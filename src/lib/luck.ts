import { TeamSeed, TEAM_OWNER, POOL } from "../data/pool";
import { pointsFor, POINTS } from "./scoring";
import { teamStrength, AVG_STRENGTH } from "./mockOdds";
import { PlayerLuck, TeamLuck } from "./types";

// ---------------------------------------------------------------------------
// LUCK MODEL — performance vs. expectation.
//
// The pool is won on points, but points conflate two things: how GOOD your
// teams are and how LUCKY they've been. This module isolates the luck.
//
// For every game a team has actually played, a pre-match strength model says
// how many points that game was "worth" in expectation (P(win)*3 + P(draw)*1).
// Summed over the games played, that's the team's EXPECTED points. The gap
// between what it actually banked and that expectation is its luck:
//
//     luck = actualPoints − expectedPoints
//
// > 0  ⇒ over-performing (winning games it was projected to lose/draw) — lucky.
// < 0  ⇒ under-performing — unlucky.
//
// A player's luck is the sum across their eight teams. We report it three ways:
//   • luck         — total points above/below expectation (the headline swing)
//   • luckPerGame  — luck normalised by games played (comparable across players)
//   • luckIndex    — actual ÷ expected (1.0 = bang on, 1.2 = +20% over)
//
// The expectation uses each team's actual opponent when that's known (from the
// finished-match schedule); otherwise it falls back to an average-strength
// opponent, so the metric works on seed data alone and sharpens as live
// results arrive.
// ---------------------------------------------------------------------------

// A completed match with known opponents, used to sharpen the expectation.
export interface PlayedMatch {
  home: string; // canonical team name
  away: string;
}

// Expected points for ONE match for a team of strength `s` against an opponent
// of strength `sOpp`. Mirrors the 3-way odds shape used elsewhere (mockOdds)
// so the luck baseline is consistent with the rest of the app's model.
function expectedPointsVs(s: number, sOpp: number): number {
  const total = s + sOpp || 1;
  const winRaw = 0.15 + 0.7 * (s / total);
  const lossRaw = 0.15 + 0.7 * (sOpp / total);
  const drawRaw = 0.28;
  const sum = winRaw + drawRaw + lossRaw;
  const pWin = winRaw / sum;
  const pDraw = drawRaw / sum;
  // POINTS.loss is 0, so the loss branch contributes nothing.
  return pWin * POINTS.win + pDraw * POINTS.draw;
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

export function computeLuck(
  records: TeamSeed[],
  played: PlayedMatch[] = []
): PlayerLuck[] {
  // For each team, collect the strengths of opponents it has a known game
  // against. We consume these first when building the expectation, then top up
  // any remaining played games with the average-strength opponent.
  const oppStrengths = new Map<string, number[]>();
  const pushOpp = (team: string, oppStrength: number) => {
    const arr = oppStrengths.get(team);
    if (arr) arr.push(oppStrength);
    else oppStrengths.set(team, [oppStrength]);
  };
  for (const m of played) {
    pushOpp(m.home, teamStrength(m.away));
    pushOpp(m.away, teamStrength(m.home));
  }

  const teamLuck = new Map<string, TeamLuck>();
  for (const t of records) {
    const gamesPlayed = t.w + t.d + t.l;
    const actualPoints = pointsFor(t.w, t.d, t.l);

    // Expected points: real opponents where we have them, average field for the
    // rest. We only ever use up to `gamesPlayed` opponents (the record is the
    // source of truth for how many games actually happened).
    const s = teamStrength(t.name);
    const opps = oppStrengths.get(t.name) ?? [];
    let expectedPoints = 0;
    for (let i = 0; i < gamesPlayed; i++) {
      const sOpp = i < opps.length ? opps[i] : AVG_STRENGTH;
      expectedPoints += expectedPointsVs(s, sOpp);
    }

    teamLuck.set(t.name, {
      team: t.name,
      owner: TEAM_OWNER[t.name] ?? "—",
      gamesPlayed,
      actualPoints,
      expectedPoints: round2(expectedPoints),
      luck: round2(actualPoints - expectedPoints),
    });
  }

  // Aggregate to players.
  const players: PlayerLuck[] = POOL.map((p) => {
    const teams = p.teams
      .map((t) => teamLuck.get(t.name))
      .filter((x): x is TeamLuck => x != null)
      .sort((a, b) => b.luck - a.luck);

    const gamesPlayed = teams.reduce((s, t) => s + t.gamesPlayed, 0);
    const actualPoints = teams.reduce((s, t) => s + t.actualPoints, 0);
    const expectedPoints = teams.reduce((s, t) => s + t.expectedPoints, 0);
    const luck = actualPoints - expectedPoints;

    return {
      player: p.name,
      gamesPlayed,
      actualPoints,
      expectedPoints: round2(expectedPoints),
      luck: round2(luck),
      luckPerGame: gamesPlayed > 0 ? round2(luck / gamesPlayed) : 0,
      luckIndex: expectedPoints > 0 ? round2(actualPoints / expectedPoints) : 1,
      teams,
    };
  });

  // Luckiest first.
  players.sort((a, b) => b.luck - a.luck);
  return players;
}
