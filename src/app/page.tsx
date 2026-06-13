"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection } from "@/lib/types";

type Tab = "matches" | "table";

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

export default function Page() {
  const [data, setData]       = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>("matches");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leaderboard?iterations=1000", { cache: "no-store" });
      setData((await res.json()) as ProjectionResult);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Standings sorted by current points (for the header callout)
  const leader = useMemo(() => {
    if (!data) return null;
    return [...data.players].sort(
      (a, b) => b.currentPoints - a.currentPoints || b.expectedFinalPoints - a.expectedFinalPoints
    )[0];
  }, [data]);

  const isLive = data?.status.liveResults ?? false;

  return (
    <>
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header-inner">
          <span className="app-title">WC26 Pool</span>
          {leader && (
            <span className="app-leader-callout">
              <strong>{leader.player}</strong> leads · {leader.currentPoints} pts
            </span>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="page">
        {loading ? (
          <div className="loading-state">Loading…</div>
        ) : !data ? (
          <div className="empty-state">
            Could not load data.{" "}
            <button
              onClick={load}
              style={{ color: "var(--green)", background: "none", border: "none",
                       cursor: "pointer", fontFamily: "inherit", fontSize: "inherit",
                       fontWeight: 700 }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="tab-pane" key={tab}>
            {tab === "matches"
              ? <MatchesTab fixtures={data.fixtures} />
              : <TableTab players={data.players} />
            }
          </div>
        )}
      </main>

      {/* ── Bottom tab bar ── */}
      <nav className="tab-bar" aria-label="Sections">
        <button
          className={`tab-btn ${tab === "matches" ? "active" : ""}`}
          onClick={() => setTab("matches")}
        >
          <CalendarIcon />
          Matches
        </button>
        <button
          className={`tab-btn ${tab === "table" ? "active" : ""}`}
          onClick={() => setTab("table")}
        >
          <TableIcon />
          Table
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

  if (groups.length === 0) {
    return <div className="empty-state">No fixtures available.</div>;
  }

  return (
    <div>
      {groups.map(({ key, label, isToday, matches }) => (
        <div className="day-section" key={key}>
          <div className={`day-label ${isToday ? "today-label" : ""}`}>
            {isToday && <span className="today-pip" />}
            {label}
          </div>
          <div className="day-card">
            {matches.map((f) => (
              <MatchRow key={f.id} fixture={f} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchRow({ fixture: f }: { fixture: FixtureProjection }) {
  const time = f.kickoff
    ? new Date(f.kickoff).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit",
      })
    : "TBD";

  return (
    <div className="match-row">
      {/* Home */}
      <div className="match-side">
        <span className="team-flag">{flag(f.home)}</span>
        <span className="team-name">{f.home}</span>
        <span className="owner-name">{f.homeOwner}</span>
      </div>

      {/* Center: time */}
      <div className="match-time-col">
        <span className="kickoff-time">{time}</span>
      </div>

      {/* Away */}
      <div className="match-side right">
        <span className="team-flag">{flag(f.away)}</span>
        <span className="team-name">{f.away}</span>
        <span className="owner-name">{f.awayOwner}</span>
      </div>
    </div>
  );
}

/* ============================================================
   TABLE TAB
   ============================================================ */
function TableTab({ players }: { players: PlayerProjection[] }) {
  const [open, setOpen] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...players].sort(
        (a, b) =>
          b.currentPoints - a.currentPoints ||
          b.expectedFinalPoints - a.expectedFinalPoints
      ),
    [players]
  );

  return (
    <div className="standings-wrap">
      <div className="standings-col-heads">
        <span>#</span>
        <span>Player</span>
        <span className="col-pts">Pts</span>
      </div>

      {sorted.map((p, i) => {
        const isOpen = open === p.player;
        const preview = p.teams
          .slice(0, 3)
          .map((t) => t.team)
          .join(" · ");

        return (
          <div key={p.player}>
            <div
              className={`standing-row ${i === 0 ? "leader" : ""}`}
              onClick={() => setOpen(isOpen ? null : p.player)}
            >
              <span className="row-rank">{i + 1}</span>
              <div className="row-info">
                <div className="row-name">{p.player}</div>
                <div className="row-teams">{preview}</div>
              </div>
              <div className="row-pts-wrap">
                <span className="row-pts">{p.currentPoints}</span>
                <span className="row-pts-unit">pts</span>
              </div>
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
  return (
    <div className="standing-expand">
      <div className="expand-teams">
        {sorted.map((t) => (
          <div className="expand-team" key={t.team}>
            <span className="et-name">{flag(t.team)} {t.team}</span>
            <div className="et-right">
              <span className="et-record">{t.currentPoints / 3}W</span>
              <span className={`et-pts ${t.currentPoints === 0 ? "zero" : ""}`}>
                {t.currentPoints}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   SVG ICONS — clean, consistent, no emoji
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

/* ============================================================
   HELPERS
   ============================================================ */
interface DayGroup {
  key: string;
  label: string;
  isToday: boolean;
  matches: FixtureProjection[];
}

function groupByDay(fixtures: FixtureProjection[]): DayGroup[] {
  const now = new Date();
  const map = new Map<string, DayGroup>();

  const sorted = [...fixtures].sort((a, b) => {
    if (!a.kickoff) return 1;
    if (!b.kickoff) return -1;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });

  for (const f of sorted) {
    const d = f.kickoff ? new Date(f.kickoff) : null;
    const key = d
      ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      : "tbd";
    const isToday = d ? sameDay(d, now) : false;
    const label = d
      ? isToday
        ? "Today"
        : d.toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric",
          }).toUpperCase()
      : "TBD";

    if (!map.has(key)) map.set(key, { key, label, isToday, matches: [] });
    map.get(key)!.matches.push(f);
  }

  return [...map.values()];
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
