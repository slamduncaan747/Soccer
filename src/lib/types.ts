// Shared domain types.

export type Stage =
  | "group"
  | "r32"   // Round of 32 (48-team format)
  | "r16"
  | "qf"
  | "sf"
  | "final";

export const KNOCKOUT_STAGES: Stage[] = ["r32", "r16", "qf", "sf", "final"];

export interface ThreeWay {
  win: number;
  draw: number;
  loss: number;
}

// A scheduled-but-unplayed group match between two pool-relevant teams (or one).
export interface GroupFixture {
  id: string;
  home: string; // canonical team name
  away: string;
  kickoff?: string; // ISO
  // 3-way de-vigged probabilities from the HOME team's perspective.
  // If a market is unavailable, this is undefined and the sim skips it.
  oddsHome?: ThreeWay;
}

// Per-team knockout survival probabilities, derived from Kalshi advance markets.
// reach[stage] = P(team is alive AND playing a match in that stage).
// A team "wins" a knockout match by advancing to the NEXT stage.
export interface KnockoutOdds {
  team: string;
  reach: Partial<Record<Stage, number>>; // P(reach this round)
}

export interface TeamProjection {
  team: string;
  owner: string;
  w: number;
  d: number;
  l: number;
  currentPoints: number;
  expectedRemainingWins: number;
  expectedFinalPoints: number;
}

export interface PlayerProjection {
  player: string;
  currentPoints: number;
  expectedFinalPoints: number;
  pFirst: number;      // P(finish strictly/tied-share 1st) — see engine for tie handling
  pTop3: number;
  finishDistribution: number[]; // index 0 = P(rank 1), etc.
  teams: TeamProjection[];
}

// A single remaining group match, with its owners and a leverage score:
// how much its result swings the title race (computed from the same MC samples).
export interface FixtureProjection {
  id: string;
  home: string;
  away: string;
  homeOwner: string;
  awayOwner: string;
  kickoff?: string; // ISO
  oddsHome?: ThreeWay;
  // swing = max over players of |P(wins pool | home win) − P(wins pool | away win)|.
  // The single most title-relevant number we can attach to a fixture.
  swing: number;
  swingPlayer?: string;          // the player whose title odds move most on this result
  swingToward?: "home" | "away"; // which result helps that player
}

// Health of the live data pipeline, surfaced in the UI so users can see
// whether projections are running on real markets or the fallback model.
export interface DataStatus {
  liveResults: boolean;             // football-data results merged in
  groupSource: "kalshi" | "mock";
  knockoutSource: "kalshi" | "mock";
  fixturesWithOdds: number;
  totalFixtures: number;
  knockoutTeams: number;            // teams with knockout reach markets
}

export interface ProjectionResult {
  players: PlayerProjection[];
  fixtures: FixtureProjection[];    // remaining group matches, sorted by swing desc
  status: DataStatus;
  iterations: number;
  generatedAt: string;
  oddsSource: "kalshi" | "mock" | "mixed";
}
