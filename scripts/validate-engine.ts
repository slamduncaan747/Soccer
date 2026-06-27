// Engine regression checks — run with `npm run validate:engine`.
//
// These exercise the projection math directly (no network) and assert the
// invariants that have regressed before: no negative or phantom expected points,
// current points that include every realized win, knockout points that match the
// simulation, and a finish-place distribution that is a proper probability.
//
// Pure assertions, no test framework — exits non-zero on any failure so it can
// gate CI or a pre-push hook.

import { runProjection } from "../src/lib/engine";
import { ALL_TEAMS } from "../src/data/pool";
import { mockGroupFixtures, mockKnockoutOdds } from "../src/lib/mockOdds";
import type { GroupFixture, KnockoutOdds } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

// ── A: pre-tournament (no games played) ─────────────────────────────────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 0, d: 0, l: 0, koWins: 0 }));
  const groupFixtures = mockGroupFixtures(records);
  const knockoutOdds = mockKnockoutOdds(records);
  const r = runProjection({ records, groupFixtures, knockoutOdds, iterations: 20000 });

  console.log("\n=== A: pre-tournament ===");
  const allTeams = r.players.flatMap((p) => p.teams);
  check("A: no negative expected team points", allTeams.every((t) => t.expectedFinalPoints >= 0));
  check("A: every team has positive expected (group games ahead)", allTeams.every((t) => t.expectedFinalPoints > 0));
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

// ── B: a team eliminated in the group with 0 points → no phantom points ──────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 1, d: 0, l: 1, koWins: 0 })); // all finished 2 games
  const dead = records.find((r) => r.name === "Curacao")!;
  dead.w = 0; dead.d = 0; dead.l = 2; // played 2, lost 2 → eliminated, 0 pts

  const groupFixtures: GroupFixture[] = mockGroupFixtures(records); // expect none remaining
  const knockoutOdds: KnockoutOdds[] = mockKnockoutOdds(records);
  const r = runProjection({ records, groupFixtures, knockoutOdds, iterations: 20000 });

  console.log("\n=== B: eliminated 0-point team ===");
  check("B: no remaining mock group games", groupFixtures.length === 0, `got ${groupFixtures.length}`);
  const c = r.players.flatMap((p) => p.teams).find((t) => t.team === "Curacao")!;
  check("B: eliminated team current = 0", c.currentPoints === 0, `cp=${c.currentPoints}`);
  check("B: eliminated team expected = current", Math.abs(c.expectedFinalPoints - c.currentPoints) < 0.01,
    `exp=${c.expectedFinalPoints}`);
  check("B: eliminated team shows eliminated (erw≈0)", c.expectedRemainingWins < 0.05, `erw=${c.expectedRemainingWins}`);
  check("B: no negative expected points", r.players.flatMap((p) => p.teams).every((t) => t.expectedFinalPoints >= 0));
}

// ── C: confirmed champion via reach=1 (reach-only path) ──────────────────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 2, d: 0, l: 0, koWins: 0 }));
  const knockoutOdds: KnockoutOdds[] = ALL_TEAMS.map((t) =>
    t.name === "Argentina"
      ? { team: t.name, reach: { r32: 1, r16: 1, qf: 1, sf: 1, final: 1, champion: 1 } }
      : { team: t.name, reach: {} }
  );
  const r = runProjection({ records, groupFixtures: [], knockoutOdds, iterations: 20000 });
  console.log("\n=== C: champion (all reach=1) ===");
  const a = r.players.flatMap((p) => p.teams).find((t) => t.team === "Argentina")!;
  check("C: champion current = 6 (group)", a.currentPoints === 6, `cp=${a.currentPoints}`);
  check("C: champion expected = 6 + 5×3 = 21", Math.abs(a.expectedFinalPoints - 21) < 0.01, `exp=${a.expectedFinalPoints}`);
  check("C: champion expectedRemainingWins = 5", Math.abs(a.expectedRemainingWins - 5) < 0.01, `erw=${a.expectedRemainingWins}`);
}

// ── D: live knockout — current points include realized knockout wins ─────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 2, d: 0, l: 0, koWins: 0 }));
  records.find((r) => r.name === "Brazil")!.koWins = 2; // won R32 + R16, in QF
  const knockoutOdds: KnockoutOdds[] = ALL_TEAMS.map((t) =>
    t.name === "Brazil"
      ? { team: t.name, reach: { qf: 0.6, sf: 0.35, final: 0.18, champion: 0.1 } } // entry markets settled away
      : { team: t.name, reach: {} }
  );
  const r = runProjection({ records, groupFixtures: [], knockoutOdds, iterations: 30000 });
  console.log("\n=== D: live knockout (Brazil 2 KO wins) ===");
  const b = r.players.flatMap((p) => p.teams).find((t) => t.team === "Brazil")!;
  check("D: current includes knockout wins (6+6=12)", b.currentPoints === 12, `cp=${b.currentPoints}`);
  check("D: expected = current + 3·future reach", Math.abs(b.expectedFinalPoints - 13.89) < 0.05, `exp=${b.expectedFinalPoints}`);
  check("D: expected ≥ current", b.expectedFinalPoints >= b.currentPoints - 0.01);
  const owner = r.players.find((p) => p.teams.some((t) => t.team === "Brazil"))!;
  const analytic = owner.teams.reduce((s, t) => s + t.expectedFinalPoints, 0);
  check("D: owner MC≈analytic (no double count)", Math.abs(owner.expectedFinalPoints - analytic) < 1.0,
    `MC=${owner.expectedFinalPoints} analytic=${analytic.toFixed(2)}`);
}

// ── E: eliminated team with incoherent reach (no R32, stale downstream) ──────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 1, d: 0, l: 1, koWins: 0 }));
  const j = records.find((r) => r.name === "Jordan")!;
  j.w = 0; j.d = 0; j.l = 2; // 0-0-2, eliminated
  const groupFixtures: GroupFixture[] = mockGroupFixtures(records);
  const knockoutOdds: KnockoutOdds[] = ALL_TEAMS.map((t) =>
    t.name === "Jordan"
      ? { team: t.name, reach: { r16: 0.4, qf: 0.3, sf: 0.2, final: 0.12, champion: 0.06 } } // NO r32
      : { team: t.name, reach: {} }
  );
  const r = runProjection({ records, groupFixtures, knockoutOdds, iterations: 20000 });
  console.log("\n=== E: incoherent reach ladder (no R32) ===");
  const jp = r.players.flatMap((p) => p.teams).find((t) => t.team === "Jordan")!;
  check("E: current = 0", jp.currentPoints === 0, `cp=${jp.currentPoints}`);
  check("E: expected ≈ current (downstream reach gated by R32)",
    Math.abs(jp.expectedFinalPoints - jp.currentPoints) < 0.05, `cur=${jp.currentPoints} exp=${jp.expectedFinalPoints}`);
  check("E: shows eliminated (erw≈0)", jp.expectedRemainingWins < 0.05, `erw=${jp.expectedRemainingWins}`);
}

// ── F: koWins=0 must not floor R32 (a low-qualify team stays small) ──────────
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 0, d: 0, l: 0, koWins: 0 }));
  const knockoutOdds: KnockoutOdds[] = ALL_TEAMS.map((t) =>
    t.name === "Jordan"
      ? { team: t.name, reach: { r32: 0.1, r16: 0.04, qf: 0.015, sf: 0.005 } }
      : { team: t.name, reach: {} }
  );
  const r = runProjection({ records, groupFixtures: [], knockoutOdds, iterations: 20000 });
  console.log("\n=== F: koWins=0 does not floor R32 ===");
  const jp = r.players.flatMap((p) => p.teams).find((t) => t.team === "Jordan")!;
  check("F: low-qualify team expected is small", jp.expectedFinalPoints < 0.5, `exp=${jp.expectedFinalPoints}`);
  check("F: expected positive (reach not zeroed)", jp.expectedFinalPoints > 0, `exp=${jp.expectedFinalPoints}`);
}

// ── G: mock knockout fallback zeroes a winless 2-game team even when another ──
//     group has already finished 3 games (groupGames inferred as 3). This guards
//     the production path where Kalshi knockout markets are unavailable.
{
  const records = ALL_TEAMS.map((t) => ({ ...t, w: 1, d: 0, l: 1, koWins: 0 })); // most teams 2 games
  records.find((r) => r.name === "Argentina")!.w = 3; // one team finished 3 → groupGames=3
  records.find((r) => r.name === "Argentina")!.l = 0;
  const panama = records.find((r) => r.name === "Panama")!;
  panama.w = 0; panama.d = 0; panama.l = 2; // winless after 2 → eliminated

  const knockoutOdds = mockKnockoutOdds(records); // mock fallback path
  const panamaReach = knockoutOdds.find((k) => k.team === "Panama")!.reach;
  console.log("\n=== G: mock fallback zeroes winless 2-game team (groupGames=3) ===");
  const reachVals = Object.values(panamaReach);
  check("G: Panama mock reach all zero", reachVals.every((v) => v === 0), `reach=${JSON.stringify(panamaReach)}`);

  const groupFixtures: GroupFixture[] = mockGroupFixtures(records);
  const r = runProjection({ records, groupFixtures, knockoutOdds, iterations: 20000 });
  const pj = r.players.flatMap((p) => p.teams).find((t) => t.team === "Panama")!;
  check("G: Panama expected ≈ current (no mock phantom)",
    Math.abs(pj.expectedFinalPoints - pj.currentPoints) < 0.2, `cur=${pj.currentPoints} exp=${pj.expectedFinalPoints}`);
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
