"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectionResult, PlayerProjection } from "@/lib/types";

const RANK_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

export default function Page() {
  const [data, setData] = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  const sourceLabel =
    data?.oddsSource === "kalshi" ? "KALSHI LIVE"
    : data?.oddsSource === "mixed" ? "KALSHI · PARTIAL"
    : "MODEL ODDS";

  return (
    <div className="wrap">
      <Floodlights />

      <header className="masthead">
        <div className="kicker">World Cup 2026 · Draft Pool</div>
        <h1 className="title">The Group<br />Stage</h1>
        <div className="sub">
          <span className={`pill ${data?.oddsSource === "kalshi" ? "live" : "gold"}`}>{sourceLabel}</span>
          <span className="pill cyan">3 pts / win</span>
          {data && <span className="pill">{(data.iterations / 1000).toFixed(0)}k sims</span>}
        </div>
      </header>

      {loading && (
        <div className="loading">
          <span className="ball">◐</span>&nbsp;&nbsp;SIMULATING THE TOURNAMENT…
        </div>
      )}

      {!loading && data && (
        <>
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

          <div className="controls">
            <button className="btn" onClick={() => load(mock)} disabled={loading}>↻ Re-run sim</button>
            <button className="btn" onClick={() => setMock((m) => !m)} disabled={loading}>
              {mock ? "Use live odds" : "Use model odds"}
            </button>
          </div>

          <p className="note">
            Win % is each player&apos;s chance of finishing 1st, from a Monte Carlo
            simulation of every remaining match. Group matches use Kalshi 3-way
            prices; knockout wins come from Kalshi &ldquo;reach round X&rdquo;
            markets, where P(win a round) = reach(next) / reach(this). Set{" "}
            <code>FOOTBALL_DATA_TOKEN</code> for live results and the WC series via{" "}
            <code>KALSHI_WC_SERIES</code>.
          </p>
        </>
      )}

      {!loading && !data && (
        <div className="loading">Couldn&apos;t load projections. Tap re-run.</div>
      )}
    </div>
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
        // position along the track scaled to the leader (relative race framing)
        const frac = max > 0 ? p.pFirst / max : 0;
        const left = mounted ? 8 + frac * 84 : 4;
        return (
          <div className="track" key={p.player}>
            <div className="lane" />
            <div
              className={`runner ${i === 0 ? "lead" : ""}`}
              style={{ left: `${left}%` }}
            >
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

    // drifting light cones + faint pitch stripes + slow motes
    const motes = Array.from({ length: 26 }, () => ({
      x: Math.random(), y: Math.random(),
      s: 0.4 + Math.random() * 1.1, v: 0.012 + Math.random() * 0.022,
    }));

    let last = performance.now();
    const draw = (time: number) => {
      const dt = Math.min(50, time - last) / 1000; // seconds, clamped
      last = time;
      ctx.clearRect(0, 0, w, h);

      // pitch stripes
      ctx.save();
      const stripeH = h / 9;
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.04)";
        ctx.fillRect(0, i * stripeH, w, stripeH);
      }
      ctx.restore();

      // two drifting floodlight cones
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

      // floating motes (drift upward through the light)
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
    if (reduce) draw(0); // single static frame
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas id="fx" ref={ref} />;
}
