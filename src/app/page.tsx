"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection, PlayerFactors, TournamentFactor, OddsHistoryPoint } from "@/lib/types";

type Tab = "games" | "standings" | "odds" | "insights";

/* ── display names ── */
const DISPLAY_NAME: Record<string, string> = { Isiah: "Zeke" };
const dn = (name: string) => DISPLAY_NAME[name] ?? name;

/* ── per-player colors (stable, design spec) ── */
const PLAYER_COLORS: Record<string, string> = {
  Duncan: "#36d07a", Sam: "#f4b740", Gus: "#ff7a59",
  Conrad: "#5b9cff", Isiah: "#c07bff", Wyatt: "#ff5d8f",
};
const playerColor = (name: string) => PLAYER_COLORS[name] ?? "#8b929c";

/* ── ISO2 country codes for flagcdn ── */
const ISO: Record<string, string> = {
  Spain: "es", Croatia: "hr", Colombia: "co", Switzerland: "ch",
  "South Korea": "kr", Algeria: "dz", Ghana: "gh", Jordan: "jo",
  France: "fr", Norway: "no", Japan: "jp", Sweden: "se",
  Senegal: "sn", "South Africa": "za", "DR Congo": "cd", Haiti: "ht",
  Portugal: "pt", Belgium: "be", "United States": "us", Canada: "ca",
  Paraguay: "py", Bosnia: "ba", Tunisia: "tn", "Cape Verde": "cv",
  England: "gb-eng", Germany: "de", Uruguay: "uy", Austria: "at",
  "Ivory Coast": "ci", "Czech Republic": "cz", Qatar: "qa", "New Zealand": "nz",
  Argentina: "ar", Morocco: "ma", Mexico: "mx", Australia: "au",
  Egypt: "eg", Scotland: "gb-sct", Uzbekistan: "uz", Curacao: "cw",
  Brazil: "br", Netherlands: "nl", "Türkiye": "tr", Ecuador: "ec",
  Iran: "ir", "Saudi Arabia": "sa", Panama: "pa", Iraq: "iq",
};

/* ── 3-letter abbreviations ── */
const ABBR_MAP: Record<string, string> = {
  "United States": "USA", "South Korea": "KOR", "Ivory Coast": "CIV",
  "DR Congo": "COD", "South Africa": "RSA", "Saudi Arabia": "KSA",
  "Cape Verde": "CPV", "New Zealand": "NZL", "Czech Republic": "CZE",
  Bosnia: "BIH", Uzbekistan: "UZB", Curacao: "CUW", Paraguay: "PAR",
  Ecuador: "ECU", Morocco: "MAR", Nigeria: "NGA", Senegal: "SEN",
  Algeria: "ALG", Tunisia: "TUN",
};
const abbr = (team: string) => (ABBR_MAP[team] ?? team.slice(0, 3)).toUpperCase();

/* ── flag chip component ── */
function Flag({ team, height = 22 }: { team: string; height?: number }) {
  const code = ISO[team];
  const ab = abbr(team);
  const style: CSSProperties = {
    "--fh": `${height}px`,
  } as CSSProperties;
  if (!code) {
    return (
      <span className="flag-chip flag-fb" style={style}>{ab.slice(0, 2)}</span>
    );
  }
  return (
    <span className="flag-chip" style={style}>
      <img
        src={`https://flagcdn.com/w160/${code}.png`}
        alt={team}
        loading="lazy"
        onError={(e) => {
          const el = e.currentTarget.parentElement!;
          el.classList.add("flag-fb");
          el.textContent = ab.slice(0, 2);
        }}
      />
    </span>
  );
}

/* ── misc helpers ── */
const round1 = (n: number) => Math.round(n * 10) / 10;
const mcSE = (p: number, n: number) => (n > 0 ? Math.sqrt((p * (1 - p)) / n) : 0);
const isAlive = (erw: number) => erw >= 0.05;

function isLiveByTime(kickoff: string | undefined): boolean {
  if (!kickoff) return false;
  const ms = Date.now() - new Date(kickoff).getTime();
  return ms > 0 && ms < 115 * 60 * 1000;
}
function liveMinute(kickoff: string): number {
  return Math.floor((Date.now() - new Date(kickoff).getTime()) / 60000);
}

/* ──────────────────────────────────────────────────────
   ROOT
────────────────────────────────────────────────────── */
export default function Page() {
  const [data, setData]   = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]     = useState<Tab>("games");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leaderboard?iterations=5000", { cache: "no-store" });
      setData((await res.json()) as ProjectionResult);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);


  return (
    <>
      <header className="app-header">
        {tab === "games" || tab === "standings" ? (
          <div className="brand-bar">
            <div className="brand-inner">
              <div className="brand-tick" />
              <span className="brand-mark">{tab === "games" ? "LIVE SCORES" : "STANDINGS"}</span>
            </div>
          </div>
        ) : tab === "odds" ? (
          <div className="brand-bar">
            <div className="brand-inner">
              <div className="brand-tick" />
              <span className="brand-mark">TITLE ODDS</span>
            </div>
            {data && <span className="brand-badge">{Math.round(data.iterations / 1000)}K SIMS</span>}
          </div>
        ) : (
          <div className="brand-bar">
            <div className="brand-inner">
              <div className="brand-tick" />
              <span className="brand-mark">INSIGHTS</span>
            </div>
          </div>
        )}
      </header>

      <main className="page">
        {loading ? (
          <div className="loading-state">Loading…</div>
        ) : !data ? (
          <div className="empty-state">
            Could not load data.{" "}
            <button onClick={load} style={{ color: "var(--acc)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", fontWeight: 700 }}>
              Retry
            </button>
          </div>
        ) : (
          <div className="tab-pane" key={tab}>
            {tab === "games"      && <GamesTab     fixtures={data.fixtures} />}
            {tab === "standings"  && <StandingsTab players={data.players} />}
            {tab === "odds"       && <OddsTab      players={data.players} iterations={data.iterations} oddsHistory={data.oddsHistory} />}
            {tab === "insights"   && <InsightsTab  players={data.players} fixtures={data.fixtures} playerFactors={data.playerFactors} />}
          </div>
        )}
      </main>

      <nav className="tab-bar" aria-label="Sections">
        <button className={`tab-btn${tab === "games" ? " active" : ""}`} onClick={() => setTab("games")}>
          <GamesIcon /> Games
        </button>
        <button className={`tab-btn${tab === "standings" ? " active" : ""}`} onClick={() => setTab("standings")}>
          <StandingsIcon /> Table
        </button>
        <button className={`tab-btn${tab === "odds" ? " active" : ""}`} onClick={() => setTab("odds")}>
          <OddsIcon /> Odds
        </button>
        <button className={`tab-btn${tab === "insights" ? " active" : ""}`} onClick={() => setTab("insights")}>
          <InsightsIcon /> Insights
        </button>
      </nav>
    </>
  );
}

/* ══════════════════════════════════════════════════════
   GAMES TAB
══════════════════════════════════════════════════════ */
function GamesTab({ fixtures }: { fixtures: FixtureProjection[] }) {
  const groups = useMemo(() => groupByDay(fixtures), [fixtures]);
  const todayKey = groups.find((g) => g.isToday)?.key ?? groups[0]?.key ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLButtonElement>(".day-chip.active");
    el?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, [selectedKey]);

  if (groups.length === 0) return <div className="empty-state">No fixtures available.</div>;
  const activeGroup = groups.find((g) => g.key === selectedKey) ?? groups[0];

  /* find any live match in active group for score bug */
  const liveBug = activeGroup.matches.find((f) => {
    const isLive = f.liveStatus != null
      ? f.liveStatus !== "FINISHED"
      : isLiveByTime(f.kickoff);
    return isLive && f.liveScore;
  });

  return (
    <div>
      {/* day strip */}
      <div className="day-strip-wrap" ref={stripRef}>
        {groups.map((g) => (
          <button
            key={g.key}
            className={`day-chip${selectedKey === g.key ? " active" : ""}`}
            onClick={() => setSelectedKey(g.key)}
          >
            {g.isToday && <span className="chip-pip" />}
            {g.shortLabel}
          </button>
        ))}
      </div>

      <div className="day-matches">
        {/* score bug */}
        {liveBug && <ScoreBug fixture={liveBug} />}

        {/* match rows */}
        {activeGroup.matches.length === 0 ? (
          <div className="empty-state">No matches this day.</div>
        ) : (
          activeGroup.matches
            .filter((f) => f !== liveBug)
            .map((f) => <MatchRow key={f.id} fixture={f} />)
        )}
      </div>
    </div>
  );
}

function ScoreBug({ fixture: f }: { fixture: FixtureProjection }) {
  const minute = f.liveMinute ?? (f.kickoff ? liveMinute(f.kickoff) : null);
  const score = f.liveScore ?? { home: 0, away: 0 };
  return (
    <div className="score-bug">
      <div className="bug-tag">
        <span className="bug-live-dot" />
        LIVE{minute !== null ? ` · ${minute}'` : ""}
      </div>
      <div className="bug-row">
        <div className="bug-team">
          <Flag team={f.home} height={26} />
          <div className="bug-txt">
            <span className="bug-abbr">{abbr(f.home)}</span>
            <span className="bug-owner">{dn(f.homeOwner)}</span>
          </div>
        </div>
        <div className="bug-score">
          {score.home}<span className="bug-score-sep">–</span>{score.away}
        </div>
        <div className="bug-team right">
          <div className="bug-txt right">
            <span className="bug-abbr">{abbr(f.away)}</span>
            <span className="bug-owner">{dn(f.awayOwner)}</span>
          </div>
          <Flag team={f.away} height={26} />
        </div>
      </div>
      <div className="bug-foot">{f.home} vs {f.away}</div>
    </div>
  );
}

function MatchRow({ fixture: f }: { fixture: FixtureProjection }) {
  const d = f.kickoff ? new Date(f.kickoff) : null;
  const timeStr = d
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : "TBD";

  const odds = f.oddsHome;
  const hp = odds ? Math.round(odds.win * 100) : null;
  const dp = odds ? Math.round(odds.draw * 100) : null;
  const ap = odds ? Math.round(odds.loss * 100) : null;
  const hasOdds = hp !== null && dp !== null && ap !== null;

  const finished = f.liveStatus === "FINISHED";
  const live = !finished && (f.liveStatus != null
    ? f.liveStatus !== "FINISHED"
    : isLiveByTime(f.kickoff));
  const minute = live && f.kickoff
    ? (f.liveMinute ?? liveMinute(f.kickoff))
    : null;

  return (
    <div className={`match-card${finished ? " done" : ""}`}>
      <div className="mc-main">
        {/* home side */}
        <div className="mc-side">
          <Flag team={f.home} height={22} />
          <div className="mc-stx">
            <span className="mc-abbr">{abbr(f.home)}</span>
            <span className="mc-owner">{dn(f.homeOwner)}</span>
          </div>
        </div>

        {/* center */}
        <div className="mc-center">
          {finished && f.liveScore ? (
            <>
              <span className="mc-score">{f.liveScore.home}–{f.liveScore.away}</span>
              <span className="mc-ft">FT</span>
            </>
          ) : live ? (
            <>
              <span className="mc-live-badge">LIVE</span>
              {f.liveScore ? (
                <span className="mc-live-score">{f.liveScore.home}–{f.liveScore.away}</span>
              ) : minute !== null ? (
                <span className="mc-live-min">{minute}&apos;</span>
              ) : null}
            </>
          ) : (
            <span className="mc-time">{timeStr}</span>
          )}
        </div>

        {/* away side */}
        <div className="mc-side right">
          <div className="mc-stx right">
            <span className="mc-abbr">{abbr(f.away)}</span>
            <span className="mc-owner">{dn(f.awayOwner)}</span>
          </div>
          <Flag team={f.away} height={22} />
        </div>
      </div>

      {/* odds bar + segment-aligned percentage labels */}
      {!finished && hasOdds && (
        <div className="mc-odds-wrap">
          <div className="mc-odds-bar">
            <span className="ob-home" style={{ width: `${hp}%`, background: playerColor(f.homeOwner) }} />
            <span className="ob-draw"  style={{ width: `${dp}%` }} />
            <span className="ob-away"  style={{ width: `${ap}%`, background: playerColor(f.awayOwner) }} />
          </div>
          <div className="mc-odds-labels-abs">
            {hp! >= 9 && (
              <span className="mc-odl" style={{ left: `${hp! / 2}%`, color: playerColor(f.homeOwner) }}>{hp}%</span>
            )}
            {dp! >= 13 && (
              <span className="mc-odl" style={{ left: `${hp! + dp! / 2}%`, color: "var(--dim)" }}>{dp}%</span>
            )}
            {ap! >= 9 && (
              <span className="mc-odl" style={{ left: `${100 - ap! / 2}%`, color: playerColor(f.awayOwner) }}>{ap}%</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   STANDINGS TAB
══════════════════════════════════════════════════════ */
function StandingsTab({ players }: { players: PlayerProjection[] }) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.currentPoints - a.currentPoints || b.pFirst - a.pFirst),
    [players]
  );
  const maxPts = Math.max(...sorted.map((p) => p.currentPoints), 1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (name: string) => setExpanded((prev) => {
    const n = new Set(prev);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });

  return (
    <div>
      <div className="standings-head">
        <span>#</span>
        <span>PLAYER</span>
        <span className="r">GP</span>
        <span className="r">PTS</span>
      </div>
      <div className="standings-body">
        {sorted.map((p, i) => {
          const lead = i === 0;
          const totalW = p.teams.reduce((s, t) => s + t.w, 0);
          const totalD = p.teams.reduce((s, t) => s + t.d, 0);
          const totalL = p.teams.reduce((s, t) => s + t.l, 0);
          const gp = totalW + totalD + totalL;
          const pctFill = maxPts > 0 ? (p.currentPoints / maxPts) * 100 : 0;
          const isExp = expanded.has(p.player);
          return (
            <div key={p.player} className={`s-row${lead ? " lead" : ""}${isExp ? " s-row-open" : ""}`}
              onClick={() => toggle(p.player)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && toggle(p.player)}>
              <div className="s-row-main">
                <span className="s-rank">{i + 1}</span>
                <div className="s-info">
                  <div className="s-name-row">
                    {dn(p.player)}
                    {lead && <span className="s-leader-tag">LEADER</span>}
                    <span className="s-caret">{isExp ? "▾" : "▸"}</span>
                  </div>
                  <div className="s-track">
                    <span className="s-track-fill" style={{ width: `${pctFill}%` }} />
                  </div>
                </div>
                <span className="s-gp">{gp}</span>
                <span className="s-pts">{p.currentPoints}</span>
              </div>
              {isExp && (
                <div className="s-teams" onClick={(e) => e.stopPropagation()}>
                  <div className="s-teams-head">
                    <span /><span /><span className="s-th-wdl">W — D — L</span><span />
                  </div>
                  {p.teams.map((t) => {
                    const alive = isAlive(t.expectedRemainingWins);
                    return (
                      <div key={t.team} className={`s-team-row${alive ? "" : " s-team-elim"}`}>
                        <Flag team={t.team} height={18} />
                        <span className="s-team-name">{t.team}</span>
                        <span className="s-team-rec">{t.w}–{t.d}–{t.l}</span>
                        <span className={`s-team-status${alive ? " alive" : " elim"}`}>{alive ? "●" : "○"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   ODDS TAB — interactive line chart
══════════════════════════════════════════════════════ */
const CHART_W = 320, CHART_H = 150, PAD_T = 10, PAD_B = 6, PAD_X = 6;
const TIMELINE = ["Draft", "MD1", "MD2", "Now"];

function xAt(i: number) { return PAD_X + (i / (TIMELINE.length - 1)) * (CHART_W - PAD_X * 2); }
function yAt(v: number, mY: number) { return PAD_T + (1 - v / mY) * (CHART_H - PAD_T - PAD_B); }

function OddsTab({ players, iterations, oddsHistory }: {
  players: PlayerProjection[];
  iterations: number;
  oddsHistory: Record<string, OddsHistoryPoint[]>;
}) {
  const [isolated, setIsolated] = useState<string | null>(null);
  const [frame, setFrame] = useState({ idx: 999, isNow: true }); // 999 = clamp to lastIdx on first render
  const isDragging = useRef(false);
  const plotRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...players].sort((a, b) => b.pFirst - a.pFirst),
    [players]
  );

  // Use real Supabase history when available; fall back to linear interpolation.
  // Either way, normalise to a flat number[] per player so the chart is uniform.
  const { history, xLabels } = useMemo<{
    history: Record<string, number[]>;
    xLabels: string[];
  }>(() => {
    const n = players.length || 6;
    const start = 1 / n;

    // Check if we have at least 2 real data points for any player
    const hasReal = Object.values(oddsHistory).some((pts) => pts.length >= 2);

    if (hasReal) {
      // Build a unified x-axis from all matchdays across all players
      const allMDs = new Set<number>();
      for (const pts of Object.values(oddsHistory)) {
        for (const p of pts) allMDs.add(p.matchday);
      }
      const sortedMDs = [...allMDs].sort((a, b) => a - b);

      // Always prepend draft (-1) if not already there
      if (!sortedMDs.includes(-1)) sortedMDs.unshift(-1);
      // Always append a "Now" point at the end if latest real != current
      const mdLabels = sortedMDs.map((md) =>
        md === -1 ? "Draft" : md === 0 ? "Start" : `MD${md}`
      );
      // Replace last label with "Now"
      if (mdLabels.length > 0) mdLabels[mdLabels.length - 1] = "Now";

      const hist: Record<string, number[]> = {};
      for (const p of players) {
        const pts = oddsHistory[p.player] ?? [];
        const byMD = new Map(pts.map((pt) => [pt.matchday, pt.pct]));
        hist[p.player] = sortedMDs.map((md) =>
          md === -1 ? (byMD.get(-1) ?? start) : (byMD.get(md) ?? p.pFirst)
        );
        // Ensure last point = live pFirst
        if (hist[p.player].length > 0) {
          hist[p.player][hist[p.player].length - 1] = p.pFirst;
        }
      }
      return { history: hist, xLabels: mdLabels };
    }

    // Fallback: just Draft → Now (honest 2-point line, no fabricated intermediates)
    const hist: Record<string, number[]> = {};
    for (const p of players) {
      hist[p.player] = [start, p.pFirst];
    }
    return { history: hist, xLabels: ["Draft", "Now"] };
  }, [players, oddsHistory]);

  const maxY = useMemo(
    () => Math.max(...Object.values(history).flatMap((arr) => arr)) * 1.08,
    [history]
  );

  const lastIdx = xLabels.length - 1;

  const idxFromClientX = useCallback((clientX: number) => {
    const plot = plotRef.current;
    if (!plot) return lastIdx;
    const r = plot.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * CHART_W;
    let best = 0, bd = 1e9;
    for (let i = 0; i < xLabels.length; i++) {
      const xPos = PAD_X + (i / Math.max(xLabels.length - 1, 1)) * (CHART_W - PAD_X * 2);
      const d2 = Math.abs(rel - xPos);
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }, [xLabels.length, lastIdx]);

  // x coordinate for a given index (uses dynamic xLabels count)
  const xAtIdx = useCallback((i: number) =>
    PAD_X + (i / Math.max(xLabels.length - 1, 1)) * (CHART_W - PAD_X * 2),
  [xLabels.length]);

  const handlePDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    const idx = idxFromClientX(e.clientX);
    setFrame({ idx, isNow: idx === lastIdx });
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [idxFromClientX, lastIdx]);

  const handlePMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const idx = idxFromClientX(e.clientX);
    setFrame({ idx, isNow: idx === lastIdx });
  }, [idxFromClientX, lastIdx]);

  const handlePEnd = useCallback(() => {
    isDragging.current = false;
    setFrame({ idx: lastIdx, isNow: true });
  }, [lastIdx]);

  const handleMMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging.current) return;
    const idx = idxFromClientX(e.clientX);
    setFrame({ idx, isNow: idx === lastIdx });
  }, [idxFromClientX, lastIdx]);

  const handleMLeave = useCallback(() => {
    if (isDragging.current) return;
    setFrame({ idx: lastIdx, isNow: true });
  }, [lastIdx]);

  /* legend label: leader or isolated player value at current frame */
  const frameIdx = Math.min(frame.idx, lastIdx);
  const labelPlayer = isolated ?? sorted[0]?.player;
  const labelV = history[labelPlayer ?? ""]?.[frameIdx] ?? 0;

  const gridLines = [0.1, 0.2, 0.3].filter((g) => g <= maxY);

  return (
    <div className="odds-screen">
      {/* chart */}
      <div className="v3-chart">
        <div className="v3-chart-h">
          <div>
            <span className="v3-chart-t">Title odds over time</span>
            <span className="v3-chart-s">
              {frame.isNow
                ? "Drag across · tap a name to isolate"
                : `${xLabels[frameIdx] ?? ""} — ${dn(labelPlayer ?? "")} ${Math.round(labelV * 100)}%`}
            </span>
          </div>
          {frame.isNow && labelPlayer && (
            <span className="v3-chart-now" style={{ color: playerColor(labelPlayer) }}>
              ● {dn(labelPlayer)} {Math.round(labelV * 100)}%
            </span>
          )}
        </div>

        <div
          className="v3-plot"
          ref={plotRef}
          onPointerDown={handlePDown}
          onPointerMove={handlePMove}
          onPointerUp={handlePEnd}
          onPointerCancel={handlePEnd}
          onMouseMove={handleMMove}
          onMouseLeave={handleMLeave}
        >
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            className="v3-svg"
          >
            {/* grid */}
            {gridLines.map((g) => {
              const y = yAt(g, maxY);
              return (
                <g key={g}>
                  <line x1={PAD_X} y1={y} x2={CHART_W - PAD_X} y2={y}
                    stroke="rgba(255,255,255,.06)" strokeWidth={1} />
                  <text x={CHART_W - PAD_X} y={y - 3}
                    fill="var(--dim)" fontSize={8}
                    fontFamily="JetBrains Mono,monospace" textAnchor="end">
                    {Math.round(g * 100)}%
                  </text>
                </g>
              );
            })}

            {/* lines */}
            {sorted.map((p, i) => {
              const arr = history[p.player] ?? [];
              const d = arr.map((v, j) =>
                `${j === 0 ? "M" : "L"}${xAtIdx(j).toFixed(1)},${yAt(v, maxY).toFixed(1)}`
              ).join(" ");
              const isLead = i === 0;
              const isDim = isolated && isolated !== p.player;
              const isOn = isolated === p.player;
              return (
                <path key={p.player} d={d} fill="none"
                  stroke={playerColor(p.player)}
                  strokeWidth={isOn ? 3.4 : isLead ? 2.8 : 1.8}
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity={isDim ? 0.16 : 1}
                />
              );
            })}

            {/* scrubber */}
            {!frame.isNow && (
              <>
                <line
                  x1={xAtIdx(frameIdx)} y1={PAD_T}
                  x2={xAtIdx(frameIdx)} y2={CHART_H - PAD_B}
                  stroke="rgba(255,255,255,.5)" strokeWidth={1} strokeDasharray="3 3"
                />
                {sorted
                  .filter((p) => !isolated || isolated === p.player)
                  .map((p) => {
                    const v = history[p.player]?.[frameIdx] ?? 0;
                    return (
                      <circle key={p.player}
                        cx={xAtIdx(frameIdx)} cy={yAt(v, maxY)}
                        r={3.2} fill={playerColor(p.player)}
                        stroke="#000" strokeWidth={1}
                      />
                    );
                  })}
              </>
            )}

            {/* end dots (shown when at Now) */}
            {frame.isNow && sorted.map((p) => {
              const arr = history[p.player] ?? [];
              const v = arr[arr.length - 1] ?? 0;
              const isDim = isolated && isolated !== p.player;
              const isOn = isolated === p.player;
              return (
                <circle key={p.player}
                  cx={xAtIdx(arr.length - 1)} cy={yAt(v, maxY)}
                  r={isOn ? 4 : 3}
                  fill={playerColor(p.player)}
                  opacity={isDim ? 0.16 : 1}
                />
              );
            })}
          </svg>
        </div>

        <div className="v3-xaxis">
          {xLabels.map((l) => <span key={l}>{l}</span>)}
        </div>
      </div>

      {/* legend list */}
      <div className="v3-olist">
        {sorted.map((p, i) => {
          const isLead = i === 0;
          const isDim = isolated && isolated !== p.player;
          const isOn = isolated === p.player;
          const maxPF = sorted[0]?.pFirst ?? 0.01;
          const se = mcSE(p.pFirst, iterations);
          const maxFD = Math.max(...p.finishDistribution);
          return (
            <div key={p.player} className="v3-oitem">
              <button
                className={`v3-orow${isLead ? " lead" : ""}${isDim ? " iso-dim" : ""}${isOn ? " iso-on" : ""}`}
                onClick={() => setIsolated(isOn ? null : p.player)}
              >
                <span className="v3-orank">{i + 1}</span>
                <span className="v3-swatch" style={{ background: playerColor(p.player) }} />
                <div className="v3-oname-col">
                  <span className="v3-oname">{dn(p.player)}</span>
                  <span className="v3-oexp-note">exp {round1(p.expectedFinalPoints)} pts</span>
                </div>
                <div className="v3-otrack">
                  <span className="v3-ofill" style={{ width: `${(p.pFirst / maxPF) * 100}%`, background: playerColor(p.player) }} />
                </div>
                <span className="v3-opct">
                  {Math.round(p.pFirst * 100)}<i>%</i>
                </span>
              </button>
              {isOn && (
                <div className="v3-oexpand">
                  <div className="v3-oexp-header">
                    <span className="v3-oexp-se">±{Math.round(se * 1000) / 10}% confidence</span>
                    <span className="v3-oexp-se">finish distribution</span>
                  </div>
                  <div className="v3-fdist">
                    <div className="v3-fdist-bars">
                      {p.finishDistribution.map((pv, fi) => {
                        const barH = maxFD > 0 ? Math.max(Math.round((pv / maxFD) * 44), 2) : 2;
                        return (
                          <div key={fi} className="v3-fdist-col">
                            {fi === 0 && (
                              <span className="v3-fdist-peak">{Math.round(pv * 100)}%</span>
                            )}
                            <div className="v3-fdist-bar" style={{
                              height: barH,
                              background: fi === 0
                                ? playerColor(p.player)
                                : `rgba(255,255,255,${Math.max(0.07, 0.18 * (1 - fi / 5))})`,
                            }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="v3-fdist-lbls">
                      {p.finishDistribution.map((pv, fi) => (
                        <span key={fi} className="v3-fdist-lbl">
                          #{fi + 1}{fi > 0 ? <i>{Math.round(pv * 100)}%</i> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="v3-oexp-teams">
                    {p.teams.map((t) => {
                      const alive = isAlive(t.expectedRemainingWins);
                      return (
                        <div key={t.team} className={`v3-oexp-team${alive ? "" : " dim"}`}>
                          <Flag team={t.team} height={16} />
                          <span className="v3-oexp-tname">{abbr(t.team)}</span>
                          <span className="v3-oexp-trec">{t.w}-{t.d}-{t.l}</span>
                          <span className={`v3-oexp-talive${alive ? " alive" : " elim"}`}>{alive ? "●" : "○"}</span>
                          <span className="v3-oexp-tpts">{round1(t.expectedFinalPoints)}<i>exp</i></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   INSIGHTS TAB
══════════════════════════════════════════════════════ */
function InsightsTab({ players, fixtures, playerFactors }: {
  players: PlayerProjection[];
  fixtures: FixtureProjection[];
  playerFactors: PlayerFactors[];
}) {
  const ranked = useMemo(() => [...players].sort((a, b) => b.pFirst - a.pFirst), [players]);
  const pFirstMap = useMemo(() => Object.fromEntries(players.map((p) => [p.player, p.pFirst])), [players]);
  const [who, setWho] = useState<string>(ranked[0]?.player ?? "");

  /* today's games (or next day), ranked by swing */
  const { dayLabel, games } = useMemo(() => {
    const now = new Date();
    const withK = fixtures.filter((f) => f.kickoff);
    const today = withK.filter((f) => sameDay(new Date(f.kickoff!), now));
    if (today.length > 0) {
      return { dayLabel: "Tonight's swings", games: [...today].sort((a, b) => b.swing - a.swing) };
    }
    const future = withK
      .filter((f) => new Date(f.kickoff!).getTime() > now.getTime())
      .sort((a, b) => new Date(a.kickoff!).getTime() - new Date(b.kickoff!).getTime());
    if (future.length === 0) return { dayLabel: "", games: [] as FixtureProjection[] };
    const nextDay = new Date(future[0].kickoff!);
    const sameNext = future.filter((f) => sameDay(new Date(f.kickoff!), nextDay));
    const label = nextDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    return { dayLabel: label, games: sameNext.sort((a, b) => b.swing - a.swing) };
  }, [fixtures]);

  const selFactors = useMemo(
    () => playerFactors.find((x) => x.player === who)?.factors ?? [],
    [playerFactors, who]
  );
  const boosts = selFactors.filter((f) => f.pYes >= f.pNo);
  const risks  = selFactors.filter((f) => f.pYes < f.pNo);

  return (
    <div className="insights-screen">
      {/* swings card */}
      {games.length > 0 && (
        <div className="v3-card">
          <div className="v3-card-h">
            <span>{dayLabel || "Upcoming"}</span>
            <span className="v3-card-s">biggest movers</span>
          </div>
          {games.slice(0, 3).map((f) => <SwingRow key={f.id} f={f} pFirstMap={pFirstMap} />)}
        </div>
      )}

      {/* what moves the needle card */}
      <div className="v3-card">
        <div className="v3-card-h">
          <span>What moves the needle</span>
          <span className="v3-card-s">rest of cup</span>
        </div>

        <div className="v3-whochips">
          {ranked.map((p) => (
            <button
              key={p.player}
              className={`v3-who${who === p.player ? " on" : ""}`}
              onClick={() => setWho(p.player)}
            >
              {dn(p.player)}
            </button>
          ))}
        </div>

        {selFactors.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--mut)", lineHeight: 1.5 }}>
            Odds are largely settled — no high-variance swings left.
          </p>
        ) : (
          <>
            {boosts.length > 0 && (
              <>
                <div className="v3-fglab up">UPSIDE</div>
                {boosts.map((f) => <FactorRow key={f.team + f.stage} f={f} />)}
              </>
            )}
            {risks.length > 0 && (
              <>
                <div className="v3-fglab down">RISK</div>
                {risks.map((f) => <FactorRow key={f.team + f.stage} f={f} />)}
              </>
            )}
          </>
        )}
      </div>

    </div>
  );
}

function SwingRow({ f, pFirstMap }: { f: FixtureProjection; pFirstMap: Record<string, number> }) {
  const d = f.kickoff ? new Date(f.kickoff) : null;
  const time = d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const ps = (f.playerSwings ?? [])[0];
  const homeHigher = ps ? ps.pHome >= ps.pAway : true;
  const goodTeam = homeHigher ? f.home : f.away;
  const hi = ps ? Math.max(ps.pHome, ps.pAway) : 0;
  const current = ps ? (pFirstMap[ps.player] ?? Math.min(ps.pHome, ps.pAway)) : 0;
  const delta = Math.round((hi - current) * 100);

  if (!ps || f.swing < 0.005) return null;

  return (
    <div className="v3-sw">
      <div className="v3-sw-l">
        <Flag team={goodTeam} height={20} />
        <div className="v3-sw-tx">
          <span className="v3-sw-m">{abbr(f.home)} v {abbr(f.away)}</span>
          <span className="v3-sw-if">if {abbr(goodTeam)} win · {time}</span>
        </div>
      </div>
      <div className="v3-sw-r">
        <span className="v3-sw-who">{dn(ps.player)}</span>
        <span className="v3-sw-move">
          {Math.round(current * 100)}%→{Math.round(hi * 100)}% <i>{delta >= 0 ? "+" : ""}{delta}</i>
        </span>
      </div>
    </div>
  );
}

function FactorRow({ f }: { f: TournamentFactor }) {
  const up = f.pYes >= f.pNo;
  const delta = Math.round((f.pYes - f.pNo) * 100);
  return (
    <div className="v3-fac">
      <Flag team={f.team} height={20} />
      <div className="v3-fac-mid">
        <span className="v3-fac-lab">{f.label}</span>
        <span className="v3-fac-prob">{Math.round(f.prob * 100)}% likely</span>
      </div>
      <div className={`v3-fac-d ${up ? "up" : "down"}`}>
        <span>{Math.round(f.pYes * 100)}%</span>
        <i>{delta >= 0 ? "+" : ""}{delta}</i>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════
   TAB ICONS
══════════════════════════════════════════════════════ */
function GamesIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.9" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function StandingsIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 20V9M12 20V4M18 20v-7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}
function OddsIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 16l4.5-5.5 3.5 3L18 6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 6h4v4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function InsightsIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 12V6M12 12l4.5 2.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
interface DayGroup {
  key: string;
  shortLabel: string;
  isToday: boolean;
  matches: FixtureProjection[];
}

function groupByDay(fixtures: FixtureProjection[]): DayGroup[] {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const map = new Map<string, DayGroup>();

  /* seed yesterday, today */
  for (let offset = -1; offset <= 0; offset++) {
    const d = new Date(todayMidnight);
    d.setDate(todayMidnight.getDate() + offset);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const isToday = offset === 0;
    const shortLabel = offset === -1 ? "Yesterday" : "Today";
    map.set(key, { key, shortLabel, isToday, matches: [] });
  }

  const sorted = [...fixtures].sort((a, b) => {
    if (!a.kickoff) return 1;
    if (!b.kickoff) return -1;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });

  for (const f of sorted) {
    const d = f.kickoff ? new Date(f.kickoff) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "tbd";
    const isToday = d ? sameDay(d, now) : false;

    if (!d) {
      if (!map.has("tbd")) map.set("tbd", { key: "tbd", shortLabel: "TBD", isToday: false, matches: [] });
      map.get("tbd")!.matches.push(f);
      continue;
    }

    if (!map.has(key)) {
      const dayDiff = Math.round(
        (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - todayMidnight.getTime()) / 86400000
      );
      const shortLabel = dayDiff === 1 ? "Tomorrow"
        : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
      map.set(key, { key, shortLabel, isToday, matches: [] });
    }
    map.get(key)!.matches.push(f);
  }

  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === "tbd") return 1;
      if (b === "tbd") return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([, g]) => g)
    .filter((g) => g.matches.length > 0 || g.isToday);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
