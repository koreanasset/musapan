// Runs the daily DART disclosure brief from this PC.
// Usage: node --env-file=stock-brief.env scripts/run-disclosure-brief.mjs

import { runDisclosureBrief } from "./lib/disclosureBrief.js";

const required = ["DART_API_KEY", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  const result = await runDisclosureBrief(process.env);
  console.log(new Date().toISOString(), JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.error(new Date().toISOString(), "FAILED:", err.message);
  process.exit(1);
}
