// Runs daily at 12:00 — posts apartments newly announced (모집공고일) today.
// Usage: node --env-file=stock-brief.env scripts/run-apt-announcement.mjs

import { runAnnouncementBrief } from "./lib/aptBrief.js";

const required = ["REB_APT_API_KEY", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  const result = await runAnnouncementBrief(process.env);
  console.log(new Date().toISOString(), JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.error(new Date().toISOString(), "FAILED:", err.message);
  process.exit(1);
}
