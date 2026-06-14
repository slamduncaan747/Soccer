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
  TournamentFactor,
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
    // KNOCKOUT_STAGES are six cumulative reach levels (r32 … champion). A team
    // "wins" the match between level i and i+1 with conditional probability
    // reach[i+1] / reach[i]; there are five such matches.
    const levels = KNOCKOUT_STAGES;
    const reachFirst = clamp01(reach[levels[0]] ?? 0);
    const condWin: number[] = [];
    let analyticWins = 0;
    for (let i = 0; i < levels.length - 1; i++) {
      const here = clamp01(reach[levels[i]] ?? 0);
      const nextReach = clamp01(reach[levels[i + 1]] ?? 0);
      // conditional prob of winning THIS match given alive at this level
      condWin.push(here > 0 ? clamp01(nextReach / here) : 0);
      // analytic expected wins contribution = P(reach next level) = nextReach
      analyticWins += nextReach;
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
  const firstTotal = new Float64Array(P);    // Σ rank-1 credit over all iters (→ pFirst)

  // ---- Knockout-milestone bookkeeping --------------------------------------
  // To rank the high-variance "what-if" factors (e.g. "Portugal reaches the SF"),
  // we record, per iteration, the deepest knockout level each team reached
  // (0 = out before R32, 1 = R32, … 6 = champion), then histogram first-place
  // credit by (team, level). Suffix-summing later gives, for any reach threshold,
  // P(team reaches it) and P(player wins pool | team did / didn't reach it).
  const T = teams.length;
  const LEVELS = 7; // 0..6
  const teamLevel = new Int8Array(T);                 // per-iter deepest level per team
  const teamLevelN = new Float64Array(T * LEVELS);    // count of iters at each exact level
  const teamLevelFirst = new Float64Array(T * LEVELS * P); // Σ first credit at each exact level

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

    // 2) Knockout — sequential survival per team. Track deepest level reached:
    //    level 1 = R32, then +1 per match won, up to 6 = champion.
    for (let ti = 0; ti < T; ti++) {
      const t = teams[ti];
      if (rng() >= t.reachFirst) { teamLevel[ti] = 0; continue; } // missed R32
      let level = 1; // reached R32
      for (let s = 0; s < t.condWin.length; s++) {
        if (rng() < t.condWin[s]) {
          addWinByOwner(pts, playerIndex, t.owner);
          level++;
        } else {
          break;
        }
      }
      teamLevel[ti] = level;
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
    for (let i = 0; i < P; i++) firstTotal[i] += firstCredit[i];

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

    // Attribute credit to each team's deepest-level bucket for milestone factors.
    for (let ti = 0; ti < T; ti++) {
      const lvl = teamLevel[ti];
      teamLevelN[ti * LEVELS + lvl]++;
      const base = (ti * LEVELS + lvl) * P;
      for (let i = 0; i < P; i++) teamLevelFirst[base + i] += firstCredit[i];
    }
  }

  // ---- Resolve per-fixture swing from the conditional first-place rates -----
  // swing[player] = P(player wins pool | this fixture was a home win)
  //               − P(...| away win). Because each fixture's outcome is drawn
  // independently of all others, this conditional contrast is the causal effect
  // of the result on that player's title odds. The two conditional rates are
  // estimated from DISJOINT iteration buckets (home-win iters vs away-win iters),
  // so the contrast's variance is the sum of two binomial-proportion variances —
  // small for coin-flip games, large for lopsided ones where one bucket is thin.
  const fixtureProjections: FixtureProjection[] = oddFixtures.map((f, fi) => {
    const base = fi * P;
    const nH = homeN[fi];
    const nA = awayN[fi];
    let best = 0;
    let bestSE = 0;
    let bestPlayer: string | undefined;
    let toward: "home" | "away" | undefined;
    // Raw conditional title odds per player: P(win pool | home win) and | away win.
    const playerSwings: { player: string; pHome: number; pAway: number }[] = [];
    if (nH > 0 && nA > 0) {
      for (let i = 0; i < P; i++) {
        const pHome = homeFirst[base + i] / nH;
        const pAway = awayFirst[base + i] / nA;
        playerSwings.push({ player: players[i], pHome: round4(pHome), pAway: round4(pAway) });
        const d = Math.abs(pHome - pAway);
        if (d > best) {
          best = d;
          // SE of the difference of two independent binomial proportions.
          bestSE = Math.sqrt(
            (pHome * (1 - pHome)) / nH + (pAway * (1 - pAway)) / nA
          );
          bestPlayer = players[i];
          toward = pHome > pAway ? "home" : "away";
        }
      }
    }
    playerSwings.sort((a, b) => Math.abs(b.pHome - b.pAway) - Math.abs(a.pHome - a.pAway));
    return {
      id: f.id,
      home: f.home,
      away: f.away,
      homeOwner: TEAM_OWNER[f.home] ?? "—",
      awayOwner: TEAM_OWNER[f.away] ?? "—",
      kickoff: f.kickoff,
      oddsHome: f.oddsHome,
      swing: round4(best),
      swingSE: round4(bestSE),
      swingPlayer: bestPlayer,
      swingToward: toward,
      playerSwings,
    };
  });
  fixtureProjections.sort((a, b) => b.swing - a.swing);

  const knockoutTeams = teams.filter((t) => t.reachFirst > 0).length;

  // ---- High-variance knockout factors per player ---------------------------
  // For every (team, reach-threshold) we know P(team reaches it) = q and the
  // player's title odds with / without it. The *explained variance*
  //   EV = q(1−q)(pYes − pNo)²
  // ranks how much a factor actually moves the needle: it is large only when the
  // event is genuinely uncertain (q near ½) AND it shifts the player's odds — so
  // longshots like "Curacao wins the cup" (q≈0) fall out automatically. We keep,
  // per player, the single highest-EV milestone per team, then the top few teams.
  const stageVerb: Record<Stage, string> = {
    group: "plays the group stage",
    r32: "reaches the knockout stage",
    r16: "reaches the Round of 16",
    qf: "reaches the Quarterfinal",
    sf: "reaches the Semifinal",
    final: "reaches the Final",
    champion: "wins the World Cup",
  };
  const reachStages = KNOCKOUT_STAGES; // r32 … champion (levels 1..6)
  const playerFactors = players.map((p, pi) => {
    const total = firstTotal[pi];
    const perTeam: TournamentFactor[] = [];
    for (let ti = 0; ti < T; ti++) {
      // suffix sums: nAtLeast[L] = iters where team reached at least level L,
      // firstAtLeast[L] = this player's first-place credit over those iters.
      let cumN = 0;
      let runFirst = 0;
      const nAtLeast: number[] = new Array(LEVELS).fill(0);
      const firstAtLeast: number[] = new Array(LEVELS).fill(0);
      for (let lvl = LEVELS - 1; lvl >= 0; lvl--) {
        cumN += teamLevelN[ti * LEVELS + lvl];
        runFirst += teamLevelFirst[(ti * LEVELS + lvl) * P + pi];
        nAtLeast[lvl] = cumN;
        firstAtLeast[lvl] = runFirst;
      }
      let bestEV = 0;
      let bestFactor: TournamentFactor | null = null;
      for (let lvl = 1; lvl < LEVELS; lvl++) {
        const stage = reachStages[lvl - 1];
        const nYes = nAtLeast[lvl];
        const q = nYes / iterations;
        if (q < 0.04 || q > 0.96) continue; // not uncertain enough to matter
        const nNo = iterations - nYes;
        if (nYes < 50 || nNo < 50) continue;
        const pYes = firstAtLeast[lvl] / nYes;
        const pNo = (total - firstAtLeast[lvl]) / nNo;
        const ev = q * (1 - q) * (pYes - pNo) * (pYes - pNo);
        if (ev > bestEV) {
          bestEV = ev;
          bestFactor = {
            team: teams[ti].name,
            owner: teams[ti].owner,
            stage,
            label: `${teams[ti].name} ${stageVerb[stage]}`,
            prob: round4(q),
            pYes: round4(pYes),
            pNo: round4(pNo),
            impact: round4(Math.sqrt(ev)),
          };
        }
      }
      if (bestFactor) perTeam.push(bestFactor);
    }
    perTeam.sort((a, b) => b.impact - a.impact);
    // Surface both upside (a team's run that HELPS this player — usually their own)
    // and downside (a rival's run that HURTS), so the picture isn't all good news.
    const boosts = perTeam.filter((f) => f.pYes >= f.pNo).slice(0, 4);
    const risks = perTeam.filter((f) => f.pYes < f.pNo).slice(0, 2);
    const factors = [...boosts, ...risks].sort((a, b) => b.impact - a.impact);
    return { player: p, factors };
  });

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
    playerFactors,
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
