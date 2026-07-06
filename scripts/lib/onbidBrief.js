import { generateThumbnail, uploadThumbnail, insertPost } from "./thumbnail.js";

const ONBID_BASE = "https://apis.data.go.kr/B010003";

// All 재산유형코드 values, comma-joined (the API documents this field as
// comma-separated for multi-select).
const PRPT_DIV_CODES = "0002,0003,0004,0005,0006,0007,0008,0010,0011,0013";

const KINDS = [
  { key: "realestate", label: "부동산", op: "OnbidRlstListSrvc2/getRlstCltrList2" },
  { key: "car", label: "차량", op: "OnbidCarListSrvc2/getCarCltrList2" },
  { key: "movable", label: "동산", op: "OnbidMvastListSrvc2/getMvastCltrList2" },
];

function dedupeKey(item) {
  return `${item.cltrMngNo}_${item.pbctCdtnNo}`;
}

// Keyed by cltrMngNo only (not the round-specific pbctCdtnNo): re-listings
// after another failed bid get a new pbctCdtnNo but are still the same
// underlying asset, which is what we don't want to repeat daily.
async function fetchAlreadyPostedKeys(env) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/onbid_posted_items?select=cltr_mng_no`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Error(`fetching posted items failed: ${await r.text()}`);
  const rows = await r.json();
  return new Set(rows.map(row => row.cltr_mng_no));
}

async function markItemsAsPosted(env, items) {
  if (items.length === 0) return;
  const rows = items.map(item => ({ cltr_mng_no: item.cltrMngNo, pbct_cdtn_no: item.pbctCdtnNo, last_posted_at: new Date().toISOString() }));
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/onbid_posted_items?on_conflict=cltr_mng_no`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`marking posted items failed: ${await r.text()}`);
}

async function cleanupOldPostedItems(env) {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/onbid_posted_items?last_posted_at=lt.${encodeURIComponent(cutoff)}`, {
    method: "DELETE",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
}

async function fetchKind(env, op, label) {
  const seen = new Map();
  // pvctTrgtYn (수의계약가능여부) is required and doesn't accept comma-joined
  // multi-values, so Y/N have to be queried separately.
  for (const pvctTrgtYn of ["N", "Y"]) {
    let page = 1;
    while (true) {
      const url = `${ONBID_BASE}/${op}?serviceKey=${env.ONBID_API_KEY}&pageNo=${page}&numOfRows=100&resultType=json&prptDivCd=${PRPT_DIV_CODES}&pvctTrgtYn=${pvctTrgtYn}&usbdNftStart=2`;
      const r = await fetch(url);
      const data = await r.json();
      if (data.result) throw new Error(`onbid ${label} API error: ${data.result.resultMsg}`);
      const raw = data.body?.items?.item;
      const list = !raw ? [] : Array.isArray(raw) ? raw : [raw];
      for (const item of list) seen.set(dedupeKey(item), item);
      const total = data.body?.totalCount || 0;
      if (list.length === 0 || page * 100 >= total) break;
      page += 1;
    }
  }
  // Only currently biddable listings (excludes 유찰 후 아직 재공고 준비중인 건).
  return [...seen.values()].filter(item => item.pbctStatCd === "0002");
}

function fmtDt(s) {
  if (!s || s.length < 12) return "-";
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

function fmtAmt(n) {
  return n ? `${Number(n).toLocaleString()}원` : "-";
}

function listItem(item) {
  const name = item.onbidCltrNm || item.prptNm || "물건명 미상";
  const location = [item.lctnSdnm, item.lctnSggnm, item.lctnEmdNm].filter(Boolean).join(" ") || "-";
  const lowstBidPrc = /^\d+$/.test(String(item.lowstBidPrcIndctCont)) ? fmtAmt(item.lowstBidPrcIndctCont) : (item.lowstBidPrcIndctCont || "-");
  const thumbnail = item.thnlImgUrlAdr ? `<img src="${item.thnlImgUrlAdr}" alt="${name}" style="max-width:220px;display:block;margin-bottom:8px;">` : "";
  return `<div style="margin:16px 0;">
${thumbnail}<strong>${name}</strong> (유찰 ${item.usbdNft}회)
<br>소재지: ${location} | 감정가: ${fmtAmt(item.apslEvlAmt)} | 최저입찰가: ${lowstBidPrc}
<br>입찰기간: ${fmtDt(item.cltrBidBgngDt)} ~ ${fmtDt(item.cltrBidEndDt)}
<br>물건관리번호: ${item.cltrMngNo} (온비드 통합검색에서 이 번호로 조회하시면 상세정보를 확인하실 수 있습니다)
</div>
<hr style="border:none;border-top:2px solid #9ca3af;margin:8px 0;">`;
}

function buildDataIntro(byKind, dateLabel) {
  const kindStats = KINDS
    .map(({ key, label }) => ({ label, items: byKind[key] || [] }))
    .filter(({ items }) => items.length > 0);

  const total = kindStats.reduce((s, { items }) => s + items.length, 0);
  const kindSummary = kindStats.map(({ label, items }) => `${label} ${items.length}건`).join(", ");

  const allItems = kindStats.flatMap(({ items }) => items);
  const maxFailed = Math.max(...allItems.map(i => Number(i.usbdNft) || 0));

  // Top 2 시도 by item count
  const regionCounts = {};
  for (const item of allItems) {
    const r = item.lctnSdnm;
    if (r) regionCounts[r] = (regionCounts[r] || 0) + 1;
  }
  const topRegions = Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  let text = `${dateLabel} 기준으로 오늘 처음 소개되는 공매물건은 총 ${total}건(${kindSummary})입니다.`;
  if (topRegions.length > 0) {
    text += ` 지역별로는 ${topRegions.join("·")} 소재 물건이 가장 많이 포함됐으며,`;
  }
  text += ` 유찰 횟수는 최대 ${maxFailed}회에 달하는 물건도 있습니다.`;
  text += ` 유찰이 반복될수록 최저입찰가가 낮아지는 경향이 있어 실수요자·투자자 모두 눈여겨볼 만한 물건들입니다.`;

  return `<p>${text}</p>`;
}

function buildContent(byKind, dateLabel) {
  const intro = `${buildDataIntro(byKind, dateLabel)}
<p>아래 내용은 특정 물건에 대한 매수·입찰 권유가 아니며, 권리관계나 현장 상태 등 자세한 내용은 <a href="https://www.onbid.co.kr" rel="noopener">온비드 사이트(www.onbid.co.kr)</a>에서 물건관리번호로 직접 검색하여 확인하시길 권장드립니다.</p>
<p>본 정보에서는 부동산 공매정보, 차량 공매정보, 동산 공매정보를 제공 하며, 매일 매일 물건이 업로드 되니 본 사이트를 즐겨찾기 해두시고 정보를 받아 가시기 바랍니다.</p>`;

  const sections = KINDS
    .filter(({ key }) => byKind[key] && byKind[key].length > 0)
    .map(({ key, label }) => `<h2>${label} (유찰 2회 이상, ${byKind[key].length}건)</h2>\n${byKind[key].map(listItem).join("\n")}`)
    .join("\n");

  return `${intro}\n${sections}`;
}

export async function runOnbidBrief(env) {
  const botAuthorId = env.STOCK_BRIEF_AUTHOR_ID || "901a0ce8-d52d-42dc-bc92-536e84273df2";
  const maxPerKind = 20;

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateLabel = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;

  const alreadyPosted = await fetchAlreadyPostedKeys(env);

  const byKind = {};
  for (const { key, label, op } of KINDS) {
    const items = await fetchKind(env, op, label);
    // Most heavily failed-on-bid items first.
    items.sort((a, b) => (b.usbdNft || 0) - (a.usbdNft || 0));
    // Skip items already featured in a previous day's brief (still unsold,
    // would otherwise repeat every day until someone wins the bid).
    const newItems = items.filter(item => !alreadyPosted.has(item.cltrMngNo));
    byKind[key] = newItems.slice(0, maxPerKind);
  }

  await cleanupOldPostedItems(env);

  const totalCount = Object.values(byKind).reduce((sum, list) => sum + list.length, 0);
  if (totalCount === 0) {
    return { skipped: true, reason: "no new items with usbdNft >= 2 today (all already featured previously)" };
  }

  const content = buildContent(byKind, dateLabel);
  const thumbnailTitle = "유찰 2회 이상 공매물건";
  const title = `[공매정보] ${dateLabel} 온비드 유찰 2회이상 공매물건`;

  let thumbnailUrl = null;
  try {
    const pngBuffer = await generateThumbnail(dateLabel, thumbnailTitle, { heading: "코리안에셋 공매정보" });
    thumbnailUrl = await uploadThumbnail(env, pngBuffer, `onbid-${kst.toISOString().slice(0, 10)}.png`);
  } catch {
    thumbnailUrl = null;
  }

  await insertPost(env, {
    category: "realestate",
    subcategory: "경매, 공매",
    title,
    content,
    thumbnailUrl,
    authorId: botAuthorId,
  });

  await markItemsAsPosted(env, Object.values(byKind).flat());

  return { success: true, title, totalCount, thumbnailUrl };
}
