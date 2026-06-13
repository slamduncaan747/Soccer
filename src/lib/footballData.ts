import { ALL_TEAMS, TeamSeed } from "../data/pool";

// football-data.org free tier. Set FOOTBALL_DATA_TOKEN in env to enable.
// WC 2026 competition code is "WC". Free tier has rate limits (10 req/min) and
// may lag; we cache aggressively and fall back to seed data when unavailable.
const FD_BASE = "https://api.football-data.org/v4";

export interface LiveRecord {
  team: string; // canonical
  w: number;
  d: number;
  l: number;
}

function fdAliases(): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of ALL_TEAMS) {
    m.set(t.name.toLowerCase(), t.name);
    if (t.fdName) m.set(t.fdName.toLowerCase(), t.name);
  }
  return m;
}

interface FDMatch {
  status: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score?: { winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null };
}

function canon(name: string, aliases: Map<string, string>): string | null {
  const l = name.toLowerCase();
  if (aliases.has(l)) return aliases.get(l)!;
  for (const [a, c] of aliases) if (l.includes(a)) return c;
  return null;
}

// Returns live W/D/L per team from FINISHED matches, or null if the API
// is not configured / unreachable. Caller falls back to seed data.
export async function fetchLiveRecords(): Promise<LiveRecord[] | null> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches?status=FINISHED`, {
      headers: { "X-Auth-Token": token },
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { matches?: FDMatch[] };
    if (!data.matches) return null;

    const aliases = fdAliases();
    const rec = new Map<string, LiveRecord>();
    const bump = (team: string, k: "w" | "d" | "l") => {
      const r = rec.get(team) || { team, w: 0, d: 0, l: 0 };
      r[k]++;
      rec.set(team, r);
    };

    for (const m of data.matches) {
      if (m.status !== "FINISHED") continue;
      const home = canon(m.homeTeam.name, aliases);
      const away = canon(m.awayTeam.name, aliases);
      const winner = m.score?.winner;
      if (home) {
        if (winner === "HOME_TEAM") bump(home, "w");
        else if (winner === "AWAY_TEAM") bump(home, "l");
        else if (winner === "DRAW") bump(home, "d");
      }
      if (away) {
        if (winner === "AWAY_TEAM") bump(away, "w");
        else if (winner === "HOME_TEAM") bump(away, "l");
        else if (winner === "DRAW") bump(away, "d");
      }
    }
    return [...rec.values()];
  } catch {
    return null;
  }
}

export interface LiveMatchScore {
  home: string;
  away: string;
  scoreHome: number;
  scoreAway: number;
  status: "IN_PLAY" | "PAUSED" | "HALFTIME";
  minute?: number;
}

export async function fetchLiveScores(): Promise<LiveMatchScore[]> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches?status=IN_PLAY,PAUSED,HALFTIME`, {
      headers: { "X-Auth-Token": token },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { matches?: Array<{
      status: string;
      homeTeam: { name: string };
      awayTeam: { name: string };
      score?: { fullTime?: { home: number | null; away: number | null } };
      minute?: number;
    }> };
    const aliases = fdAliases();
    return (data.matches ?? []).flatMap((m) => {
      const home = canon(m.homeTeam.name, aliases);
      const away = canon(m.awayTeam.name, aliases);
      if (!home || !away) return [];
      const sc = m.score?.fullTime;
      return [{
        home, away,
        scoreHome: sc?.home ?? 0,
        scoreAway: sc?.away ?? 0,
        status: (["IN_PLAY", "PAUSED", "HALFTIME"].includes(m.status) ? m.status : "IN_PLAY") as LiveMatchScore["status"],
        minute: m.minute,
      }];
    });
  } catch { return []; }
}

// Merge live records over seed data. Seed is the floor; live overrides per team.
export function mergeRecords(seed: TeamSeed[], live: LiveRecord[] | null): TeamSeed[] {
  if (!live) return seed;
  const liveMap = new Map(live.map((r) => [r.team, r]));
  return seed.map((t) => {
    const l = liveMap.get(t.name);
    return l ? { ...t, w: l.w, d: l.d, l: l.l } : t;
  });
}
