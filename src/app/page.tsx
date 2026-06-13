"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection } from "@/lib/types";

const FINISH_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

export default function Page() {
  const [data, setData] = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [mock, setMock] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("matches");

  const load = useCallback(async (useMock: boolean) => {
    setLoading(true);
    setMounted(false);
    try {
      const res = await fetch(
        `/api/leaderboard?iterations=50000${useMock ? "&mock=1" : ""}`,
        { cache: "no-store" }
      );
      setData((await res.json()) as ProjectionResult);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    }
  }, []);

  useEffect(() => { load(mock); }, [load, mock]);

  // Nav scroll shadow
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // IntersectionObserver for active nav link
  useEffect(() => {
    const sections = ["matches", "standings", "schedule"];
    const observers: IntersectionObserver[] = [];
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-40% 0px -55% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [data]);

  const today = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    return data.fixtures.filter((f) => f.kickoff && sameDay(new Date(f.kickoff), now));
  }, [data]);

  const upcoming = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return [...data.fixtures]
      .filter((f) => f.kickoff && new Date(f.kickoff).getTime() >= tomorrow.getTime())
      .sort((a, b) => kickoffMs(a) - kickoffMs(b))
      .slice(0, 30);
  }, [data]);

  const todayDate = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
  }, []);

  const isLive = data?.status.groupSource === "kalshi" || data?.status.knockoutSource === "kalshi";

  return (
    <>
      {/* Sticky nav */}
      <nav className={`site-nav ${navScrolled ? "scrolled" : ""}`} aria-label="Page sections">
        <span className="nav-brand">WC26 <span>Pool</span></span>
        <ul className="nav-links" role="list">
          {[
            { id: "matches", label: "Matches" },
            { id: "standings", label: "Standings" },
            { id: "schedule", label: "Schedule" },
          ].map(({ id, label }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={activeSection === id ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
        <div className="nav-status" aria-live="polite">
          <span className={`status-dot ${!data ? "" : isLive ? "live" : "mock"}`} />
          <span>{!data ? "—" : isLive ? "Live" : "Model"}</span>
        </div>
      </nav>

      <main className="page">
        {/* Matchday header */}
        <header className="matchday-header">
          <p className="matchday-eyebrow">World Cup 2026 · Draft Pool</p>
          <h1 className="matchday-title">
            {today.length > 0 ? (
              <><em>{today.length} {today.length === 1 ? "match" : "matches"}</em><br />today</>
            ) : (
              <>Group<br /><em>Stage</em></>
            )}
          </h1>
          <div className="matchday-meta">
            <span>{todayDate}</span>
            {data && <span>{data.players.length} players · {data.players.reduce((s, p) => s + p.teams.length, 0)} teams</span>}
            {data && <span>{(data.iterations / 1000).toFixed(0)}k simulations</span>}
          </div>
        </header>

        {loading && (
          <div className="loading-state">Running simulations…</div>
        )}

        {!loading && !data && (
          <div className="error-state">
            Couldn&apos;t load projections.{" "}
            <button className="ctrl-btn" style={{ display: "inline", padding: "4px 10px" }} onClick={() => load(mock)}>
              Retry
            </button>
          </div>
        )}

        {!loading && data && (
          <>
            {/* TODAY'S MATCHES */}
            <section id="matches" className="section">
              <div className="section-header">
                <h2 className="section-title">Today&apos;s matches</h2>
                {today.length > 0 && (
                  <span className="section-meta">{today.length} {today.length === 1 ? "fixture" : "fixtures"}</span>
                )}
              </div>

              {today.length === 0 ? (
                <div className="no-matches">No pool matches today — check the schedule below.</div>
              ) : (
                <div className="match-list">
                  {today.map((f, i) => (
                    <MatchCard key={f.id} fixture={f} mounted={mounted} delay={i * 60} />
                  ))}
                </div>
              )}
            </section>

            {/* STANDINGS */}
            <section id="standings" className="section">
              <div className="section-header">
                <h2 className="section-title">Standings</h2>
                <span className="section-meta">Win probability</span>
              </div>
              <StandingsTable players={data.players} mounted={mounted} />
            </section>

            {/* SCHEDULE */}
            <section id="schedule" className="section">
              <div className="section-header">
                <h2 className="section-title">Schedule</h2>
                {upcoming.length > 0 && (
                  <span className="section-meta">Next {upcoming.length} fixtures</span>
                )}
              </div>
              {upcoming.length === 0 ? (
                <div className="no-matches">No upcoming fixtures.</div>
              ) : (
                <UpcomingStrip fixtures={upcoming} mounted={mounted} />
              )}
            </section>

            <div className="controls">
              <button className="ctrl-btn" onClick={() => load(mock)} disabled={loading}>
                ↻ Re-run simulation
              </button>
              <button className="ctrl-btn" onClick={() => setMock((m) => !m)} disabled={loading}>
                {mock ? "Switch to live odds" : "Switch to model odds"}
              </button>
            </div>

            <p className="page-note">
              Win&nbsp;% is each player&apos;s probability of finishing 1st, from a
              Monte Carlo simulation of all remaining matches. Group odds via Kalshi
              3-way markets; knockout odds from Kalshi advance markets.
              Set <code>FOOTBALL_DATA_TOKEN</code> for live results.
            </p>
          </>
        )}
      </main>
    </>
  );
}

/* ============================================================
   MATCH CARD
   ============================================================ */
function MatchCard({
  fixture: f, mounted, delay,
}: { fixture: FixtureProjection; mounted: boolean; delay: number }) {
  const o = f.oddsHome;
  const isKey = f.swing >= 0.05;

  const time = f.kickoff
    ? new Date(f.kickoff).toLocaleString("en-US", {
        weekday: "short", hour: "numeric", minute: "2-digit",
      })
    : "TBD";

  const stakesLine = f.swing > 0 && f.swingPlayer
    ? (() => {
        const toward = f.swingToward === "home" ? f.home : f.away;
        return `A ${toward} win shifts ${f.swingPlayer}'s title odds by ${(f.swing * 100).toFixed(1)}pp`;
      })()
    : null;

  return (
    <div
      className={`match-card ${isKey ? "key-game" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="match-meta-row">
        <span className="match-time">{time}</span>
        {isKey && (
          <span className="match-swing">↑ {(f.swing * 100).toFixed(0)}% swing</span>
        )}
      </div>

      <div className="match-teams-row">
        <div className="match-team">
          <span className="team-name">{f.home}</span>
          <span className="team-owner">{f.homeOwner}</span>
        </div>
        <span className="match-vs">vs</span>
        <div className="match-team away">
          <span className="team-name">{f.away}</span>
          <span className="team-owner">{f.awayOwner}</span>
        </div>
      </div>

      {o ? (
        <div className="odds-grid">
          <OddsLeg label={f.home} pct={o.win} mounted={mounted} side="home" />
          <OddsLeg label="Draw" pct={o.draw} mounted={mounted} side="draw" />
          <OddsLeg label={f.away} pct={o.loss} mounted={mounted} side="away" />
        </div>
      ) : null}

      {stakesLine && <div className="match-stakes">{stakesLine}</div>}
    </div>
  );
}

function OddsLeg({
  label, pct, mounted, side,
}: { label: string; pct: number; mounted: boolean; side: string }) {
  return (
    <div className={`odds-leg ${side}`}>
      <div className="odds-bar-track">
        <div
          className="odds-bar-fill"
          style={{ width: mounted ? `${pct * 100}%` : "0%" }}
        />
      </div>
      <div className="odds-row">
        <span className="odds-label">{label}</span>
        <span className="odds-pct">{(pct * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

/* ============================================================
   STANDINGS TABLE
   ============================================================ */
function StandingsTable({ players, mounted }: { players: PlayerProjection[]; mounted: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const maxFirst = players[0]?.pFirst || 1;

  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th aria-label="Rank">#</th>
          <th>Player</th>
          <th>Now</th>
          <th>Proj</th>
          <th>Win%</th>
          <th>Top&nbsp;3</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => (
          <>
            <tr
              key={p.player}
              className={`standings-row ${i === 0 ? "leader" : ""}`}
              onClick={() => setOpen(open === p.player ? null : p.player)}
              aria-expanded={open === p.player}
            >
              <td className="s-rank">{i + 1}</td>
              <td className="s-name">{p.player}</td>
              <td className="s-num now">{p.currentPoints}</td>
              <td className="s-num proj">{p.expectedFinalPoints.toFixed(1)}</td>
              <td className="s-win-cell">
                <div
                  className="s-win-bar"
                  style={{ width: mounted ? `${(p.pFirst / maxFirst) * 100}%` : "0%" }}
                />
                <span className="s-win-val">{(p.pFirst * 100).toFixed(1)}%</span>
              </td>
              <td className="s-top3">{(p.pTop3 * 100).toFixed(0)}%</td>
            </tr>
            {open === p.player && (
              <tr key={`${p.player}-detail`}>
                <td colSpan={6} style={{ padding: 0 }}>
                  <PlayerDetail player={p} mounted={mounted} />
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  );
}

function PlayerDetail({ player: p, mounted }: { player: PlayerProjection; mounted: boolean }) {
  const maxDist = Math.max(...p.finishDistribution, 0.001);
  return (
    <div className="player-detail">
      <div className="player-detail-inner">
        {/* Team breakdown */}
        <div className="detail-teams">
          {p.teams.map((t) => (
            <div className="detail-team-row" key={t.team}>
              <span className="dt-name">{t.team}</span>
              <span className="dt-pts">{t.currentPoints} pts</span>
              <span className="dt-proj">{t.expectedFinalPoints.toFixed(1)} proj</span>
            </div>
          ))}
        </div>

        {/* Finish distribution */}
        <div className="detail-dist">
          <p className="detail-dist-label">Finish odds</p>
          <div className="dist-bars">
            {p.finishDistribution.slice(0, 6).map((d, i) => (
              <div
                key={i}
                className={`dist-bar ${i === 0 ? "first" : ""}`}
                style={{ height: mounted ? `${Math.max(4, (d / maxDist) * 100)}%` : "4%" }}
                title={`${FINISH_LABELS[i]}: ${(d * 100).toFixed(1)}%`}
              >
                <span className="dist-bar-label">{FINISH_LABELS[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   UPCOMING STRIP
   ============================================================ */
function UpcomingStrip({ fixtures, mounted }: { fixtures: FixtureProjection[]; mounted: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="upcoming-list">
      {fixtures.map((f) => {
        const isOpen = open === f.id;
        const dateLabel = f.kickoff
          ? new Date(f.kickoff).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()
          : "TBD";
        const timeLabel = f.kickoff
          ? new Date(f.kickoff).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "";
        const o = f.oddsHome;

        return (
          <div key={f.id}>
            <div
              className="upcoming-row"
              onClick={() => setOpen(isOpen ? null : f.id)}
              aria-expanded={isOpen}
            >
              <span className="up-date">{dateLabel}</span>
              <span className="up-teams">{f.home} <span style={{ color: "var(--muted-2)" }}>v</span> {f.away}</span>
              {o ? (
                <span className="up-odds">
                  {(o.win * 100).toFixed(0)}% · {(o.draw * 100).toFixed(0)}% · {(o.loss * 100).toFixed(0)}%
                </span>
              ) : (
                <span className="up-odds" style={{ color: "var(--muted-2)" }}>—</span>
              )}
            </div>

            {isOpen && (
              <div className="up-expand">
                <div className="up-expand-inner">
                  <div className="up-exp-teams">
                    <div className="up-exp-team">
                      <span className="up-exp-name">{f.home}</span>
                      <span className="team-owner">{f.homeOwner}</span>
                    </div>
                    <span className="match-vs" style={{ paddingTop: 4 }}>{timeLabel || "vs"}</span>
                    <div className="up-exp-team right">
                      <span className="up-exp-name">{f.away}</span>
                      <span className="team-owner">{f.awayOwner}</span>
                    </div>
                  </div>
                  {o && (
                    <div className="odds-grid">
                      <OddsLeg label={f.home} pct={o.win} mounted={mounted} side="home" />
                      <OddsLeg label="Draw" pct={o.draw} mounted={mounted} side="draw" />
                      <OddsLeg label={f.away} pct={o.loss} mounted={mounted} side="away" />
                    </div>
                  )}
                  {f.swing > 0.02 && f.swingPlayer && (
                    <div className="match-stakes" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      {`A ${f.swingToward === "home" ? f.home : f.away} win shifts ${f.swingPlayer}'s title odds by ${(f.swing * 100).toFixed(1)}pp`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   HELPERS
   ============================================================ */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function kickoffMs(f: FixtureProjection): number {
  return f.kickoff ? new Date(f.kickoff).getTime() : Number.MAX_SAFE_INTEGER;
}
