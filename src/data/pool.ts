// Seed data parsed directly from the Google Sheet the user provided.
// Each player owns 8 teams. W/D/L are CURRENT recorded results (group stage so far).
// Scoring is governed by lib/scoring.ts — this file only records raw match outcomes.

export interface TeamSeed {
  name: string;       // canonical display name
  fdName?: string;    // football-data.org name override when it differs
  kalshiName?: string; // Kalshi market label override when it differs
  w: number;          // GROUP-stage wins
  d: number;          // GROUP-stage draws
  l: number;          // GROUP-stage losses
  // Realized KNOCKOUT matches won so far (R32 → Final). Each is a locked-in
  // win worth 3 points. Tracked separately from group W/D/L because knockout
  // results feed current points directly while remaining knockout rounds are
  // still projected from the reach markets.
  koWins?: number;
}

export interface PlayerSeed {
  name: string;
  teams: TeamSeed[];
}

// NOTE on team-name normalization: the sheet has a few spellings that won't
// match data providers (AUSTRAILIA, TURKIYE). Canonical names are corrected;
// `fdName` / `kalshiName` carry provider-specific aliases where needed.
export const POOL: PlayerSeed[] = [
  {
    name: "Sam",
    teams: [
      { name: "Spain", w: 0, d: 0, l: 0 },
      { name: "Croatia", w: 0, d: 0, l: 0 },
      { name: "Colombia", w: 0, d: 0, l: 0 },
      { name: "Switzerland", w: 0, d: 0, l: 0 },
      { name: "South Korea", kalshiName: "Korea Republic", w: 1, d: 0, l: 0 },
      { name: "Algeria", w: 0, d: 0, l: 0 },
      { name: "Ghana", w: 0, d: 0, l: 0 },
      { name: "Jordan", w: 0, d: 0, l: 0 },
    ],
  },
  {
    name: "Wyatt",
    teams: [
      { name: "France", w: 0, d: 0, l: 0 },
      { name: "Norway", w: 0, d: 0, l: 0 },
      { name: "Japan", w: 0, d: 0, l: 0 },
      { name: "Sweden", w: 0, d: 0, l: 0 },
      { name: "Senegal", w: 0, d: 0, l: 0 },
      { name: "South Africa", w: 0, d: 0, l: 1 },
      { name: "DR Congo", fdName: "Congo DR", kalshiName: "Congo DR", w: 0, d: 0, l: 0 },
      { name: "Haiti", w: 0, d: 0, l: 0 },
    ],
  },
  {
    name: "Duncan",
    teams: [
      { name: "Portugal", w: 0, d: 0, l: 0 },
      { name: "Belgium", w: 0, d: 0, l: 0 },
      { name: "United States", kalshiName: "USA", w: 0, d: 0, l: 0 },
      { name: "Canada", w: 0, d: 1, l: 0 },
      { name: "Paraguay", w: 0, d: 0, l: 0 },
      { name: "Bosnia", fdName: "Bosnia and Herzegovina", w: 0, d: 1, l: 0 },
      { name: "Tunisia", w: 0, d: 0, l: 0 },
      { name: "Cape Verde", w: 0, d: 0, l: 0 },
    ],
  },
  {
    name: "Conrad",
    teams: [
      { name: "England", w: 0, d: 0, l: 0 },
      { name: "Germany", w: 0, d: 0, l: 0 },
      { name: "Uruguay", w: 0, d: 0, l: 0 },
      { name: "Austria", w: 0, d: 0, l: 0 },
      { name: "Ivory Coast", fdName: "Côte d'Ivoire", w: 0, d: 0, l: 0 },
      { name: "Czech Republic", fdName: "Czechia", kalshiName: "Czechia", w: 0, d: 0, l: 1 },
      { name: "Qatar", w: 0, d: 0, l: 0 },
      { name: "New Zealand", w: 0, d: 0, l: 0 },
    ],
  },
  {
    name: "Gus",
    teams: [
      { name: "Argentina", w: 0, d: 0, l: 0 },
      { name: "Morocco", w: 0, d: 0, l: 0 },
      { name: "Mexico", w: 1, d: 0, l: 0 },
      { name: "Australia", w: 0, d: 0, l: 0 }, // sheet: "AUSTRAILIA"
      { name: "Egypt", w: 0, d: 0, l: 0 },
      { name: "Scotland", w: 0, d: 0, l: 0 },
      { name: "Uzbekistan", w: 0, d: 0, l: 0 },
      { name: "Curacao", fdName: "Curaçao", w: 0, d: 0, l: 0 },
    ],
  },
  {
    name: "Isiah",
    teams: [
      { name: "Brazil", w: 0, d: 0, l: 0 },
      { name: "Netherlands", w: 0, d: 0, l: 0 },
      { name: "Türkiye", fdName: "Turkey", kalshiName: "Turkiye", w: 0, d: 0, l: 0 }, // sheet: "TURKIYE"
      { name: "Ecuador", w: 0, d: 0, l: 0 },
      { name: "Iran", w: 0, d: 0, l: 0 },
      { name: "Saudi Arabia", w: 0, d: 0, l: 0 },
      { name: "Panama", w: 0, d: 0, l: 0 },
      { name: "Iraq", w: 0, d: 0, l: 0 },
    ],
  },
];

// Flat lookup: team name -> owning player
export const TEAM_OWNER: Record<string, string> = Object.fromEntries(
  POOL.flatMap((p) => p.teams.map((t) => [t.name, p.name]))
);

export const ALL_TEAMS: TeamSeed[] = POOL.flatMap((p) => p.teams);
