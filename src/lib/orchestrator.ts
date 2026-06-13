import { ALL_TEAMS } from "../data/pool";
import { fetchLiveRecords, fetchLiveScores, mergeRecords } from "./footballData";
import { fetchGroupFixtures, fetchKnockoutOdds } from "./kalshi";
import { mockGroupFixtures, mockKnockoutOdds } from "./mockOdds";
import { runProjection } from "./engine";
import { ProjectionResult } from "./types";

export interface ProjectOptions {
  iterations?: number;
  forceMock?: boolean;
}

// Single entry point used by API routes. Tries live sources, degrades to mock.
export async function buildProjection(opts: ProjectOptions = {}): Promise<ProjectionResult> {
  const iterations = opts.iterations ?? 50000;

  // 1) Current records: live (football-data) over seed.
  const live = opts.forceMock ? null : await fetchLiveRecords();
  const records = mergeRecords(ALL_TEAMS, live);

  // 2) Odds: Kalshi public markets, falling back to mock when unavailable.
  let groupFixtures = mockGroupFixtures();
  let knockoutOdds = mockKnockoutOdds();
  let source: ProjectionResult["oddsSource"] = "mock";
  let groupSource: "kalshi" | "mock" = "mock";
  let knockoutSource: "kalshi" | "mock" = "mock";

  if (!opts.forceMock) {
    const [grp, ko] = await Promise.all([fetchGroupFixtures(), fetchKnockoutOdds()]);
    if (grp.ok) {
      groupFixtures = grp.fixtures;
      groupSource = "kalshi";
    }
    if (ko.ok) {
      knockoutOdds = ko.odds;
      knockoutSource = "kalshi";
    }
    if (grp.ok && ko.ok) source = "kalshi";
    else if (grp.ok || ko.ok) source = "mixed";
  }

  const result = runProjection({ records, groupFixtures, knockoutOdds, iterations });
  result.oddsSource = source;
  result.status = {
    ...result.status,
    liveResults: !opts.forceMock && !!live && live.length > 0,
    groupSource,
    knockoutSource,
  };

  // Merge live scores into fixtures for in-progress matches
  if (!opts.forceMock) {
    const liveScores = await fetchLiveScores();
    if (liveScores.length > 0) {
      const liveMap = new Map(liveScores.map((l) => [`${l.home}|${l.away}`, l]));
      result.fixtures = result.fixtures.map((f) => {
        const liveMatch = liveMap.get(`${f.home}|${f.away}`);
        if (!liveMatch) return f;
        return {
          ...f,
          liveStatus: liveMatch.status,
          liveScore: { home: liveMatch.scoreHome, away: liveMatch.scoreAway },
          liveMinute: liveMatch.minute,
        };
      });
    }
  }

  return result;
}
