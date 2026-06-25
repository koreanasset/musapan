// Runs the daily stock data brief from this PC (not from Vercel), so the
// outbound request hits Kiwoom's API from the IP address already
// registered in the Kiwoom developer portal.
//
// Usage: node --env-file=stock-brief.env scripts/run-stock-brief.mjs
// (run from the musapan/ project root so the relative env-file path resolves)

import { runStockBrief } from "./lib/stockBrief.js";

const required = ["KIWOOM_APP_KEY", "KIWOOM_APP_SECRET", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  console.error("Make sure to run with: node --env-file=stock-brief.env scripts/run-stock-brief.mjs");
  process.exit(1);
}

try {
  const result = await runStockBrief(process.env);
  console.log(new Date().toISOString(), JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.error(new Date().toISOString(), "FAILED:", err.message);
  process.exit(1);
}
