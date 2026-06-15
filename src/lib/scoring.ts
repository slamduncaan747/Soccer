// SCORING — single source of truth for the pool's points rule.
//
// Rule: 3 points per win, 1 point per draw, 0 for a loss. A draw credits BOTH
// teams in the fixture. Points are computed strictly from POINTS below; to
// change the rule, change this object and nothing else.
export const POINTS = {
  win: 3,
  draw: 1,
  loss: 0,
} as const;

export function pointsFor(w: number, d: number, l: number): number {
  return w * POINTS.win + d * POINTS.draw + l * POINTS.loss;
}

// Expected points contributed by ONE future match given 3-way probabilities.
// Probabilities are assumed already de-vigged (sum to 1).
export function expectedMatchPoints(pWin: number, pDraw: number, pLoss: number): number {
  return pWin * POINTS.win + pDraw * POINTS.draw + pLoss * POINTS.loss;
}
