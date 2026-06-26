# Soccer Draft Pool — Simulation Model

**Audience:** a statistician evaluating whether the projection is sound.
**Goal of the model:** estimate each pool player's probability of finishing 1st
(and the full finish-place distribution), plus expected final points, for a
fantasy pool drafted over the 2026 Men's World Cup.

This document describes the model **as implemented**. Code references:
`src/lib/engine.ts` (Monte Carlo), `src/lib/orchestrator.ts` (data assembly),
`src/lib/kalshi.ts` / `src/lib/footballData.ts` (inputs), `src/lib/scoring.ts`
(scoring rule).

---

## 1. Pool structure & scoring

- **6 players.** Each player owns **8 teams** (48 teams total — a partition of
  the full 48-team field, no team owned by two players).
- **Scoring rule (`POINTS`):** a team earns **3 points per match won**, **1 for
  a draw**, and **0 for a loss**. A drawn match credits **both** teams in it.
  Knockout matches have no draws (advancement counts as a win), so draws arise
  only in the group stage. A player's score = 3 × (total wins) + 1 × (total
  draws) across their 8 teams.
- The objective quantity, **P(win the pool)**, is the probability a player has
  the strictly-or-tied highest score at tournament end. Because that depends on
  the *joint* distribution of all six players' totals (including ties and the
  correlation induced when two owned teams play each other), it is computed by
  Monte Carlo, not by comparing expected points.

---

## 2. Inputs and how probabilities are derived

### 2.1 Current results (state) — football-data.org
A single call to `/competitions/WC/matches` returns every match with status and
score. From **FINISHED GROUP-STAGE** matches we accumulate each team's current
**W / D / L**. Knockout match results are deliberately **not** tallied here —
they enter the model exclusively through the reach markets of §2.2(b) (a won
knockout match shows up as `reach[next round] → 1`, worth 3 points), so counting
them here as well would double-count. These group records are *realized* results
and enter the simulation as fixed starting points (not random). Each player's
**current points = 3 × (group wins) + 1 × (group draws)** across their 8 teams.

### 2.2 Forward-looking probabilities — Kalshi prediction markets
All forward probabilities are **market-implied** from Kalshi (a regulated
prediction-market exchange). For each market we take the YES probability as the
**bid/ask midpoint** when both sides are quoted, else the last trade price, else
the ask. Prices are already in [0, 1].

Two market families are used:

**(a) Group-stage match markets** (`KXWCGAME`) — one event per group game with
three mutually-exclusive legs: home win, draw, away win. The three YES prices are
**de-vigged** by proportional normalization (divide each by their sum) to yield a
coherent categorical distribution `{win, draw, loss}` summing to 1. (Function
`normalize3`.) There are 72 group games; finished ones are dropped, leaving the
remaining-game fixtures used by the sim.

**(b) Knockout reach markets** — per-team cumulative survival probabilities.
**Six** levels span the **five** knockout matches, so reaching the final and
winning it are modeled as distinct steps:

| Engine level | Meaning | Kalshi source |
|---|---|---|
| `r32`      | reach the Round of 32 (i.e. qualify from group) | `KXWCGROUPQUAL` |
| `r16`      | reach the Round of 16 | `KXWCROUND-*RO16` |
| `qf`       | reach the Quarterfinal | `KXWCROUND-*QUAR` |
| `sf`       | reach the Semifinal | `KXWCROUND-*SEMI` |
| `final`    | **reach** the final (win the semifinal) | `KXWCROUND-*FINAL` |
| `champion` | **win** the final (win the cup) | `KXMENWORLDCUP` |

Each is an independent YES market, so they are **not internally normalized**;
instead the ladder is forced to be **non-increasing** (`monotone`): each level is
capped at the previous one, since reach(r32) ≥ reach(r16) ≥ … ≥ reach(final) ≥
champion must hold. This guards the conditional-probability step in §4.

---

## 3. Group-stage model (per remaining match)

Each remaining group fixture with odds is a single **categorical draw** over
{home win, draw, away win} using its de-vigged probabilities. A "win" outcome
adds 3 points to the **owner of the winning team**; a draw adds 1 point to the
owners of **both** teams.

Fixtures where **both** teams are pool teams are handled exactly: because one
categorical outcome is drawn per fixture, the negative correlation between the
two owners (one team's win is the other's loss/draw) is reproduced without extra
modeling. Fixtures with no market are skipped (contribute 0).

---

## 4. Knockout model (per team)

A single-elimination bracket from the Round of 32. The five knockout matches sit
between the six cumulative reach levels `[r32, r16, qf, sf, final, champion]`: a
team plays the match at level *i* iff it reached level *i*, and **wins it iff it
reaches level *i+1***. From the cumulative reach probabilities:

- P(reach R32) = `reach[r32]` (the entry probability).
- Conditional on being alive at level *i*, the per-match win probability is
  `condWin[i] = reach[i+1] / reach[i]`. The final match uses
  `condWin = champion / reach[final]` — a genuine, separately-priced win
  probability rather than an automatic win.

The simulation draws each team's knockout run **sequentially**:

```
alive = Bernoulli( reach[r32] )                       # reached the bracket?
for i in [r32→r16, r16→qf, qf→sf, sf→final, final→champion]:
    if not alive: break
    won = Bernoulli( reach[i+1] / reach[i] )          # win this match?
    if won: owner gains 3 points; advance
    else:   alive = false
```

This reproduces the correct **marginal** reach probability at every level
(`P(reach i) = reach[i]` by telescoping) while yielding integer win counts.
Expected knockout wins telescopes to `reach[r16] + reach[qf] + reach[sf] +
reach[final] + champion` — five distinct terms, one per match.

Knockout draws are taken **independently across teams** (see §6, L1).

---

## 5. Monte Carlo procedure & outputs

- **Iterations:** default 50,000 (configurable via `?iterations=`).
- **RNG:** `mulberry32`, seeded deterministically (default seed `0xC0FFEE`), so
  runs are **reproducible**. Independence across draws relies on the quality of
  this PRNG.
- **Per iteration:** start each player at `3 × current wins`; add group-stage and
  knockout wins as above; then **rank** the six players by total points.
- **Tie handling (exact):** if *g* players tie for a block of positions
  `[k, k+g)`, each receives `1/g` credit spread across those *g* positions. This
  makes the finish-position matrix a proper distribution — `Σ_players P(rank = r)
  = 1` for every rank *r*, and dead heats for 1st are split fractionally rather
  than broken arbitrarily.

**Reported per player:**
- `pFirst` = P(rank 1) (with fractional tie credit).
- `pTop3` = P(rank ≤ 3).
- `finishDistribution` = full P(rank = 1..6) vector.
- `expectedFinalPoints` = mean total points over iterations. Also computed in
  closed form (analytic expectation) for the per-team display; the two agree up
  to Monte Carlo error.

**Per remaining group fixture — "swing" (leverage):** using the *same* MC draws,
each iteration's fractional first-place credit is bucketed by what the fixture
did (home win vs away win). The swing is
`max over players | P(player wins pool | home win) − P(player wins pool | away
win) |`, i.e. the largest shift in any player's title probability conditional on
that single match's result. Because each fixture's outcome is drawn independently
of all others, this conditional contrast is the causal effect of the result.

The two conditional rates are estimated from **disjoint** iteration buckets
(home-win iters vs away-win iters), so the contrast's variance is the sum of two
binomial-proportion variances. This is reported per fixture as **`swingSE`**
(`√[p_H(1−p_H)/n_H + p_A(1−p_A)/n_A]`) — small for coin-flip games, large for
lopsided ones where one bucket is thin. The UI flags a swing as "noisy" when it is
within ~2 standard errors of zero. We also expose **`playerSwings`** — the signed
delta for *every* player, not just the most-affected one.

---

## 6. Assumptions, independence structure & limitations

These are the points most worth a statistician's scrutiny.

- **L1 — Cross-team independence in the knockout (open).** Each team's knockout
  survival is drawn independently. In reality teams meet in the bracket, so
  survivals are mechanically negatively correlated (exactly one team advances per
  match), and two *pool-owned* teams can meet. The model captures correct
  **marginal** reach probabilities but **not** the bracket's joint dependence.
  Independent draws let several of one player's strong teams deep-run
  simultaneously more freely than a real bracket allows, inflating the **variance**
  of that player's total — and pool-win probability lives in the tails. The effect
  is **potentially first-order for a player holding multiple title contenders**,
  not merely second-order; it is modest for portfolios of comparable, spread-out
  teams. The honest fix is bracket-aware simulation (assign teams to slots and
  simulate actual matchups), which is a substantial rewrite and is additionally
  hard pre-knockout because bracket placement depends on the (randomized) group
  results. Left as a documented approximation.

- **L2 — Terminal stage (RESOLVED).** Previously the ladder had five slots and
  mapped `final` → the champion market, which gated "reach the final" at
  championship probability and made the final match an automatic win — undercounting
  the wins of losing finalists (a high-points, title-deciding scenario). The model
  now uses **six** levels with `final` = P(reach final) from `KXWCROUND-*FINAL`
  and `champion` = P(win the cup) from `KXMENWORLDCUP`, so the final match has its
  own conditional win probability `champion / reach[final]`. The terminal
  approximation is gone.

- **L3 — Market calibration is assumed.** All forward probabilities are taken as
  the *true* probabilities after de-vigging by proportional normalization.
  This inherits any miscalibration or stale pricing in thin markets, and
  proportional de-vig is one of several de-vig conventions (shin / power methods
  differ slightly). Group legs are de-vigged to sum to 1; knockout reach markets
  are independently priced and only monotonicity-corrected, so residual vig is
  not removed there.

- **L4 — Group/knockout coherence gap (open).** A team's group results (random in
  the sim) and its knockout reach probabilities (fixed market inputs) are drawn
  independently. This is correct for *points accounting* (the two phases score
  disjoint matches), but it breaks the *within-iteration correlation*: a team that
  happens to win all three simulated group games still advances at its static
  market rate, and a team that loses all three can still deep-run at that same
  rate. Real performance is autocorrelated, so the per-iteration joint is
  slightly incoherent even though every marginal is correct. The effect on `pFirst`
  is modest; removing it requires deriving knockout odds from the same
  strength model that drives the group draws (i.e. the L1 bracket-aware rewrite).

- **L5 — Static markets within a run.** A projection is a snapshot; market prices
  are cached up to 60s and served stale on rate-limit (does not affect
  statistical properties, only freshness).

- **L6 — Scoring-rule note.** The pool scores **3 points per win, 1 per draw,
  0 per loss** (matches `POINTS` in `scoring.ts`). Draws arise only in the group
  stage; both teams' owners receive the draw point. Seed totals in `pool.ts` may
  not reproduce exactly if they were recorded from a snapshot taken before draw
  scoring was added — use the live FD records in production.

---

## 7. Suggested validation

- **Internal consistency:** confirm MC `expectedFinalPoints` matches the
  closed-form expectation (already computed) within `O(1/√N)`; check
  `Σ_players finishDistribution[r] ≈ 1` per rank.
- **Marginal recovery:** verify simulated per-team reach frequencies match the
  input `reach[*]` markets (tests the §4 construction). Re-run now that L2 is fixed
  — the six-level ladder, including the separate final-match step, should be
  reproduced exactly.
- **Swing error bars:** `swingSE` is now emitted per fixture; confirm reported
  swings exceed their standard error before treating them as real, especially for
  lopsided games whose conditional buckets are thin.
- **Calibration backtest:** as group games resolve, compare pre-match de-vigged
  probabilities to outcomes (Brier score / reliability curve) to test L3.
- **Sensitivity:** re-run with `final` mapped to reach-final vs champion (L2) and
  with an alternative de-vig method (L3) to bound model risk.
- **Convergence:** confirm `pFirst` is stable across seeds at N = 50,000.
