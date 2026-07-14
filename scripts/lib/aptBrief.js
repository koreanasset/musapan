import { generateThumbnail, uploadThumbnail, insertPost } from "./thumbnail.js";
import { pickVariant } from "./textVariants.js";

const OPENAPI_BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail";
const SUBSCRIPTION_LOOKBACK_DAYS = 45;

function todayKstStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function fetchApt(apiKey, condParams) {
  const all = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ page, perPage: 100, serviceKey: apiKey });
    for (const [field, op, value] of condParams) {
      params.set(`cond[${field}::${op}]`, value);
    }
    const r = await fetch(`${OPENAPI_BASE}?${params.toString()}`);
    const data = await r.json();
    if (data.code) throw new Error(`odcloud API error: ${data.code} ${data.msg}`);
    all.push(...(data.data || []));
    if (data.data.length < 100) break;
    page += 1;
  }
  return all;
}

function fetchByAnnouncementDate(apiKey, dateStr) {
  return fetchApt(apiKey, [["RCRIT_PBLANC_DE", "EQ", dateStr]]);
}

async function fetchBySubscriptionStartDate(apiKey, dateStr) {
  const windowStart = addDaysStr(dateStr, -SUBSCRIPTION_LOOKBACK_DAYS);
  const items = await fetchApt(apiKey, [
    ["RCRIT_PBLANC_DE", "GTE", windowStart],
    ["RCRIT_PBLANC_DE", "LTE", dateStr],
  ]);
  return items.filter(d => d.RCEPT_BGNDE === dateStr);
}

function fmtCount(n) {
  return n ? `${Number(n).toLocaleString()}세대` : "세대수 미정";
}

function listItem(d, { showPeriod }) {
  const period = showPeriod ? `<br>청약접수: ${d.RCEPT_BGNDE || "-"} ~ ${d.RCEPT_ENDDE || "-"}` : "";
  return `<h2>${d.HOUSE_NM} (${d.SUBSCRPT_AREA_CODE_NM})</h2>
<p>위치: ${d.HSSPLY_ADRES || "정보 없음"}
<br>공급규모: ${fmtCount(d.TOT_SUPLY_HSHLDCO)} | 시행사: ${d.BSNS_MBY_NM || "-"} | 시공사: ${d.CNSTRCT_ENTRPS_NM || "-"}${period}
<br>모집공고일: ${d.RCRIT_PBLANC_DE || "-"} | 당첨자발표일: ${d.PRZWNER_PRESNATN_DE || "-"} | 입주예정월: ${d.MVN_PREARNGE_YM || "-"}
<br><a href="${d.PBLANC_URL || "https://www.applyhome.co.kr"}" target="_blank" rel="noopener noreferrer">[공고 원문보기]</a></p>`;
}

const ANNOUNCEMENT_OPENING_VARIANTS = [
  dateLabel => `${dateLabel} 새로 공고된 아파트 분양 정보를 자동으로 정리해드립니다.`,
  dateLabel => `${dateLabel}에 모집공고가 새로 게시된 아파트 분양단지를 모아봤습니다.`,
  dateLabel => `오늘(${dateLabel}) 기준 신규 분양 모집공고를 정리해드립니다.`,
  dateLabel => `${dateLabel} 분양정보 업데이트 — 오늘 새로 공고된 단지는 아래와 같습니다.`,
];

const SUBSCRIPTION_OPENING_VARIANTS = [
  dateLabel => `${dateLabel} 청약접수가 시작되는 단지를 자동으로 정리해드립니다.`,
  dateLabel => `${dateLabel}부터 청약 신청을 받는 아파트 단지를 모아봤습니다.`,
  dateLabel => `오늘(${dateLabel}) 기준 청약접수 개시 단지를 정리해드립니다.`,
  dateLabel => `${dateLabel} 청약정보 업데이트 — 오늘부터 접수가 시작되는 단지는 아래와 같습니다.`,
];

const DISCLAIMER_VARIANTS = [
  () => `한국부동산원 청약홈 공공데이터를 기준으로 하며, 특정 단지에 대한 청약 권유가 아닙니다. 정확한 내용은 [공고 원문보기]에서 직접 확인하시길 권장드립니다.`,
  () => `이 정보는 한국부동산원 청약홈 공공데이터를 바탕으로 자동 정리된 것으로, 특정 단지의 청약을 권유하는 것은 아닙니다. 세부 내용은 [공고 원문보기]에서 직접 확인해보시기 바랍니다.`,
  () => `특정 단지를 추천드리는 게 아니라 한국부동산원 청약홈 공공데이터를 정리해서 전달드리는 취지입니다. 정확한 내용은 [공고 원문보기]에서 확인하시길 권장드립니다.`,
];

function buildContent(items, dateLabel, mode) {
  const openingVariants = mode === "announcement" ? ANNOUNCEMENT_OPENING_VARIANTS : SUBSCRIPTION_OPENING_VARIANTS;
  const opening = pickVariant(openingVariants, dateLabel + mode)(dateLabel);
  const disclaimer = pickVariant(DISCLAIMER_VARIANTS, dateLabel + mode + "disclaimer")();
  const intro = `<p>${opening} ${disclaimer}</p>`;

  const rows = items.map(d => listItem(d, { showPeriod: mode === "announcement" })).join("\n");
  return `${intro}\n${rows}`;
}

async function postBrief(env, { items, dateLabel, mode, titleSuffix, thumbnailTitle }) {
  const botAuthorId = env.STOCK_BRIEF_AUTHOR_ID || "901a0ce8-d52d-42dc-bc92-536e84273df2";
  const content = buildContent(items, dateLabel, mode);
  const title = `[분양정보] ${dateLabel} ${titleSuffix}`;

  let thumbnailUrl = null;
  try {
    const pngBuffer = await generateThumbnail(dateLabel, thumbnailTitle, { heading: "코리안에셋 분양정보" });
    thumbnailUrl = await uploadThumbnail(env, pngBuffer, `apt-${mode}-${dateLabel}.png`);
  } catch {
    thumbnailUrl = null;
  }

  await insertPost(env, {
    category: "realestate",
    subcategory: "분양정보",
    title,
    content,
    thumbnailUrl,
    authorId: botAuthorId,
  });

  return { success: true, title, count: items.length, thumbnailUrl };
}

export async function runAnnouncementBrief(env) {
  const dateStr = env.APT_DATE_OVERRIDE || todayKstStr();
  const dateLabel = dateStr.replace(/-/g, ".");
  const items = await fetchByAnnouncementDate(env.REB_APT_API_KEY, dateStr);

  if (items.length === 0) {
    return { skipped: true, reason: "no new announcements today" };
  }

  return postBrief(env, {
    items,
    dateLabel,
    mode: "announcement",
    titleSuffix: "오늘의 분양 모집공고",
    thumbnailTitle: "오늘의 분양 모집공고",
  });
}

export async function runSubscriptionBrief(env) {
  const dateStr = env.APT_DATE_OVERRIDE || todayKstStr();
  const dateLabel = dateStr.replace(/-/g, ".");
  const items = await fetchBySubscriptionStartDate(env.REB_APT_API_KEY, dateStr);

  if (items.length === 0) {
    return { skipped: true, reason: "no subscriptions starting today" };
  }

  return postBrief(env, {
    items,
    dateLabel,
    mode: "subscription",
    titleSuffix: "오늘의 청약접수 시작 단지",
    thumbnailTitle: "오늘의 청약접수 시작 단지",
  });
}
