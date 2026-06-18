import { createClient } from "@supabase/supabase-js";
import type { PlayerProjection, OddsHistoryPoint } from "./types";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton — safe to call at module level in server/client code.
export const supabase = createClient(url, key);

// ── snapshot shape returned by Supabase ──────────────────────────
export interface OddsRow {
  captured_at: string;
  matchday: number;
  player: string;
  title_odds: number;
  expected_points?: number | null;
}

// Minimum time between snapshots for a given matchday. Snapshots are written
// fire-and-forget whenever the projection is built (i.e. whenever someone opens
// the app), so this throttle caps writes at one per matchday per half hour.
const SNAPSHOT_MIN_INTERVAL_MS = 30 * 60 * 1000;

// ── write a snapshot (server-side only, called from orchestrator) ─
// Deduplicates: skips write if a snapshot for this matchday already
// exists that was captured within the last 30 minutes.
export async function snapshotOdds(
  players: PlayerProjection[],
  matchday: number
): Promise<void> {
  try {
    // Check most recent snapshot for this matchday
    const { data: recent } = await supabase
      .from("wc26_odds_snapshots")
      .select("captured_at")
      .eq("matchday", matchday)
      .order("captured_at", { ascending: false })
      .limit(1)
      .single();

    if (recent) {
      const ageMs = Date.now() - new Date(recent.captured_at).getTime();
      if (ageMs < SNAPSHOT_MIN_INTERVAL_MS) {
        // Too soon since the last snapshot for this matchday — skip.
        return;
      }
    }

    const rows = players.map((p) => ({
      matchday,
      player: p.player,
      title_odds: p.pFirst,
      expected_points: p.expectedFinalPoints,
    }));

    const { error } = await supabase.from("wc26_odds_snapshots").insert(rows);
    if (error) {
      // Self-heal if the expected_points column hasn't been added yet: retry
      // with just the odds so historical tracking never silently stops.
      const missingCol = /expected_points/i.test(error.message);
      if (missingCol) {
        const { error: e2 } = await supabase
          .from("wc26_odds_snapshots")
          .insert(rows.map(({ expected_points: _omit, ...r }) => r));
        if (e2) console.error("[supabase] snapshotOdds fallback error:", e2.message);
        else console.warn("[supabase] snapshotOdds: expected_points column missing — stored odds only");
      } else {
        console.error("[supabase] snapshotOdds error:", error.message);
      }
    }
  } catch (e) {
    console.error("[supabase] snapshotOdds threw:", e);
  }
}

// ── read odds + expected-points history for the chart ────────────
// Returns one array entry per player, each with an array of
// { matchday, pct, pts } data points ordered Draft → Now.
// Always prepends a synthetic "Draft" point (equal 1/n odds; expected points
// flat-anchored to the first real snapshot since we don't track pre-draft).
export async function readOddsHistory(
  players: string[]
): Promise<Record<string, OddsHistoryPoint[]>> {
  try {
    // select("*") so the read keeps working whether or not expected_points
    // exists in the table yet.
    const { data, error } = await supabase
      .from("wc26_odds_snapshots")
      .select("*")
      .in("player", players)
      .order("captured_at", { ascending: true });

    if (error || !data?.length) return {};

    // Group: for each matchday keep the most recent capture (rows are ordered
    // ascending by capture time, so later writes overwrite earlier ones).
    const byMatchday = new Map<number, Map<string, { pct: number; pts: number }>>();
    for (const row of data as OddsRow[]) {
      if (!byMatchday.has(row.matchday)) byMatchday.set(row.matchday, new Map());
      byMatchday.get(row.matchday)!.set(row.player, {
        pct: row.title_odds,
        pts: row.expected_points ?? 0,
      });
    }

    // Build per-player series: Draft (synthetic) then each matchday
    const n = players.length || 6;
    const draftOdds = 1 / n;
    const sortedMDs = [...byMatchday.keys()].sort((a, b) => a - b);

    const result: Record<string, OddsHistoryPoint[]> = {};
    for (const player of players) {
      const series: OddsHistoryPoint[] = [];
      for (const md of sortedMDs) {
        const v = byMatchday.get(md)?.get(player);
        if (v !== undefined) series.push({ matchday: md, pct: v.pct, pts: v.pts });
      }
      // Synthetic draft point: equal odds; expected points anchored to the
      // earliest real snapshot (flat line back to draft) so the points view
      // has a defined starting value.
      const firstPts = series[0]?.pts ?? 0;
      result[player] = [{ matchday: -1, pct: draftOdds, pts: firstPts }, ...series];
    }
    return result;
  } catch (e) {
    console.error("[supabase] readOddsHistory threw:", e);
    return {};
  }
}
