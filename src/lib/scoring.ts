// SCORING — single source of truth for the pool's points rule.
//
// The user confirmed 3 / 0 / 0 (win only). Their seed sheet shows draw totals
// as if draws scored 1, so the seed standings won't reproduce under this rule;
// going forward, points are computed strictly from POINTS below. To switch the
// rule (e.g. give draws a point), change this object and nothing else.
export const POINTS = {
  win: 3,
  draw: 0,
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
