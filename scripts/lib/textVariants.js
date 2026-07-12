// Deterministic phrasing rotation for auto-generated post boilerplate.
// Same date always picks the same variant (reproducible for manual re-runs /
// backfills), but different days land on different phrasing so daily posts
// don't read as copy-pasted templates.
export function pickVariant(variants, seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return variants[hash % variants.length];
}
