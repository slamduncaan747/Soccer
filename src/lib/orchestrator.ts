import { ALL_TEAMS } from "../data/pool";
import { fetchAllWCMatches, mergeRecords } from "./footballData";
import { fetchGroupFixtures, fetchKnockoutOdds } from "./kalshi";
import { mockGroupFixtures, mockKnockoutOdds } from "./mockOdds";
import { runProjection } from "./engine";
import { GroupFixture, ProjectionResult } from "./types";

export interface ProjectOptions {
  iterations?: number;
  forceMock?: boolean;
}

export async function buildProjection(opts: ProjectOptions = {}): Promise<ProjectionResult> {
  const iterations = opts.iterations ?? 50000;
  const useMock = opts.forceMock ?? false;

  // ── 1) Single football-data.org call for everything ───────────
  // One request → schedule (kickoff times) + W/D/L records + live scores.
  const fdData = useMock ? null : await fetchAllWCMatches();

  const records = mergeRecords(ALL_TEAMS, fdData?.records ?? null);

  // ── 2) Kalshi odds (separate API, no auth needed) ──────────────
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

  // ── 3) Build group fixtures ────────────────────────────────────
  // Use FD schedule as the fixture source (real kickoff times).
  // Overlay Kalshi odds where available. Fall back to mock only when
  // both sources are absent.
  let groupFixtures: GroupFixture[];
  let groupSource: "kalshi" | "mock" = "mock";

  const fdSchedule = fdData?.schedule ?? null;

  if (fdSchedule && fdSchedule.length > 0) {
    // Build a lookup from Kalshi odds by team pair
    const kalshiMap = new Map<string, GroupFixture>();
    for (const f of kalshiGroup ?? []) {
      kalshiMap.set(`${f.home}|${f.away}`, f);
    }

    groupFixtures = fdSchedule
      .filter((m) => m.stage === "GROUP_STAGE")
      .filter((m) => !["FINISHED", "CANCELLED", "POSTPONED"].includes(m.status))
      .map((m) => {
        // Try direct Kalshi match, then flipped (home/away may differ)
        const k = kalshiMap.get(`${m.home}|${m.away}`);
        const kFlip = !k ? kalshiMap.get(`${m.away}|${m.home}`) : null;
        let oddsHome = k?.oddsHome;
        if (!oddsHome && kFlip?.oddsHome) {
          oddsHome = {
            win: kFlip.oddsHome.loss,
            draw: kFlip.oddsHome.draw,
            loss: kFlip.oddsHome.win,
          };
        }
        return {
          id: `fd-${m.id}`,
          home: m.home,
          away: m.away,
          kickoff: m.kickoff,
          oddsHome,
        };
      });

    if (kalshiGroup && kalshiGroup.length > 0) groupSource = "kalshi";
    // else groupSource stays "mock" but fixtures come from FD — labelled honestly below
  } else if (kalshiGroup && kalshiGroup.length > 0) {
    // No FD schedule but have Kalshi events (no kickoff times)
    groupFixtures = kalshiGroup;
    groupSource = "kalshi";
  } else {
    groupFixtures = mockGroupFixtures();
    groupSource = "mock";
  }

  const knockoutOdds = kalshiKOResult?.odds ?? mockKnockoutOdds();
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

  // ── 5) Merge live scores into fixture projections ─────────────
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

  // ── 6) Debug info (visible in /api/leaderboard response) ──────
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
  };

  return result;
}
