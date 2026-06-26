import { ALL_TEAMS, TeamSeed } from "../data/pool";
import { GroupFixture, KnockoutOdds, KNOCKOUT_STAGES } from "./types";
import { mulberry32, normalize3 } from "./probability";

// Deterministic mock odds so the whole app runs end-to-end before real WC
// markets exist on Kalshi. Strength is a stable per-team pseudo-rating; better
// teams get higher win probs and deeper knockout runs. This is NOT a prediction —
// it's scaffolding that the real Kalshi feed replaces.
const STRENGTH: Record<string, number> = {
  Spain: 0.92, France: 0.93, Argentina: 0.94, Brazil: 0.91, England: 0.9,
  Portugal: 0.88, Germany: 0.87, Netherlands: 0.86, Belgium: 0.82, Uruguay: 0.78,
  Croatia: 0.77, Morocco: 0.76, "United States": 0.7, Mexico: 0.72, Japan: 0.71,
  Switzerland: 0.68, Senegal: 0.69, Colombia: 0.74, Norway: 0.7, Austria: 0.66,
  Sweden: 0.62, "South Korea": 0.64, Ecuador: 0.63, "Ivory Coast": 0.6,
  Australia: 0.58, "Czech Republic": 0.6, Türkiye: 0.66, Egypt: 0.58, Canada: 0.6,
  Paraguay: 0.55, Iran: 0.57, "Saudi Arabia": 0.5, Scotland: 0.55, Tunisia: 0.52,
  "DR Congo": 0.5, Algeria: 0.54, Qatar: 0.48, Panama: 0.45, "Cape Verde": 0.4,
  Ghana: 0.55, Uzbekistan: 0.46, "South Africa": 0.47, Bosnia: 0.52, Iraq: 0.46,
  Jordan: 0.42, Haiti: 0.36, "New Zealand": 0.44, Curacao: 0.34,
};

function strength(team: string): number {
  return STRENGTH[team] ?? 0.5;
}

// Build a plausible set of remaining group fixtures by pairing pool teams.
// Pass current records so teams that have already played their group matches are
// excluded from rounds they no longer have remaining (each team plays 2 group
// games; a team with w+d+l=1 needs 1 more, w+d+l=2 needs none).
export function mockGroupFixtures(records?: TeamSeed[]): GroupFixture[] {
  const rng = mulberry32(42);
  const allTeams = ALL_TEAMS.map((t) => t.name);
  // Map team name → number of remaining group matches (max 2, min 0).
  const played = records
    ? new Map(records.map((r) => [r.name, r.w + r.d + r.l]))
    : null;
  const fixtures: GroupFixture[] = [];
  // Stagger kickoffs starting at noon today so the "Today" view has live-looking
  // matches and the rest spill across the coming days (mock scaffolding only).
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  let slot = 0;
  // Up to two remaining group matches per team; exclude teams that have already
  // played their quota for a given round index (0 = first remaining, 1 = second).
  for (let round = 0; round < 2; round++) {
    const eligible = allTeams.filter((t) => (played?.get(t) ?? 0) + round < 2);
    const shuffled = [...eligible].sort(() => rng() - 0.5);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const home = shuffled[i];
      const away = shuffled[i + 1];
      const sh = strength(home);
      const sa = strength(away);
      const total = sh + sa;
      const pHomeRaw = 0.15 + 0.7 * (sh / total);
      const pAwayRaw = 0.15 + 0.7 * (sa / total);
      const pDrawRaw = 0.28;
      // ~4 matches per day, every 3 hours, then roll to the next day's noon.
      const day = Math.floor(slot / 4);
      const hour = (slot % 4) * 3;
      const kickoff = new Date(start);
      kickoff.setDate(start.getDate() + day);
      kickoff.setHours(12 + hour);
      slot++;
      fixtures.push({
        id: `mock-${round}-${i}`,
        home,
        away,
        kickoff: kickoff.toISOString(),
        oddsHome: normalize3({ win: pHomeRaw, draw: pDrawRaw, loss: pAwayRaw }),
      });
    }
  }
  return fixtures;
}

// Build knockout reach probabilities consistent with a bracket: monotonically
// decreasing across rounds, scaled by team strength. This is fallback scaffolding
// used only when the real Kalshi reach markets are unavailable.
//
// When current group records are supplied we fold in form so the fallback stays
// sane mid-tournament: a team that has finished its group games with no points is
// treated as eliminated (reach 0) rather than being handed strength-based survival
// odds, and weaker group runs are damped. Without this, an eliminated team that
// scored nothing would still project knockout points.
export function mockKnockoutOdds(records?: TeamSeed[]): KnockoutOdds[] {
  const recMap = records ? new Map(records.map((r) => [r.name, r])) : null;
  // Infer the group format (games per team) from how many games the furthest-along
  // team has played, so "finished the group" adapts to the real schedule.
  const groupGames = recMap
    ? Math.max(2, ...[...recMap.values()].map((r) => r.w + r.d + r.l))
    : 0;

  return ALL_TEAMS.map((t) => {
    const s = strength(t.name);
    const rec = recMap?.get(t.name);
    const gp = rec ? rec.w + rec.d + rec.l : 0;
    const pts = rec ? rec.w * 3 + rec.d : 0;

    // A team that has played its full group slate with 0 points cannot advance.
    if (rec && gp >= groupGames && pts === 0) {
      const reach: Record<string, number> = {};
      for (const stage of KNOCKOUT_STAGES) reach[stage] = 0;
      return { team: t.name, reach };
    }

    // Form multiplier in [0.2, 1.15] from points-per-game so far (0 games → 1.0).
    const ppg = gp > 0 ? pts / gp : 1; // 0..3
    const form = gp > 0 ? Math.max(0.2, Math.min(1.15, 0.45 + ppg / 3)) : 1;

    const reachR32 = Math.min(0.97, (0.35 + s * 0.6) * form); // most strong teams advance
    const decay = 0.45 + s * 0.4; // stronger teams keep winning
    const reach: Record<string, number> = {};
    let p = reachR32;
    for (const stage of KNOCKOUT_STAGES) {
      reach[stage] = Math.max(0, Math.min(1, p));
      p *= decay; // P(reach next) ≈ P(reach this) * conditional win
    }
    return { team: t.name, reach };
  });
}
