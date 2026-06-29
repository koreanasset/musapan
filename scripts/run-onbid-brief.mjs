// Runs the daily Onbid auction brief (유찰 2회 이상 물건) from this PC.
// Usage: node --env-file=stock-brief.env scripts/run-onbid-brief.mjs

import { runOnbidBrief } from "./lib/onbidBrief.js";

const required = ["ONBID_API_KEY", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  const result = await runOnbidBrief(process.env);
  console.log(new Date().toISOString(), JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.error(new Date().toISOString(), "FAILED:", err.message);
  process.exit(1);
}
