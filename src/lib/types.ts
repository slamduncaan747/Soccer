// Shared domain types.

export type Stage =
  | "group"
  | "r32"   // Round of 32 (48-team format) — i.e. qualified from group
  | "r16"
  | "qf"
  | "sf"
  | "final"     // reached the final (won the semifinal)
  | "champion"; // won the final (won the cup)

// Cumulative knockout REACH levels, in order. Six levels span five knockout
// matches (R32, R16, QF, SF, Final): a team "wins" the match at level i iff it
// reaches level i+1. `final` = reach the final; `champion` = win the final.
export const KNOCKOUT_STAGES: Stage[] = ["r32", "r16", "qf", "sf", "final", "champion"];

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
  // Whether the team is still in the tournament (can still earn points). Set from
  // the football-data schedule (any upcoming match) ORed with knockout presence —
  // ground truth, independent of market liquidity. Drives the UI shading.
  alive: boolean;
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
  swingSE?: number;              // Monte-Carlo standard error of `swing` (thin buckets ⇒ larger)
  swingPlayer?: string;          // the player whose title odds move most on this result
  swingToward?: "home" | "away"; // which result helps that player
  // Per-player RAW conditional title odds for this fixture: P(win pool | home win)
  // and P(win pool | away win). Lets the UI show "14% → 19%" rather than a delta.
  playerSwings?: { player: string; pHome: number; pAway: number }[];
  // Live match data (populated from football-data.org during active matches)
  liveStatus?: "IN_PLAY" | "PAUSED" | "HALFTIME" | "FINISHED";
  liveScore?: { home: number; away: number };
  liveMinute?: number;
}

// A high-variance "what-if" for a player: a knockout milestone (team reaches a
// round) ranked by how much it actually moves their title odds. `prob` is how
// likely the event is; `pYes`/`pNo` are the player's title odds with/without it.
export interface TournamentFactor {
  team: string;
  owner: string;            // the team's owner (may differ from the viewing player)
  stage: Stage;             // the reach threshold the event represents
  label: string;            // e.g. "Portugal reaches the Semifinal"
  prob: number;             // P(event happens)
  pYes: number;             // P(viewing player wins pool | event happens)
  pNo: number;              // P(viewing player wins pool | event does NOT happen)
  impact: number;           // √(explained variance) — the ranking key
}

export interface PlayerFactors {
  player: string;
  factors: TournamentFactor[]; // top high-variance factors, strongest first
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

// Per-player odds history for the chart.
// Each entry is one snapshot in time: matchday = -1 means draft (synthetic equal odds),
// matchday 0+ are actual stored snapshots.
export interface OddsHistoryPoint {
  matchday: number; // -1 = draft, 0 = start, 1 = after MD1, etc.
  pct: number;      // 0–1 title odds
  pts: number;      // expected final points (projected end-of-tournament total)
}

export interface ProjectionResult {
  players: PlayerProjection[];
  fixtures: FixtureProjection[];    // all group matches (finished + remaining)
  playerFactors: PlayerFactors[];   // per-player high-variance knockout what-ifs
  status: DataStatus;
  iterations: number;
  generatedAt: string;
  oddsSource: "kalshi" | "mock" | "mixed";
  // Per-player historical title odds, keyed by player name.
  // Empty object when Supabase is unavailable.
  oddsHistory: Record<string, OddsHistoryPoint[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug?: Record<string, unknown>;
}
