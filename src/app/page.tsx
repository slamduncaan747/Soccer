"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectionResult, PlayerProjection, FixtureProjection, PlayerFactors, TournamentFactor } from "@/lib/types";

type Tab = "matches" | "odds" | "insights";

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
const round1 = (n: number) => Math.round(n * 10) / 10;

// Monte-Carlo standard error of a probability estimate from N iterations.
const mcSE = (p: number, n: number) => (n > 0 ? Math.sqrt((p * (1 - p)) / n) : 0);
// A team with essentially no expected remaining wins is effectively out.
const isAlive = (expRemainingWins: number) => expRemainingWins >= 0.05;

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
              {displayName(leader.player)} leads · {leader.currentPoints} pts
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
            {tab === "matches"  && <MatchesTab fixtures={data.fixtures} />}
            {tab === "odds"     && <OddsTab players={data.players} iterations={data.iterations} />}
            {tab === "insights" && <InsightsTab players={data.players} fixtures={data.fixtures} playerFactors={data.playerFactors} />}
          </div>
        )}
      </main>

      <nav className="tab-bar" aria-label="Sections">
        <button className={`tab-btn ${tab === "matches" ? "active" : ""}`} onClick={() => setTab("matches")}>
          <CalendarIcon /> Matches
        </button>
        <button className={`tab-btn ${tab === "odds" ? "active" : ""}`} onClick={() => setTab("odds")}>
          <TableIcon /> Odds
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
   ODDS TAB — title odds, minimal & monochrome
   ============================================================ */
function OddsTab({ players, iterations }: { players: PlayerProjection[]; iterations: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = useMemo(() => [...players].sort((a, b) => b.pFirst - a.pFirst), [players]);
  const maxWin = Math.max(...sorted.map((p) => p.pFirst), 0.01);
  const simLabel = iterations >= 1000 ? `${Math.round(iterations / 1000)}k sims` : `${iterations} sims`;

  return (
    <div className="odds-wrap">
      <div className="odds-head">
        <span className="odds-head-title">Title Odds</span>
        <span className="odds-head-sub">{simLabel}</span>
      </div>

      {sorted.map((p, i) => {
        const isOpen = open === p.player;
        const isLeader = i === 0;
        const se = mcSE(p.pFirst, iterations);
        return (
          <div key={p.player}>
            <button
              className={`odds-row${isOpen ? " open" : ""}`}
              onClick={() => setOpen(isOpen ? null : p.player)}
            >
              <span className="odds-rank">{i + 1}</span>
              <span className="odds-name">{displayName(p.player)}</span>
              <div className="odds-bar-wrap">
                <div className="odds-bar-track">
                  <div className={`odds-bar-fill${isLeader ? " lead" : ""}`}
                    style={{ width: `${(p.pFirst / maxWin) * 100}%` }} />
                </div>
                <span className="odds-sub">{p.currentPoints} pts · proj {round1(p.expectedFinalPoints)}</span>
              </div>
              <span className="odds-pct">
                {Math.round(p.pFirst * 100)}<span className="odds-pct-sign">%</span>
                <span className="odds-se">±{(se * 100).toFixed(1)}</span>
              </span>
            </button>
            {isOpen && <OddsRoster player={p} />}
          </div>
        );
      })}

      <p className="odds-foot">
        Chance of finishing 1st across {simLabel}. ± is the simulation margin of error.
      </p>
    </div>
  );
}

function OddsRoster({ player: p }: { player: PlayerProjection }) {
  const teams = [...p.teams].sort((a, b) => b.expectedFinalPoints - a.expectedFinalPoints);
  return (
    <div className="odds-roster">
      {teams.map((t) => {
        const played = t.w + t.d + t.l;
        const record = played > 0 ? `${t.w}-${t.d}-${t.l}` : "—";
        const out = !isAlive(t.expectedRemainingWins);
        return (
          <div className={`roster-team${out ? " out" : ""}`} key={t.team}>
            <span className="roster-flag">{flag(t.team)}</span>
            <span className="roster-name">{t.team}</span>
            <span className="roster-rec">{record}</span>
            <span className="roster-pts">{t.currentPoints}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   INSIGHTS TAB — today's swings + per-player factors
   ============================================================ */
function InsightsTab({ players, fixtures, playerFactors }: {
  players: PlayerProjection[];
  fixtures: FixtureProjection[];
  playerFactors: PlayerFactors[];
}) {
  const ranked = useMemo(() => [...players].sort((a, b) => b.pFirst - a.pFirst), [players]);
  const [who, setWho] = useState<string>(ranked[0]?.player ?? "");

  // Today's games (or the next match day if none), ranked by title swing.
  const { dayLabel, games } = useMemo(() => {
    const now = new Date();
    const withK = fixtures.filter((f) => f.kickoff);
    const today = withK.filter((f) => sameDay(new Date(f.kickoff!), now));
    if (today.length > 0) {
      return { dayLabel: "Today", games: [...today].sort((a, b) => b.swing - a.swing) };
    }
    const future = withK
      .filter((f) => new Date(f.kickoff!).getTime() > now.getTime())
      .sort((a, b) => new Date(a.kickoff!).getTime() - new Date(b.kickoff!).getTime());
    if (future.length === 0) return { dayLabel: "", games: [] as FixtureProjection[] };
    const nextDay = new Date(future[0].kickoff!);
    const sameNext = future.filter((f) => sameDay(new Date(f.kickoff!), nextDay));
    const label = nextDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    return { dayLabel: `Next · ${label}`, games: sameNext.sort((a, b) => b.swing - a.swing) };
  }, [fixtures]);

  const selFactors = useMemo(
    () => playerFactors.find((x) => x.player === who)?.factors ?? [],
    [playerFactors, who]
  );
  const boosts = selFactors.filter((f) => f.pYes >= f.pNo);
  const risks = selFactors.filter((f) => f.pYes < f.pNo);

  return (
    <div className="insights-wrap">

      {/* Today's biggest swings */}
      <div className="insight-section">
        <div className="insight-header">
          <span className="insight-title">{dayLabel || "Upcoming"}</span>
          <span className="insight-subtitle">biggest swings</span>
        </div>
        {games.length === 0
          ? <p className="insight-note">No upcoming games with odds.</p>
          : games.slice(0, 6).map((f) => <TodaySwing key={f.id} f={f} />)}
      </div>

      {/* Per-player tournament factors */}
      <div className="insight-section">
        <div className="insight-header">
          <span className="insight-title">What Moves the Needle</span>
          <span className="insight-subtitle">rest of tournament</span>
        </div>

        <div className="who-chips">
          {ranked.map((p) => (
            <button key={p.player}
              className={`who-chip${who === p.player ? " active" : ""}`}
              onClick={() => setWho(p.player)}>
              {displayName(p.player)}
            </button>
          ))}
        </div>

        {selFactors.length === 0 ? (
          <p className="insight-note">Odds are largely settled — no high-variance swings left.</p>
        ) : (
          <>
            {boosts.length > 0 && (
              <div className="factor-group">
                <div className="factor-group-head up">Upside</div>
                {boosts.map((f) => <FactorRow key={f.team + f.stage} f={f} />)}
              </div>
            )}
            {risks.length > 0 && (
              <div className="factor-group">
                <div className="factor-group-head down">Risks</div>
                {risks.map((f) => <FactorRow key={f.team + f.stage} f={f} />)}
              </div>
            )}
            <p className="insight-note small">
              {displayName(who)}&apos;s title odds without → with each event. Only swings likely
              enough to matter are shown.
            </p>
          </>
        )}
      </div>

      <MethodologyNote />
    </div>
  );
}

// One of today's games: the most-affected player's raw before/after odds.
function TodaySwing({ f }: { f: FixtureProjection }) {
  const d = f.kickoff ? new Date(f.kickoff) : null;
  const time = d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const ps = (f.playerSwings ?? [])[0]; // pre-sorted by |pHome − pAway|
  const homeHigher = ps ? ps.pHome >= ps.pAway : true;
  const hi = ps ? Math.max(ps.pHome, ps.pAway) : 0;
  const lo = ps ? Math.min(ps.pHome, ps.pAway) : 0;
  const goodTeam = homeHigher ? f.home : f.away;
  return (
    <div className="today-row">
      <div className="today-match">
        <span className="today-teams">{flag(f.home)} {f.home} <span className="today-v">v</span> {f.away} {flag(f.away)}</span>
        <span className="today-time">{time}</span>
      </div>
      {ps && f.swing > 0.005 ? (
        <div className="today-swing">
          <strong>{displayName(ps.player)}</strong>
          <span className="today-prob">{Math.round(lo * 100)}% → {Math.round(hi * 100)}%</span>
          <span className="today-if">if {goodTeam} {flag(goodTeam)} win</span>
        </div>
      ) : (
        <div className="today-swing muted">little title impact</div>
      )}
    </div>
  );
}

// One tournament factor row: event, its likelihood, and the player's odds shift.
function FactorRow({ f }: { f: TournamentFactor }) {
  const up = f.pYes >= f.pNo;
  return (
    <div className="factor-row">
      <span className="factor-flag">{flag(f.team)}</span>
      <div className="factor-mid">
        <div className="factor-label">{f.label}</div>
        <div className="factor-prob">{Math.round(f.prob * 100)}% likely</div>
      </div>
      <div className={`factor-delta ${up ? "up" : "down"}`}>
        <span className="fd-from">{Math.round(f.pNo * 100)}%</span>
        <span className="fd-arrow">{up ? "↑" : "↓"}</span>
        <span className="fd-to">{Math.round(f.pYes * 100)}%</span>
      </div>
    </div>
  );
}

// Plain-language model summary so the numbers are interpretable.
function MethodologyNote() {
  const [open, setOpen] = useState(false);
  return (
    <div className="method-note">
      <button className="method-toggle" onClick={() => setOpen((v) => !v)}>
        <span>How these numbers work</span>
        <span className="method-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="method-body">
          <p>Score = <strong>3 points per match a team you own wins</strong>. We run thousands of simulated tournaments off live <strong>Kalshi market odds</strong> — group games and each team&apos;s knockout run.</p>
          <p><strong>Odds</strong> = how often you finish 1st. A <strong>swing</strong> is how much one result moves those odds, from the same sims.</p>
        </div>
      )}
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

