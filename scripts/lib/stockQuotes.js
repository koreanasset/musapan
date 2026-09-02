// Builds the "오늘주식시세" board: a full KOSPI+KOSDAQ quote snapshot taken
// once after market close (not a live/intraday feed — see run-stock-quotes.mjs).
//
// Earlier version paginated Kiwoom's ka10027 ranking endpoint, assuming
// "keep paging until it stops" reached every listed stock. It didn't: a
// stock up +6.87% that day (팬스타엔터프라이즈) never showed up no matter
// how far pagination went, and total coverage swung wildly run to run
// (1714 vs 739 rows) because a *ranking* endpoint only surfaces however
// many stocks Kiwoom's backend decides to rank that day — not "everyone".
//
// This version instead:
//   1. Pulls the authoritative full stock list per market from ka10099
//      (one call each for KOSPI/거래소 and KOSDAQ — no pagination needed,
//      no ranking involved, so no coverage gaps).
//   2. Looks up each stock's actual quote individually via ka10001, which
//      is what confirmed 팬스타엔터프라이즈's real price/change/volume.
// It's ~4,300 calls instead of ~15, so it trades a couple of minutes for
// genuine completeness — fine for a once-a-day after-close snapshot.

const KIWOOM_BASE = "https://api.kiwoom.com";
// ka10099 market codes: "0" = 코스피(거래소, also carries ETFs/ETNs/리츠),
// "10" = 코스닥. (Different convention from ka10027's "0"/"101" — verified
// by inspection; "101" returns nothing on ka10099.)
const MASTER_LIST_MARKETS = [{ code: "0", market: "코스피" }, { code: "10", market: "코스닥" }];
const QUOTE_DELAY_MS = 450; // ~2.2 req/s; a 0-delay burst test failed on the 8th call
const BREATHER_EVERY = 200; // extra pause every N calls as a margin against any sliding-window limit
const BREATHER_MS = 3000;
const MAX_RETRIES_PER_QUOTE = 4;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getKiwoomToken(env) {
  const r = await fetch(`${KIWOOM_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: env.KIWOOM_APP_KEY,
      secretkey: env.KIWOOM_APP_SECRET,
    }),
  });
  const data = await r.json();
  if (!data.token) throw new Error(`Kiwoom token issue failed: ${JSON.stringify(data)}`);
  return data.token;
}

async function fetchMasterList(token, mrkt_tp) {
  const r = await fetch(`${KIWOOM_BASE}/api/dostk/stkinfo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "api-id": "ka10099",
      "cont-yn": "N",
      "next-key": "",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mrkt_tp }),
  });
  if (r.status !== 200) throw new Error(`ka10099 mrkt_tp=${mrkt_tp} failed: status ${r.status}`);
  const data = await r.json();
  return data.list || [];
}

async function fetchQuoteOnce(token, stk_cd) {
  const r = await fetch(`${KIWOOM_BASE}/api/dostk/stkinfo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "api-id": "ka10001",
      "cont-yn": "N",
      "next-key": "",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ stk_cd }),
  });
  return { status: r.status, data: r.status === 200 ? await r.json() : null };
}

async function fetchQuote(token, stk_cd, log) {
  let result = await fetchQuoteOnce(token, stk_cd);
  for (let attempt = 0; result.status !== 200 && attempt < MAX_RETRIES_PER_QUOTE; attempt++) {
    await sleep(2000 * 2 ** attempt); // 2s/4s/8s/16s
    result = await fetchQuoteOnce(token, stk_cd);
  }
  if (result.status !== 200 || !result.data || result.data.return_code !== 0) {
    log?.(`stk_cd=${stk_cd} quote failed after retries (status=${result.status})`);
    return null;
  }
  return result.data;
}

// cur_prc/pred_pre carry a sign PREFIX indicating today's direction, not
// that the value itself is negative — the price is always positive.
function toQuoteRow(stk_cd, stk_nm, market, q) {
  return {
    stk_cd,
    stk_nm,
    market,
    cur_prc: Math.abs(Number(q.cur_prc)) || 0,
    pred_pre: Number(q.pred_pre) || 0,
    flu_rt: Number(q.flu_rt) || 0,
    trde_qty: Number(q.trde_qty) || 0,
  };
}

async function upsertQuotes(env, rows) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map(r => ({ ...r, updated_at: new Date().toISOString() }));
    const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/stock_quotes?on_conflict=stk_cd`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) throw new Error(`stock_quotes upsert failed: ${await r.text()}`);
  }
}

// Deletes rows for codes no longer in today's authoritative master list
// (real delistings) — safe regardless of how many quote lookups succeeded
// this run, since it's driven by the master list, not by "what did we
// manage to fetch today". A stock that's still listed but whose quote
// lookup merely failed today just keeps yesterday's price untouched.
async function deleteDelisted(env, currentCodes) {
  if (currentCodes.length === 0) return; // safety: never wipe the table if the master list pull itself failed
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/stock_quotes?select=stk_cd`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Error(`fetching existing codes failed: ${await r.text()}`);
  const existing = (await r.json()).map(row => row.stk_cd);
  const currentSet = new Set(currentCodes);
  const toDelete = existing.filter(code => !currentSet.has(code));
  if (toDelete.length === 0) return;

  const CHUNK = 200;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const batch = toDelete.slice(i, i + CHUNK);
    await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/stock_quotes?stk_cd=in.(${batch.join(",")})`, {
      method: "DELETE",
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
  }
  return toDelete.length;
}

export async function runStockQuotes(env) {
  const token = await getKiwoomToken(env);

  const masterEntries = [];
  for (const { code, market } of MASTER_LIST_MARKETS) {
    const list = await fetchMasterList(token, code);
    for (const s of list) masterEntries.push({ stk_cd: s.code, stk_nm: s.name, market });
    await sleep(1000);
  }

  if (masterEntries.length === 0) {
    return { skipped: true, reason: "no market data (holiday or closed, or master list pull failed)" };
  }

  const rows = [];
  const failedCodes = [];
  for (let i = 0; i < masterEntries.length; i++) {
    const { stk_cd, stk_nm, market } = masterEntries[i];
    const q = await fetchQuote(token, stk_cd, msg => console.log(msg));
    if (q) rows.push(toQuoteRow(stk_cd, stk_nm, market, q));
    else failedCodes.push(stk_cd);

    if ((i + 1) % BREATHER_EVERY === 0) {
      console.log(`progress: ${i + 1}/${masterEntries.length} (${failedCodes.length} failed so far)`);
      await sleep(BREATHER_MS);
    } else {
      await sleep(QUOTE_DELAY_MS);
    }
  }

  await upsertQuotes(env, rows);
  const deletedCount = await deleteDelisted(env, masterEntries.map(e => e.stk_cd));

  return {
    success: true,
    total: masterEntries.length,
    fetched: rows.length,
    failed: failedCodes.length,
    deleted: deletedCount || 0,
    kospi: rows.filter(r => r.market === "코스피").length,
    kosdaq: rows.filter(r => r.market === "코스닥").length,
  };
}
