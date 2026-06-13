"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection } from "@/lib/types";

type Tab = "matches" | "table";

export default function Page() {
  const [data, setData]       = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>("matches");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use minimum iterations — we only need standings, not projections
      const res = await fetch("/api/leaderboard?iterations=1000", { cache: "no-store" });
      setData((await res.json()) as ProjectionResult);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isLive = data?.status.liveResults ?? false;

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <span className="app-title">WC26 Pool</span>
          {isLive && (
            <span className="app-live-badge">
              <span className="app-live-dot" />
              Live
            </span>
          )}
        </div>
      </header>

      <main className="page">
        {loading ? (
          <div className="loading-screen">Loading…</div>
        ) : !data ? (
          <div className="empty-state">
            Could not load data.{" "}
            <button onClick={load} style={{ color: "var(--live)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>
              Retry
            </button>
          </div>
        ) : tab === "matches" ? (
          <MatchesTab fixtures={data.fixtures} />
        ) : (
          <TableTab players={data.players} />
        )}
      </main>

      <nav className="tab-bar" aria-label="Sections">
        <button
          className={`tab-btn ${tab === "matches" ? "active" : ""}`}
          onClick={() => setTab("matches")}
          aria-selected={tab === "matches"}
        >
          <span className="tab-icon">📅</span>
          Matches
        </button>
        <button
          className={`tab-btn ${tab === "table" ? "active" : ""}`}
          onClick={() => setTab("table")}
          aria-selected={tab === "table"}
        >
          <span className="tab-icon">🏆</span>
          Table
        </button>
      </nav>
    </>
  );
}

/* ============================================================
   MATCHES TAB — grouped by date
   ============================================================ */
function MatchesTab({ fixtures }: { fixtures: FixtureProjection[] }) {
  const groups = useMemo(() => groupByDay(fixtures), [fixtures]);

  if (groups.length === 0) {
    return <div className="empty-state">No fixtures to show.</div>;
  }

  return (
    <div>
      {groups.map(({ label, isToday, matches }) => (
        <div className="date-group" key={label}>
          <div className="date-header">
            {isToday && <span className="today-dot" />}
            <span className={isToday ? "date-today" : ""}>{label}</span>
          </div>
          {matches.map((f) => (
            <MatchCard key={f.id} fixture={f} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MatchCard({ fixture: f }: { fixture: FixtureProjection }) {
  const time = f.kickoff
    ? new Date(f.kickoff).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit",
      })
    : "TBD";

  return (
    <div className="match-card">
      <div className="match-inner">
        <div className="match-team-col">
          <span className="match-team-name">{f.home}</span>
          <span className="match-owner-tag">{f.homeOwner}</span>
        </div>

        <div className="match-center">
          <span className="match-kickoff">{time}</span>
          <span className="match-vs">vs</span>
        </div>

        <div className="match-team-col right">
          <span className="match-team-name">{f.away}</span>
          <span className="match-owner-tag">{f.awayOwner}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   TABLE TAB — standings
   ============================================================ */
function TableTab({ players }: { players: PlayerProjection[] }) {
  const [open, setOpen] = useState<string | null>(null);

  // Sort by current points, then by projected as tiebreaker
  const sorted = useMemo(
    () => [...players].sort((a, b) =>
      b.currentPoints - a.currentPoints || b.expectedFinalPoints - a.expectedFinalPoints
    ),
    [players]
  );

  return (
    <div className="standings-section">
      <div className="standings-header">
        <span>#</span>
        <span>Player</span>
        <span className="sh-pts">Pts</span>
      </div>

      {sorted.map((p, i) => {
        const isOpen = open === p.player;
        const teamPreview = p.teams
          .slice(0, 4)
          .map((t) => t.team)
          .join(", ");

        return (
          <div key={p.player}>
            <div
              className={`standing-row ${i === 0 ? "leader" : ""}`}
              onClick={() => setOpen(isOpen ? null : p.player)}
            >
              <span className="sr-rank">{i + 1}</span>
              <div className="sr-info">
                <div className="sr-name">{p.player}</div>
                <div className="sr-teams-preview">{teamPreview}…</div>
              </div>
              <div className="sr-pts-col">
                <span className="sr-pts">{p.currentPoints}</span>
                <span className="sr-pts-label">pts</span>
              </div>
            </div>

            {isOpen && <PlayerDetail player={p} />}
          </div>
        );
      })}
    </div>
  );
}

function PlayerDetail({ player: p }: { player: PlayerProjection }) {
  const sorted = [...p.teams].sort((a, b) => b.currentPoints - a.currentPoints);
  return (
    <div className="standing-expand">
      <div className="expand-inner">
        {sorted.map((t) => (
          <div className="expand-team-row" key={t.team}>
            <span className="et-name">{t.team}</span>
            <span className="et-record">
              {t.currentPoints / 3}W
            </span>
            <span className={`et-pts ${t.currentPoints === 0 ? "zeroed" : ""}`}>
              {t.currentPoints}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   HELPERS
   ============================================================ */
interface DayGroup {
  label: string;
  isToday: boolean;
  matches: FixtureProjection[];
}

function groupByDay(fixtures: FixtureProjection[]): DayGroup[] {
  const now = new Date();
  const map = new Map<string, DayGroup>();

  // Sort all fixtures chronologically first
  const sorted = [...fixtures].sort((a, b) => {
    if (!a.kickoff) return 1;
    if (!b.kickoff) return -1;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });

  for (const f of sorted) {
    const d = f.kickoff ? new Date(f.kickoff) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "tbd";
    const isToday = d ? sameDay(d, now) : false;
    const label = d
      ? isToday
        ? "Today"
        : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()
      : "TBD";

    if (!map.has(key)) map.set(key, { label, isToday, matches: [] });
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
