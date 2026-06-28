// Runs daily at 09:00 — posts apartments whose subscription (청약접수) opens today.
// Usage: node --env-file=stock-brief.env scripts/run-apt-subscription.mjs

import { runSubscriptionBrief } from "./lib/aptBrief.js";

const required = ["REB_APT_API_KEY", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  const result = await runSubscriptionBrief(process.env);
  console.log(new Date().toISOString(), JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.error(new Date().toISOString(), "FAILED:", err.message);
  process.exit(1);
}
