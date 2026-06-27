import { generateThumbnail, uploadThumbnail, insertPost } from "./thumbnail.js";

const KIWOOM_BASE = "https://api.kiwoom.com";
// Kiwoom market_tp codes: "0" = 코스피, "101" = 코스닥 ("1" silently falls back to KOSPI)
const MARKET_CODES = ["0", "101"];
const SECTION_LABELS = ["코스피", "코스닥", "레버리지·인버스 상품"];

// Leveraged/inverse ETN & ETF products trade like derivatives and routinely
// dominate volume/change-rate rankings; split them out so plain KOSPI/KOSDAQ
// stock rankings aren't drowned out by them.
function isLeveragedProduct(name) {
  return /레버리지|인버스|ETN/.test(String(name || ""));
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

async function rkinfo(token, apiId, body) {
  const r = await fetch(`${KIWOOM_BASE}/api/dostk/rkinfo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "api-id": apiId,
      "cont-yn": "N",
      "next-key": "",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function fetchTopVolumeByMarket(token, mrkt_tp) {
  const data = await rkinfo(token, "ka10030", {
    mrkt_tp,
    sort_tp: "1",
    mang_stk_incls: "0",
    crd_tp: "0",
    trde_qty_tp: "0",
    pric_tp: "0",
    trde_prica_tp: "0",
    mrkt_open_tp: "0",
    stex_tp: "3",
  });
  // Kiwoom occasionally returns a sentinel overflow value (2^32-1) for
  // trde_qty on thinly-traded leveraged/inverse products; drop those rows.
  return (data.tdy_trde_qty_upper || []).filter(s => Number(s.trde_qty) < 1_000_000_000);
}

// pred_pre_sig: 1=상한가, 2=상승, 3=보합, 4=하락, 5=하한가 (Kiwoom convention)
async function fetchChangeRateByMarket(token, mrkt_tp) {
  const data = await rkinfo(token, "ka10027", {
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
  });
  return data.pred_pre_flu_rt_upper || [];
}

function dedupeByCode(list) {
  const seen = new Set();
  return list.filter(s => {
    if (seen.has(s.stk_cd)) return false;
    seen.add(s.stk_cd);
    return true;
  });
}

function cleanName(name) {
  return String(name || "").trim();
}

function cleanPrice(v) {
  return String(v || "").replace(/^[+-]/, "");
}

function listRows(list, withVolume) {
  return list
    .map((s, i) => {
      const vol = withVolume ? `, 거래량 ${Number(s.trde_qty).toLocaleString()}주` : "";
      return `<li>${i + 1}. ${cleanName(s.stk_nm)} - 현재가 ${cleanPrice(s.cur_prc)}원, 등락률 ${s.flu_rt}%${vol}</li>`;
    })
    .join("\n");
}

function buildTemplateContent(bySection, dateLabel) {
  const sections = SECTION_LABELS.map(label => {
    const { volumeList, changeList, limitUpList } = bySection[label];
    const limitUpSection = limitUpList.length > 0
      ? `<ul>\n${listRows(limitUpList, false)}\n</ul>`
      : `<p>${dateLabel} ${label} 중 상한가에 도달한 종목이 없습니다.</p>`;

    return `<h2>${label} 상한가 종목</h2>
${limitUpSection}
<h2>${label} 거래량 상위 종목</h2>
<ul>
${listRows(volumeList, true)}
</ul>
<h2>${label} 등락률 상위 종목</h2>
<ul>
${listRows(changeList, false)}
</ul>`;
  }).join("\n");

  return `<p>${dateLabel} 코스피·코스닥 시장 마감 데이터를 자동으로 정리해드립니다. 레버리지·인버스 상품은 거래량/등락률 규모가 일반 종목과 크게 달라 별도 섹션으로 분리했습니다. 아래 내용은 매수·매도를 권유하는 의견이 아니라 수치를 객관적으로 요약한 정보이며, 투자 판단과 책임은 투자자 본인에게 있습니다.</p>
${sections}`;
}

async function buildAiContent(env, bySection, dateLabel) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const toPlain = (s, withVolume) => ({
    종목명: cleanName(s.stk_nm),
    현재가: cleanPrice(s.cur_prc),
    등락률: s.flu_rt,
    ...(withVolume ? { 거래량: s.trde_qty } : {}),
  });

  const sectionData = SECTION_LABELS.map(label => {
    const { volumeList, changeList, limitUpList } = bySection[label];
    return `[${label}]
상한가 종목: ${JSON.stringify(limitUpList.map(s => toPlain(s, false)))}
거래량 상위 5종목: ${JSON.stringify(volumeList.map(s => toPlain(s, true)))}
등락률 상위 5종목: ${JSON.stringify(changeList.map(s => toPlain(s, false)))}`;
  }).join("\n\n");

  const prompt = `다음은 ${dateLabel}(전 거래일) 코스피·코스닥 시장 마감 기준 데이터다. 레버리지·인버스 ETN/ETF 상품은 거래량/등락률 규모가 일반 종목과 크게 달라서 따로 분리되어 있다. 세 그룹(코스피, 코스닥, 레버리지·인버스 상품)을 서로 합치지 말 것.

${sectionData}

이 데이터를 바탕으로 커뮤니티 게시판에 올릴 글을 HTML로 작성해줘. 반드시 지킬 것:
- <p>, <h2>, <ul><li> 태그만 사용 (마크다운 금지, 코드블록 금지)
- 매수/매도 추천, 투자 권유, "사세요", "좋습니다", "유망합니다" 같은 표현 절대 금지. 객관적 수치 설명만.
- "오늘", "오늘의" 같은 표현 대신 정확한 날짜(${dateLabel})를 명시할 것. 이 날짜는 글이 올라가는 날이 아니라 데이터가 집계된 전 거래일임.
- 코스피, 코스닥, 레버리지·인버스 상품 세 그룹을 절대 합치지 말고, 각 그룹별로 "상한가 종목", "거래량 상위", "등락률 상위" 소제목(h2)을 따로 만들어서 정리 (총 9개의 h2). 상한가 종목이 없으면 "상한가에 도달한 종목이 없습니다"라고 적을 것
- 글 맨 앞에 "이 글은 매수·매도 권유가 아니며 투자 판단의 책임은 본인에게 있다"는 안내문 포함
- 출처를 밝히는 문구는 넣지 말 것
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
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  const text = data?.content?.[0]?.text;
  if (!text || !text.includes("<")) return null;
  return text.trim();
}

function topN(list, sortKey, n) {
  const sorted = [...list].sort((a, b) => sortKey(b) - sortKey(a));
  return sorted.slice(0, n);
}

export async function runStockBrief(env) {
  const botAuthorId = env.STOCK_BRIEF_AUTHOR_ID || "901a0ce8-d52d-42dc-bc92-536e84273df2";

  const token = await getKiwoomToken(env);

  const volumeByMarket = await Promise.all(MARKET_CODES.map(code => fetchTopVolumeByMarket(token, code)));
  const changeByMarket = await Promise.all(MARKET_CODES.map(code => fetchChangeRateByMarket(token, code)));

  const allVolume = dedupeByCode(volumeByMarket.flat());
  const allChange = dedupeByCode(changeByMarket.flat());

  if (allVolume.length === 0 && allChange.length === 0) {
    return { skipped: true, reason: "no market data (holiday or closed)" };
  }

  // Kiwoom's mrkt_tp="0" ("코스피") response isn't cleanly KOSPI-only — it
  // can include KOSDAQ names too. mrkt_tp="101" is reliably KOSDAQ-scoped
  // (verified by inspection), so use that as the authoritative KOSDAQ set
  // and treat anything else (that isn't leveraged) as KOSPI by elimination.
  const kosdaqCodes = new Set(volumeByMarket[1].map(s => s.stk_cd).concat(changeByMarket[1].map(s => s.stk_cd)));

  function classify(s) {
    if (isLeveragedProduct(s.stk_nm)) return "레버리지·인버스 상품";
    return kosdaqCodes.has(s.stk_cd) ? "코스닥" : "코스피";
  }

  const bySection = {};
  for (const label of SECTION_LABELS) {
    const volumeList = topN(allVolume.filter(s => classify(s) === label), s => Number(s.trde_qty), 5);
    const changeFullForLabel = allChange.filter(s => classify(s) === label);
    const changeList = topN(changeFullForLabel, s => parseFloat(s.flu_rt), 5);
    const limitUpList = changeFullForLabel.filter(s => s.pred_pre_sig === "1");
    bySection[label] = { volumeList, changeList, limitUpList };
  }

  // This script runs the morning after market close, so the data is from
  // the previous trading day, not the day the post is published.
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dataDate = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  const dateLabel = `${dataDate.getUTCFullYear()}.${String(dataDate.getUTCMonth() + 1).padStart(2, "0")}.${String(dataDate.getUTCDate()).padStart(2, "0")}`;

  const aiContent = await buildAiContent(env, bySection, dateLabel);
  const content = aiContent || buildTemplateContent(bySection, dateLabel);
  const thumbnailTitle = "상한가 종목, 거래량·등락률 순위";
  const title = `[데이터브리핑] ${dateLabel} ${thumbnailTitle}`;

  let thumbnailUrl = null;
  try {
    const pngBuffer = await generateThumbnail(dateLabel, thumbnailTitle);
    thumbnailUrl = await uploadThumbnail(env, pngBuffer, `stock-${dataDate.toISOString().slice(0, 10)}.png`);
  } catch {
    thumbnailUrl = null;
  }

  await insertPost(env, {
    category: "stock",
    subcategory: "오늘의 특징주",
    title,
    content,
    thumbnailUrl,
    authorId: botAuthorId,
  });

  return {
    success: true,
    title,
    usedAi: !!aiContent,
    limitUpCount: Object.values(bySection).reduce((sum, m) => sum + m.limitUpList.length, 0),
    thumbnailUrl,
  };
}

export async function getOutboundIp() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    return (await r.json()).ip;
  } catch {
    return "lookup failed";
  }
}
