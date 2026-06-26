import { ALL_TEAMS, TEAM_OWNER } from "../data/pool";
import { fetchAllWCMatches, mergeRecords, ScheduledMatch } from "./footballData";
import { fetchGroupFixtures, fetchKnockoutOdds } from "./kalshi";
import { mockGroupFixtures, mockKnockoutOdds } from "./mockOdds";
import { runProjection } from "./engine";
import { GroupFixture, ProjectionResult, FixtureProjection, ThreeWay } from "./types";
import { snapshotOdds, readOddsHistory } from "./supabase";

export interface ProjectOptions {
  iterations?: number;
  forceMock?: boolean;
}

// Last-known 3-way odds per fixture, keyed by team pairing in both orientations.
// Kalshi's per-game markets typically close (and stop returning a price) the
// moment a match kicks off — exactly when we want to show "live" odds. This
// warm-instance cache lets a live fixture keep displaying the most recent market
// odds we saw for it instead of blanking out the moment play starts.
const FIXTURE_ODDS_CACHE = new Map<string, ThreeWay>();

function rememberOdds(home: string, away: string, o: ThreeWay) {
  FIXTURE_ODDS_CACHE.set(`${home}|${away}`, o);
  FIXTURE_ODDS_CACHE.set(`${away}|${home}`, { win: o.loss, draw: o.draw, loss: o.win });
}

function recallOdds(home: string, away: string): ThreeWay | undefined {
  return FIXTURE_ODDS_CACHE.get(`${home}|${away}`);
}

export async function buildProjection(opts: ProjectOptions = {}): Promise<ProjectionResult> {
  const iterations = opts.iterations ?? 50000;
  const useMock = opts.forceMock ?? false;

  // ── 1) Single football-data.org call for everything ───────────
  const fdData = useMock ? null : await fetchAllWCMatches();
  const records = mergeRecords(ALL_TEAMS, fdData?.records ?? null);

  // ── 2) Kalshi odds ─────────────────────────────────────────────
  let kalshiGroup: GroupFixture[] | null = null;
  let kalshiKOResult: Awaited<ReturnType<typeof fetchKnockoutOdds>> | null = null;

  if (!useMock) {
    const [grpResult, koResult] = await Promise.all([
      fetchGroupFixtures(),
      fetchKnockoutOdds(),
    ]);
    if (grpResult.ok) kalshiGroup = grpResult.fixtures;
    if (koResult.ok) kalshiKOResult = koResult;
  }

  // ── 3) Build group fixtures for simulation (unfinished only) ──
  let groupFixtures: GroupFixture[];
  let groupSource: "kalshi" | "mock" = "mock";
  const fdSchedule = fdData?.schedule ?? null;

  if (fdSchedule && fdSchedule.length > 0) {
    const kalshiMap = new Map<string, GroupFixture>();
    for (const f of kalshiGroup ?? []) {
      kalshiMap.set(`${f.home}|${f.away}`, f);
    }

    groupFixtures = fdSchedule
      .filter((m) => m.stage === "GROUP_STAGE")
      .filter((m) => !["FINISHED", "CANCELLED", "POSTPONED"].includes(m.status))
      .map((m) => {
        const k = kalshiMap.get(`${m.home}|${m.away}`);
        const kFlip = !k ? kalshiMap.get(`${m.away}|${m.home}`) : null;
        let oddsHome = k?.oddsHome;
        if (!oddsHome && kFlip?.oddsHome) {
          oddsHome = { win: kFlip.oddsHome.loss, draw: kFlip.oddsHome.draw, loss: kFlip.oddsHome.win };
        }
        // Remember fresh odds; fall back to the last-known price once the market
        // closes at kickoff so live fixtures keep their odds.
        if (oddsHome) rememberOdds(m.home, m.away, oddsHome);
        else oddsHome = recallOdds(m.home, m.away);
        return { id: `fd-${m.id}`, home: m.home, away: m.away, kickoff: m.kickoff, oddsHome };
      });

    if (kalshiGroup && kalshiGroup.length > 0) groupSource = "kalshi";
  } else if (kalshiGroup && kalshiGroup.length > 0) {
    groupFixtures = kalshiGroup;
    groupSource = "kalshi";
  } else {
    groupFixtures = mockGroupFixtures(records);
    groupSource = "mock";
  }

  const knockoutOdds = kalshiKOResult?.odds ?? mockKnockoutOdds(records);
  const knockoutSource: "kalshi" | "mock" = kalshiKOResult?.ok ? "kalshi" : "mock";

  // ── 4) Run Monte Carlo ────────────────────────────────────────
  const result = runProjection({ records, groupFixtures, knockoutOdds, iterations });

  const fixturesWithOdds = groupFixtures.filter((f) => f.oddsHome != null).length;
  const oddsSource: ProjectionResult["oddsSource"] =
    groupSource === "kalshi" && knockoutSource === "kalshi" ? "kalshi"
    : groupSource === "kalshi" || knockoutSource === "kalshi" ? "mixed"
    : "mock";

  result.oddsSource = oddsSource;
  result.status = {
    ...result.status,
    liveResults: !!fdData?.records?.length,
    groupSource,
    knockoutSource,
    fixturesWithOdds,
    totalFixtures: groupFixtures.length,
    knockoutTeams: knockoutOdds.length,
  };

  // ── 5) Append finished + odds-less unfinished matches for display ─
  // The engine only emits fixtures it could price, so result.fixtures has no
  // finished games and no live/upcoming games whose market we couldn't match.
  // We add both here so the Games tab always shows every group match — a live
  // game must never vanish just because its market closed at kickoff.
  if (fdSchedule && fdSchedule.length > 0) {
    const present = new Set(result.fixtures.map((f) => `${f.home}|${f.away}`));

    const finished = fdSchedule.filter(
      (m): m is ScheduledMatch & { scoreHome: number; scoreAway: number } =>
        m.stage === "GROUP_STAGE" &&
        m.status === "FINISHED" &&
        m.scoreHome !== undefined &&
        m.scoreAway !== undefined
    );

    const finishedProjections: FixtureProjection[] = finished.map((m) => ({
      id: `fd-finished-${m.id}`,
      home: m.home,
      away: m.away,
      homeOwner: TEAM_OWNER[m.home] ?? "?",
      awayOwner: TEAM_OWNER[m.away] ?? "?",
      kickoff: m.kickoff,
      swing: 0,
      liveStatus: "FINISHED",
      liveScore: { home: m.scoreHome, away: m.scoreAway },
    }));

    // Unfinished group games the engine dropped for lack of odds (e.g. a live
    // game whose market just closed). Attach last-known odds if we have them.
    const unpricedProjections: FixtureProjection[] = fdSchedule
      .filter(
        (m) =>
          m.stage === "GROUP_STAGE" &&
          !["FINISHED", "CANCELLED", "POSTPONED"].includes(m.status) &&
          !present.has(`${m.home}|${m.away}`)
      )
      .map((m) => ({
        id: `fd-${m.id}`,
        home: m.home,
        away: m.away,
        homeOwner: TEAM_OWNER[m.home] ?? "?",
        awayOwner: TEAM_OWNER[m.away] ?? "?",
        kickoff: m.kickoff,
        oddsHome: recallOdds(m.home, m.away),
        swing: 0,
      }));

    result.fixtures = [...result.fixtures, ...finishedProjections, ...unpricedProjections];
  }

  // ── 6) Merge live scores into all fixture projections ──────────
  // Runs after every fixture is assembled so live games added above also
  // pick up their score/status/minute.
  const liveScores = fdData?.liveScores ?? [];
  if (liveScores.length > 0) {
    const liveMap = new Map(liveScores.map((l) => [`${l.home}|${l.away}`, l]));
    result.fixtures = result.fixtures.map((f) => {
      const lm = liveMap.get(`${f.home}|${f.away}`);
      if (!lm) return f;
      return {
        ...f,
        liveStatus: lm.status,
        liveScore: { home: lm.scoreHome, away: lm.scoreAway },
        liveMinute: lm.minute,
      };
    });
  }

  // ── 7) Determine current matchday (max games played by any team) ─
  const matchday = records.reduce((max, t) => Math.max(max, t.w + t.d + t.l), 0);

  // ── 8) Snapshot odds to Supabase (fire-and-forget) ────────────
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !useMock) {
    snapshotOdds(result.players, matchday).catch((e) =>
      console.error("[orchestrator] snapshotOdds error:", e)
    );
  }

  // ── 9) Read odds history from Supabase ────────────────────────
  let oddsHistory: ProjectionResult["oddsHistory"] = {};
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !useMock) {
    oddsHistory = await readOddsHistory(result.players.map((p) => p.player));
  }
  result.oddsHistory = oddsHistory;

  // ── 10) Debug info ────────────────────────────────────────────
  result.debug = {
    footballDataToken: !!process.env.FOOTBALL_DATA_TOKEN,
    fdScheduleMatches: fdSchedule?.length ?? null,
    fdFinishedTeams: fdData?.records?.length ?? null,
    fdLiveMatches: fdData?.liveScores?.length ?? null,
    kalshiGroupFixtures: kalshiGroup?.length ?? null,
    kalshiKnockoutTeams: kalshiKOResult?.odds?.length ?? null,
    groupFixturesTotal: groupFixtures.length,
    groupFixturesWithOdds: fixturesWithOdds,
    groupSource,
    knockoutSource,
    matchday,
  };

  return result;
}
