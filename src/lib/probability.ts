import { ThreeWay } from "./types";

// De-vig (remove the bookmaker/market margin) from raw implied probabilities
// using simple proportional normalization (a.k.a. "multiplicative" method).
//
// Kalshi YES prices are in cents (0..100) and approximate the market-implied
// probability directly, but a set of mutually-exclusive outcomes (win/draw/loss,
// or all teams to win the cup) will sum to slightly more than 1 due to spread.
// Normalizing so the set sums to 1 yields a coherent probability distribution.
export function normalize3(raw: ThreeWay): ThreeWay {
  const s = raw.win + raw.draw + raw.loss;
  if (s <= 0) return { win: 1 / 3, draw: 1 / 3, loss: 1 / 3 };
  return { win: raw.win / s, draw: raw.draw / s, loss: raw.loss / s };
}

export function normalizeMany(raw: number[]): number[] {
  const s = raw.reduce((a, b) => a + b, 0);
  if (s <= 0) return raw.map(() => 1 / raw.length);
  return raw.map((x) => x / s);
}

// Convert a Kalshi YES price (cents, 0..100) to a probability (0..1).
export function priceToProb(yesCents: number): number {
  return Math.max(0, Math.min(1, yesCents / 100));
}

// Mulberry32 — small, fast, seedable PRNG so simulations are reproducible.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
