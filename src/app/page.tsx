"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection } from "@/lib/types";

type Tab = "matches" | "table";

const PLAYER_COLORS: Record<string, string> = {
  Sam: "#60a5fa", Wyatt: "#f59e0b", Duncan: "#a78bfa",
  Conrad: "#f472b6", Gus: "#34d399", Isiah: "#fb923c",
};
const playerColor = (name: string) => PLAYER_COLORS[name] ?? "#666";

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
              <strong style={{ color: playerColor(leader.player) }}>{leader.player}</strong>
              {" "}leads · {leader.currentPoints} pts
            </span>
          )}
        </div>
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
            {tab === "matches"
              ? <MatchesTab fixtures={data.fixtures} />
              : <TableTab players={data.players} />
            }
          </div>
        )}
      </main>

      <nav className="tab-bar" aria-label="Sections">
        <button className={`tab-btn ${tab === "matches" ? "active" : ""}`} onClick={() => setTab("matches")}>
          <CalendarIcon />
          Matches
        </button>
        <button className={`tab-btn ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>
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
  const todayKey = groups.find((g) => g.isToday)?.key ?? groups[0]?.key ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);
  const stripRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected chip into view
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLButtonElement>(".day-chip.active");
    el?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, [selectedKey]);

  if (groups.length === 0) return <div className="empty-state">No fixtures available.</div>;

  const activeGroup = groups.find((g) => g.key === selectedKey) ?? groups[0];

  return (
    <div>
      {/* ── Day strip ── */}
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

      {/* ── Matches for selected day ── */}
      <div className="day-matches">
        {activeGroup.matches.map((f) => (
          <MatchCard key={f.id} fixture={f} />
        ))}
      </div>
    </div>
  );
}

function MatchCard({ fixture: f }: { fixture: FixtureProjection }) {
  const d = f.kickoff ? new Date(f.kickoff) : null;
  const timeStr = d
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : "TBD";
  const [tVal, tPeriod] = timeStr.split(" ");

  const odds = f.oddsHome;
  const hp = odds ? Math.round(odds.win * 100) : null;
  const dp = odds ? Math.round(odds.draw * 100) : null;
  const ap = odds ? Math.round(odds.loss * 100) : null;

  return (
    <div className="match-card">
      <div className="match-card-teams">
        {/* Home */}
        <div className="mc-team home">
          <span className="mc-flag">{flag(f.home)}</span>
          <span className="mc-name">{f.home}</span>
          <span className="mc-owner">{f.homeOwner}</span>
        </div>

        {/* Center: time */}
        <div className="mc-center">
          <span className="mc-time">{tVal}</span>
          {tPeriod && <span className="mc-period">{tPeriod}</span>}
        </div>

        {/* Away */}
        <div className="mc-team away">
          <span className="mc-flag">{flag(f.away)}</span>
          <span className="mc-name">{f.away}</span>
          <span className="mc-owner">{f.awayOwner}</span>
        </div>
      </div>

      {/* Odds */}
      {hp !== null && dp !== null && ap !== null && (
        <div className="mc-odds">
          <div className="odds-track">
            <div className="odds-seg home-win" style={{ width: `${hp}%` }} />
            <div className="odds-seg draw"     style={{ width: `${dp}%` }} />
            <div className="odds-seg away-win" style={{ width: `${ap}%` }} />
          </div>
          <div className="odds-labels">
            <span>{hp}%</span>
            <span className="odds-label-mid">{dp}% draw</span>
            <span>{ap}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TABLE TAB
   ============================================================ */
function TableTab({ players }: { players: PlayerProjection[] }) {
  const [open, setOpen] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...players].sort(
      (a, b) => b.currentPoints - a.currentPoints || b.expectedFinalPoints - a.expectedFinalPoints
    ),
    [players]
  );

  const maxPts = Math.max(...sorted.map((p) => p.currentPoints), 1);

  return (
    <div className="standings-wrap">
      {sorted.map((p, i) => {
        const isOpen = open === p.player;
        const isLeader = i === 0;
        const color = isLeader ? "var(--green)" : playerColor(p.player);
        const pct = (p.currentPoints / maxPts) * 100;

        return (
          <div key={p.player}>
            <div
              className={`standing-row${isLeader ? " leader" : ""}`}
              style={{ borderLeftColor: color }}
              onClick={() => setOpen(isOpen ? null : p.player)}
            >
              <span className="row-rank" style={{ color }}>{i + 1}</span>
              <div className="row-info">
                <div className="row-name">{p.player}</div>
                <div className="row-teams">
                  {p.teams.slice(0, 4).map((t) => t.team).join(" · ")}
                </div>
              </div>
              <div className="row-right">
                <span className="row-pts">{p.currentPoints}</span>
                <span className="row-pts-label">pts</span>
              </div>
              <div className="row-progress" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>

            {isOpen && <PlayerExpand player={p} color={color} />}
          </div>
        );
      })}
    </div>
  );
}

function PlayerExpand({ player: p, color }: { player: PlayerProjection; color: string }) {
  const sorted = [...p.teams].sort((a, b) => b.currentPoints - a.currentPoints);
  return (
    <div className="standing-expand">
      <div className="expand-teams">
        {sorted.map((t) => (
          <div className="expand-team" key={t.team}>
            <span className="et-name">{flag(t.team)} {t.team}</span>
            <span
              className={`et-pts${t.currentPoints === 0 ? " zero" : ""}`}
              style={t.currentPoints > 0 ? { color } : undefined}
            >
              {t.currentPoints}
            </span>
          </div>
        ))}
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
  const map = new Map<string, DayGroup>();

  const sorted = [...fixtures].sort((a, b) => {
    if (!a.kickoff) return 1;
    if (!b.kickoff) return -1;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });

  for (const f of sorted) {
    const d = f.kickoff ? new Date(f.kickoff) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "tbd";
    const isToday = d ? sameDay(d, now) : false;

    const dayDiff = d
      ? Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
          - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
      : null;

    const shortLabel = !d ? "TBD"
      : dayDiff === -1 ? "Yesterday"
      : dayDiff === 0  ? "Today"
      : dayDiff === 1  ? "Tomorrow"
      : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });

    const label = d
      ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()
      : "TBD";

    if (!map.has(key)) map.set(key, { key, label, shortLabel, isToday, matches: [] });
    map.get(key)!.matches.push(f);
  }

  return [...map.values()];
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
