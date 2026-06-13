"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectionResult,
  PlayerProjection,
  FixtureProjection,
  DataStatus,
} from "@/lib/types";

const RANK_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
type Tab = "leaderboard" | "predictions" | "matches" | "insights";
const TABS: { id: Tab; label: string }[] = [
  { id: "leaderboard", label: "Race" },
  { id: "predictions", label: "Teams" },
  { id: "matches", label: "Matches" },
  { id: "insights", label: "Insights" },
];

export default function Page() {
  const [data, setData] = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [mock, setMock] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("leaderboard");

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
      // let the DOM paint at 0 before animating meters/race to value
      requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    }
  }, []);

  useEffect(() => { load(mock); }, [load, mock]);

  return (
    <div className="wrap">
      <Floodlights />

      <header className="masthead">
        <div className="kicker">World Cup 2026 · Draft Pool</div>
        <h1 className="title">The Group<br />Stage</h1>
        {data && <StatusStrip status={data.status} iterations={data.iterations} generatedAt={data.generatedAt} />}
      </header>

      <Nav tab={tab} setTab={setTab} />

      {loading && (
        <div className="loading">
          <span className="ball">◐</span>&nbsp;&nbsp;SIMULATING THE TOURNAMENT…
        </div>
      )}

      {!loading && data && (
        <>
          {tab === "leaderboard" && <LeaderboardTab data={data} mounted={mounted} />}
          {tab === "predictions" && <PredictionsTab data={data} mounted={mounted} />}
          {tab === "matches" && <MatchesTab fixtures={data.fixtures} />}
          {tab === "insights" && <InsightsTab data={data} />}

          <div className="controls">
            <button className="btn" onClick={() => load(mock)} disabled={loading}>↻ Re-run sim</button>
            <button className="btn" onClick={() => setMock((m) => !m)} disabled={loading}>
              {mock ? "Use live odds" : "Use model odds"}
            </button>
          </div>
        </>
      )}

      {!loading && !data && (
        <div className="loading">Couldn&apos;t load projections. Tap re-run.</div>
      )}
    </div>
  );
}

/* ============================== NAV ============================== */
function Nav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="nav" role="tablist" aria-label="Sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          className={`nav-tab ${tab === t.id ? "on" : ""}`}
          onClick={() => setTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

/* ============================== STATUS ============================== */
function StatusStrip({
  status, iterations, generatedAt,
}: { status: DataStatus; iterations: number; generatedAt: string }) {
  const live = status.groupSource === "kalshi" || status.knockoutSource === "kalshi";
  const allLive = status.groupSource === "kalshi" && status.knockoutSource === "kalshi";
  const label = allLive ? "KALSHI LIVE" : live ? "KALSHI · PARTIAL" : "MODEL ODDS";
  const tone = allLive ? "live" : live ? "gold" : "gold";
  const when = useMemo(() => {
    try {
      return new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }, [generatedAt]);

  return (
    <div className="status">
      <span className={`pill ${tone}`}>{label}</span>
      <span className="pill cyan">3 pts / win</span>
      <span className="pill">{(iterations / 1000).toFixed(0)}k sims</span>
      <span className="status-dot" aria-hidden />
      <span className="status-meta">updated {when}</span>
    </div>
  );
}

/* ============================== LEADERBOARD ============================== */
function LeaderboardTab({ data, mounted }: { data: ProjectionResult; mounted: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="tabpane">
      <TitleRace players={data.players} mounted={mounted} />
      <div className="board">
        {data.players.map((p, i) => (
          <Row
            key={p.player}
            p={p}
            rank={i + 1}
            lead={i === 0}
            open={open === p.player}
            mounted={mounted}
            delay={i * 80}
            maxFirst={data.players[0]?.pFirst || 1}
            onToggle={() => setOpen(open === p.player ? null : p.player)}
          />
        ))}
      </div>
      <p className="note">
        Win&nbsp;% is each player&apos;s chance of finishing 1st, from a Monte Carlo
        simulation of every remaining match. Group matches use Kalshi 3-way
        prices; knockout wins come from Kalshi &ldquo;reach round X&rdquo;
        markets, where P(win a round) = reach(next) / reach(this).
      </p>
    </section>
  );
}

/* ---- the signature: a live race to the trophy ---- */
function TitleRace({ players, mounted }: { players: PlayerProjection[]; mounted: boolean }) {
  const max = players[0]?.pFirst || 1;
  return (
    <div className="race">
      <div className="race-head">
        <span>The race</span>
        <span className="trophy">◆ trophy</span>
      </div>
      {players.map((p, i) => {
        const frac = max > 0 ? p.pFirst / max : 0;
        const left = mounted ? 8 + frac * 84 : 4;
        return (
          <div className="track" key={p.player}>
            <div className="lane" />
            <div className={`runner ${i === 0 ? "lead" : ""}`} style={{ left: `${left}%` }}>
              <span className="dot" />
              <span className="who">{p.player}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({
  p, rank, lead, open, mounted, delay, maxFirst, onToggle,
}: {
  p: PlayerProjection; rank: number; lead: boolean; open: boolean;
  mounted: boolean; delay: number; maxFirst: number; onToggle: () => void;
}) {
  const pct = p.pFirst * 100;
  const fillW = maxFirst > 0 ? Math.max(3, (p.pFirst / maxFirst) * 100) : 3;
  const animPct = useCountUp(mounted ? pct : 0, 1200);
  const animProj = useCountUp(mounted ? p.expectedFinalPoints : 0, 1100);

  return (
    <div
      className={`row ${lead ? "lead" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onToggle}
    >
      <div className="row-top">
        <div className="rank">{lead && <span className="crown">♛</span>}{rank}</div>
        <div className="namecol">
          <div className="name">{p.player}</div>
          <div className="movement">
            {lead ? "◆ leading the pool" : `${(p.pTop3 * 100).toFixed(0)}% to podium`}
          </div>
        </div>
        <div className="pts">
          <b>{p.currentPoints}</b> now<br />
          <span className="proj">{animProj.toFixed(1)}</span> proj
        </div>
      </div>

      <div className="meter">
        <div className="grid" />
        <div className="fill" style={{ width: mounted ? `${fillW}%` : "0%" }} />
        <div className="label">
          <span className="cap">P(WIN POOL)</span>
          <span className="val">{animPct.toFixed(1)}%</span>
        </div>
      </div>

      {open && (
        <div className="detail">
          <FinishDist dist={p.finishDistribution} />
          <div className="detail-head"><span>Team</span><span>Now</span><span>Proj</span></div>
          {p.teams.map((t) => (
            <div className="team-line" key={t.team}>
              <span className="tname">{t.team}</span>
              <span className="twins">{t.currentPoints}</span>
              <span className="tproj">{t.expectedFinalPoints.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FinishDist({ dist }: { dist: number[] }) {
  const max = Math.max(...dist, 0.01);
  return (
    <div className="finish-wrap">
      <div className="finish-cap">Finish position odds</div>
      <div className="finish">
        {dist.slice(0, 6).map((d, i) => (
          <div
            key={i}
            className={`bar ${i === 0 ? "win" : ""}`}
            style={{ height: `${Math.max(5, (d / max) * 100)}%` }}
            title={`${RANK_LABELS[i]}: ${(d * 100).toFixed(1)}%`}
          >
            <span>{RANK_LABELS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== PREDICTIONS / TEAMS ============================== */
function PredictionsTab({ data, mounted }: { data: ProjectionResult; mounted: boolean }) {
  // Flatten every team across players, sorted by projected final points.
  const teams = useMemo(() => {
    const all = data.players.flatMap((p) =>
      p.teams.map((t) => ({ ...t, owner: p.player }))
    );
    return all.sort((a, b) => b.expectedFinalPoints - a.expectedFinalPoints);
  }, [data]);

  const topProj = teams[0]?.expectedFinalPoints || 1;

  return (
    <section className="tabpane">
      <div className="pane-head">
        <h2 className="pane-title">Team projections</h2>
        <p className="pane-sub">Expected final points per team — current points plus simulated remaining wins.</p>
      </div>

      <div className="teamtable">
        <div className="tt-head">
          <span>Team</span>
          <span className="tt-owner-h">Owner</span>
          <span className="tt-num">Now</span>
          <span className="tt-num">Proj</span>
        </div>
        {teams.map((t, i) => {
          const w = topProj > 0 ? (t.expectedFinalPoints / topProj) * 100 : 0;
          return (
            <div className="tt-row" key={t.team} style={{ animationDelay: `${Math.min(i, 16) * 28}ms` }}>
              <div className="tt-bar" style={{ width: mounted ? `${w}%` : "0%" }} />
              <span className="tt-team">{t.team}</span>
              <span className="tt-owner"><span className="ochip">{t.owner}</span></span>
              <span className="tt-num dim">{t.currentPoints}</span>
              <span className="tt-num gold">{t.expectedFinalPoints.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================== MATCHES ============================== */
function MatchesTab({ fixtures }: { fixtures: FixtureProjection[] }) {
  // Sort chronologically for the schedule view; bucket into Today / Upcoming.
  const sorted = useMemo(
    () => [...fixtures].sort((a, b) => kickoffMs(a) - kickoffMs(b)),
    [fixtures]
  );
  const { today, upcoming, undated } = useMemo(() => {
    const now = new Date();
    const t: FixtureProjection[] = [], u: FixtureProjection[] = [], n: FixtureProjection[] = [];
    for (const f of sorted) {
      if (!f.kickoff) { n.push(f); continue; }
      const d = new Date(f.kickoff);
      if (sameDay(d, now)) t.push(f);
      else if (d.getTime() >= now.getTime()) u.push(f);
      else t.push(f); // already-started today-ish; keep with today
    }
    return { today: t, upcoming: u, undated: n };
  }, [sorted]);

  return (
    <section className="tabpane">
      <div className="pane-head">
        <h2 className="pane-title">Matches</h2>
        <p className="pane-sub">Remaining group fixtures involving pool teams, with de-vigged 3-way odds.</p>
      </div>

      {today.length > 0 && (
        <>
          <div className="day-label"><span className="live-pip" />Today</div>
          <div className="matchlist">
            {today.map((f) => <MatchCard key={f.id} f={f} />)}
          </div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="day-label">Upcoming</div>
          <div className="matchlist">
            {upcoming.slice(0, 24).map((f) => <MatchCard key={f.id} f={f} />)}
          </div>
        </>
      )}

      {today.length === 0 && upcoming.length === 0 && undated.length > 0 && (
        <div className="matchlist">
          {undated.slice(0, 24).map((f) => <MatchCard key={f.id} f={f} />)}
        </div>
      )}

      {fixtures.length === 0 && (
        <div className="empty">No remaining group fixtures with markets right now.</div>
      )}
    </section>
  );
}

function MatchCard({ f }: { f: FixtureProjection }) {
  const o = f.oddsHome;
  const time = f.kickoff
    ? new Date(f.kickoff).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : "TBD";
  return (
    <div className="match">
      <div className="match-top">
        <span className="match-time">{time}</span>
        {f.swing > 0.02 && <span className="match-key">◆ {(f.swing * 100).toFixed(0)}% swing</span>}
      </div>
      <div className="match-teams">
        <div className="mt-side">
          <span className="mt-name">{f.home}</span>
          <span className="ochip sm">{f.homeOwner}</span>
        </div>
        <span className="mt-v">vs</span>
        <div className="mt-side right">
          <span className="mt-name">{f.away}</span>
          <span className="ochip sm">{f.awayOwner}</span>
        </div>
      </div>
      {o ? (
        <div className="odds3">
          <Leg label={f.home} pct={o.win} kind="home" />
          <Leg label="Draw" pct={o.draw} kind="draw" />
          <Leg label={f.away} pct={o.loss} kind="away" />
        </div>
      ) : (
        <div className="odds-none">No market</div>
      )}
    </div>
  );
}

function Leg({ label, pct, kind }: { label: string; pct: number; kind: string }) {
  return (
    <div className={`leg ${kind}`}>
      <div className="leg-bar"><div className="leg-fill" style={{ width: `${pct * 100}%` }} /></div>
      <div className="leg-meta">
        <span className="leg-label">{label}</span>
        <span className="leg-pct">{(pct * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

/* ============================== INSIGHTS ============================== */
function InsightsTab({ data }: { data: ProjectionResult }) {
  const key = useMemo(
    () => data.fixtures.filter((f) => f.swing > 0).slice(0, 6),
    [data]
  );
  const s = data.status;

  return (
    <section className="tabpane">
      <div className="pane-head">
        <h2 className="pane-title">Insights</h2>
        <p className="pane-sub">The matches that move the title race most, and the health of the data behind these numbers.</p>
      </div>

      <div className="cap-row">Key games</div>
      {key.length === 0 && <div className="empty">No swing games yet — odds may still be loading.</div>}
      <div className="insightlist">
        {key.map((f, i) => {
          const helps = f.swingToward === "home" ? f.home : f.away;
          const helpsOwner = f.swingToward === "home" ? f.homeOwner : f.awayOwner;
          return (
            <div className="insight" key={f.id}>
              <div className="ins-rank">{i + 1}</div>
              <div className="ins-body">
                <div className="ins-match">{f.home} <span className="ins-v">v</span> {f.away}</div>
                <div className="ins-line">
                  A <b>{helps}</b> win lifts <b className="gld">{f.swingPlayer ?? helpsOwner}</b>&apos;s
                  title odds by <b className="gld">{(f.swing * 100).toFixed(1)} pts</b>
                </div>
              </div>
              <div className="ins-swing">
                <div className="ins-swing-bar"><div style={{ width: `${Math.min(100, f.swing * 100 * 3)}%` }} /></div>
                <span>{(f.swing * 100).toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cap-row">Data sources</div>
      <div className="health">
        <HealthRow label="Live results" ok={s.liveResults}
          detail={s.liveResults ? "football-data merged" : "using seed standings"} />
        <HealthRow label="Group odds" ok={s.groupSource === "kalshi"}
          detail={`${s.groupSource === "kalshi" ? "Kalshi markets" : "model odds"} · ${s.fixturesWithOdds}/${s.totalFixtures} priced`} />
        <HealthRow label="Knockout odds" ok={s.knockoutSource === "kalshi"}
          detail={`${s.knockoutSource === "kalshi" ? "Kalshi reach markets" : "model odds"} · ${s.knockoutTeams} teams`} />
      </div>
      <p className="note">
        Swing = the change in a player&apos;s probability of winning the whole pool
        between the two decisive results of a match, measured directly from the
        Monte Carlo samples. It answers &ldquo;which single game should I watch?&rdquo;
      </p>
    </section>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="hrow">
      <span className={`hled ${ok ? "on" : "off"}`} />
      <span className="hlabel">{label}</span>
      <span className="hdetail">{detail}</span>
      <span className={`hstate ${ok ? "on" : "off"}`}>{ok ? "LIVE" : "MODEL"}</span>
    </div>
  );
}

/* ============================== HELPERS ============================== */
function kickoffMs(f: FixtureProjection): number {
  return f.kickoff ? new Date(f.kickoff).getTime() : Number.MAX_SAFE_INTEGER;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* count-up hook with reduced-motion respect */
function useCountUp(target: number, duration: number) {
  const [val, setVal] = useState(target);
  const raf = useRef<number>();
  useEffect(() => {
    if (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVal(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return val;
}

/* animated floodlit-stadium backdrop on canvas — very low contrast */
function Floodlights() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const motes = Array.from({ length: 26 }, () => ({
      x: Math.random(), y: Math.random(),
      s: 0.4 + Math.random() * 1.1, v: 0.012 + Math.random() * 0.022,
    }));

    let last = performance.now();
    const draw = (time: number) => {
      const dt = Math.min(50, time - last) / 1000;
      last = time;
      ctx.clearRect(0, 0, w, h);

      ctx.save();
      const stripeH = h / 9;
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.04)";
        ctx.fillRect(0, i * stripeH, w, stripeH);
      }
      ctx.restore();

      const cones = [
        { hue: "rgba(79,214,192,", baseX: 0.2, amp: 0.06, sp: 0.00018 },
        { hue: "rgba(240,207,114,", baseX: 0.8, amp: 0.07, sp: 0.00013 },
      ];
      for (const cone of cones) {
        const cx = (cone.baseX + Math.sin(time * cone.sp) * cone.amp) * w;
        const g = ctx.createRadialGradient(cx, -40, 0, cx, h * 0.4, h * 0.95);
        g.addColorStop(0, cone.hue + "0.10)");
        g.addColorStop(0.4, cone.hue + "0.03)");
        g.addColorStop(1, cone.hue + "0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      for (const m of motes) {
        if (!reduce) m.y -= m.v * dt;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        const px = m.x * w, py = m.y * h;
        ctx.beginPath();
        ctx.arc(px, py, m.s, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(240,235,210,0.10)";
        ctx.fill();
      }

      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    if (reduce) draw(0);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas id="fx" ref={ref} />;
}
