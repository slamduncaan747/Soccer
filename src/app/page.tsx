"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection } from "@/lib/types";

type Tab = "matches" | "table";

// Display name overrides (Isiah goes by Zeke)
const DISPLAY_NAME: Record<string, string> = { Isiah: "Zeke" };
const displayName = (name: string) => DISPLAY_NAME[name] ?? name;

const AVATAR_SRC: Record<string, string> = {
  Wyatt:  "/avatars/wyatt.jpeg",
  Isiah:  "/avatars/isiah.jpeg",
  Sam:    "/avatars/sam.jpeg",
  Conrad: "/avatars/conrad.jpeg",
  Gus:    "/avatars/gus.jpeg",
  Duncan: "/avatars/duncan_sq.jpeg",
};

/* National team primary colors — used for odds bar segments */
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
              <strong>{displayName(leader.player)}</strong> leads · {leader.currentPoints} pts
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
        {activeGroup.matches.length === 0 ? (
          <div className="empty-state">No matches this day.</div>
        ) : (
          activeGroup.matches.map((f) => <MatchCard key={f.id} fixture={f} />)
        )}
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
  const hc = teamColor(f.home);
  const ac = teamColor(f.away);

  return (
    <div className="match-card">
      <div className="match-card-teams">
        <div className="mc-team home">
          <span className="mc-flag">{flag(f.home)}</span>
          <span className="mc-name">{f.home}</span>
          <span className="mc-owner">{f.homeOwner}</span>
        </div>
        <div className="mc-center">
          <span className="mc-time">{tVal}</span>
          {tPeriod && <span className="mc-period">{tPeriod}</span>}
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
            <div className="odds-seg" style={{ width: `${hp}%`, background: hc }} />
            <div className="odds-seg draw" style={{ width: `${dp}%` }} />
            <div className="odds-seg" style={{ width: `${ap}%`, background: ac }} />
          </div>
          <div className="odds-labels">
            <span style={{ color: hc }}>{hp}%</span>
            <span className="odds-label-mid">{dp}% draw</span>
            <span style={{ color: ac }}>{ap}%</span>
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
      <div className="standings-header">
        <span className="sh-rank">#</span>
        <span className="sh-player">Player</span>
        <span className="sh-pts">Pts</span>
      </div>

      {sorted.map((p, i) => {
        const isOpen = open === p.player;
        const isLeader = i === 0;
        const pct = (p.currentPoints / maxPts) * 100;
        const avatarSrc = AVATAR_SRC[p.player];

        return (
          <div key={p.player}>
            <div
              className={`standing-row${isLeader ? " leader" : ""}`}
              onClick={() => setOpen(isOpen ? null : p.player)}
            >
              <span className="row-rank">{i + 1}</span>
              <div className="row-avatar" aria-hidden>
                {avatarSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="" width={40} height={40} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
                )}
              </div>
              <div className="row-info">
                <div className="row-name">{displayName(p.player)}</div>
                <div className="row-teams">
                  {p.teams.slice(0, 4).map((t) => t.team).join(" · ")}
                </div>
              </div>
              <div className="row-right">
                <span className="row-pts">{p.currentPoints}</span>
                <span className="row-pts-label">pts</span>
              </div>
              <div className="row-progress" style={{ width: `${pct}%` }} />
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
            <span className="et-left">
              <span className="et-flag">{flag(t.team)}</span>
              <span className="et-name">{t.team}</span>
            </span>
            <span className={`et-pts${t.currentPoints === 0 ? " zero" : ""}`}>
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
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const map = new Map<string, DayGroup>();

  // Always seed yesterday and today so the strip always spans back to today
  for (let offset = -2; offset <= 0; offset++) {
    const d = new Date(todayMidnight);
    d.setDate(todayMidnight.getDate() + offset);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const isToday = offset === 0;
    const shortLabel = offset === -2 ? d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })
      : offset === -1 ? "Yesterday"
      : "Today";
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

  // Sort map entries by date (tbd goes last)
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
