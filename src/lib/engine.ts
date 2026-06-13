import { POOL, TEAM_OWNER, TeamSeed } from "../data/pool";
import { pointsFor, POINTS, expectedMatchPoints } from "./scoring";
import {
  FixtureProjection,
  GroupFixture,
  KnockoutOdds,
  KNOCKOUT_STAGES,
  PlayerProjection,
  ProjectionResult,
  Stage,
  TeamProjection,
} from "./types";
import { mulberry32 } from "./probability";

// ---------------------------------------------------------------------------
// MODEL
//
// A player's final score = 3 * (total team wins). Only wins score (POINTS rule).
// "Win probability" = P(a player finishes 1st on the leaderboard). Because that
// depends on the JOINT distribution of all six players' totals (with ties, and
// with correlation when two owned teams meet), the statistically correct way to
// get it is Monte Carlo over all remaining match outcomes — not expected points.
//
// Remaining wins come from two phases:
//
//  GROUP STAGE — per-match 3-way (W/D/L) odds from Kalshi. Each unplayed group
//  fixture is a categorical draw {home win, draw, away win}. A win adds POINTS.win
//  to the owner of the winning team. Fixtures where both teams are pool teams are
//  naturally correlated (one team's win is the other's loss) — the sim handles
//  this exactly because it draws ONE outcome per fixture.
//
//  KNOCKOUT STAGE — derived from Kalshi "team to reach round X" markets.
//  In a single-elimination bracket a team plays a match in round r iff it
//  reached round r, and it WINS that match iff it reaches round r+1.
//  So, conditional on reaching r, P(win the round-r match) = reach[r+1] / reach[r].
//  Expected knockout wins for a team = sum over rounds of reach[r+1]
//  (since P(reach r) * P(win | reached r) = reach[r+1]). For the SIMULATION we
//  draw each round sequentially: alive_{r+1} = alive_r AND Bernoulli(reach[r+1]/reach[r]),
//  which reproduces the marginal reach probabilities and yields integer win counts.
//
//  The 48-team format: 32 teams advance from groups to a Round of 32, then
//  R16 -> QF -> SF -> Final. A team that wins the Final has 5 knockout wins max.
// ---------------------------------------------------------------------------

export interface EngineInput {
  records: TeamSeed[];           // current (live-merged) W/D/L per team
  groupFixtures: GroupFixture[]; // remaining group matches w/ odds
  knockoutOdds: KnockoutOdds[];  // per-team reach probabilities
  iterations?: number;
  seed?: number;
}

interface TeamRuntime {
  name: string;
  owner: string;
  currentWins: number;
  // sequential conditional win prob per knockout round (index aligned to KNOCKOUT_STAGES)
  condWin: number[];
  reachFirst: number; // P(reach the first knockout round, r32)
  expRemainingWins: number; // analytic, for display
}

function buildTeamRuntime(input: EngineInput): TeamRuntime[] {
  const koMap = new Map(input.knockoutOdds.map((k) => [k.team, k.reach]));
  return input.records.map((t) => {
    const reach = koMap.get(t.name) || {};
    const stages = KNOCKOUT_STAGES;
    // reach[r32] is entry prob; subsequent are conditional win probs.
    const reachFirst = clamp01(reach[stages[0]] ?? 0);
    const condWin: number[] = [];
    let analyticWins = 0;
    let prevReach = reachFirst;
    for (let i = 0; i < stages.length; i++) {
      const here = clamp01(reach[stages[i]] ?? 0);
      const nextReach = i + 1 < stages.length ? clamp01(reach[stages[i + 1]] ?? 0) : winFinalProb(reach);
      // conditional prob of winning THIS round's match given alive at this round
      const cw = here > 0 ? clamp01(nextReach / here) : 0;
      condWin.push(cw);
      // analytic expected wins contribution = P(reach next round) = nextReach
      analyticWins += nextReach;
      prevReach = here;
    }
    return {
      name: t.name,
      owner: TEAM_OWNER[t.name] ?? "—",
      currentWins: t.w,
      condWin,
      reachFirst,
      expRemainingWins: analyticWins,
    };
  });
}

// P(win the final) — if a dedicated "win cup" market exists use it, else
// treat reaching the final with a 50% coin as a fallback.
function winFinalProb(reach: Partial<Record<Stage, number>>): number {
  const finalReach = reach["final"] ?? 0;
  // If a champion market was mapped onto "final" we can't distinguish; assume
  // reach["final"] already encodes "win cup" when present from the champion event.
  return clamp01(finalReach);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Analytic expected REMAINING wins from group play for a single team, summed
// across all its remaining fixtures.
function groupExpectedWins(team: string, fixtures: GroupFixture[]): number {
  let e = 0;
  for (const f of fixtures) {
    if (!f.oddsHome) continue;
    if (f.home === team) e += f.oddsHome.win;
    else if (f.away === team) e += f.oddsHome.loss; // away win prob
  }
  return e;
}

export function runProjection(input: EngineInput): ProjectionResult {
  const iterations = input.iterations ?? 50000;
  const rng = mulberry32(input.seed ?? 0xC0FFEE);
  const teams = buildTeamRuntime(input);
  const teamByName = new Map(teams.map((t) => [t.name, t]));

  // ---- Analytic expected final points (closed form, exact in expectation) ----
  const teamProjections: TeamProjection[] = teams.map((t) => {
    const grpWins = groupExpectedWins(t.name, input.groupFixtures);
    const expRemaining = grpWins + t.expRemainingWins;
    const currentPoints = pointsFor(t.currentWins, 0, 0); // wins only score
    const rec = input.records.find((r) => r.name === t.name);
    return {
      team: t.name,
      owner: t.owner,
      w: rec?.w ?? 0,
      d: rec?.d ?? 0,
      l: rec?.l ?? 0,
      currentPoints,
      expectedRemainingWins: round2(expRemaining),
      expectedFinalPoints: round2(currentPoints + expRemaining * POINTS.win),
    };
  });

  // ---- Monte Carlo for finish-place distribution ----
  const players = POOL.map((p) => p.name);
  const playerIndex = new Map(players.map((p, i) => [p, i]));
  const finishCounts: number[][] = players.map(() => new Array(players.length).fill(0));
  const expFinalAccum = new Array(players.length).fill(0);

  // Precompute per-player current points and team membership for speed.
  const ownerTeams = new Map<string, TeamRuntime[]>();
  for (const t of teams) {
    const arr = ownerTeams.get(t.owner) || [];
    arr.push(t);
    ownerTeams.set(t.owner, arr);
  }
  const basePoints = players.map((p) =>
    (ownerTeams.get(p) || []).reduce((s, t) => s + pointsFor(t.currentWins, 0, 0), 0)
  );

  // ---- Fixture-leverage bookkeeping ----------------------------------------
  // For every remaining group match with odds, we estimate how much its result
  // swings each player's chance of WINNING THE POOL, straight from the MC draws:
  // we bucket each iteration's fractional first-place credit by what this fixture
  // did (home win vs away win), then compare the two conditional distributions.
  const oddFixtures = input.groupFixtures.filter((f) => f.oddsHome);
  const F = oddFixtures.length;
  const P = players.length;
  const outcome = new Int8Array(F); // per-iter: 0 home win, 1 draw, 2 away win
  const homeN = new Float64Array(F);
  const awayN = new Float64Array(F);
  const homeFirst = new Float64Array(F * P); // Σ first-place credit when home won
  const awayFirst = new Float64Array(F * P); // Σ first-place credit when away won
  const firstCredit = new Float64Array(P);   // this iteration's rank-1 credit per player

  for (let it = 0; it < iterations; it++) {
    const pts = basePoints.slice();

    // 1) Group fixtures — one categorical draw each.
    for (let fi = 0; fi < F; fi++) {
      const f = oddFixtures[fi];
      const r = rng();
      const { win, draw } = f.oddsHome!;
      if (r < win) {
        outcome[fi] = 0;
        addWin(pts, playerIndex, f.home);
      } else if (r < win + draw) {
        outcome[fi] = 1; // draw — no points under win-only rule
      } else {
        outcome[fi] = 2;
        addWin(pts, playerIndex, f.away);
      }
    }

    // 2) Knockout — sequential survival per team.
    for (const t of teams) {
      let alive = rng() < t.reachFirst; // reached R32?
      if (!alive) continue;
      for (let s = 0; s < t.condWin.length; s++) {
        const won = rng() < t.condWin[s];
        if (won) {
          addWinByOwner(pts, playerIndex, t.owner);
        } else {
          alive = false;
          break;
        }
      }
    }

    // 3) Rank players this iteration. Ties are split FRACTIONALLY so the
    //    finish-position probabilities are exact (Σ over players of P(rank r)
    //    = 1 for every r). If g players tie for a block of positions
    //    [start, start+g), each receives 1/g credit spread across those g
    //    positions — the probabilistically correct treatment of a dead heat.
    const order = players
      .map((p, i) => ({ i, v: pts[i] }))
      .sort((a, b) => b.v - a.v);

    let k = 0;
    while (k < order.length) {
      let j = k + 1;
      while (j < order.length && order[j].v === order[k].v) j++;
      const g = j - k; // size of the tied block occupying positions [k, j)
      const perSlot = 1 / g; // each tied player is equally likely in any of the g slots
      for (let m = k; m < j; m++) {
        for (let pos = k; pos < j; pos++) {
          finishCounts[order[m].i][pos] += perSlot;
        }
      }
      k = j;
    }
    for (let i = 0; i < players.length; i++) expFinalAccum[i] += pts[i];

    // Capture this iteration's rank-1 (first place) credit per player: the top
    // tied block shares position 0 equally; everyone else gets 0.
    firstCredit.fill(0);
    let topG = 1;
    while (topG < order.length && order[topG].v === order[0].v) topG++;
    const perTop = 1 / topG;
    for (let m = 0; m < topG; m++) firstCredit[order[m].i] = perTop;

    // Attribute that credit to each fixture's outcome bucket (home/away wins).
    for (let fi = 0; fi < F; fi++) {
      const o = outcome[fi];
      if (o === 0) {
        homeN[fi]++;
        const base = fi * P;
        for (let i = 0; i < P; i++) homeFirst[base + i] += firstCredit[i];
      } else if (o === 2) {
        awayN[fi]++;
        const base = fi * P;
        for (let i = 0; i < P; i++) awayFirst[base + i] += firstCredit[i];
      }
    }
  }

  // ---- Resolve per-fixture swing from the conditional first-place rates -----
  const fixtureProjections: FixtureProjection[] = oddFixtures.map((f, fi) => {
    const base = fi * P;
    let best = 0;
    let bestPlayer: string | undefined;
    let toward: "home" | "away" | undefined;
    if (homeN[fi] > 0 && awayN[fi] > 0) {
      for (let i = 0; i < P; i++) {
        const pHome = homeFirst[base + i] / homeN[fi];
        const pAway = awayFirst[base + i] / awayN[fi];
        const d = Math.abs(pHome - pAway);
        if (d > best) {
          best = d;
          bestPlayer = players[i];
          toward = pHome > pAway ? "home" : "away";
        }
      }
    }
    return {
      id: f.id,
      home: f.home,
      away: f.away,
      homeOwner: TEAM_OWNER[f.home] ?? "—",
      awayOwner: TEAM_OWNER[f.away] ?? "—",
      kickoff: f.kickoff,
      oddsHome: f.oddsHome,
      swing: round4(best),
      swingPlayer: bestPlayer,
      swingToward: toward,
    };
  });
  fixtureProjections.sort((a, b) => b.swing - a.swing);

  const knockoutTeams = teams.filter((t) => t.reachFirst > 0).length;

  const playerProjections: PlayerProjection[] = players.map((p, i) => {
    const dist = finishCounts[i].map((c) => c / iterations);
    const pFirst = dist[0];
    const pTop3 = dist[0] + dist[1] + dist[2];
    const myTeams = teamProjections.filter((t) => t.owner === p);
    return {
      player: p,
      currentPoints: basePoints[i],
      expectedFinalPoints: round2(expFinalAccum[i] / iterations),
      pFirst: round4(pFirst),
      pTop3: round4(pTop3),
      finishDistribution: dist.map(round4),
      teams: myTeams.sort((a, b) => b.expectedFinalPoints - a.expectedFinalPoints),
    };
  });

  playerProjections.sort((a, b) => b.pFirst - a.pFirst || b.expectedFinalPoints - a.expectedFinalPoints);

  return {
    players: playerProjections,
    fixtures: fixtureProjections,
    status: {
      // Sources are filled in by the orchestrator, which knows the real feed
      // outcome; the engine only knows the counts it was handed.
      liveResults: false,
      groupSource: "mock",
      knockoutSource: "mock",
      fixturesWithOdds: F,
      totalFixtures: input.groupFixtures.length,
      knockoutTeams,
    },
    iterations,
    generatedAt: new Date().toISOString(),
    oddsSource: "mixed",
  };
}

function addWin(pts: number[], idx: Map<string, number>, team: string) {
  const owner = TEAM_OWNER[team];
  if (owner == null) return;
  const i = idx.get(owner);
  if (i != null) pts[i] += POINTS.win;
}
function addWinByOwner(pts: number[], idx: Map<string, number>, owner: string) {
  const i = idx.get(owner);
  if (i != null) pts[i] += POINTS.win;
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}
function round4(x: number) {
  return Math.round(x * 10000) / 10000;
}
