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
  stage: string;      // "GROUP_STAGE" | "ROUND_OF_32" | etc
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

function fdAliases(): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of ALL_TEAMS) {
    m.set(t.name.toLowerCase(), t.name);
    if (t.fdName) m.set(t.fdName.toLowerCase(), t.name);
  }
  return m;
}

function canon(name: string, aliases: Map<string, string>): string | null {
  const l = name.toLowerCase();
  if (aliases.has(l)) return aliases.get(l)!;
  for (const [a, c] of aliases) if (l.includes(a) || a.includes(l)) return c;
  return null;
}

interface FDMatchFull {
  id: number;
  status: string;
  stage: string;
  utcDate: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score?: {
    winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime?: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
  };
  minute?: number;
}

// Fetch the full WC match schedule — all stages, all statuses.
// Returns null if API unavailable.
export async function fetchWCSchedule(): Promise<ScheduledMatch[] | null> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { "X-Auth-Token": token },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(`[footballData] schedule fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as { matches?: FDMatchFull[] };
    if (!data.matches) return null;

    const aliases = fdAliases();
    const out: ScheduledMatch[] = [];

    for (const m of data.matches) {
      const home = canon(m.homeTeam.name, aliases);
      const away = canon(m.awayTeam.name, aliases);
      if (!home || !away) {
        console.warn(`[footballData] unresolved: "${m.homeTeam.name}" vs "${m.awayTeam.name}"`);
        continue;
      }
      const sc = m.score?.fullTime ?? m.score?.regularTime;
      out.push({
        id: m.id,
        home,
        away,
        kickoff: m.utcDate,
        status: m.status as ScheduledMatch["status"],
        stage: m.stage,
        scoreHome: sc?.home ?? undefined,
        scoreAway: sc?.away ?? undefined,
        minute: m.minute,
      });
    }
    return out;
  } catch (e) {
    console.error("[footballData] schedule fetch threw:", e);
    return null;
  }
}

// Finished-match records per team.
export async function fetchLiveRecords(): Promise<LiveRecord[] | null> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches?status=FINISHED`, {
      headers: { "X-Auth-Token": token },
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { matches?: FDMatchFull[] };
    if (!data.matches) return null;

    const aliases = fdAliases();
    const rec = new Map<string, LiveRecord>();
    const bump = (team: string, k: "w" | "d" | "l") => {
      const r = rec.get(team) ?? { team, w: 0, d: 0, l: 0 };
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

// Currently live match scores.
export async function fetchLiveScores(): Promise<LiveMatchScore[]> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(
      `${FD_BASE}/competitions/WC/matches?status=IN_PLAY,PAUSED,HALFTIME`,
      {
        headers: { "X-Auth-Token": token },
        next: { revalidate: 30 },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { matches?: FDMatchFull[] };
    const aliases = fdAliases();
    return (data.matches ?? []).flatMap((m) => {
      const home = canon(m.homeTeam.name, aliases);
      const away = canon(m.awayTeam.name, aliases);
      if (!home || !away) return [];
      const sc = m.score?.fullTime ?? m.score?.regularTime;
      return [{
        home, away,
        scoreHome: sc?.home ?? 0,
        scoreAway: sc?.away ?? 0,
        status: (["IN_PLAY", "PAUSED", "HALFTIME"].includes(m.status)
          ? m.status : "IN_PLAY") as LiveMatchScore["status"],
        minute: m.minute,
      }];
    });
  } catch { return []; }
}

export function mergeRecords(seed: TeamSeed[], live: LiveRecord[] | null): TeamSeed[] {
  if (!live) return seed;
  const liveMap = new Map(live.map((r) => [r.team, r]));
  return seed.map((t) => {
    const l = liveMap.get(t.name);
    return l ? { ...t, w: l.w, d: l.d, l: l.l } : t;
  });
}
