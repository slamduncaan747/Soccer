"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

// Comprehensive pipeline diagnostics. Hits /api/leaderboard?debug=1 and renders
// EVERYTHING: feed health, raw Kalshi markets (with team matching), per-team
// reach ladders + projections, remaining fixtures, and the full raw JSON. Works
// in both states — if a feed is down the API returns { error, diagnostics } and
// those are shown instead.

const mono: CSSProperties = { fontFamily: "JetBrains Mono, ui-monospace, monospace" };
const card: CSSProperties = {
  background: "#14171c", border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 10, padding: 12, marginBottom: 14,
};
const th: CSSProperties = { textAlign: "left", padding: "4px 8px", color: "#8b929c", fontWeight: 700, position: "sticky", top: 0, background: "#14171c" };
const td: CSSProperties = { padding: "3px 8px", borderTop: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" };

const pct = (v: any) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v: any) => (v == null ? "—" : typeof v === "number" ? v.toString() : String(v));

export default function DebugPage() {
  const [raw, setRaw] = useState<any>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showJson, setShowJson] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leaderboard?debug=1&iterations=4000", { cache: "no-store" });
      setStatus(res.status);
      setRaw(await res.json());
    } catch (e) {
      setStatus(0);
      setRaw({ error: "Could not reach the API.", diagnostics: [String(e)] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dump = raw?.debug?.dump ?? null;
  const isError = !!raw?.error;

  const f = filter.trim().toLowerCase();
  const matches = (s: any) => !f || String(s ?? "").toLowerCase().includes(f);

  const perTeam: any[] = useMemo(() => {
    const t = dump?.perTeam ?? [];
    return f ? t.filter((x: any) => matches(x.team) || matches(x.owner)) : t;
  }, [dump, f]);

  const koMarkets: any[] = useMemo(() => {
    const m = dump?.rawKnockoutMarkets ?? [];
    return f ? m.filter((x: any) => matches(x.team) || matches(x.subtitle)) : m;
  }, [dump, f]);

  const grpMarkets: any[] = useMemo(() => {
    const m = dump?.rawGroupMarkets ?? [];
    return f ? m.filter((x: any) => matches(x.home) || matches(x.away) || (x.legs ?? []).some((l: any) => matches(l.subtitle) || matches(l.team))) : m;
  }, [dump, f]);

  return (
    <div style={{ ...mono, background: "#0b0d10", color: "#f3f5f7", minHeight: "100dvh", padding: 14, fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Pipeline Debug</h1>
        <span style={{ color: "#8b929c" }}>
          build: <b style={{ color: "#19cf7a" }}>{raw?.debug?.buildMarker ?? dump?.buildMarker ?? "(none — OLD BUILD)"}</b>
        </span>
        <span style={{ color: status === 200 ? "#19cf7a" : "#ff5247" }}>HTTP {status ?? "…"}</span>
        <button onClick={load} style={{ marginLeft: "auto", ...btn }}>{loading ? "Loading…" : "Refresh"}</button>
        <a href="/" style={{ ...btn, textDecoration: "none", color: "#8b929c" }}>← App</a>
      </div>

      <input
        placeholder="Filter by team / subtitle (e.g. Panama)"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ width: "100%", padding: "8px 10px", marginBottom: 14, background: "#14171c", color: "#f3f5f7", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, ...mono }}
      />

      {/* ── error / health ── */}
      {isError && (
        <div style={{ ...card, borderColor: "#ff5247" }}>
          <div style={{ color: "#ff5247", fontWeight: 700, marginBottom: 8 }}>API returned an error (no projection)</div>
          <div style={{ marginBottom: 8 }}>{raw.error}</div>
          {(raw.diagnostics ?? []).map((d: string, i: number) => (
            <div key={i} style={{ color: "#8b929c" }}>{d}</div>
          ))}
        </div>
      )}

      {dump && (
        <>
          {/* feed health */}
          <div style={card}>
            <SectionTitle>Feed health</SectionTitle>
            {Object.entries(dump.sources).map(([k, v]: any) => (
              <div key={k} style={{ marginBottom: 4 }}>
                <span style={{ color: v.ok ? "#19cf7a" : "#ff5247", fontWeight: 700 }}>{v.ok ? "OK  " : "FAIL"}</span>{" "}
                <b>{k}</b> — <span style={{ color: "#8b929c" }}>{v.detail}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, color: "#8b929c" }}>
              {Object.entries(dump.counts).map(([k, v]: any) => `${k}=${v}`).join("   ·   ")}
            </div>
            <div style={{ marginTop: 6, color: "#565d68" }}>generatedAt {dump.generatedAt} · {dump.iterations} sims</div>
          </div>

          {/* per-team projections + reach */}
          <div style={card}>
            <SectionTitle>Per-team ({perTeam.length})</SectionTitle>
            <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {["team", "owner", "W-D-L-KO", "alive", "cur", "grpPts", "koPts", "exp", "inKO?", "r32", "r16", "qf", "sf", "final", "champ", "remaining games"].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perTeam.map((t: any) => {
                    const r = t.reach ?? {};
                    const rec = t.record;
                    // The real bug signal: a winless team (0 current points) that is
                    // nonetheless getting KNOCKOUT points. Group points for a team with
                    // games left are legitimate; knockout points for a dead team are not.
                    const koBug = (t.currentPoints ?? 0) === 0 && (t.expKnockoutPoints ?? 0) > 0.1;
                    return (
                      <tr key={t.team} style={{ background: koBug ? "rgba(255,82,71,.16)" : undefined }}>
                        <td style={td}><b>{t.team}</b></td>
                        <td style={{ ...td, color: "#8b929c" }}>{t.owner}</td>
                        <td style={td}>{rec ? `${rec.w}-${rec.d}-${rec.l}-${rec.koWins ?? 0}` : "—"}</td>
                        <td style={{ ...td, color: t.alive ? "#19cf7a" : "#565d68" }}>{t.alive ? "yes" : "no"}</td>
                        <td style={td}>{num(t.currentPoints)}</td>
                        <td style={td}>{num(t.expGroupPoints)}</td>
                        <td style={{ ...td, color: (t.expKnockoutPoints ?? 0) > 0.1 ? "#ffb040" : "#565d68", fontWeight: 700 }}>{num(t.expKnockoutPoints)}</td>
                        <td style={{ ...td, color: "#19cf7a", fontWeight: 700 }}>{num(t.expectedFinalPoints)}</td>
                        <td style={{ ...td, color: t.inKnockoutMarket ? "#19cf7a" : "#565d68" }}>{t.inKnockoutMarket ? "yes" : "no"}</td>
                        <td style={td}>{pct(r.r32)}</td>
                        <td style={td}>{pct(r.r16)}</td>
                        <td style={td}>{pct(r.qf)}</td>
                        <td style={td}>{pct(r.sf)}</td>
                        <td style={td}>{pct(r.final)}</td>
                        <td style={td}>{pct(r.champion)}</td>
                        <td style={{ ...td, color: "#8b929c" }}>
                          {(t.remainingGroupGames ?? []).map((g: any) => `${g.home} v ${g.away}${g.oddsHome ? ` (${pct(g.oddsHome.win)}/${pct(g.oddsHome.draw)}/${pct(g.oddsHome.loss)})` : " (no odds)"}`).join("; ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 6, color: "#565d68" }}>
              <b>cur</b> = current points · <b>grpPts</b> = expected from remaining group games · <b>koPts</b> = expected from knockouts (residual) ·
              <b> inKO?</b> = team present in Kalshi knockout markets. Red row = 0 current points but &gt;0 knockout points (the bug signal).
            </div>
          </div>

          {/* raw knockout markets */}
          <div style={card}>
            <SectionTitle>Raw knockout markets ({koMarkets.length})</SectionTitle>
            <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>{["stage", "subtitle", "→ matched team", "prob", "status", "result", "bid", "ask", "last", "eventTicker"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {koMarkets.map((m: any, i: number) => {
                    const settled = m.status === "finalized" || m.result === "yes" || m.result === "no";
                    return (
                      <tr key={i} style={{ background: m.team == null ? "rgba(255,176,64,.12)" : undefined }}>
                        <td style={td}>{m.stage}</td>
                        <td style={td}>{m.subtitle}</td>
                        <td style={{ ...td, color: m.team ? "#f3f5f7" : "#ffb040" }}>{m.team ?? "UNMATCHED"}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{pct(m.prob)}</td>
                        <td style={{ ...td, color: settled ? "#8b929c" : "#19cf7a" }}>{m.status ?? "?"}</td>
                        <td style={{ ...td, color: m.result === "yes" ? "#19cf7a" : m.result === "no" ? "#ff5247" : "#565d68" }}>{m.result || "—"}</td>
                        <td style={td}>{m.bid ?? "—"}</td>
                        <td style={td}>{m.ask ?? "—"}</td>
                        <td style={{ ...td, color: "#565d68" }}>{m.last ?? "—"}</td>
                        <td style={{ ...td, color: "#565d68" }}>{m.eventTicker ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 6, color: "#565d68" }}>
              Amber = subtitle matched no pool team. Settled markets resolve via <b>result</b> (yes→100%, no→0%); active markets via the bid/ask book.
            </div>
          </div>

          {/* raw group markets */}
          <div style={card}>
            <SectionTitle>Raw group markets ({grpMarkets.length})</SectionTitle>
            <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>{["event", "legs (subtitle → team @ prob)", "parsed", "odds (W/D/L)"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {grpMarkets.map((m: any, i: number) => (
                    <tr key={i}>
                      <td style={{ ...td, color: "#565d68" }}>{m.eventTicker}</td>
                      <td style={td}>{(m.legs ?? []).map((l: any) => `${l.subtitle} → ${l.team ?? "?"} @ ${pct(l.prob)}`).join("  |  ")}</td>
                      <td style={td}>{m.home ?? "?"} v {m.away ?? "?"}</td>
                      <td style={td}>{m.oddsHome ? `${pct(m.oddsHome.win)} / ${pct(m.oddsHome.draw)} / ${pct(m.oddsHome.loss)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* full raw JSON */}
      <div style={card}>
        <button onClick={() => setShowJson((s) => !s)} style={btn}>{showJson ? "Hide" : "Show"} full raw JSON</button>
        {showJson && (
          <pre style={{ ...mono, fontSize: 10.5, color: "#8b929c", whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 10 }}>
            {JSON.stringify(raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

const btn: CSSProperties = {
  fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 12, fontWeight: 700,
  background: "#1b1f26", color: "#f3f5f7", border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 8, padding: "7px 12px", cursor: "pointer",
};

function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, letterSpacing: .3 }}>{children}</div>;
}
