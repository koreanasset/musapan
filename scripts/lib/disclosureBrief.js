import { generateThumbnail, uploadThumbnail, insertPost } from "./thumbnail.js";
import { pickVariant } from "./textVariants.js";

const DART_BASE = "https://opendart.fss.or.kr/api";

// Order matters: first match wins, so put more specific categories before
// generic ones that could otherwise swallow them (e.g. "부도ㆍ은행거래정지"
// before the generic "거래정지" check).
const CATEGORIES = [
  { label: "횡령ㆍ배임", match: n => n.includes("횡령") || n.includes("배임") },
  { label: "부도ㆍ은행거래정지ㆍ파산", match: n => n.includes("부도") || n.includes("은행거래정지") || n.includes("파산") || n.includes("회생절차") },
  { label: "상장폐지", match: n => n.includes("상장폐지") },
  { label: "거래정지", match: n => n.includes("거래정지") },
  { label: "관리종목 지정", match: n => n.includes("관리종목") },
  { label: "단일판매ㆍ공급계약체결", match: n => n.includes("단일판매") || n.includes("공급계약") },
  { label: "전환사채권발행결정", match: n => n.includes("전환사채권발행결정") },
  { label: "회사합병ㆍ분할결정", match: n => n.includes("합병결정") || n.includes("분할결정") },
  { label: "타법인 주식 취득", match: n => n.includes("타법인주식") || n.includes("타법인 주식") },
  // "최대주주등소유주식변동/변경신고서" is a routine periodic filing, not an
  // actual change-of-largest-shareholder event — exclude it explicitly.
  { label: "최대주주 변경", match: n => n.includes("최대주주") && !n.includes("소유주식") },
  { label: "자기주식 취득ㆍ처분", match: n => n.includes("자기주식") },
  { label: "자본감소(감자)", match: n => n.includes("감자") || n.includes("자본감소") },
  { label: "소송 등의 제기", match: n => n.includes("소송") },
  { label: "임상시험", match: n => n.includes("임상시험") },
  {
    label: "유상증자ㆍ무상증자결정",
    match: n => n.includes("유상증자결정") || n.includes("유무상증자결정") || n.includes("무상증자결정"),
  },
];

function classify(reportName) {
  const cleaned = reportName.replace(/^\[기재정정\]/, "");
  for (const { label, match } of CATEGORIES) {
    if (match(cleaned)) return label;
  }
  return null;
}

async function fetchDayDisclosures(apiKey, dateStr) {
  const all = [];
  let page = 1;
  while (true) {
    const url = `${DART_BASE}/list.json?crtfc_key=${apiKey}&bgn_de=${dateStr}&end_de=${dateStr}&page_count=100&page_no=${page}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status === "013") break; // no data found for the period
    if (data.status !== "000") throw new Error(`DART API error: ${data.status} ${data.message}`);
    all.push(...(data.list || []));
    if (page >= (data.total_page || 1)) break;
    page += 1;
  }
  // corp_cls: Y=코스피, K=코스닥, N=코넥스, E=기타(비상장 등) — only keep
  // listed (KOSPI/KOSDAQ) companies.
  return all.filter(d => d.corp_cls === "Y" || d.corp_cls === "K");
}

function listRows(items) {
  return items
    .map(d => `<li>${d.corp_name} - ${d.report_nm.trim()} <a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}" target="_blank" rel="noopener noreferrer">[원문보기]</a></li>`)
    .join("\n");
}

const OPENING_VARIANTS = [
  (dateLabel, total) => `${dateLabel} 기준 코스피·코스닥 주요 공시 총 ${total}건이 접수됐습니다.`,
  (dateLabel, total) => `${dateLabel}에 접수된 코스피·코스닥 주요 공시는 총 ${total}건입니다.`,
  (dateLabel, total) => `오늘(${dateLabel}) 코스피·코스닥에서 총 ${total}건의 주요 공시가 나왔습니다.`,
  (dateLabel, total) => `${dateLabel} 공시브리핑 — 코스피·코스닥 주요 공시 ${total}건을 정리해드립니다.`,
];

const SEVERE_VARIANTS = [
  severe => ` 오늘은 특히 ${severe} 관련 공시가 포함되어 있어 보유 종목 여부를 반드시 확인해 보시기 바랍니다.`,
  severe => ` 특히 ${severe} 관련 공시가 있으니, 보유 중인 종목이라면 꼭 내용을 확인해 보시기 바랍니다.`,
  severe => ` ${severe} 관련 공시도 포함되어 있어, 관련 종목을 보유하고 계시다면 눈여겨보시길 권해드립니다.`,
];

function buildDataIntro(byCategory, dateLabel) {
  const activeCategories = CATEGORIES.filter(({ label }) => byCategory[label]?.length > 0);
  const total = activeCategories.reduce((s, { label }) => s + byCategory[label].length, 0);

  // Highlight high-severity categories if present
  const severe = ["횡령ㆍ배임", "부도ㆍ은행거래정지ㆍ파산", "상장폐지", "거래정지"]
    .filter(l => byCategory[l]?.length > 0);

  let text = pickVariant(OPENING_VARIANTS, dateLabel)(dateLabel, total);
  if (severe.length > 0) {
    text += pickVariant(SEVERE_VARIANTS, dateLabel + "severe")(severe.join(", "));
  }
  return `<p>${text}</p>`;
}

function buildHighlightPara(byCategory) {
  // Priority order: severe first, then others. Pick up to 2 companies per category, max 6 highlights total.
  const priorityOrder = [
    "횡령ㆍ배임", "부도ㆍ은행거래정지ㆍ파산", "상장폐지", "거래정지", "관리종목 지정",
    "유상증자ㆍ무상증자결정", "회사합병ㆍ분할결정", "단일판매ㆍ공급계약체결",
    "타법인 주식 취득", "최대주주 변경", "전환사채권발행결정", "자기주식 취득ㆍ처분", "자본감소(감자)", "소송 등의 제기", "임상시험",
  ];

  const highlights = [];
  for (const label of priorityOrder) {
    if (!byCategory[label]?.length) continue;
    const companies = byCategory[label].slice(0, 2).map(d => d.corp_name);
    highlights.push(`${companies.join("·")}(${label})`);
    if (highlights.length >= 6) break;
  }

  if (highlights.length === 0) return "";
  return `<p>오늘 주요 공시로는 ${highlights.join(", ")} 등이 있습니다.</p>`;
}

const DISCLAIMER_VARIANTS = [
  "<p>투자에 있어 매우 중요한 공시들만 따로 정리해서 매일 매일 업데이트 해드리니 투자에 참고 하시기 바라며, 아래 내용은 매수·매도를 권유하는 의견이 아닙니다. 자세한 내용은 [원문보기] 링크로 직접 확인하시길 권장드립니다.</p>",
  "<p>매수·매도를 권유하는 목적이 아니라, 투자 판단에 참고하실 수 있도록 중요 공시만 추려서 매일 정리해드리는 내용입니다. 자세한 내용은 [원문보기] 링크에서 직접 확인해보시기 바랍니다.</p>",
  "<p>아래 내용은 투자 권유가 아닌 공시 사실 전달을 목적으로 합니다. 투자 판단에 중요할 만한 공시만 골라 매일 업데이트하고 있으니, 자세한 사항은 [원문보기] 링크로 확인하시길 권장드립니다.</p>",
];

function buildTemplateContent(byCategory, dateLabel) {
  const sections = CATEGORIES
    .filter(({ label }) => byCategory[label] && byCategory[label].length > 0)
    .map(({ label }) => `<h2>${label}</h2>\n<ul>\n${listRows(byCategory[label])}\n</ul>`)
    .join("\n");

  return `${buildDataIntro(byCategory, dateLabel)}
${buildHighlightPara(byCategory)}
${pickVariant(DISCLAIMER_VARIANTS, dateLabel + "disclaimer")}
${sections}`;
}

async function buildAiContent(env, byCategory, dateLabel) {
  if (!env.ANTHROPIC_API_KEY) return null;

  const sectionData = CATEGORIES
    .filter(({ label }) => byCategory[label] && byCategory[label].length > 0)
    .map(({ label }) => `[${label}]\n${byCategory[label].map(d => `- ${d.corp_name}: ${d.report_nm.trim()} (rcept_no=${d.rcept_no})`).join("\n")}`)
    .join("\n\n");

  if (!sectionData) return null;

  const prompt = `다음은 ${dateLabel}(전 거래일) DART 전자공시시스템에 접수된 주요 공시 목록이다. 카테고리별로 회사명과 공시 종류가 나열되어 있고, 괄호 안 rcept_no는 원문 링크용 접수번호다.

${sectionData}

이 데이터를 바탕으로 커뮤니티 게시판에 올릴 글을 HTML로 작성해줘. 반드시 지킬 것:
- <p>, <h2>, <ul><li>, <a> 태그만 사용 (마크다운 금지, 코드블록 금지)
- 매수/매도 추천, 투자 권유, 호재/악재 단정 표현 절대 금지. 공시 사실만 객관적으로 전달
- 글 맨 앞(메타 설명에 노출될 부분)에 날짜(${dateLabel})와 함께 "오늘의 주식시장 주요 공시 내용을 정리해서 알려 드립니다", 매일 업데이트된다는 점, 코리안에셋 사이트를 즐겨찾기 해두라는 권유, 오늘 다루는 공시 카테고리 목록, 투자 권유가 아니라는 안내, [원문보기]에서 확인하라는 안내를 자연스러운 문장 2~3개로 작성할 것
- 카테고리별로 소제목(h2)을 만들어서 정리하고, 데이터에 없는 카테고리는 만들지 말 것
- 각 항목마다 회사명과 공시명을 적고, 끝에 <a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=접수번호" target="_blank" rel="noopener noreferrer">[원문보기]</a> 링크를 반드시 포함
- 다른 설명 없이 HTML 본문만 출력`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  const text = data?.content?.[0]?.text;
  if (!text || !text.includes("<")) return null;
  return text.trim();
}

export async function runDisclosureBrief(env) {
  const botAuthorId = env.STOCK_BRIEF_AUTHOR_ID || "901a0ce8-d52d-42dc-bc92-536e84273df2";

  // Unlike the stock ranking brief, this runs the same evening (19:00) the
  // disclosures were filed, so the data date is today, not the day before.
  const now = new Date();
  const dataDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  let dateStr = `${dataDate.getUTCFullYear()}${String(dataDate.getUTCMonth() + 1).padStart(2, "0")}${String(dataDate.getUTCDate()).padStart(2, "0")}`;
  let dateLabel = `${dataDate.getUTCFullYear()}.${String(dataDate.getUTCMonth() + 1).padStart(2, "0")}.${String(dataDate.getUTCDate()).padStart(2, "0")}`;

  // For manual testing/backfill only: override the target date.
  if (env.DISCLOSURE_DATE_OVERRIDE) {
    dateStr = env.DISCLOSURE_DATE_OVERRIDE;
    dateLabel = `${dateStr.slice(0, 4)}.${dateStr.slice(4, 6)}.${dateStr.slice(6, 8)}`;
  }

  const disclosures = await fetchDayDisclosures(env.DART_API_KEY, dateStr);

  if (disclosures.length === 0) {
    return { skipped: true, reason: "no disclosures (holiday or closed)" };
  }

  const byCategory = {};
  for (const d of disclosures) {
    const label = classify(d.report_nm);
    if (!label) continue;
    (byCategory[label] = byCategory[label] || []).push(d);
  }

  const totalMatched = Object.values(byCategory).reduce((sum, list) => sum + list.length, 0);
  if (totalMatched === 0) {
    return { skipped: true, reason: "no matching disclosure categories that day" };
  }

  const aiContent = await buildAiContent(env, byCategory, dateLabel);
  const content = aiContent || buildTemplateContent(byCategory, dateLabel);
  const thumbnailTitle = "주요 공시 모음";
  const title = `[공시브리핑] ${dateLabel} ${thumbnailTitle}`;

  let thumbnailUrl = null;
  try {
    const pngBuffer = await generateThumbnail(dateLabel, thumbnailTitle, { heading: "코리안에셋 공시브리핑" });
    thumbnailUrl = await uploadThumbnail(env, pngBuffer, `disclosure-${dataDate.toISOString().slice(0, 10)}.png`);
  } catch {
    thumbnailUrl = null;
  }

  await insertPost(env, {
    category: "stock",
    subcategory: "중요공시/뉴스",
    title,
    content,
    thumbnailUrl,
    authorId: botAuthorId,
  });

  return { success: true, title, usedAi: !!aiContent, totalMatched, thumbnailUrl };
}
