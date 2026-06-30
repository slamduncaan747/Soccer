import { ALL_TEAMS, TEAM_OWNER } from "../data/pool";
import { fetchAllWCMatches, mergeRecords, ScheduledMatch, KO_STAGES } from "./footballData";
import { fetchGroupFixtures, fetchKnockoutOdds } from "./kalshi";
import { runProjection } from "./engine";
import { GroupFixture, KnockoutOdds, ProjectionResult, FixtureProjection, KNOCKOUT_STAGES, ThreeWay } from "./types";
import { snapshotOdds, readOddsHistory } from "./supabase";

export interface ProjectOptions {
  iterations?: number;
  // When set, attaches a full per-team breakdown for this team name to
  // result.debug.teamBreakdown — used to diagnose anomalous projections in
  // production (where the live FD/Kalshi inputs aren't otherwise visible).
  debugTeam?: string;
  // When true, attaches result.debug.dump with the entire pipeline state:
  // feed health, raw Kalshi markets (with team matching), per-team reach
  // ladders & projections, and remaining fixtures. Powers the /debug screen.
  fullDebug?: boolean;
}

// Thrown when any live feed required to produce real numbers is unavailable.
// The app NEVER falls back to fabricated/model odds — instead the API surfaces
// this and the UI shows an error screen with the `diagnostics` log. `message`
// is a short human reason; `diagnostics` is the per-feed detail.
export class ProjectionFailure extends Error {
  diagnostics: string[];
  constructor(message: string, diagnostics: string[]) {
    super(message);
    this.name = "ProjectionFailure";
    this.diagnostics = diagnostics;
  }
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

// FD knockout stage → index into KNOCKOUT_STAGES of the match being played,
// i.e. the match that decides reach[levels[i+1]] given reach[levels[i]].
const KO_STAGE_INDEX: Record<string, number> = {
  LAST_32: 0,         // r32 -> r16
  LAST_16: 1,         // r16 -> qf
  QUARTER_FINALS: 2,  // qf  -> sf
  SEMI_FINALS: 3,     // sf  -> final
  FINAL: 4,            // final -> champion
};

// Fallback per-match odds for a knockout fixture, derived from each team's
// reach ladder (P(win this match) = reach[next] / reach[here]), normalized
// head-to-head since one team must win (knockout ties are decided by ET/pens —
// no draw outcome). Used only when no live Kalshi per-match market is matched.
function deriveKnockoutOdds(
  home: string,
  away: string,
  stage: string,
  knockoutOdds: KnockoutOdds[]
): ThreeWay | undefined {
  const idx = KO_STAGE_INDEX[stage];
  if (idx == null) return undefined;
  const here = KNOCKOUT_STAGES[idx];
  const next = KNOCKOUT_STAGES[idx + 1];
  const condWin = (team: string): number | null => {
    const r = knockoutOdds.find((k) => k.team === team)?.reach;
    const h = r?.[here];
    const n = r?.[next];
    if (h == null || n == null || h <= 0) return null;
    return Math.max(0, Math.min(1, n / h));
  };
  const wHome = condWin(home);
  const wAway = condWin(away);
  if (wHome == null || wAway == null) return undefined;
  const sum = wHome + wAway;
  if (sum <= 0) return undefined;
  return { win: wHome / sum, draw: 0, loss: wAway / sum };
}

export async function buildProjection(opts: ProjectOptions = {}): Promise<ProjectionResult> {
  const iterations = opts.iterations ?? 50000;

  // ── 1) Fetch every live feed. No fallbacks: if any is unavailable we stop. ──
  const capture = !!opts.fullDebug;
  const [fd, grp, ko] = await Promise.all([
    fetchAllWCMatches(),
    fetchGroupFixtures(capture),
    fetchKnockoutOdds(capture),
  ]);

  const diagnostics: string[] = [
    `[football-data] ${fd.ok ? "OK" : "FAIL"} — ${fd.detail}`,
    `[kalshi group markets] ${grp.ok ? "OK" : "FAIL"} — ${grp.detail}`,
    `[kalshi knockout markets] ${ko.ok ? "OK" : "FAIL"} — ${ko.detail}`,
  ];

  // Any broken feed → hard stop. We never display fabricated numbers.
  const failures: string[] = [];
  if (!fd.ok) failures.push("live results & schedule (football-data.org)");
  if (!grp.ok) failures.push("group match markets (Kalshi)");
  if (!ko.ok) failures.push("knockout reach markets (Kalshi)");
  if (failures.length > 0) {
    throw new ProjectionFailure(`Live data unavailable: ${failures.join("; ")}.`, diagnostics);
  }

  const fdData = fd.data!;
  const fdSchedule = fdData.schedule;
  const records = mergeRecords(ALL_TEAMS, fdData.records);
  const knockoutOdds = ko.odds;

  // ── 2) Build remaining group fixtures from the live schedule + live odds. ──
  const kalshiMap = new Map<string, GroupFixture>();
  for (const f of grp.fixtures) kalshiMap.set(`${f.home}|${f.away}`, f);

  const groupFixtures: GroupFixture[] = fdSchedule
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
      // closes at kickoff so live fixtures keep their (real) odds.
      if (oddsHome) rememberOdds(m.home, m.away, oddsHome);
      else oddsHome = recallOdds(m.home, m.away);
      return { id: `fd-${m.id}`, home: m.home, away: m.away, kickoff: m.kickoff, oddsHome };
    });

  const fixturesWithOdds = groupFixtures.filter((f) => f.oddsHome != null).length;

  // If there are upcoming group games but the market feed priced none of them,
  // the group odds are effectively missing — stop rather than show partial numbers.
  if (groupFixtures.length > 0 && fixturesWithOdds === 0) {
    diagnostics.push(
      `[group odds] ${groupFixtures.length} remaining group game(s) but 0 matched a Kalshi market`
    );
    throw new ProjectionFailure(
      "Group match odds could not be matched to any upcoming game.",
      diagnostics
    );
  }

  // ── 3) Run Monte Carlo on real data only ──────────────────────
  const result = runProjection({ records, groupFixtures, knockoutOdds, iterations });

  result.oddsSource = "kalshi";
  result.status = {
    ...result.status,
    liveResults: true,
    groupSource: "kalshi",
    knockoutSource: "kalshi",
    fixturesWithOdds,
    totalFixtures: groupFixtures.length,
    knockoutTeams: knockoutOdds.length,
  };

  // ── 4b) Refine team liveness from ground truth (drives UI shading) ────────
  // A team is "alive" (not shaded) if it still has any upcoming match in the live
  // schedule — group OR knockout — or it's in the knockout bracket (reach > 0) or
  // has banked knockout wins. This is independent of market liquidity, so an
  // illiquid forward market can no longer wrongly grey out a team that is, in
  // fact, still playing.
  const upcoming = new Set<string>();
  for (const m of fdSchedule) {
    if (!["FINISHED", "CANCELLED", "POSTPONED"].includes(m.status)) {
      upcoming.add(m.home);
      upcoming.add(m.away);
    }
  }
  const hasReach = new Map(
    knockoutOdds.map((k) => [k.team, Object.values(k.reach).some((v) => (v ?? 0) > 0)])
  );
  const koWinsByTeam = new Map(records.map((r) => [r.name, r.koWins ?? 0]));
  for (const p of result.players) {
    for (const t of p.teams) {
      t.alive =
        upcoming.has(t.team) ||
        (hasReach.get(t.team) ?? false) ||
        (koWinsByTeam.get(t.team) ?? 0) > 0;
    }
  }

  // ── 5) Append finished + odds-less unfinished matches for display ─
  // The engine only emits group fixtures it could price, so result.fixtures has
  // no finished games, no knockout games at all, and no live/upcoming games
  // whose market we couldn't match. We add all of those here so the Games tab
  // always shows every match — group or knockout — and a live game never
  // vanishes just because its market closed at kickoff. THIRD_PLACE is included
  // for display even though it doesn't score (see footballData.ts KO_STAGES).
  const DISPLAY_STAGES = new Set(["GROUP_STAGE", "THIRD_PLACE", ...KO_STAGES]);
  if (fdSchedule && fdSchedule.length > 0) {
    const present = new Set(result.fixtures.map((f) => `${f.home}|${f.away}`));

    const finished = fdSchedule.filter(
      (m): m is ScheduledMatch & { scoreHome: number; scoreAway: number } =>
        DISPLAY_STAGES.has(m.stage) &&
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

    // Unfinished games the engine dropped for lack of odds — all knockout games
    // (the engine only prices group fixtures) plus any group game whose market
    // closed/wasn't matched. Attach last-known odds if we have them.
    const unpricedProjections: FixtureProjection[] = fdSchedule
      .filter(
        (m) =>
          DISPLAY_STAGES.has(m.stage) &&
          !["FINISHED", "CANCELLED", "POSTPONED"].includes(m.status) &&
          !present.has(`${m.home}|${m.away}`)
      )
      .map((m) => {
        // Prefer a real Kalshi per-match market (KXWCGAME also lists knockout
        // fixtures, not just group games) over the reach-derived estimate.
        const k = kalshiMap.get(`${m.home}|${m.away}`);
        const kFlip = !k ? kalshiMap.get(`${m.away}|${m.home}`) : null;
        let oddsHome = k?.oddsHome;
        if (!oddsHome && kFlip?.oddsHome) {
          oddsHome = { win: kFlip.oddsHome.loss, draw: kFlip.oddsHome.draw, loss: kFlip.oddsHome.win };
        }
        if (oddsHome) {
          rememberOdds(m.home, m.away, oddsHome);
        } else {
          oddsHome =
            recallOdds(m.home, m.away) ??
            deriveKnockoutOdds(m.home, m.away, m.stage, knockoutOdds);
        }
        return {
          id: `fd-${m.id}`,
          home: m.home,
          away: m.away,
          homeOwner: TEAM_OWNER[m.home] ?? "?",
          awayOwner: TEAM_OWNER[m.away] ?? "?",
          kickoff: m.kickoff,
          oddsHome,
          swing: 0,
        };
      });

    result.fixtures = [...result.fixtures, ...finishedProjections, ...unpricedProjections];
  }

  // ── 6) Merge live scores into all fixture projections ──────────
  // Runs after every fixture is assembled so live games added above also
  // pick up their score/status/minute.
  const liveScores = fdData.liveScores;
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
  // Supabase only powers the historical odds chart; if it is down the live
  // projection is still fully real, so this is intentionally non-blocking.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    snapshotOdds(result.players, matchday).catch((e) =>
      console.error("[orchestrator] snapshotOdds error:", e)
    );
  }

  // ── 9) Read odds history from Supabase ────────────────────────
  let oddsHistory: ProjectionResult["oddsHistory"] = {};
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    oddsHistory = await readOddsHistory(result.players.map((p) => p.player));
  }
  result.oddsHistory = oddsHistory;

  // ── 10) Debug info ────────────────────────────────────────────
  result.debug = {
    footballDataToken: !!process.env.FOOTBALL_DATA_TOKEN,
    fdScheduleMatches: fdSchedule.length,
    fdFinishedTeams: fdData.records.length,
    fdLiveMatches: fdData.liveScores.length,
    kalshiGroupFixtures: grp.fixtures.length,
    kalshiKnockoutTeams: ko.odds.length,
    groupFixturesTotal: groupFixtures.length,
    groupFixturesWithOdds: fixturesWithOdds,
    matchday,
    diagnostics,
    // Always present so the deployed build/version can be probed.
    buildMarker: "live-only-v1",
  };

  // Opt-in per-team breakdown: exposes exactly what fed a team's projection
  // (record incl. knockout wins, reach ladder, remaining priced group games)
  // so an anomalous expected-points value can be traced on the live deployment.
  if (opts.debugTeam) {
    const name = opts.debugTeam;
    const rec = records.find((r) => r.name === name) ?? null;
    const koEntry = knockoutOdds.find((k) => k.team === name) ?? null;
    const remaining = groupFixtures
      .filter((f) => f.home === name || f.away === name)
      .map((f) => ({ home: f.home, away: f.away, oddsHome: f.oddsHome ?? null }));
    const proj = result.players
      .flatMap((p) => p.teams)
      .find((t) => t.team === name) ?? null;
    result.debug.teamBreakdown = {
      team: name,
      record: rec,
      reach: koEntry?.reach ?? null,
      remainingGroupGames: remaining,
      projection: proj,
    };
  }

  // Full pipeline dump for the /debug screen — everything needed to trace any
  // number back to its inputs.
  if (opts.fullDebug) {
    const reachByTeam = new Map(knockoutOdds.map((k) => [k.team, k.reach]));
    const projByTeam = new Map(result.players.flatMap((p) => p.teams).map((t) => [t.team, t]));
    const remByTeam = new Map<string, { home: string; away: string; oddsHome: ThreeWay | null }[]>();
    for (const f of groupFixtures) {
      for (const side of [f.home, f.away]) {
        const arr = remByTeam.get(side) ?? [];
        arr.push({ home: f.home, away: f.away, oddsHome: f.oddsHome ?? null });
        remByTeam.set(side, arr);
      }
    }

    const round2 = (x: number) => Math.round(x * 100) / 100;
    const perTeam = ALL_TEAMS.map((t) => {
      const rec = records.find((r) => r.name === t.name);
      const proj = projByTeam.get(t.name);
      const remaining = remByTeam.get(t.name) ?? [];
      // Decompose expected points so the SOURCE of any elevation is unambiguous:
      // expected remaining GROUP points vs expected KNOCKOUT points.
      let grpWin = 0, grpDraw = 0;
      for (const g of remaining) {
        if (!g.oddsHome) continue;
        if (g.home === t.name) { grpWin += g.oddsHome.win; grpDraw += g.oddsHome.draw; }
        else { grpWin += g.oddsHome.loss; grpDraw += g.oddsHome.draw; }
      }
      const expGroupPoints = round2(grpWin * 3 + grpDraw * 1);
      const cur = proj?.currentPoints ?? 0;
      const exp = proj?.expectedFinalPoints ?? 0;
      const expKnockoutPoints = round2(exp - cur - expGroupPoints); // residual = knockout
      return {
        team: t.name,
        owner: TEAM_OWNER[t.name] ?? "?",
        record: rec ? { w: rec.w, d: rec.d, l: rec.l, koWins: rec.koWins ?? 0 } : null,
        reach: reachByTeam.get(t.name) ?? null,
        inKnockoutMarket: reachByTeam.has(t.name),
        alive: proj?.alive ?? null,
        currentPoints: proj?.currentPoints ?? null,
        expGroupPoints,
        expKnockoutPoints,
        expectedFinalPoints: proj?.expectedFinalPoints ?? null,
        expectedRemainingWins: proj?.expectedRemainingWins ?? null,
        nRemainingGames: remaining.length,
        remainingGroupGames: remaining,
      };
    }).sort((a, b) => (b.expectedFinalPoints ?? 0) - (a.expectedFinalPoints ?? 0));

    result.debug.dump = {
      buildMarker: "live-only-v1",
      generatedAt: result.generatedAt,
      iterations: result.iterations,
      sources: {
        footballData: { ok: fd.ok, detail: fd.detail },
        kalshiGroup: { ok: grp.ok, detail: grp.detail },
        kalshiKnockout: { ok: ko.ok, detail: ko.detail },
      },
      diagnostics,
      counts: {
        scheduleMatches: fdSchedule.length,
        teamsWithResults: fdData.records.length,
        liveMatches: fdData.liveScores.length,
        knockoutTeamsWithReach: knockoutOdds.filter((k) => Object.keys(k.reach).length > 0).length,
        remainingGroupGames: groupFixtures.length,
        remainingGroupGamesPriced: fixturesWithOdds,
        matchday,
      },
      perTeam,
      remainingGroupFixtures: groupFixtures.map((f) => ({
        home: f.home, away: f.away, kickoff: f.kickoff, oddsHome: f.oddsHome ?? null,
      })),
      rawKnockoutMarkets: ko.markets ?? [],
      rawGroupMarkets: grp.markets ?? [],
    };
  }

  return result;
}
