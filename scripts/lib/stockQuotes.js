// Builds the "오늘주식시세" board: a full KOSPI+KOSDAQ quote snapshot taken
// once after market close (not a live/intraday feed — see run-stock-quotes.mjs).
//
// ka10027 ("전일대비등락률상위요청") is a *ranking* endpoint by name, but its
// cont-yn/next-key pagination keeps returning rows past the "top" ones all
// the way through the whole market (verified by inspection) — so paginating
// it fully is how we get literally every listed stock's quote, not just the
// top movers. See lib/stockBrief.js for the sibling script that only reads
// the first page of this same endpoint for its top-5 rankings.

const KIWOOM_BASE = "https://api.kiwoom.com";
const MARKET_CODES = ["0", "101"]; // "0" ~ 코스피 (loosely; see classify()), "101" = 코스닥
const PAGE_DELAY_MS = 1000; // pacing between pages to stay under Kiwoom's rate limit (saw a 429 after ~6 back-to-back calls with no delay)
const MAX_PAGES_PER_MARKET = 25; // 200 rows/page; generous headroom over the ~1000-1800 rows/market this actually returns

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

async function fetchPage(token, mrkt_tp, contYn, nextKey) {
  const r = await fetch(`${KIWOOM_BASE}/api/dostk/rkinfo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "api-id": "ka10027",
      "cont-yn": contYn,
      "next-key": nextKey || "",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mrkt_tp,
      sort_tp: "1",
      mang_stk_incls: "0",
      crd_cnd: "0",
      trde_qty_cnd: "0",
      pric_cnd: "0",
      trde_prica_cnd: "0",
      mrkt_open_tp: "0",
      stex_tp: "3",
      updown_incls: "0",
      stk_cnd: "0",
    }),
  });
  return { status: r.status, respContYn: r.headers.get("cont-yn"), respNextKey: r.headers.get("next-key"), data: r.status === 200 ? await r.json() : null };
}

async function fetchAllForMarket(token, mrkt_tp, log) {
  const rows = [];
  let contYn = "N";
  let nextKey = "";
  for (let page = 0; page < MAX_PAGES_PER_MARKET; page++) {
    let result = await fetchPage(token, mrkt_tp, contYn, nextKey);
    for (let attempt = 0; result.status === 429 && attempt < 3; attempt++) {
      // Exponential backoff (4s/8s/16s) before retrying this same page.
      await sleep(4000 * 2 ** attempt);
      result = await fetchPage(token, mrkt_tp, contYn, nextKey);
    }
    if (result.status !== 200 || !result.data) {
      log?.(`mrkt_tp=${mrkt_tp} page=${page} gave up after status=${result.status}`);
      break;
    }

    rows.push(...(result.data.pred_pre_flu_rt_upper || []));
    if (result.respContYn !== "Y" || !result.respNextKey) break;
    contYn = "Y";
    nextKey = result.respNextKey;
    await sleep(PAGE_DELAY_MS);
  }
  return rows;
}

function cleanCode(stk_cd) {
  return String(stk_cd || "").split("_")[0];
}

// flu_rt/pred_pre come back as signed strings ("+209", "-1500") — Number()
// parses the leading sign correctly, giving both the true price direction
// and magnitude in one step (cur_prc's sign prefix is the same convention
// but the price itself is always positive, so that one gets abs()'d).
function toQuoteRow(s, market) {
  return {
    stk_cd: cleanCode(s.stk_cd),
    stk_nm: String(s.stk_nm || "").trim(),
    market,
    cur_prc: Math.abs(Number(s.cur_prc)) || 0,
    pred_pre: Number(s.pred_pre) || 0,
    flu_rt: Number(s.flu_rt) || 0,
    trde_qty: Number(s.now_trde_qty) || 0,
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

// Stocks that dropped off the market (delisted) since the last run would
// otherwise linger forever with a stale price; delete anything this run
// didn't just touch.
async function deleteStale(env, keptCodes, cutoffIso) {
  if (keptCodes.length === 0) return; // safety: never wipe the whole table on a failed run
  await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/stock_quotes?updated_at=lt.${encodeURIComponent(cutoffIso)}`, {
    method: "DELETE",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
}

export async function runStockQuotes(env) {
  const startedAt = new Date().toISOString();
  const token = await getKiwoomToken(env);

  const rawByMarket = [];
  for (const code of MARKET_CODES) {
    rawByMarket.push(await fetchAllForMarket(token, code, msg => console.log(msg)));
    await sleep(PAGE_DELAY_MS);
  }
  const [raw0, raw101] = rawByMarket;

  if (raw0.length === 0 && raw101.length === 0) {
    return { skipped: true, reason: "no market data (holiday or closed)" };
  }

  // mrkt_tp="0" isn't cleanly KOSPI-only (can include KOSDAQ names too);
  // mrkt_tp="101" is reliably KOSDAQ-scoped, so use it as the authoritative
  // KOSDAQ set and classify everything else as KOSPI (same technique as
  // lib/stockBrief.js).
  const kosdaqCodes = new Set(raw101.map(s => cleanCode(s.stk_cd)));

  const merged = new Map();
  for (const s of [...raw0, ...raw101]) {
    const code = cleanCode(s.stk_cd);
    if (merged.has(code)) continue;
    const market = kosdaqCodes.has(code) ? "코스닥" : "코스피";
    merged.set(code, toQuoteRow(s, market));
  }

  const rows = [...merged.values()];
  await upsertQuotes(env, rows);
  await deleteStale(env, rows.map(r => r.stk_cd), startedAt);

  return { success: true, count: rows.length, kospi: rows.filter(r => r.market === "코스피").length, kosdaq: rows.filter(r => r.market === "코스닥").length };
}
