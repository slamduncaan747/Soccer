"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection } from "@/lib/types";

const FINISH_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

export default function Page() {
  const [data, setData]       = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [mock, setMock]       = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("standings");

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

  // Header border on scroll
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 2);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Section highlight in nav
  useEffect(() => {
    const ids = ["standings", "today", "schedule"];
    const obs = ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const o = new IntersectionObserver(
        ([e]) => { if (e.isIntersecting) setActiveSection(id); },
        { rootMargin: "-30% 0px -60% 0px" }
      );
      o.observe(el);
      return o;
    });
    return () => obs.forEach((o) => o?.disconnect());
  }, [data]);

  const today = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    return [...data.fixtures]
      .filter((f) => f.kickoff && sameDay(new Date(f.kickoff), now))
      .sort((a, b) => b.swing - a.swing); // most impactful first
  }, [data]);

  const upcoming = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const eod = new Date(now); eod.setHours(23, 59, 59, 999);
    return [...data.fixtures]
      .filter((f) => f.kickoff && new Date(f.kickoff).getTime() > eod.getTime())
      .sort((a, b) => new Date(a.kickoff!).getTime() - new Date(b.kickoff!).getTime())
      .slice(0, 32);
  }, [data]);

  const isLive = data
    ? data.status.groupSource === "kalshi" || data.status.knockoutSource === "kalshi"
    : false;

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const heroTitle = today.length > 0
    ? `${today.length} match${today.length === 1 ? "" : "es"} today`
    : "Standings";

  return (
    <>
      {/* ── Header ── */}
      <header className={`site-header ${scrolled ? "border-on" : ""}`} role="banner">
        <div className="header-inner">
          <span className="header-brand">WC26 Pool</span>

          <nav aria-label="Page sections">
            <ul className="header-nav" role="list">
              {[
                { id: "standings", label: "Standings" },
                { id: "today",     label: "Today" },
                { id: "schedule",  label: "Schedule" },
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
          </nav>

          <div className="header-status" aria-live="polite">
            <span className={`live-dot ${!loading && isLive ? "on" : ""}`} />
            <span className={`live-label ${!loading && isLive ? "on" : ""}`}>
              {loading ? "Loading" : isLive ? "Live" : "Model"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="page">
        <div className="container">

          {/* Hero */}
          <div className="page-hero">
            <p className="hero-date">{todayStr}</p>
            <h1 className="hero-title">{heroTitle}</h1>
            {data && (
              <div className="hero-stats">
                <span className="hero-stat">{data.players.length} players</span>
                <span className="hero-stat">{(data.iterations / 1000).toFixed(0)}k simulations</span>
                <span className="hero-stat">
                  {data.status.groupSource === "kalshi" ? "Kalshi odds" : "Model odds"}
                </span>
              </div>
            )}
          </div>

          {/* ── Loading / Error ── */}
          {loading && <div className="state-center">Running simulations…</div>}
          {!loading && !data && (
            <div className="state-center">
              Failed to load.{" "}
              <button className="ctrl-btn" style={{ marginLeft: 12, flex: "none" }} onClick={() => load(mock)}>
                Retry
              </button>
            </div>
          )}

          {!loading && data && (
            <>
              {/* ── STANDINGS ── */}
              <section id="standings" className="section">
                <p className="section-label">Standings</p>
                <StandingsTable players={data.players} mounted={mounted} />
              </section>

              {/* ── TODAY'S MATCHES ── */}
              <section id="today" className="section">
                <p className="section-label">
                  {today.length > 0 ? `Today · ${today.length} fixture${today.length === 1 ? "" : "s"}` : "Today"}
                </p>
                {today.length === 0 ? (
                  <p className="empty">No pool matches today.</p>
                ) : (
                  <div className="match-list">
                    {today.map((f, i) => (
                      <MatchCard key={f.id} fixture={f} mounted={mounted} delay={i * 40} />
                    ))}
                  </div>
                )}
              </section>

              {/* ── SCHEDULE ── */}
              <section id="schedule" className="section">
                <p className="section-label">
                  {upcoming.length > 0 ? `Schedule · ${upcoming.length} upcoming` : "Schedule"}
                </p>
                {upcoming.length === 0 ? (
                  <p className="empty">No upcoming fixtures.</p>
                ) : (
                  <ScheduleList fixtures={upcoming} mounted={mounted} />
                )}
              </section>

              {/* ── Controls ── */}
              <div className="controls">
                <button className="ctrl-btn" onClick={() => load(mock)} disabled={loading}>
                  Refresh
                </button>
                <button className="ctrl-btn" onClick={() => setMock((m) => !m)} disabled={loading}>
                  {mock ? "Use live odds" : "Use model odds"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

/* ============================================================
   STANDINGS TABLE
   ============================================================ */
function StandingsTable({ players, mounted }: { players: PlayerProjection[]; mounted: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const maxFirst = players[0]?.pFirst ?? 1;

  return (
    <table className="standings">
      <thead>
        <tr>
          <th aria-label="Rank">#</th>
          <th>Player</th>
          <th>Pts</th>
          <th>Proj</th>
          <th>Win prob</th>
          <th>Top 3</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => {
          const isOpen = open === p.player;
          return (
            <>
              <tr
                key={p.player}
                className={i === 0 ? "leader" : ""}
                onClick={() => setOpen(isOpen ? null : p.player)}
                aria-expanded={isOpen}
              >
                <td className="s-rank">{i + 1}</td>
                <td className="s-player">{p.player}</td>
                <td className="s-num prominent">{p.currentPoints}</td>
                <td className="s-num">{p.expectedFinalPoints.toFixed(1)}</td>
                <td className="s-prob-cell">
                  <div className="s-prob-inner">
                    <span className="s-prob-num">{(p.pFirst * 100).toFixed(1)}%</span>
                    <div className="s-prob-bar-track">
                      <div
                        className="s-prob-bar-fill"
                        style={{ width: mounted ? `${(p.pFirst / maxFirst) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>
                </td>
                <td className="s-top3">{(p.pTop3 * 100).toFixed(0)}%</td>
              </tr>
              {isOpen && (
                <tr key={`${p.player}-expand`} className="player-expand-row">
                  <td colSpan={6}>
                    <PlayerExpand player={p} mounted={mounted} />
                  </td>
                </tr>
              )}
            </>
          );
        })}
      </tbody>
    </table>
  );
}

function PlayerExpand({ player: p, mounted }: { player: PlayerProjection; mounted: boolean }) {
  const maxDist = Math.max(...p.finishDistribution, 0.001);
  return (
    <div className="player-expand">
      <div className="expand-teams">
        {p.teams.map((t) => (
          <div className="expand-team-row" key={t.team}>
            <span className="et-name">{t.team}</span>
            <span className="et-now">{t.currentPoints} pts</span>
            <span className="et-proj">{t.expectedFinalPoints.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <p className="expand-dist-label">Finish probability</p>
      <div className="expand-dist-bars">
        {p.finishDistribution.slice(0, 6).map((d, i) => (
          <div
            key={i}
            className={`dist-bar ${i === 0 ? "first" : ""}`}
            style={{ height: mounted ? `${Math.max(4, (d / maxDist) * 100)}%` : "4%" }}
            title={`${FINISH_LABELS[i]}: ${(d * 100).toFixed(1)}%`}
          >
            <span className="dist-bar-lbl">{FINISH_LABELS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   MATCH CARD
   ============================================================ */
function MatchCard({ fixture: f, mounted, delay }: {
  fixture: FixtureProjection; mounted: boolean; delay: number;
}) {
  const o = f.oddsHome;
  const isKey = f.swing >= 0.05;

  const time = f.kickoff
    ? new Date(f.kickoff).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
    : "TBD";

  const stakes = buildStakes(f);

  return (
    <div
      className={`match-card${isKey ? " key" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="match-top-row">
        <span className="match-time">{time}</span>
        {isKey && (
          <span className="match-impact">
            {(f.swing * 100).toFixed(0)}pp swing
          </span>
        )}
      </div>

      <div className="match-teams">
        <div className="match-side">
          <span className="match-team-name">{f.home}</span>
          <span className="match-owner">{f.homeOwner}</span>
        </div>
        <span className="match-vs-sep">vs</span>
        <div className="match-side right">
          <span className="match-team-name">{f.away}</span>
          <span className="match-owner">{f.awayOwner}</span>
        </div>
      </div>

      {o && (
        <div className="odds-row">
          <OddsCol
            label={`${f.home} win`}
            pct={o.win}
            mounted={mounted}
            align="left"
          />
          <OddsCol
            label="Draw"
            pct={o.draw}
            mounted={mounted}
            align="center"
          />
          <OddsCol
            label={`${f.away} win`}
            pct={o.loss}
            mounted={mounted}
            align="right"
          />
        </div>
      )}

      {stakes && <p className="match-stakes">{stakes}</p>}
    </div>
  );
}

function OddsCol({ label, pct, mounted, align }: {
  label: string; pct: number; mounted: boolean; align: "left" | "center" | "right";
}) {
  return (
    <div className={`odds-col ${align === "center" ? "center" : align === "right" ? "right" : ""}`}>
      <span className="odds-pct">{(pct * 100).toFixed(0)}%</span>
      <div className="odds-bar">
        <div className="odds-fill" style={{ width: mounted ? `${pct * 100}%` : "0%" }} />
      </div>
      <span className="odds-outcome">{label}</span>
    </div>
  );
}

/* ============================================================
   SCHEDULE LIST
   ============================================================ */
function ScheduleList({ fixtures, mounted }: { fixtures: FixtureProjection[]; mounted: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="schedule-list">
      {fixtures.map((f) => {
        const isOpen = open === f.id;
        const date = f.kickoff
          ? new Date(f.kickoff).toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric",
            })
          : "TBD";
        const time = f.kickoff
          ? new Date(f.kickoff).toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit",
            })
          : "";
        const o = f.oddsHome;
        return (
          <div key={f.id}>
            <div
              className="sched-row"
              onClick={() => setOpen(isOpen ? null : f.id)}
              aria-expanded={isOpen}
            >
              <span className="sched-date">{date}</span>
              <span className="sched-teams">
                {f.home}
                <span className="sep">v</span>
                {f.away}
              </span>
              {o ? (
                <span className="sched-odds">
                  {(o.win * 100).toFixed(0)}
                  <span style={{ margin: "0 3px", color: "var(--text-3)" }}>·</span>
                  {(o.draw * 100).toFixed(0)}
                  <span style={{ margin: "0 3px", color: "var(--text-3)" }}>·</span>
                  {(o.loss * 100).toFixed(0)}
                </span>
              ) : (
                <span className="sched-odds">—</span>
              )}
            </div>
            {isOpen && (
              <div className="sched-expand">
                <div className="sched-expand-inner">
                  <MatchCard fixture={f} mounted={mounted} delay={0} />
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
function buildStakes(f: FixtureProjection): string | null {
  if (f.swing <= 0 || !f.swingPlayer) return null;
  const team = f.swingToward === "home" ? f.home : f.away;
  const pp = (f.swing * 100).toFixed(1);
  return `${team} win moves ${f.swingPlayer}'s title probability by ${pp}pp`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
