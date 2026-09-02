// Snapshots the full KOSPI+KOSDAQ quote list once, after market close, for
// the "오늘주식시세" board (see lib/stockQuotes.js for why pagination gets
// every stock, not just top movers).
// Usage: node --env-file=stock-brief.env scripts/run-stock-quotes.mjs

import { runStockQuotes } from "./lib/stockQuotes.js";

const required = ["KIWOOM_APP_KEY", "KIWOOM_APP_SECRET", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  const result = await runStockQuotes(process.env);
  console.log(new Date().toISOString(), JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.error(new Date().toISOString(), "FAILED:", err.message);
  process.exit(1);
}
