import { generateThumbnail, uploadThumbnail, insertPost } from "./thumbnail.js";

const KIWOOM_BASE = "https://api.kiwoom.com";
// Kiwoom market_tp codes: "0" = 코스피, "101" = 코스닥 ("1" silently falls back to KOSPI)
const MARKET_CODES = ["0", "101"];
const SECTION_LABELS = ["코스피", "코스닥", "레버리지·인버스 상품"];
const SECTION_COLORS = {
  "코스피": "#dc2626",
  "코스닥": "#2563eb",
  "레버리지·인버스 상품": "#f97316",
};

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

// ka10027 sort_tp: 1=상승률상위, 3=하락률상위 (verified by inspection — 2 and 4
// don't cleanly correspond to either).
async function fetchRiseRateByMarket(token, mrkt_tp) {
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

async function fetchDeclineRateByMarket(token, mrkt_tp) {
  const data = await rkinfo(token, "ka10027", {
    mrkt_tp,
    sort_tp: "3",
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
    const color = SECTION_COLORS[label];
    const h2 = text => `<h2 style="color:${color}">${text}</h2>`;
    const { volumeList, changeList, declineList, limitUpList, limitDownList } = bySection[label];
    const limitUpSection = limitUpList.length > 0
      ? `<ul>\n${listRows(limitUpList, false)}\n</ul>`
      : `<p>${dateLabel} ${label} 중 상한가에 도달한 종목이 없습니다.</p>`;
    const limitDownSection = limitDownList.length > 0
      ? `<ul>\n${listRows(limitDownList, false)}\n</ul>`
      : `<p>${dateLabel} ${label} 중 하한가에 도달한 종목이 없습니다.</p>`;

    return `${h2(`${label} 상한가 종목`)}
${limitUpSection}
${h2(`${label} 하한가 종목`)}
${limitDownSection}
${h2(`${label} 거래량 상위 종목`)}
<ul>
${listRows(volumeList, true)}
</ul>
${h2(`${label} 등락률 상위 종목`)}
<ul>
${listRows(changeList, false)}
</ul>
${h2(`${label} 하락 상위 종목`)}
<ul>
${listRows(declineList, false)}
</ul>`;
  }).join("\n");

  // Build data-driven intro from today's actual numbers
  const allLimitUp = SECTION_LABELS.flatMap(l => bySection[l].limitUpList);
  const allLimitDown = SECTION_LABELS.flatMap(l => bySection[l].limitDownList);

  // flu_rt already carries its sign (e.g. "+27.47" or "-21.61") — don't add extra +
  const fmtRate = r => `${r.flu_rt}%`;
  const kospiTop1Rise    = bySection["코스피"].changeList[0];
  const kospiTop1Decline = bySection["코스피"].declineList[0];
  const kosdaqTop1Rise   = bySection["코스닥"].changeList[0];
  const kosdaqTop1Decline= bySection["코스닥"].declineList[0];
  const topVolume        = [...bySection["코스피"].volumeList, ...bySection["코스닥"].volumeList]
    .sort((a, b) => Number(b.trde_qty) - Number(a.trde_qty))[0];

  let introText = `${dateLabel} 주식시장 마감 기준, `;
  if (allLimitUp.length > 0) {
    introText += `상한가 종목은 총 ${allLimitUp.length}개 발생했습니다. `;
  } else {
    introText += `상한가 종목은 없었습니다. `;
  }
  if (allLimitDown.length > 0) {
    introText += `하한가 종목은 총 ${allLimitDown.length}개였습니다. `;
  } else {
    introText += `하한가 종목도 없었습니다. `;
  }

  const highlights = [];
  if (kospiTop1Rise)    highlights.push(`코스피 상승률 1위 ${cleanName(kospiTop1Rise.stk_nm)}(${fmtRate(kospiTop1Rise)})`);
  if (kospiTop1Decline) highlights.push(`하락률 1위 ${cleanName(kospiTop1Decline.stk_nm)}(${fmtRate(kospiTop1Decline)})`);
  if (kosdaqTop1Rise)   highlights.push(`코스닥 상승률 1위 ${cleanName(kosdaqTop1Rise.stk_nm)}(${fmtRate(kosdaqTop1Rise)})`);
  if (kosdaqTop1Decline)highlights.push(`하락률 1위 ${cleanName(kosdaqTop1Decline.stk_nm)}(${fmtRate(kosdaqTop1Decline)})`);
  if (topVolume)        highlights.push(`거래량 1위 ${cleanName(topVolume.stk_nm)}(${Number(topVolume.trde_qty).toLocaleString()}주)`);

  if (highlights.length > 0) {
    introText += highlights.join(", ") + "였습니다. ";
  }
  introText += `아래 내용은 매수·매도를 권유하는 의견이 아니라 수치를 객관적으로 요약한 정보이며, 투자 판단과 책임은 투자자 본인에게 있습니다.`;

  return `<p>${introText}</p>
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
    const { volumeList, changeList, declineList, limitUpList, limitDownList } = bySection[label];
    return `[${label}]
상한가 종목: ${JSON.stringify(limitUpList.map(s => toPlain(s, false)))}
하한가 종목: ${JSON.stringify(limitDownList.map(s => toPlain(s, false)))}
거래량 상위 5종목: ${JSON.stringify(volumeList.map(s => toPlain(s, true)))}
등락률(상승) 상위 5종목: ${JSON.stringify(changeList.map(s => toPlain(s, false)))}
하락률 상위 5종목: ${JSON.stringify(declineList.map(s => toPlain(s, false)))}`;
  }).join("\n\n");

  const prompt = `다음은 ${dateLabel} 코스피·코스닥 시장 마감 기준 데이터다. 레버리지·인버스 ETN/ETF 상품은 거래량/등락률 규모가 일반 종목과 크게 달라서 따로 분리되어 있다. 세 그룹(코스피, 코스닥, 레버리지·인버스 상품)을 서로 합치지 말 것.

${sectionData}

이 데이터를 바탕으로 커뮤니티 게시판에 올릴 글을 HTML로 작성해줘. 반드시 지킬 것:
- <p>, <h2 style="color:...">, <ul><li> 태그만 사용 (마크다운 금지, 코드블록 금지)
- 매수/매도 추천, 투자 권유, "사세요", "좋습니다", "유망합니다" 같은 표현 절대 금지. 객관적 수치 설명만.
- "오늘", "오늘의" 같은 표현 대신 정확한 날짜(${dateLabel})를 명시할 것.
- 코스피, 코스닥, 레버리지·인버스 상품 세 그룹을 절대 합치지 말고, 각 그룹별로 "상한가 종목", "하한가 종목", "거래량 상위", "등락률 상위", "하락 상위" 소제목(h2)을 따로 만들어서 정리 (총 15개의 h2). 상한가/하한가 종목이 없으면 "상한가(또는 하한가)에 도달한 종목이 없습니다"라고 적을 것
- 그룹별 h2 제목 색상을 반드시 구분할 것: 코스피는 <h2 style="color:${SECTION_COLORS["코스피"]}">, 코스닥은 <h2 style="color:${SECTION_COLORS["코스닥"]}">, 레버리지·인버스 상품은 <h2 style="color:${SECTION_COLORS["레버리지·인버스 상품"]}">로 지정
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
  const riseByMarket = await Promise.all(MARKET_CODES.map(code => fetchRiseRateByMarket(token, code)));
  const declineByMarket = await Promise.all(MARKET_CODES.map(code => fetchDeclineRateByMarket(token, code)));

  const allVolume = dedupeByCode(volumeByMarket.flat());
  const allRise = dedupeByCode(riseByMarket.flat());
  const allDecline = dedupeByCode(declineByMarket.flat());

  if (allVolume.length === 0 && allRise.length === 0 && allDecline.length === 0) {
    return { skipped: true, reason: "no market data (holiday or closed)" };
  }

  // Kiwoom's mrkt_tp="0" ("코스피") response isn't cleanly KOSPI-only — it
  // can include KOSDAQ names too. mrkt_tp="101" is reliably KOSDAQ-scoped
  // (verified by inspection), so use that as the authoritative KOSDAQ set
  // and treat anything else (that isn't leveraged) as KOSPI by elimination.
  const kosdaqCodes = new Set(volumeByMarket[1].map(s => s.stk_cd).concat(riseByMarket[1].map(s => s.stk_cd)));

  function classify(s) {
    if (isLeveragedProduct(s.stk_nm)) return "레버리지·인버스 상품";
    return kosdaqCodes.has(s.stk_cd) ? "코스닥" : "코스피";
  }

  const bySection = {};
  for (const label of SECTION_LABELS) {
    const volumeList = topN(allVolume.filter(s => classify(s) === label), s => Number(s.trde_qty), 5);
    const riseFullForLabel = allRise.filter(s => classify(s) === label);
    const declineFullForLabel = allDecline.filter(s => classify(s) === label);
    const changeList = topN(riseFullForLabel, s => parseFloat(s.flu_rt), 5);
    const declineList = topN(declineFullForLabel, s => -parseFloat(s.flu_rt), 5);
    // pred_pre_sig from this endpoint is just a generic up/down direction
    // flag, not a "hit the price limit" indicator (every row in the decline
    // list comes back as sig=5 regardless of magnitude). KRX's daily price
    // band is ±30%, so detect actual limit hits by the change rate itself.
    const limitUpList = riseFullForLabel.filter(s => parseFloat(s.flu_rt) >= 29.5);
    const limitDownList = declineFullForLabel.filter(s => parseFloat(s.flu_rt) <= -29.5);
    bySection[label] = { volumeList, changeList, declineList, limitUpList, limitDownList };
  }

  // This script runs the same evening (18:30) the market closed, so the
  // data date is today, not the day before.
  const now = new Date();
  const dataDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateLabel = `${dataDate.getUTCFullYear()}.${String(dataDate.getUTCMonth() + 1).padStart(2, "0")}.${String(dataDate.getUTCDate()).padStart(2, "0")}`;

  const aiContent = await buildAiContent(env, bySection, dateLabel);
  const content = aiContent || buildTemplateContent(bySection, dateLabel);
  const thumbnailTitle = "주식 상승률·하락률 순위, 거래량·등락률 순위 정보";
  const title = `${dateLabel} 주식 상승률 순위 및 하락률 순위, 거래량 및 등락률 순위 정보`;

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
