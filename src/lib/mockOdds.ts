import { ALL_TEAMS } from "../data/pool";
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
export function mockGroupFixtures(): GroupFixture[] {
  const rng = mulberry32(42);
  const teams = ALL_TEAMS.map((t) => t.name);
  const fixtures: GroupFixture[] = [];
  // Stagger kickoffs starting at noon today so the "Today" view has live-looking
  // matches and the rest spill across the coming days (mock scaffolding only).
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  let slot = 0;
  // Two remaining group matches per team, paired round-robin-ish.
  for (let round = 0; round < 2; round++) {
    const shuffled = [...teams].sort(() => rng() - 0.5);
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
// decreasing across rounds, scaled by team strength.
export function mockKnockoutOdds(): KnockoutOdds[] {
  return ALL_TEAMS.map((t) => {
    const s = strength(t.name);
    const reachR32 = Math.min(0.97, 0.35 + s * 0.6); // most strong teams advance
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
