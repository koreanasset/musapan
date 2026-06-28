import { generateThumbnail, uploadThumbnail, insertPost } from "./thumbnail.js";

const ODCLOUD_BASE = "https://api.odcloud.kr/api/15101046/v1/uddi:14a46595-03dd-47d3-a418-d64e52820598";

function todayKstStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

async function fetchByDateField(apiKey, fieldName, dateStr) {
  const all = [];
  let page = 1;
  while (true) {
    const cond = encodeURIComponent(`[${fieldName}::EQ]`);
    const url = `${ODCLOUD_BASE}?page=${page}&perPage=100&serviceKey=${apiKey}&cond${cond}=${dateStr}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.code) throw new Error(`odcloud API error: ${data.code} ${data.msg}`);
    all.push(...(data.data || []));
    if (data.data.length < 100) break;
    page += 1;
  }
  return all;
}

function fmtCount(n) {
  return n ? `${Number(n).toLocaleString()}세대` : "세대수 미정";
}

function listItem(d, { showPeriod }) {
  const period = showPeriod ? `<br>청약접수: ${d.청약접수시작일 || "-"} ~ ${d.청약접수종료일 || "-"}` : "";
  return `<h2>${d.주택명} (${d.공급지역명})</h2>
<p>위치: ${d.공급위치 || "정보 없음"}
<br>공급규모: ${fmtCount(d.공급규모)} | 시행사: ${d.사업주체명_시행사 || "-"} | 시공사: ${d.건설업체명_시공사 || "-"}${period}
<br>모집공고일: ${d.모집공고일 || "-"} | 당첨자발표일: ${d.당첨자발표일 || "-"} | 입주예정월: ${d.입주예정월 || "-"}
<br><a href="${d.모집공고홈페이지주소 || "https://www.applyhome.co.kr"}" target="_blank" rel="noopener noreferrer">[공고 원문보기]</a></p>`;
}

function buildContent(items, dateLabel, mode) {
  const intro = mode === "announcement"
    ? `<p>${dateLabel} 새로 공고된 아파트 분양 정보를 자동으로 정리해드립니다. 한국부동산원 청약홈 공공데이터를 기준으로 하며, 특정 단지에 대한 청약 권유가 아닙니다. 정확한 내용은 [공고 원문보기]에서 직접 확인하시길 권장드립니다.</p>`
    : `<p>${dateLabel} 청약접수가 시작되는 단지를 자동으로 정리해드립니다. 한국부동산원 청약홈 공공데이터를 기준으로 하며, 특정 단지에 대한 청약 권유가 아닙니다. 정확한 내용은 [공고 원문보기]에서 직접 확인하시길 권장드립니다.</p>`;

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
  const items = await fetchByDateField(env.REB_APT_API_KEY, "모집공고일", dateStr);

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
  const items = await fetchByDateField(env.REB_APT_API_KEY, "청약접수시작일", dateStr);

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
