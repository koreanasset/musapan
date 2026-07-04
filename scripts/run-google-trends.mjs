// Keeps the "최신 구글 트렌드 순위" sidebar widget in sync with Google's Daily
// Search Trends feed for Korea. Runs every ~30 minutes via Task Scheduler,
// but only writes when the top-10 ranking actually changed.
// Usage: node --env-file=stock-brief.env scripts/run-google-trends.mjs

import { runGoogleTrendsUpdate } from "./lib/googleTrends.js";

const required = ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  const result = await runGoogleTrendsUpdate(process.env);
  console.log(new Date().toISOString(), JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.error(new Date().toISOString(), "FAILED:", err.message);
  process.exit(1);
}
