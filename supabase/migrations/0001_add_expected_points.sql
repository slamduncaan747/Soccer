-- Track expected final points alongside title odds in the history snapshots
-- powering the Odds tab chart. The app self-heals if this column is missing
-- (it falls back to storing odds only), but expected-points tracking does not
-- begin until this runs.
ALTER TABLE public.wc26_odds_snapshots
  ADD COLUMN IF NOT EXISTS expected_points real;
