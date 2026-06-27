// Kalshi market dumper — run locally (you have network access; the agent doesn't).
//
//   node scripts/kalshi-dump.mjs
//
// Writes kalshi-dump.json (full raw payloads) and prints a summary. Paste the
// summary back, or attach kalshi-dump.json. No auth needed (public read API).
//
// Override series tickers if they differ:
//   KALSHI_WC_QUALIFY_SERIES, KALSHI_WC_ROUND_SERIES,
//   KALSHI_WC_CHAMPION_SERIES, KALSHI_WC_GAME_SERIES

import { writeFileSync } from "node:fs";

const BASE = "https://external-api.kalshi.com/trade-api/v2";

const SERIES = {
  qualify:  process.env.KALSHI_WC_QUALIFY_SERIES  || "KXWCGROUPQUAL",
  round:    process.env.KALSHI_WC_ROUND_SERIES    || "KXWCROUND",
  champion: process.env.KALSHI_WC_CHAMPION_SERIES || "KXMENWORLDCUP",
  game:     process.env.KALSHI_WC_GAME_SERIES     || "KXWCGAME",
};

async function getMarkets(series) {
  const url = `${BASE}/markets?series_ticker=${encodeURIComponent(series)}&limit=1000`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, status: res.status, markets: [] };
    const data = await res.json();
    return { ok: true, status: 200, markets: data.markets ?? [], cursor: data.cursor };
  } catch (e) {
    return { ok: false, status: 0, error: String(e), markets: [] };
  }
}

// also try to discover any WC-related series in case the tickers are wrong
async function discoverSeries() {
  for (const path of [
    `${BASE}/series?category=Sports`,
    `${BASE}/series`,
  ]) {
    try {
      const res = await fetch(path, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const data = await res.json();
      const list = data.series ?? data.series_tickers ?? [];
      const hits = (Array.isArray(list) ? list : [])
        .map((s) => s.ticker || s.series_ticker || s)
        .filter((t) => typeof t === "string" && /WC|WORLDCUP|WORLD_CUP/i.test(t));
      if (hits.length) return hits;
    } catch { /* ignore */ }
  }
  return [];
}

const short = (m) => ({
  ticker: m.ticker,
  event_ticker: m.event_ticker,
  yes_sub_title: m.yes_sub_title,
  subtitle: m.subtitle,
  title: m.title,
  status: m.status,
  result: m.result,
  yes_bid_dollars: m.yes_bid_dollars,
  yes_ask_dollars: m.yes_ask_dollars,
  last_price_dollars: m.last_price_dollars,
  yes_bid: m.yes_bid,
  yes_ask: m.yes_ask,
  last_price: m.last_price,
  volume: m.volume,
  open_interest: m.open_interest,
  close_time: m.close_time,
  expiration_time: m.expiration_time,
});

function summarize(name, series, r) {
  console.log(`\n========== ${name}  (series_ticker=${series}) ==========`);
  console.log(`HTTP ${r.status} · ${r.markets.length} markets`);
  if (!r.markets.length) return;

  // field discovery — the actual keys Kalshi sends on a market
  console.log(`\nFIELDS on first market:\n  ${Object.keys(r.markets[0]).join(", ")}`);

  // status breakdown
  const byStatus = {};
  for (const m of r.markets) byStatus[m.status ?? "(none)"] = (byStatus[m.status ?? "(none)"] ?? 0) + 1;
  console.log(`\nstatus breakdown: ${JSON.stringify(byStatus)}`);

  // quote availability
  let twoSided = 0, lastOnly = 0, none = 0;
  for (const m of r.markets) {
    const bid = parseFloat(m.yes_bid_dollars), ask = parseFloat(m.yes_ask_dollars), last = parseFloat(m.last_price_dollars);
    if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask < 1) twoSided++;
    else if (Number.isFinite(last) && last > 0 && last < 1) lastOnly++;
    else none++;
  }
  console.log(`quotes: two-sided=${twoSided}  last-only=${lastOnly}  none/empty=${none}`);

  // distinct event tickers (helps see RO16/QUAR/SEMI/FINAL structure)
  const events = [...new Set(r.markets.map((m) => m.event_ticker))];
  console.log(`distinct event_tickers (${events.length}): ${events.slice(0, 12).join(", ")}${events.length > 12 ? " …" : ""}`);

  // every market, compact
  console.log(`\nALL MARKETS (subtitle | status | result | bid | ask | last | vol | OI | event):`);
  for (const m of r.markets) {
    const sub = (m.yes_sub_title || m.subtitle || "").slice(0, 22).padEnd(22);
    console.log(
      `  ${sub} | ${(m.status ?? "?").padEnd(10)} | ${String(m.result ?? "").padEnd(4)} | ` +
      `${String(m.yes_bid_dollars ?? "-").padStart(6)} | ${String(m.yes_ask_dollars ?? "-").padStart(6)} | ` +
      `${String(m.last_price_dollars ?? "-").padStart(6)} | ${String(m.volume ?? 0).padStart(6)} | ${String(m.open_interest ?? 0).padStart(6)} | ${m.event_ticker ?? ""}`
    );
  }
}

const out = {};
console.log("Fetching Kalshi WC markets…");

const discovered = await discoverSeries();
if (discovered.length) console.log(`\nDiscovered WC-related series tickers: ${discovered.join(", ")}`);
else console.log("\n(could not auto-discover series; using the configured tickers)");

for (const [name, series] of Object.entries(SERIES)) {
  const r = await getMarkets(series);
  out[name] = { series, ...r };
  summarize(name, series, r);
}

writeFileSync("kalshi-dump.json", JSON.stringify({ discovered, series: SERIES, data: out }, null, 2));
console.log(`\n\nFull raw payloads written to kalshi-dump.json — paste the summary above or attach that file.`);
