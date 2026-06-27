import { GroupFixture, KnockoutOdds, Stage } from "./types";
import { normalize3 } from "./probability";
import { ALL_TEAMS } from "../data/pool";

// Kalshi public market-data base — NO auth required for reads.
const KALSHI_BASE = "https://external-api.kalshi.com/trade-api/v2";

// Real 2026 Men's World Cup series tickers (confirmed against the live API).
// Override via env if Kalshi renames them.
//   KXWCGROUPQUAL — P(team qualifies from its group → reaches the Round of 32)
//   KXWCROUND     — per-team P(reach Round of 16 / Quarterfinal / Semifinal / Final)
//   KXMENWORLDCUP — P(team wins the World Cup)
//   KXWCGAME      — per-match 3-way (home win / draw / away win) for every group game
const SERIES = {
  qualify: process.env.KALSHI_WC_QUALIFY_SERIES || "KXWCGROUPQUAL",
  round: process.env.KALSHI_WC_ROUND_SERIES || "KXWCROUND",
  champion: process.env.KALSHI_WC_CHAMPION_SERIES || "KXMENWORLDCUP",
  game: process.env.KALSHI_WC_GAME_SERIES || "KXWCGAME",
};

interface KalshiMarket {
  ticker: string;
  event_ticker?: string;
  yes_sub_title?: string;
  subtitle?: string;
  title?: string;
  // Current Kalshi price fields are fixed-point dollar STRINGS in [0,1]
  // (e.g. "0.7300" = 73%). The legacy integer-cent fields (last_price,
  // yes_bid, yes_ask) are deprecated and now return null — do not use them.
  yes_bid_dollars?: string | null;
  yes_ask_dollars?: string | null;
  last_price_dollars?: string | null;
  status?: string;
}

function num(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// A market's YES probability: prefer the bid/ask midpoint (most current),
// fall back to last trade, then the ask alone. Returns null if truly unpriced.
function marketProb(m: KalshiMarket): number | null {
  const bid = num(m.yes_bid_dollars);
  const ask = num(m.yes_ask_dollars);
  const last = num(m.last_price_dollars);
  if (bid != null && ask != null && ask >= bid && bid + ask > 0) {
    return clamp01((bid + ask) / 2);
  }
  if (last != null && last > 0) return clamp01(last);
  if (ask != null && ask > 0) return clamp01(ask);
  return null;
}

function teamAliases(): Map<string, string> {
  // map lowercased provider label -> canonical team name
  const m = new Map<string, string>();
  for (const t of ALL_TEAMS) {
    m.set(t.name.toLowerCase(), t.name);
    if (t.kalshiName) m.set(t.kalshiName.toLowerCase(), t.name);
  }
  return m;
}

function matchTeam(label: string | undefined, aliases: Map<string, string>): string | null {
  if (!label) return null;
  const l = label.toLowerCase().trim();
  // Exact match first to avoid substring false positives (e.g. "Austria"/"Australia").
  if (aliases.has(l)) return aliases.get(l)!;
  for (const [alias, canon] of aliases) {
    if (l.includes(alias)) return canon;
  }
  return null;
}

// Kalshi's free read tier rate-limits bursts (HTTP 429). To keep odds stable
// across rapid page reloads we keep the last successful payload per series and:
//   1) serve it directly while still fresh (no network call at all), and
//   2) fall back to it (stale) whenever a fetch is rate-limited or fails,
// so a transient 429 never blanks the projection.
interface MarketCacheEntry {
  markets: KalshiMarket[];
  ts: number;
}
// A series fetch result: `ok` means we have real market data to use (a fresh
// fetch, or a still-valid cached payload). `ok:false` means the exchange could
// not be reached and we have nothing real — the projection must not proceed.
interface SeriesResult {
  markets: KalshiMarket[];
  ok: boolean;
  detail: string;
}
const FRESH_MS = 60_000;
const marketCache = new Map<string, MarketCacheEntry>();
const inflight = new Map<string, Promise<SeriesResult>>();

async function fetchSeriesMarkets(series: string): Promise<SeriesResult> {
  const cached = marketCache.get(series);
  if (cached && Date.now() - cached.ts < FRESH_MS) {
    const age = Math.round((Date.now() - cached.ts) / 1000);
    return { markets: cached.markets, ok: true, detail: `${series}: ${cached.markets.length} markets (cached ${age}s ago)` };
  }

  // Collapse concurrent requests for the same series into one network call.
  const existing = inflight.get(series);
  if (existing) return existing;

  const p = (async (): Promise<SeriesResult> => {
    try {
      const res = await fetch(
        `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(series)}&limit=1000`,
        { headers: { Accept: "application/json" }, cache: "no-store" }
      );
      if (!res.ok) {
        // A transient error with a usable cache is still real data; a hard
        // failure with no cache means we genuinely cannot read this market.
        if (cached) {
          console.warn(`[kalshi] ${series} → HTTP ${res.status} — serving last-good cache`);
          return { markets: cached.markets, ok: true, detail: `${series}: HTTP ${res.status}, served last-good cache (${cached.markets.length} markets)` };
        }
        console.warn(`[kalshi] ${series} → HTTP ${res.status} (no cache)`);
        return { markets: [], ok: false, detail: `${series}: HTTP ${res.status}, no cached data` };
      }
      const data = (await res.json()) as { markets?: KalshiMarket[] };
      const markets = data.markets ?? [];
      if (markets.length) marketCache.set(series, { markets, ts: Date.now() });
      return { markets, ok: true, detail: `${series}: ${markets.length} markets` };
    } catch (e) {
      if (cached) {
        console.warn(`[kalshi] ${series} fetch failed — serving last-good cache:`, e);
        return { markets: cached.markets, ok: true, detail: `${series}: fetch error, served last-good cache (${cached.markets.length} markets)` };
      }
      console.warn(`[kalshi] ${series} fetch failed (no cache):`, e);
      return { markets: [], ok: false, detail: `${series}: fetch error — ${String(e)}` };
    } finally {
      inflight.delete(series);
    }
  })();

  inflight.set(series, p);
  return p;
}

// Force the reach ladder to be non-increasing (reach R32 ≥ R16 ≥ QF ≥ SF ≥ win).
// Market noise can violate this; the engine divides successive reach probs, so a
// dirty ladder would produce conditional probabilities outside [0,1].
function monotone(reach: Partial<Record<Stage, number>>): Partial<Record<Stage, number>> {
  const order: Stage[] = ["r32", "r16", "qf", "sf", "final", "champion"];
  const out: Partial<Record<Stage, number>> = {};
  let cap = 1;
  for (const s of order) {
    const v = reach[s];
    if (v != null) {
      const capped = Math.min(v, cap);
      out[s] = capped;
      cap = capped;
    }
  }
  return out;
}

// Per-team knockout survival probabilities from Kalshi markets. Six cumulative
// reach levels span the five knockout matches, so the final match (reach-final →
// champion) is modeled explicitly rather than collapsed into the champion market:
//   r32      ← KXWCGROUPQUAL   (qualify from group)
//   r16      ← KXWCROUND-*RO16
//   qf       ← KXWCROUND-*QUAR
//   sf       ← KXWCROUND-*SEMI
//   final    ← KXWCROUND-*FINAL (reach the final)
//   champion ← KXMENWORLDCUP    (win the final / win the cup)
export async function fetchKnockoutOdds(): Promise<{ odds: KnockoutOdds[]; ok: boolean; detail: string }> {
  const aliases = teamAliases();
  const byTeam = new Map<string, Partial<Record<Stage, number>>>();
  const set = (team: string, stage: Stage, p: number) => {
    const r = byTeam.get(team) ?? {};
    r[stage] = p;
    byTeam.set(team, r);
  };

  const [qualRes, roundRes, champRes] = await Promise.all([
    fetchSeriesMarkets(SERIES.qualify),
    fetchSeriesMarkets(SERIES.round),
    fetchSeriesMarkets(SERIES.champion),
  ]);
  const qual = qualRes.markets;
  const round = roundRes.markets;
  const champ = champRes.markets;

  for (const m of qual) {
    const team = matchTeam(m.yes_sub_title || m.subtitle, aliases);
    const p = marketProb(m);
    if (team && p != null) set(team, "r32", p);
  }

  // Order matters: /FINAL/ must be tested before nothing else collides, and the
  // RO16/QUAR/SEMI/FINAL suffixes are mutually exclusive in the event ticker.
  const roundStage: [RegExp, Stage][] = [
    [/RO16/i, "r16"],
    [/QUAR/i, "qf"],
    [/SEMI/i, "sf"],
    [/FINAL/i, "final"], // reach the final (NOT win it)
  ];
  for (const m of round) {
    const ev = m.event_ticker || "";
    const stage = roundStage.find(([re]) => re.test(ev))?.[1];
    if (!stage) continue;
    const team = matchTeam(m.yes_sub_title || m.subtitle, aliases);
    const p = marketProb(m);
    if (team && p != null) set(team, stage, p);
  }

  // Champion market = win the final → the terminal `champion` reach level.
  for (const m of champ) {
    const team = matchTeam(m.yes_sub_title || m.subtitle, aliases);
    const p = marketProb(m);
    if (team && p != null) set(team, "champion", p);
  }

  const odds: KnockoutOdds[] = [...byTeam.entries()].map(([team, reach]) => ({
    team,
    reach: monotone(reach),
  }));

  // Healthy only if every underlying series fetch succeeded AND we actually
  // parsed reach for at least one team. Anything less means the knockout feed
  // is broken and the projection must not be shown.
  const fetchOk = qualRes.ok && roundRes.ok && champRes.ok;
  const hasReach = odds.some((o) => Object.keys(o.reach).length > 0);
  const ok = fetchOk && hasReach;
  const detail = `${qualRes.detail} | ${roundRes.detail} | ${champRes.detail} → ${odds.length} teams with reach`;
  console.log(`[kalshi] knockout: ${odds.length} teams with reach markets (ok=${ok})`);
  return { odds, ok, detail };
}

// Per-match 3-way group odds from the KXWCGAME series. Each game is one event
// (e.g. "Germany vs Curacao") holding three markets: the two teams + "Tie".
// We read each leg's YES probability and de-vig the trio into a coherent
// {win, draw, loss} distribution. Home/away orientation is internal — the
// orchestrator matches fixtures to the FD schedule in either orientation.
export async function fetchGroupFixtures(): Promise<{ fixtures: GroupFixture[]; ok: boolean; detail: string }> {
  const aliases = teamAliases();
  const res = await fetchSeriesMarkets(SERIES.game);
  const markets = res.markets;

  const byEvent = new Map<string, KalshiMarket[]>();
  for (const m of markets) {
    const ek = m.event_ticker;
    if (!ek) continue;
    const arr = byEvent.get(ek) ?? [];
    arr.push(m);
    byEvent.set(ek, arr);
  }

  const fixtures: GroupFixture[] = [];
  for (const [ek, legs] of byEvent) {
    let tie: number | null = null;
    const teams: { name: string; p: number }[] = [];
    for (const m of legs) {
      const sub = (m.yes_sub_title || m.subtitle || "").trim();
      const p = marketProb(m);
      if (p == null) continue;
      if (/^tie$|draw/i.test(sub)) {
        tie = p;
        continue;
      }
      const team = matchTeam(sub, aliases);
      if (team) teams.push({ name: team, p });
    }
    if (teams.length !== 2 || tie == null) continue;
    const [home, away] = teams;
    fixtures.push({
      id: ek,
      home: home.name,
      away: away.name,
      oddsHome: normalize3({ win: home.p, draw: tie, loss: away.p }),
    });
  }

  // Healthy as long as the series fetch itself succeeded. Zero parsed fixtures is
  // valid late in the tournament (every group game has settled); whether the
  // *remaining* games are actually priced is checked in the orchestrator against
  // the live schedule.
  const ok = res.ok;
  console.log(`[kalshi] group: ${fixtures.length} fixtures with 3-way odds (fetch ok=${ok})`);
  return { fixtures, ok, detail: `${res.detail} → ${fixtures.length} parsed fixtures` };
}
