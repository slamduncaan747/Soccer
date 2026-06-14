import { ALL_TEAMS } from "../data/pool";
import { fetchLiveRecords, fetchLiveScores, fetchWCSchedule, mergeRecords } from "./footballData";
import { fetchGroupFixtures, fetchKnockoutOdds } from "./kalshi";
import { mockGroupFixtures, mockKnockoutOdds } from "./mockOdds";
import { runProjection } from "./engine";
import { GroupFixture, ProjectionResult } from "./types";

export interface ProjectOptions {
  iterations?: number;
  forceMock?: boolean;
}

export interface DataDebug {
  footballDataToken: boolean;
  scheduleMatches: number | null;     // null = API unavailable
  finishedMatches: number | null;
  liveMatches: number | null;
  kalshiGroupFixtures: number | null; // null = API failed
  kalshiKnockoutTeams: number | null;
}

export async function buildProjection(
  opts: ProjectOptions = {}
): Promise<ProjectionResult> {
  const iterations = opts.iterations ?? 50000;
  const useMock = opts.forceMock ?? false;

  const debug: DataDebug = {
    footballDataToken: !!process.env.FOOTBALL_DATA_TOKEN,
    scheduleMatches: null,
    finishedMatches: null,
    liveMatches: null,
    kalshiGroupFixtures: null,
    kalshiKnockoutTeams: null,
  };

  // ── 1) Live records (finished match W/D/L) ────────────────────
  const liveRec = useMock ? null : await fetchLiveRecords();
  debug.finishedMatches = liveRec ? liveRec.length : (process.env.FOOTBALL_DATA_TOKEN ? 0 : null);
  const records = mergeRecords(ALL_TEAMS, liveRec);

  // ── 2) Full WC schedule from football-data.org ────────────────
  const schedule = useMock ? null : await fetchWCSchedule();
  debug.scheduleMatches = schedule ? schedule.length : null;

  // ── 3) Kalshi group + knockout odds ───────────────────────────
  let kalshiGroup: GroupFixture[] | null = null;
  let kalshiKO: Awaited<ReturnType<typeof fetchKnockoutOdds>>["odds"] | null = null;

  if (!useMock) {
    const [grpResult, koResult] = await Promise.all([
      fetchGroupFixtures(),
      fetchKnockoutOdds(),
    ]);
    if (grpResult.ok) {
      kalshiGroup = grpResult.fixtures;
      debug.kalshiGroupFixtures = grpResult.fixtures.length;
    } else {
      debug.kalshiGroupFixtures = 0;
    }
    if (koResult.ok) {
      kalshiKO = koResult.odds;
      debug.kalshiKnockoutTeams = koResult.odds.length;
    } else {
      debug.kalshiKnockoutTeams = 0;
    }
  }

  // ── 4) Build fixture list ─────────────────────────────────────
  // Priority: schedule from football-data (for kickoff times) merged with
  // Kalshi odds. Fall back to mock fixtures only when BOTH are unavailable.
  let groupFixtures: GroupFixture[];
  let groupSource: "kalshi" | "mock" | "schedule" = "mock";

  if (schedule && schedule.length > 0) {
    // Use FD schedule as the source of truth for fixtures + kickoff times.
    // Overlay Kalshi odds where a matching market exists.
    const kalshiMap = new Map<string, GroupFixture>();
    for (const f of kalshiGroup ?? []) {
      kalshiMap.set(`${f.home}|${f.away}`, f);
      kalshiMap.set(`${f.away}|${f.home}`, f); // also try reversed
    }

    groupFixtures = schedule
      .filter((m) => m.stage === "GROUP_STAGE")
      .filter((m) => m.status !== "FINISHED" && m.status !== "CANCELLED" && m.status !== "POSTPONED")
      .map((m) => {
        const kalshi = kalshiMap.get(`${m.home}|${m.away}`);
        // If reversed match found in Kalshi, flip win/loss
        const kalshiFlipped = !kalshi ? kalshiMap.get(`${m.away}|${m.home}`) : null;
        let oddsHome = kalshi?.oddsHome;
        if (!oddsHome && kalshiFlipped?.oddsHome) {
          oddsHome = {
            win: kalshiFlipped.oddsHome.loss,
            draw: kalshiFlipped.oddsHome.draw,
            loss: kalshiFlipped.oddsHome.win,
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

    groupSource = kalshiGroup && kalshiGroup.length > 0 ? "kalshi" : "schedule";
  } else if (kalshiGroup && kalshiGroup.length > 0) {
    // No FD schedule but have Kalshi — use Kalshi fixtures (no kickoff times)
    groupFixtures = kalshiGroup;
    groupSource = "kalshi";
  } else {
    // True fallback: mock data
    groupFixtures = mockGroupFixtures();
    groupSource = "mock";
  }

  const knockoutOdds = kalshiKO ?? mockKnockoutOdds();
  const knockoutSource: "kalshi" | "mock" = kalshiKO ? "kalshi" : "mock";

  // ── 5) Run Monte Carlo ────────────────────────────────────────
  const result = runProjection({ records, groupFixtures, knockoutOdds, iterations });

  const fixturesWithOdds = groupFixtures.filter((f) => f.oddsHome != null).length;
  const oddsSource: ProjectionResult["oddsSource"] =
    groupSource === "kalshi" && knockoutSource === "kalshi" ? "kalshi"
    : groupSource === "kalshi" || knockoutSource === "kalshi" ? "mixed"
    : "mock";

  result.oddsSource = oddsSource;
  result.status = {
    ...result.status,
    liveResults: !!liveRec && liveRec.length > 0,
    groupSource: groupSource === "mock" ? "mock" : "kalshi",
    knockoutSource,
    fixturesWithOdds,
    totalFixtures: groupFixtures.length,
    knockoutTeams: knockoutOdds.length,
  };

  // ── 6) Merge live scores into fixture projections ─────────────
  const liveScores = useMock ? [] : await fetchLiveScores();
  debug.liveMatches = liveScores.length;

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

  return { ...result, debug: debug as unknown as Record<string, unknown> };
}
