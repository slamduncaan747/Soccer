import { GroupFixture, KnockoutOdds, Stage, ThreeWay } from "./types";
import { normalize3, priceToProb } from "./probability";
import { ALL_TEAMS } from "../data/pool";

// Kalshi public market-data base — NO auth required for reads.
// (Despite legacy naming, this serves ALL Kalshi markets.)
const KALSHI_BASE = "https://external-api.kalshi.com/trade-api/v2";

// Series tickers are not guaranteed stable; these are best-effort guesses that
// the resolver below will confirm via the /series search. Override via env.
const WC_SERIES_HINTS = (process.env.KALSHI_WC_SERIES || "KXWORLDCUP,KXWC2026,KXFIFAWC")
  .split(",")
  .map((s) => s.trim());

interface KalshiMarket {
  ticker: string;
  title?: string;
  yes_sub_title?: string;
  subtitle?: string;
  last_price?: number; // cents
  yes_bid?: number;
  yes_ask?: number;
  status?: string;
}

interface KalshiEvent {
  event_ticker: string;
  title?: string;
  markets?: KalshiMarket[];
}

async function kalshiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${KALSHI_BASE}${path}`, {
      headers: { Accept: "application/json" },
      // Cache server-side for a minute; markets move but not by the second for our needs.
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Best YES-side probability estimate for a market: prefer the midpoint of
// bid/ask if both present (tighter than last trade), else last_price.
function marketProb(m: KalshiMarket): number | null {
  if (m.yes_bid != null && m.yes_ask != null && m.yes_ask >= m.yes_bid) {
    return priceToProb((m.yes_bid + m.yes_ask) / 2);
  }
  if (m.last_price != null) return priceToProb(m.last_price);
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
  const l = label.toLowerCase();
  for (const [alias, canon] of aliases) {
    if (l.includes(alias)) return canon;
  }
  return null;
}

// Pull tournament-advance markets: P(team reaches round X / wins cup).
// We look for events whose title references the stage and read each team's YES prob.
export async function fetchKnockoutOdds(): Promise<{ odds: KnockoutOdds[]; ok: boolean }> {
  const aliases = teamAliases();
  const byTeam = new Map<string, Partial<Record<Stage, number>>>();

  const stageKeywords: [Stage, RegExp][] = [
    ["r32", /round of 32|ro32/i],
    ["r16", /round of 16|ro16|last 16/i],
    ["qf", /quarter|quarterfinal|qf/i],
    ["sf", /semi|semifinal|sf/i],
    ["final", /win the (world cup|tournament)|champion|to win the cup|final winner/i],
  ];

  let foundAny = false;

  for (const series of WC_SERIES_HINTS) {
    const data = await kalshiGet<{ events?: KalshiEvent[] }>(
      `/events?series_ticker=${encodeURIComponent(series)}&with_nested_markets=true&limit=200`
    );
    if (!data?.events?.length) continue;

    for (const ev of data.events) {
      const stageEntry = stageKeywords.find(([, re]) => re.test(ev.title || ""));
      if (!stageEntry) continue;
      const [stage] = stageEntry;

      for (const mk of ev.markets || []) {
        const team = matchTeam(mk.yes_sub_title || mk.subtitle || mk.title, aliases);
        if (!team) continue;
        const p = marketProb(mk);
        if (p == null) continue;
        foundAny = true;
        const rec = byTeam.get(team) || {};
        rec[stage] = p;
        byTeam.set(team, rec);
      }
    }
  }

  const odds: KnockoutOdds[] = [...byTeam.entries()].map(([team, reach]) => ({ team, reach }));
  return { odds, ok: foundAny };
}

// Pull per-match 3-way group markets where available.
// Kalshi soccer match markets vary; we look for events titled like "X vs Y"
// and try to read win/draw/loss legs. Returns [] if none parse — the engine
// then treats those group matches as unknown (skipped from sim contribution).
export async function fetchGroupFixtures(): Promise<{ fixtures: GroupFixture[]; ok: boolean }> {
  const aliases = teamAliases();
  const fixtures: GroupFixture[] = [];
  let ok = false;

  for (const series of WC_SERIES_HINTS) {
    const data = await kalshiGet<{ events?: KalshiEvent[] }>(
      `/events?series_ticker=${encodeURIComponent(series)}&with_nested_markets=true&limit=200`
    );
    if (!data?.events?.length) continue;

    for (const ev of data.events) {
      const vs = (ev.title || "").match(/(.+?)\s+(?:vs\.?|v\.?|@|-)\s+(.+)/i);
      if (!vs) continue;
      const home = matchTeam(vs[1], aliases);
      const away = matchTeam(vs[2], aliases);
      if (!home || !away) continue;

      // Try to find three legs by subtitle keywords.
      let win: number | null = null,
        draw: number | null = null,
        loss: number | null = null;
      for (const mk of ev.markets || []) {
        const sub = (mk.yes_sub_title || mk.subtitle || "").toLowerCase();
        const p = marketProb(mk);
        if (p == null) continue;
        if (/draw|tie/.test(sub)) draw = p;
        else if (sub.includes(home.toLowerCase())) win = p;
        else if (sub.includes(away.toLowerCase())) loss = p;
      }
      if (win != null && draw != null && loss != null) {
        const odds: ThreeWay = normalize3({ win, draw, loss });
        fixtures.push({ id: ev.event_ticker, home, away, oddsHome: odds });
        ok = true;
      }
    }
  }

  return { fixtures, ok };
}
