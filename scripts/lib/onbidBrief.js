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
<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0;">`;
}

function buildContent(byKind, dateLabel) {
  const intro = `<p>${dateLabel} 기준 온비드(Onbid)에 등록된 공매물건 중 유찰이 2회 이상 발생한 물건 상위 20건을 자동으로 정리해드립니다. 유찰이 반복된 물건은 회차가 지날수록 최저입찰가가 낮아지는 경우가 많아 투자 관심이 높은 편입니다.</p>
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

  const byKind = {};
  for (const { key, label, op } of KINDS) {
    const items = await fetchKind(env, op, label);
    // Most heavily failed-on-bid items first.
    items.sort((a, b) => (b.usbdNft || 0) - (a.usbdNft || 0));
    byKind[key] = items.slice(0, maxPerKind);
  }

  const totalCount = Object.values(byKind).reduce((sum, list) => sum + list.length, 0);
  if (totalCount === 0) {
    return { skipped: true, reason: "no items with usbdNft >= 2 today" };
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

  return { success: true, title, totalCount, thumbnailUrl };
}
