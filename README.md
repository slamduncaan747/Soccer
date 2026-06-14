# The Group Stage — WC26 Draft Pool

Mobile web app for a six-person World Cup 2026 draft pool. Live results, Kalshi
prediction-market odds, and a Monte Carlo engine that computes each player's
probability of winning the pool.

## Quick start

```bash
npm install
cp .env.example .env.local   # add tokens (optional — runs on model odds without them)
npm run dev                  # http://localhost:3000
```

The app runs immediately with **model odds** (deterministic, strength-based) so
you can see everything working before real markets exist. Add live sources via env.

## Environment

| Var | Purpose |
|-----|---------|
| `FOOTBALL_DATA_TOKEN` | football-data.org free-tier key for live W/D/L results. Without it, the app uses the seed standings. |
| `KALSHI_WC_SERIES` | Comma-separated Kalshi series tickers for the World Cup, once they exist. The Kalshi client is auth-free (public market data). |

## Scoring

One rule, one place: `src/lib/scoring.ts`. Currently **3 / 0 / 0** (win only).
Change `POINTS` there to alter the rule everywhere. Note: the seed sheet's draw
totals imply draws once scored 1 pt; under 3/0/0 those won't reproduce, but all
projections going forward obey `POINTS`.

## The projection model (probability theory)

A player's score = 3 × (total wins by their 8 teams). "Win probability" = P(finish
1st), which depends on the **joint** distribution of all six players' totals — so
it's computed by Monte Carlo, not expected points (expected points can't give
finish-place odds or handle ties/correlation).

- **Group stage** — each remaining match is a categorical draw from Kalshi 3-way
  (win/draw/loss) prices, de-vigged by normalizing to sum 1
  (`src/lib/probability.ts`). Drawing one outcome per fixture correctly
  correlates matches where two pool teams meet.
- **Knockout stage** — from Kalshi "team to reach round X" markets. In a bracket a
  team plays in round *r* iff it reached *r*, and wins that match iff it reaches
  *r+1*. So `P(win round r | alive) = reach(r+1) / reach(r)`, and the sim draws
  survival sequentially R32 → R16 → QF → SF → Final.
- **Ties** are split fractionally: if *g* players tie for a block of positions,
  each gets 1/*g* credit per slot. This makes the finish-position probabilities
  exact — every player's distribution sums to 1, Σ P(1st) = 1, Σ P(top-3) = 3.

20,000 iterations by default (`?iterations=` to override, capped at 200k).

## Architecture

```
src/
  data/pool.ts          seed: players, 8 teams each, current records
  lib/
    scoring.ts          POINTS rule (single source of truth)
    types.ts            domain types
    probability.ts      de-vig, normalize, seeded PRNG
    kalshi.ts           public Kalshi market-data client + odds extraction
    footballData.ts     live results provider (+ seed merge)
    mockOdds.ts         deterministic fallback odds
    engine.ts           Monte Carlo projection engine
    orchestrator.ts     wires sources → engine, degrades gracefully
  app/
    api/leaderboard/    GET projection JSON
    page.tsx            mobile leaderboard UI
    globals.css         design system
```

## Data source notes

- **Kalshi**: public endpoints at `external-api.kalshi.com/trade-api/v2` need no
  key for reads. Market title/subtitle parsing in `kalshi.ts` is best-effort and
  may need tuning once the real WC market structure is published — adjust the
  regexes and `WC_SERIES_HINTS` there.
- **football-data.org**: free tier covers the WC (`/competitions/WC/matches`) with
  a ~10 req/min limit; responses are cached server-side.
- If neither is available the app uses model odds and seed records, so it never
  breaks.

## Tuning the team-name mapping

Provider names differ from the sheet (e.g. Ivory Coast → "Côte d'Ivoire",
Türkiye → "Turkey" on Kalshi). Aliases live in `data/pool.ts` as `fdName` /
`kalshiName`. Add more there if a team fails to match.
