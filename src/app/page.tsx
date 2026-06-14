"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection } from "@/lib/types";

type Tab = "matches" | "table" | "insights";

const DISPLAY_NAME: Record<string, string> = { Isiah: "Zeke" };
const displayName = (name: string) => DISPLAY_NAME[name] ?? name;

const PLAYER_COLORS: Record<string, string> = {
  Sam: "#3b82f6", Wyatt: "#f59e0b", Duncan: "#8b5cf6",
  Conrad: "#ec4899", Gus: "#10b981", Isiah: "#f97316",
};
const playerColor = (name: string) => PLAYER_COLORS[name] ?? "#555";

const TEAM_COLORS: Record<string, string> = {
  Spain: "#c60b1e",      France: "#1a3f7f",      Brazil: "#009c3b",
  Argentina: "#6babdf",  England: "#cf081f",      Germany: "#6b7280",
  Portugal: "#016d38",   Netherlands: "#f36621",  Belgium: "#ed2939",
  Uruguay: "#5eb6e4",    Croatia: "#e91b23",      Morocco: "#c1272d",
  "United States": "#b22234", Mexico: "#006847",  Japan: "#bc002d",
  Switzerland: "#cc0000", Senegal: "#00853f",     Colombia: "#f5c518",
  Norway: "#ef2b2d",     Austria: "#ed2939",      Sweden: "#006aa7",
  "South Korea": "#003478", Ecuador: "#ffd100",   "Ivory Coast": "#f77f00",
  Australia: "#00843d",  "Czech Republic": "#d7141a", Türkiye: "#e30a17",
  Egypt: "#ce1126",      Canada: "#cc0000",       Paraguay: "#d52b1e",
  Iran: "#239f40",       "Saudi Arabia": "#006c35", Scotland: "#003f8a",
  Tunisia: "#e70013",    "DR Congo": "#007fff",   Algeria: "#006233",
  Qatar: "#8d1b3d",      Panama: "#da121a",       "Cape Verde": "#003893",
  Ghana: "#006b3f",      Uzbekistan: "#1eb53a",   "South Africa": "#007a4d",
  Bosnia: "#002395",     Iraq: "#ce1126",         Jordan: "#007a3d",
  Haiti: "#00209f",      "New Zealand": "#00247d", Curacao: "#003da5",
};
const teamColor = (name: string) => TEAM_COLORS[name] ?? "#555";

const FLAGS: Record<string, string> = {
  "Spain": "🇪🇸", "France": "🇫🇷", "Brazil": "🇧🇷", "Argentina": "🇦🇷",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Germany": "🇩🇪", "Portugal": "🇵🇹", "Netherlands": "🇳🇱",
  "Belgium": "🇧🇪", "Uruguay": "🇺🇾", "Croatia": "🇭🇷", "Morocco": "🇲🇦",
  "United States": "🇺🇸", "Mexico": "🇲🇽", "Japan": "🇯🇵", "Switzerland": "🇨🇭",
  "Senegal": "🇸🇳", "Colombia": "🇨🇴", "Norway": "🇳🇴", "Austria": "🇦🇹",
  "Sweden": "🇸🇪", "South Korea": "🇰🇷", "Ecuador": "🇪🇨", "Ivory Coast": "🇨🇮",
  "Australia": "🇦🇺", "Czech Republic": "🇨🇿", "Türkiye": "🇹🇷", "Egypt": "🇪🇬",
  "Canada": "🇨🇦", "Paraguay": "🇵🇾", "Iran": "🇮🇷", "Saudi Arabia": "🇸🇦",
  "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Tunisia": "🇹🇳", "DR Congo": "🇨🇩", "Algeria": "🇩🇿",
  "Qatar": "🇶🇦", "Panama": "🇵🇦", "Cape Verde": "🇨🇻", "Ghana": "🇬🇭",
  "Uzbekistan": "🇺🇿", "South Africa": "🇿🇦", "Bosnia": "🇧🇦", "Iraq": "🇮🇶",
  "Jordan": "🇯🇴", "Haiti": "🇭🇹", "New Zealand": "🇳🇿", "Curacao": "🇨🇼",
};
const flag = (team: string) => FLAGS[team] ?? "🏳️";
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const round1 = (n: number) => Math.round(n * 10) / 10;

// Feature 3: Live match helpers
function isLiveByTime(kickoff: string | undefined): boolean {
  if (!kickoff) return false;
  const ms = Date.now() - new Date(kickoff).getTime();
  return ms > 0 && ms < 115 * 60 * 1000;
}

function liveMinute(kickoff: string): number {
  return Math.floor((Date.now() - new Date(kickoff).getTime()) / 60000);
}

export default function Page() {
  const [data, setData]       = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>("matches");

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

  const leader = useMemo(() => {
    if (!data) return null;
    return [...data.players].sort(
      (a, b) => b.currentPoints - a.currentPoints || b.expectedFinalPoints - a.expectedFinalPoints
    )[0];
  }, [data]);

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <span className="app-title">WC26 Pool</span>
          {leader && (
            <span className="app-leader-callout">
              <strong style={{ color: playerColor(leader.player) }}>{displayName(leader.player)}</strong>
              {" "}leads · {leader.currentPoints} pts
            </span>
          )}
        </div>
        {data && (
          <div className="app-status-strip">
            <div className={`status-pill${data.status.groupSource === "kalshi" ? " live" : " warn"}`}>
              <span className="pill-dot" />
              {data.status.groupSource === "kalshi" ? "KALSHI ODDS" : "MOCK ODDS"}
            </div>
            <div className={`status-pill${data.status.liveResults ? " live" : " warn"}`}>
              <span className="pill-dot" />
              {data.status.liveResults ? "LIVE RESULTS" : "NO LIVE DATA"}
            </div>
            {data.oddsSource === "mock" && (
              <div className="status-pill warn mock-warn">⚠ SIMULATED DATA</div>
            )}
          </div>
        )}
      </header>

      <main className="page">
        {loading ? (
          <div className="loading-state">Loading…</div>
        ) : !data ? (
          <div className="empty-state">
            Could not load data.{" "}
            <button onClick={load} style={{
              color: "var(--green)", background: "none", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", fontWeight: 700,
            }}>Retry</button>
          </div>
        ) : (
          <div className="tab-pane" key={tab}>
            {tab === "matches"  && <MatchesTab fixtures={data.fixtures} />}
            {tab === "table"    && <TableTab players={data.players} fixtures={data.fixtures} />}
            {tab === "insights" && <InsightsTab players={data.players} fixtures={data.fixtures} />}
          </div>
        )}
      </main>

      <nav className="tab-bar" aria-label="Sections">
        <button className={`tab-btn ${tab === "matches" ? "active" : ""}`} onClick={() => setTab("matches")}>
          <CalendarIcon /> Matches
        </button>
        <button className={`tab-btn ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>
          <TableIcon /> Table
        </button>
        <button className={`tab-btn ${tab === "insights" ? "active" : ""}`} onClick={() => setTab("insights")}>
          <InsightsIcon /> Insights
        </button>
      </nav>
    </>
  );
}

/* ============================================================
   MATCHES TAB
   ============================================================ */
function MatchesTab({ fixtures }: { fixtures: FixtureProjection[] }) {
  const groups = useMemo(() => groupByDay(fixtures), [fixtures]);
  const todayKey = groups.find((g) => g.isToday)?.key ?? groups[0]?.key ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);
  // Feature 2: expanded card state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLButtonElement>(".day-chip.active");
    el?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, [selectedKey]);

  if (groups.length === 0) return <div className="empty-state">No fixtures available.</div>;
  const activeGroup = groups.find((g) => g.key === selectedKey) ?? groups[0];

  return (
    <div>
      <div className="day-strip-wrap">
        <div className="day-strip" ref={stripRef}>
          {groups.map((g) => (
            <button
              key={g.key}
              className={`day-chip${selectedKey === g.key ? " active" : ""}${g.isToday ? " is-today" : ""}`}
              onClick={() => setSelectedKey(g.key)}
            >
              {g.isToday && <span className="chip-pip" />}
              {g.shortLabel}
            </button>
          ))}
        </div>
      </div>
      <div className="day-matches">
        {activeGroup.matches.length === 0
          ? <div className="empty-state">No matches this day.</div>
          : activeGroup.matches.map((f) => (
              <MatchCard
                key={f.id}
                fixture={f}
                isExpanded={expandedId === f.id}
                onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
              />
            ))
        }
      </div>
    </div>
  );
}

function MatchCard({
  fixture: f,
  isExpanded,
  onToggle,
}: {
  fixture: FixtureProjection;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const d = f.kickoff ? new Date(f.kickoff) : null;
  const timeStr = d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "TBD";
  const [tVal, tPeriod] = timeStr.split(" ");
  const odds = f.oddsHome;
  const hp = odds ? Math.round(odds.win * 100) : null;
  const dp = odds ? Math.round(odds.draw * 100) : null;
  const ap = odds ? Math.round(odds.loss * 100) : null;

  // Feature 3: live detection
  const live = f.liveStatus != null ? f.liveStatus !== "FINISHED"
    : isLiveByTime(f.kickoff);
  const minute = live && f.kickoff
    ? (f.liveMinute ?? liveMinute(f.kickoff))
    : null;

  return (
    <div className="match-card" onClick={onToggle}>
      <div className="match-card-teams">
        <div className="mc-team home">
          <span className="mc-flag">{flag(f.home)}</span>
          <span className="mc-name">{f.home}</span>
          <span className="mc-owner">{f.homeOwner}</span>
        </div>
        <div className="mc-center">
          {live ? (
            <>
              <span className="live-badge">LIVE</span>
              {f.liveScore ? (
                <span className="live-score">{f.liveScore.home}–{f.liveScore.away}</span>
              ) : minute !== null ? (
                <span className="live-minute">{minute}&apos;</span>
              ) : null}
            </>
          ) : (
            <>
              <span className="mc-time">{tVal}</span>
              {tPeriod && <span className="mc-period">{tPeriod}</span>}
              <span className="mc-chevron">{isExpanded ? "▲" : "▼"}</span>
            </>
          )}
        </div>
        <div className="mc-team away">
          <span className="mc-flag">{flag(f.away)}</span>
          <span className="mc-name">{f.away}</span>
          <span className="mc-owner">{f.awayOwner}</span>
        </div>
      </div>
      {hp !== null && dp !== null && ap !== null && (
        <div className="mc-odds">
          <div className="odds-track">
            <div className="odds-seg" style={{ width: `${hp}%`, background: teamColor(f.home) }} />
            <div className="odds-seg draw" style={{ width: `${dp}%` }} />
            <div className="odds-seg" style={{ width: `${ap}%`, background: teamColor(f.away) }} />
          </div>
          <div className="odds-labels">
            <span style={{ color: teamColor(f.home) }}>{hp}%</span>
            <span className="odds-label-mid">{dp}% draw</span>
            <span style={{ color: teamColor(f.away) }}>{ap}%</span>
          </div>
        </div>
      )}
      {/* Feature 2: expanded preview */}
      {isExpanded && (
        <div className="match-preview">
          {f.swingPlayer && f.swingToward && (
            <div className="preview-insight">
              <span className="preview-insight-icon">⚡</span>
              <span>
                A <strong>{f.swingToward === "home" ? f.home : f.away}</strong> win gives{" "}
                <strong style={{ color: playerColor(f.swingPlayer) }}>{displayName(f.swingPlayer)}</strong>{" "}
                the biggest title boost (+{Math.round(f.swing * 100)}% win prob)
              </span>
            </div>
          )}
          <div className="preview-stakes">
            <div className="stake-item">
              <span className="stake-flag">{flag(f.home)}</span>
              <div>
                <div className="stake-team">{f.home}</div>
                <div className="stake-owner" style={{ color: playerColor(f.homeOwner) }}>{f.homeOwner}&apos;s team</div>
              </div>
            </div>
            <div className="stake-vs">VS</div>
            <div className="stake-item right">
              <div>
                <div className="stake-team">{f.away}</div>
                <div className="stake-owner right" style={{ color: playerColor(f.awayOwner) }}>{f.awayOwner}&apos;s team</div>
              </div>
              <span className="stake-flag">{flag(f.away)}</span>
            </div>
          </div>
          {f.oddsHome && (
            <div className="preview-outcomes">
              <div className="outcome-row">
                <span className="outcome-label">{f.home} win</span>
                <span className="outcome-prob" style={{ color: teamColor(f.home) }}>{Math.round(f.oddsHome.win * 100)}%</span>
              </div>
              <div className="outcome-row">
                <span className="outcome-label">Draw</span>
                <span className="outcome-prob" style={{ color: "var(--t2)" }}>{Math.round(f.oddsHome.draw * 100)}%</span>
              </div>
              <div className="outcome-row">
                <span className="outcome-label">{f.away} win</span>
                <span className="outcome-prob" style={{ color: teamColor(f.away) }}>{Math.round(f.oddsHome.loss * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TABLE TAB
   ============================================================ */
function TableTab({ players, fixtures }: { players: PlayerProjection[]; fixtures: FixtureProjection[] }) {
  const [open, setOpen] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...players].sort(
      (a, b) => b.currentPoints - a.currentPoints || b.expectedFinalPoints - a.expectedFinalPoints
    ),
    [players]
  );

  const maxPts = Math.max(...sorted.map((p) => p.currentPoints), 1);

  // Feature 4: live adjustments
  const liveFix = useMemo(
    () => fixtures.filter((f) => f.liveStatus != null || isLiveByTime(f.kickoff)),
    [fixtures]
  );

  const liveAdjustments = useMemo(() => {
    const adj: Record<string, number> = {};
    for (const f of liveFix) {
      const { homeOwner, awayOwner, liveScore } = f;
      if (!liveScore) continue;
      const { home: sh, away: sa } = liveScore;
      if (sh > sa) {
        adj[homeOwner] = (adj[homeOwner] ?? 0) + 3;
      } else if (sa > sh) {
        adj[awayOwner] = (adj[awayOwner] ?? 0) + 3;
      } else {
        adj[homeOwner] = (adj[homeOwner] ?? 0) + 1;
        adj[awayOwner] = (adj[awayOwner] ?? 0) + 1;
      }
    }
    return adj;
  }, [liveFix]);

  return (
    <div className="standings-wrap">
      <div className="standings-header">
        <span className="sh-rank">#</span>
        <span>Player</span>
        <span className="sh-meta">Teams · Played</span>
        <span className="sh-pts">Pts</span>
      </div>

      {sorted.map((p, i) => {
        const isOpen = open === p.player;
        const isLeader = i === 0;
        const ptPct = (p.currentPoints / maxPts) * 100;

        const gamesPlayed = p.teams.reduce((s, t) => s + t.w + t.d + t.l, 0);
        const teamsAlive = p.teams.filter((t) => {
          const played = t.w + t.d + t.l;
          if (played >= 2 && t.currentPoints === 0 && t.d === 0) return false;
          if (played >= 3 && t.currentPoints === 0) return false;
          return true;
        }).length;

        const delta = liveAdjustments[p.player];

        return (
          <div key={p.player}>
            <div
              className={`standing-row${isLeader ? " leader" : ""}`}
              onClick={() => setOpen(isOpen ? null : p.player)}
            >
              <span className="row-rank" style={{ color: isLeader ? "var(--green)" : playerColor(p.player) }}>
                {i + 1}
              </span>
              <div className="row-info">
                <div className="row-name">{displayName(p.player)}</div>
              </div>
              <div className="row-meta">
                <span className="row-meta-stat">
                  <span className="meta-val">{teamsAlive}</span>
                  <span className="meta-label">/8 alive</span>
                </span>
                <span className="row-meta-stat">
                  <span className="meta-val">{gamesPlayed}</span>
                  <span className="meta-label">/24 played</span>
                </span>
              </div>
              <div className="row-right">
                <div className="row-pts-row">
                  <span className="row-pts">{p.currentPoints}</span>
                  {delta != null && delta > 0 && (
                    <span className="live-delta">+{delta}</span>
                  )}
                </div>
                <span className="row-pts-label">pts</span>
              </div>
              <div className="row-progress" style={{ width: `${ptPct}%` }} />
            </div>

            {isOpen && <PlayerExpand player={p} />}
          </div>
        );
      })}
    </div>
  );
}

function PlayerExpand({ player: p }: { player: PlayerProjection }) {
  const sorted = [...p.teams].sort((a, b) => b.currentPoints - a.currentPoints);
  const color = playerColor(p.player);
  return (
    <div className="standing-expand">
      <div className="expand-teams">
        {sorted.map((t) => {
          const played = t.w + t.d + t.l;
          const record = played > 0 ? `${t.w}W ${t.d}D ${t.l}L` : "—";
          return (
            <div className="expand-team" key={t.team}>
              <span className="et-left">
                <span className="et-flag">{flag(t.team)}</span>
                <span className="et-name">{t.team}</span>
              </span>
              <span className="et-record">{record}</span>
              <span className={`et-pts${t.currentPoints === 0 ? " zero" : ""}`}
                style={t.currentPoints > 0 ? { color } : undefined}>
                {t.currentPoints}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   INSIGHTS TAB
   ============================================================ */
function InsightsTab({ players, fixtures }: { players: PlayerProjection[]; fixtures: FixtureProjection[] }) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.pFirst - a.pFirst),
    [players]
  );
  const maxWin = Math.max(...sorted.map((p) => p.pFirst), 0.01);
  const topSwing = useMemo(
    () => [...fixtures].filter((f) => f.swing > 0).sort((a, b) => b.swing - a.swing).slice(0, 5),
    [fixtures]
  );
  const byPts = useMemo(
    () => [...players].sort((a, b) => b.currentPoints - a.currentPoints),
    [players]
  );
  const maxProj = Math.max(...players.map((p) => p.expectedFinalPoints), 1);

  return (
    <div className="insights-wrap">

      {/* Win probability */}
      <div className="insight-section">
        <div className="insight-header">
          <span className="insight-title">Win Probability</span>
          <span className="insight-subtitle">Monte Carlo · {players[0]?.finishDistribution ? "5k sims" : ""}</span>
        </div>
        {sorted.map((p, i) => (
          <div className="win-row" key={p.player}>
            <div className="win-row-top">
              <span className="win-name">{displayName(p.player)}</span>
              <span className="win-pct" style={{ color: i === 0 ? "var(--green)" : "var(--t1)" }}>
                {pct(p.pFirst)}
              </span>
            </div>
            <div className="win-bar-track">
              <div
                className="win-bar-fill"
                style={{
                  width: `${(p.pFirst / maxWin) * 100}%`,
                  background: i === 0 ? "var(--green)" : playerColor(p.player),
                  opacity: i === 0 ? 1 : 0.7,
                }}
              />
            </div>
            <div className="win-sub">
              <span>Top 3: {pct(p.pTop3)}</span>
              <span>Proj: {round1(p.expectedFinalPoints)} pts</span>
            </div>
          </div>
        ))}
      </div>

      {/* Projected final standings */}
      <div className="insight-section">
        <div className="insight-header">
          <span className="insight-title">Projected Final Points</span>
          <span className="insight-subtitle">Expected wins × 3 pts</span>
        </div>
        {byPts.map((p) => (
          <div className="proj-row" key={p.player}>
            <span className="proj-name">{displayName(p.player)}</span>
            <div className="proj-bars">
              <div className="proj-current-bar" style={{
                width: `${(p.currentPoints / maxProj) * 100}%`,
                background: playerColor(p.player),
              }} />
              <div className="proj-expected-bar" style={{
                width: `${((p.expectedFinalPoints - p.currentPoints) / maxProj) * 100}%`,
                background: playerColor(p.player),
                opacity: 0.25,
              }} />
            </div>
            <div className="proj-nums">
              <span className="proj-cur">{p.currentPoints}</span>
              <span className="proj-arrow">→</span>
              <span className="proj-exp">{round1(p.expectedFinalPoints)}</span>
            </div>
          </div>
        ))}
        <div className="proj-legend">
          <span className="legend-solid" /> Earned &nbsp;
          <span className="legend-dim" /> Projected
        </div>
      </div>

      {/* Key matches */}
      {topSwing.length > 0 && (
        <div className="insight-section">
          <div className="insight-header">
            <span className="insight-title">Most Impactful Matches</span>
            <span className="insight-subtitle">Swing = max title-odds shift</span>
          </div>
          {topSwing.map((f) => {
            const d = f.kickoff ? new Date(f.kickoff) : null;
            const timeLabel = d
              ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : "TBD";
            const swingPct = Math.round(f.swing * 100);
            const toward = f.swingToward === "home" ? f.home : f.swingToward === "away" ? f.away : null;
            return (
              <div className="swing-row" key={f.id}>
                <div className="swing-matchup">
                  <span>{flag(f.home)} {f.home}</span>
                  <span className="swing-vs">vs</span>
                  <span>{flag(f.away)} {f.away}</span>
                </div>
                <div className="swing-meta">
                  <span className="swing-time">{timeLabel}</span>
                  {f.swingPlayer && toward && (
                    <span className="swing-note">
                      <span style={{ color: playerColor(f.swingPlayer) }}>
                        {displayName(f.swingPlayer)}
                      </span>
                      {" "}+{swingPct}% if {toward} wins
                    </span>
                  )}
                </div>
                <div className="swing-bar-track">
                  <div className="swing-bar-fill" style={{ width: `${Math.min(swingPct * 2, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Finish distribution */}
      <div className="insight-section">
        <div className="insight-header">
          <span className="insight-title">Finish Distribution</span>
          <span className="insight-subtitle">P(finish in each place)</span>
        </div>
        <div className="finish-grid">
          {byPts.map((p) => (
            <div className="finish-player" key={p.player}>
              <div className="finish-name">{displayName(p.player)}</div>
              <div className="finish-bars">
                {p.finishDistribution.map((prob, place) => (
                  <div
                    key={place}
                    className="finish-bar"
                    style={{
                      height: `${Math.max(prob * 100 * 4, 2)}%`,
                      background: place === 0 ? "var(--green)" : playerColor(p.player),
                      opacity: place === 0 ? 1 : 0.6 - place * 0.05,
                    }}
                    title={`P(${place + 1}): ${pct(prob)}`}
                  />
                ))}
              </div>
              <div className="finish-label">
                <span>1st</span>
                <span>{p.finishDistribution.length}th</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ============================================================
   ICONS
   ============================================================ */
function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="8" cy="15" r="1" fill="currentColor" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
      <circle cx="16" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}
function TableIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 9h18M3 15h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 9v9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function InsightsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 17l4-6 4 3 4-7 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="11" r="1.5" fill="currentColor" />
    </svg>
  );
}

/* ============================================================
   HELPERS
   ============================================================ */
interface DayGroup {
  key: string;
  label: string;
  shortLabel: string;
  isToday: boolean;
  matches: FixtureProjection[];
}

function groupByDay(fixtures: FixtureProjection[]): DayGroup[] {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const map = new Map<string, DayGroup>();

  for (let offset = -2; offset <= 0; offset++) {
    const d = new Date(todayMidnight);
    d.setDate(todayMidnight.getDate() + offset);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const isToday = offset === 0;
    const shortLabel = offset === -2
      ? d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })
      : offset === -1 ? "Yesterday" : "Today";
    map.set(key, { key, label: shortLabel, shortLabel, isToday, matches: [] });
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
      if (!map.has("tbd")) map.set("tbd", { key: "tbd", label: "TBD", shortLabel: "TBD", isToday: false, matches: [] });
      map.get("tbd")!.matches.push(f);
      continue;
    }

    if (!map.has(key)) {
      const dayDiff = Math.round(
        (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - todayMidnight.getTime()) / 86400000
      );
      const shortLabel = dayDiff === 1 ? "Tomorrow"
        : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
      map.set(key, { key, label: shortLabel, shortLabel, isToday, matches: [] });
    }
    map.get(key)!.matches.push(f);
  }

  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === "tbd") return 1;
      if (b === "tbd") return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([, g]) => g);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

