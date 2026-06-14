import { ALL_TEAMS, TeamSeed } from "../data/pool";

const FD_BASE = "https://api.football-data.org/v4";

export interface LiveRecord {
  team: string;
  w: number;
  d: number;
  l: number;
}

export interface ScheduledMatch {
  id: number;
  home: string;       // canonical name
  away: string;
  kickoff: string;    // ISO
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "HALFTIME" | "FINISHED" | "POSTPONED" | "SUSPENDED" | "CANCELLED";
  stage: string;
  scoreHome?: number;
  scoreAway?: number;
  minute?: number;
}

export interface LiveMatchScore {
  home: string;
  away: string;
  scoreHome: number;
  scoreAway: number;
  status: "IN_PLAY" | "PAUSED" | "HALFTIME";
  minute?: number;
}

export interface WCData {
  schedule: ScheduledMatch[];
  records: LiveRecord[];
  liveScores: LiveMatchScore[];
}

interface FDMatchFull {
  id: number;
  status: string;
  stage: string;
  utcDate: string;
  homeTeam: { name: string | null };
  awayTeam: { name: string | null };
  score?: {
    winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime?: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
  };
  minute?: number;
}

function fdAliases(): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of ALL_TEAMS) {
    m.set(t.name.toLowerCase(), t.name);
    if (t.fdName) m.set(t.fdName.toLowerCase(), t.name);
  }
  return m;
}

function canon(name: string | null | undefined, aliases: Map<string, string>): string | null {
  if (!name) return null;
  const l = name.toLowerCase();
  if (aliases.has(l)) return aliases.get(l)!;
  for (const [a, c] of aliases) if (l.includes(a) || a.includes(l)) return c;
  return null;
}

function logRateLimitHeaders(headers: Headers, label: string) {
  const available = headers.get("X-RequestsAvailable");
  const reset = headers.get("X-RequestCounter-Reset");
  const client = headers.get("X-Authenticated-Client");
  const version = headers.get("X-API-Version");
  console.log(
    `[footballData] ${label} — client=${client ?? "?"} version=${version ?? "?"} ` +
    `requests_remaining=${available ?? "?"} reset_in=${reset ?? "?"}s`
  );
  if (available !== null && Number(available) <= 2) {
    console.warn(`[footballData] Rate limit nearly exhausted: ${available} requests left, resets in ${reset}s`);
  }
}

// Single fetch for ALL WC matches — one API call covers schedule, records, and live scores.
// Free tier: 10 req/min. Caching at 60s means one burst per minute max.
export async function fetchAllWCMatches(): Promise<WCData | null> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.warn("[footballData] FOOTBALL_DATA_TOKEN not set — skipping live data");
    return null;
  }

  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { "X-Auth-Token": token },
      next: { revalidate: 60 }, // cache 60s server-side
    });

    logRateLimitHeaders(res.headers, "fetchAllWCMatches");

    if (res.status === 429) {
      const reset = res.headers.get("X-RequestCounter-Reset");
      console.error(`[footballData] Rate limited — resets in ${reset ?? "?"}s`);
      return null;
    }
    if (!res.ok) {
      console.error(`[footballData] HTTP ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as { matches?: FDMatchFull[] };
    if (!data.matches?.length) {
      console.warn("[footballData] Response OK but no matches in payload");
      return null;
    }

    const aliases = fdAliases();
    const schedule: ScheduledMatch[] = [];
    const recordMap = new Map<string, LiveRecord>();
    const liveScores: LiveMatchScore[] = [];

    const bump = (team: string, k: "w" | "d" | "l") => {
      const r = recordMap.get(team) ?? { team, w: 0, d: 0, l: 0 };
      r[k]++;
      recordMap.set(team, r);
    };

    for (const m of data.matches) {
      const home = canon(m.homeTeam.name, aliases);
      const away = canon(m.awayTeam.name, aliases);
      if (!home || !away) {
        // Only warn for pool-adjacent teams — TBD/null slots are expected in early scheduling
        const hn = m.homeTeam.name;
        const an = m.awayTeam.name;
        if (hn && an && hn !== "TBD" && an !== "TBD") {
          console.warn(`[footballData] unresolved: "${hn}" vs "${an}"`);
        }
        continue;
      }

      const sc = m.score?.fullTime ?? m.score?.regularTime;
      const scoreHome = sc?.home ?? undefined;
      const scoreAway = sc?.away ?? undefined;

      // Full schedule entry
      schedule.push({
        id: m.id,
        home,
        away,
        kickoff: m.utcDate,
        status: m.status as ScheduledMatch["status"],
        stage: m.stage,
        scoreHome,
        scoreAway,
        minute: m.minute,
      });

      // W/D/L records from finished matches
      if (m.status === "FINISHED") {
        const winner = m.score?.winner;
        if (winner === "HOME_TEAM") { bump(home, "w"); bump(away, "l"); }
        else if (winner === "AWAY_TEAM") { bump(away, "w"); bump(home, "l"); }
        else if (winner === "DRAW") { bump(home, "d"); bump(away, "d"); }
      }

      // Live scores from in-progress matches
      if (["IN_PLAY", "PAUSED", "HALFTIME"].includes(m.status)) {
        liveScores.push({
          home,
          away,
          scoreHome: scoreHome ?? 0,
          scoreAway: scoreAway ?? 0,
          status: m.status as LiveMatchScore["status"],
          minute: m.minute,
        });
      }
    }

    console.log(
      `[footballData] parsed ${schedule.length} matches, ` +
      `${recordMap.size} teams with results, ${liveScores.length} live`
    );

    return { schedule, records: [...recordMap.values()], liveScores };
  } catch (e) {
    console.error("[footballData] fetch threw:", e);
    return null;
  }
}

export function mergeRecords(seed: TeamSeed[], live: LiveRecord[] | null): TeamSeed[] {
  if (!live) return seed;
  const liveMap = new Map(live.map((r) => [r.team, r]));
  return seed.map((t) => {
    const l = liveMap.get(t.name);
    return l ? { ...t, w: l.w, d: l.d, l: l.l } : t;
  });
}

// Keep these for backwards compatibility (used by old orchestrator tests)
export async function fetchLiveRecords() { return null; }
export async function fetchLiveScores() { return []; }
export async function fetchWCSchedule() { return null; }
