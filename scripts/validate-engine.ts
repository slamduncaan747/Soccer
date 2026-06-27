// Engine regression checks — run with `npm run validate:engine`.
//
// These exercise the projection math directly (no network, no app fallbacks) and
// assert the invariants that have regressed before: no negative or phantom
// expected points, current points that include every realized win, knockout
// points that match the simulation, and a finish-place distribution that is a
// proper probability. Inputs are built inline — the app itself never fabricates
// odds (a broken feed produces an error screen, not modeled numbers).
//
// Pure assertions, no test framework — exits non-zero on any failure.

import { runProjection } from "../src/lib/engine";
import { marketProb } from "../src/lib/kalshi";
import { ALL_TEAMS } from "../src/data/pool";
import type { GroupFixture, KnockoutOdds, Stage } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

const KO: Stage[] = ["r32", "r16", "qf", "sf", "final", "champion"];

// Synthetic but COHERENT inputs (monotone reach ladders, normalized 3-way odds).
function synthGroupFixtures(): GroupFixture[] {
  const names = ALL_TEAMS.map((t) => t.name);
  const fixtures: GroupFixture[] = [];
  for (let i = 0; i + 1 < names.length; i += 2) {
    fixtures.push({
      id: `g${i}`, home: names[i], away: names[i + 1],
      oddsHome: { win: 0.45, draw: 0.27, loss: 0.28 },
    });
  }
  return fixtures;
}
function synthKnockout(): KnockoutOdds[] {
  return ALL_TEAMS.map((t, idx) => {
    let p = 0.2 + (idx % 5) * 0.13; // vary entry probability across teams
    const reach: Partial<Record<Stage, number>> = {};
    for (const s of KO) { reach[s] = p; p *= 0.55; } // monotone decreasing
    return { team: t.name, reach };
  });
}

// ── A: full coherent input — distributional invariants & MC↔analytic ────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 0, d: 0, l: 0, koWins: 0 }));
  const r = runProjection({ records, groupFixtures: synthGroupFixtures(), knockoutOdds: synthKnockout(), iterations: 20000 });
  console.log("\n=== A: coherent full input ===");
  const allTeams = r.players.flatMap((p) => p.teams);
  check("A: no negative expected team points", allTeams.every((t) => t.expectedFinalPoints >= 0));
  check("A: every team has positive expected (games ahead)", allTeams.every((t) => t.expectedFinalPoints > 0));
  const sumFirst = r.players.reduce((s, p) => s + p.pFirst, 0);
  check("A: Σ pFirst ≈ 1", Math.abs(sumFirst - 1) < 0.02, `Σ=${sumFirst.toFixed(4)}`);
  for (let rank = 0; rank < 6; rank++) {
    const col = r.players.reduce((s, p) => s + (p.finishDistribution[rank] ?? 0), 0);
    check(`A: Σ P(rank ${rank + 1}) ≈ 1`, Math.abs(col - 1) < 0.02, `Σ=${col.toFixed(4)}`);
  }
  for (const p of r.players) {
    const analytic = p.teams.reduce((s, t) => s + t.expectedFinalPoints, 0);
    check(`A: ${p.player} MC≈analytic`, Math.abs(p.expectedFinalPoints - analytic) < 1.0,
      `MC=${p.expectedFinalPoints} analytic=${analytic.toFixed(2)}`);
  }
}

// ── B: confirmed champion via reach=1 (reach-only path) ─────────────────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 2, d: 0, l: 0, koWins: 0 }));
  const knockoutOdds: KnockoutOdds[] = ALL_TEAMS.map((t) =>
    t.name === "Argentina"
      ? { team: t.name, reach: { r32: 1, r16: 1, qf: 1, sf: 1, final: 1, champion: 1 } }
      : { team: t.name, reach: {} }
  );
  const r = runProjection({ records, groupFixtures: [], knockoutOdds, iterations: 20000 });
  console.log("\n=== B: champion (all reach=1) ===");
  const a = r.players.flatMap((p) => p.teams).find((t) => t.team === "Argentina")!;
  check("B: champion current = 6 (group)", a.currentPoints === 6, `cp=${a.currentPoints}`);
  check("B: champion expected = 6 + 5×3 = 21", Math.abs(a.expectedFinalPoints - 21) < 0.01, `exp=${a.expectedFinalPoints}`);
  check("B: champion expectedRemainingWins = 5", Math.abs(a.expectedRemainingWins - 5) < 0.01, `erw=${a.expectedRemainingWins}`);
}

// ── C: live knockout — current points include realized knockout wins ────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 2, d: 0, l: 0, koWins: 0 }));
  records.find((r) => r.name === "Brazil")!.koWins = 2; // won R32 + R16, in QF
  const knockoutOdds: KnockoutOdds[] = ALL_TEAMS.map((t) =>
    t.name === "Brazil"
      ? { team: t.name, reach: { qf: 0.6, sf: 0.35, final: 0.18, champion: 0.1 } } // entry markets settled away
      : { team: t.name, reach: {} }
  );
  const r = runProjection({ records, groupFixtures: [], knockoutOdds, iterations: 30000 });
  console.log("\n=== C: live knockout (Brazil 2 KO wins) ===");
  const b = r.players.flatMap((p) => p.teams).find((t) => t.team === "Brazil")!;
  check("C: current includes knockout wins (6+6=12)", b.currentPoints === 12, `cp=${b.currentPoints}`);
  check("C: expected = current + 3·future reach", Math.abs(b.expectedFinalPoints - 13.89) < 0.05, `exp=${b.expectedFinalPoints}`);
  check("C: expected ≥ current", b.expectedFinalPoints >= b.currentPoints - 0.01);
  const owner = r.players.find((p) => p.teams.some((t) => t.team === "Brazil"))!;
  const analytic = owner.teams.reduce((s, t) => s + t.expectedFinalPoints, 0);
  check("C: owner MC≈analytic (no double count)", Math.abs(owner.expectedFinalPoints - analytic) < 1.0,
    `MC=${owner.expectedFinalPoints} analytic=${analytic.toFixed(2)}`);
}

// ── D: eliminated team, incoherent reach (no R32, stale downstream) ──────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 0, d: 0, l: 2, koWins: 0 }));
  const knockoutOdds: KnockoutOdds[] = ALL_TEAMS.map((t) =>
    t.name === "Panama"
      ? { team: t.name, reach: { r16: 0.4, qf: 0.3, sf: 0.2, final: 0.12, champion: 0.06 } } // NO r32
      : { team: t.name, reach: {} }
  );
  const r = runProjection({ records, groupFixtures: [], knockoutOdds, iterations: 20000 });
  console.log("\n=== D: incoherent reach ladder (no R32) ===");
  const p = r.players.flatMap((x) => x.teams).find((t) => t.team === "Panama")!;
  check("D: current = 0", p.currentPoints === 0, `cp=${p.currentPoints}`);
  check("D: expected ≈ current (downstream reach gated by R32)",
    Math.abs(p.expectedFinalPoints - p.currentPoints) < 0.05, `cur=${p.currentPoints} exp=${p.expectedFinalPoints}`);
  check("D: shows eliminated (erw≈0)", p.expectedRemainingWins < 0.05, `erw=${p.expectedRemainingWins}`);
}

// ── E: koWins=0 must not floor R32 (a low-qualify team stays small) ──────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 0, d: 0, l: 0, koWins: 0 }));
  const knockoutOdds: KnockoutOdds[] = ALL_TEAMS.map((t) =>
    t.name === "Jordan"
      ? { team: t.name, reach: { r32: 0.1, r16: 0.04, qf: 0.015, sf: 0.005 } }
      : { team: t.name, reach: {} }
  );
  const r = runProjection({ records, groupFixtures: [], knockoutOdds, iterations: 20000 });
  console.log("\n=== E: koWins=0 does not floor R32 ===");
  const j = r.players.flatMap((p) => p.teams).find((t) => t.team === "Jordan")!;
  check("E: low-qualify team expected is small", j.expectedFinalPoints < 0.5, `exp=${j.expectedFinalPoints}`);
  check("E: expected positive (reach not zeroed)", j.expectedFinalPoints > 0, `exp=${j.expectedFinalPoints}`);
}

// ── F: marketProb rejects empty/illiquid books (the 50/50 phantom) ──────────
{
  console.log("\n=== F: marketProb empty-book handling ===");
  const mp = (bid: string | null, ask: string | null, last: string | null = null) =>
    marketProb({ ticker: "t", yes_bid_dollars: bid, yes_ask_dollars: ask, last_price_dollars: last } as any);
  check("F: empty book bid0/ask1 → null (NOT 0.5)", mp("0", "1") === null, `got ${mp("0", "1")}`);
  check("F: both quotes missing → null", mp(null, null) === null, `got ${mp(null, null)}`);
  check("F: real tossup 0.48/0.52 → ~0.5", Math.abs((mp("0.48", "0.52") ?? -1) - 0.5) < 0.001);
  check("F: favorite 0.90/0.95 → ~0.925", Math.abs((mp("0.90", "0.95") ?? -1) - 0.925) < 0.001);
  check("F: longshot 0.02/0.06 → ~0.04", Math.abs((mp("0.02", "0.06") ?? -1) - 0.04) < 0.001);
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
