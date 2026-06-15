import { createClient } from "@supabase/supabase-js";
import type { PlayerProjection } from "./types";

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
}

// ── write a snapshot (server-side only, called from orchestrator) ─
// Deduplicates: skips write if a snapshot for this matchday already
// exists that was captured within the last 60 minutes.
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
      if (ageMs < 60 * 60 * 1000) {
        // Less than 1 hour since last snapshot for this matchday — skip.
        return;
      }
    }

    const rows = players.map((p) => ({
      matchday,
      player: p.player,
      title_odds: p.pFirst,
    }));

    const { error } = await supabase.from("wc26_odds_snapshots").insert(rows);
    if (error) console.error("[supabase] snapshotOdds error:", error.message);
  } catch (e) {
    console.error("[supabase] snapshotOdds threw:", e);
  }
}

// ── read odds history for the chart ──────────────────────────────
// Returns one array entry per player, each with an array of
// { matchday, pct } data points ordered Draft → Now.
// Always prepends a synthetic "Draft" point (equal 1/n odds).
export async function readOddsHistory(
  players: string[]
): Promise<Record<string, { matchday: number; pct: number }[]>> {
  try {
    // Fetch the most recent snapshot per matchday (distinct on matchday)
    const { data, error } = await supabase
      .from("wc26_odds_snapshots")
      .select("matchday, player, title_odds, captured_at")
      .in("player", players)
      .order("captured_at", { ascending: true });

    if (error || !data?.length) return {};

    // Group: for each matchday keep the most recent capture
    const byMatchday = new Map<number, Map<string, number>>();
    for (const row of data) {
      if (!byMatchday.has(row.matchday)) byMatchday.set(row.matchday, new Map());
      byMatchday.get(row.matchday)!.set(row.player, row.title_odds);
    }

    // Build per-player series: Draft (synthetic) then each matchday
    const n = players.length || 6;
    const draftOdds = 1 / n;
    const sortedMDs = [...byMatchday.keys()].sort((a, b) => a - b);

    const result: Record<string, { matchday: number; pct: number }[]> = {};
    for (const player of players) {
      result[player] = [{ matchday: -1, pct: draftOdds }]; // synthetic Draft point
      for (const md of sortedMDs) {
        const odds = byMatchday.get(md)?.get(player);
        if (odds !== undefined) result[player].push({ matchday: md, pct: odds });
      }
    }
    return result;
  } catch (e) {
    console.error("[supabase] readOddsHistory threw:", e);
    return {};
  }
}
