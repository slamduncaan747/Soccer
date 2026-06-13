import { ALL_TEAMS } from "../data/pool";
import { fetchLiveRecords, mergeRecords } from "./footballData";
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

  if (!opts.forceMock) {
    const [grp, ko] = await Promise.all([fetchGroupFixtures(), fetchKnockoutOdds()]);
    if (grp.ok && ko.ok) {
      groupFixtures = grp.fixtures;
      knockoutOdds = ko.odds;
      source = "kalshi";
    } else if (grp.ok || ko.ok) {
      if (grp.ok) groupFixtures = grp.fixtures;
      if (ko.ok) knockoutOdds = ko.odds;
      source = "mixed";
    }
  }

  const result = runProjection({ records, groupFixtures, knockoutOdds, iterations });
  result.oddsSource = source;
  return result;
}
