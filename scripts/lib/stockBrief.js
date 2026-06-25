const KIWOOM_BASE = "https://api.kiwoom.com";

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

async function fetchTopVolume(token) {
  const data = await rkinfo(token, "ka10030", {
    mrkt_tp: "0",
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
async function fetchChangeRateRanking(token) {
  const data = await rkinfo(token, "ka10027", {
    mrkt_tp: "0",
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

function buildTemplateContent(volumeList, changeList, limitUpList, dateLabel) {
  const limitUpSection = limitUpList.length > 0
    ? `<h2>상한가 종목</h2>\n<ul>\n${listRows(limitUpList, false)}\n</ul>\n`
    : `<h2>상한가 종목</h2>\n<p>${dateLabel} 상한가에 도달한 종목이 없습니다.</p>\n`;

  return `<p>${dateLabel} 코스피 시장 마감 데이터를 자동으로 정리해드립니다. 아래 내용은 매수·매도를 권유하는 의견이 아니라, 거래량·등락률·상한가 수치를 객관적으로 요약한 정보입니다. 투자 판단과 책임은 투자자 본인에게 있습니다.</p>
${limitUpSection}
<h2>거래량 상위 종목</h2>
<ul>
${listRows(volumeList, true)}
</ul>
<h2>등락률 상위 종목</h2>
<ul>
${listRows(changeList, false)}
</ul>
<p>본 정보는 키움증권 OpenAPI를 통해 자동 수집된 데이터이며, 특정 종목의 매수 또는 매도를 추천하지 않습니다.</p>`;
}

async function buildAiContent(env, volumeList, changeList, limitUpList, dateLabel) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const toPlain = (s, withVolume) => ({
    종목명: cleanName(s.stk_nm),
    현재가: cleanPrice(s.cur_prc),
    등락률: s.flu_rt,
    ...(withVolume ? { 거래량: s.trde_qty } : {}),
  });

  const prompt = `다음은 ${dateLabel}(전 거래일) 코스피 시장 마감 기준 데이터다.

상한가 종목: ${JSON.stringify(limitUpList.map(s => toPlain(s, false)))}
거래량 상위 5종목: ${JSON.stringify(volumeList.slice(0, 5).map(s => toPlain(s, true)))}
등락률 상위 5종목: ${JSON.stringify(changeList.slice(0, 5).map(s => toPlain(s, false)))}

이 데이터를 바탕으로 커뮤니티 게시판에 올릴 글을 HTML로 작성해줘. 반드시 지킬 것:
- <p>, <h2>, <ul><li> 태그만 사용 (마크다운 금지, 코드블록 금지)
- 매수/매도 추천, 투자 권유, "사세요", "좋습니다", "유망합니다" 같은 표현 절대 금지. 객관적 수치 설명만.
- "오늘", "오늘의" 같은 표현 대신 정확한 날짜(${dateLabel})를 명시할 것. 이 날짜는 글이 올라가는 날이 아니라 데이터가 집계된 전 거래일임.
- 상한가 종목, 거래량 상위, 등락률 상위를 각각 소제목(h2)으로 나눠서 정리. 상한가 종목이 없으면 "상한가에 도달한 종목이 없습니다"라고 적을 것
- 글 맨 앞에 "이 글은 매수·매도 권유가 아니며 투자 판단의 책임은 본인에게 있다"는 안내문 포함
- 글 맨 끝에 "키움증권 OpenAPI로 자동 수집된 데이터"라는 출처 문구 포함
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
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  const text = data?.content?.[0]?.text;
  if (!text || !text.includes("<")) return null;
  return text.trim();
}

export async function runStockBrief(env) {
  const botAuthorId = env.STOCK_BRIEF_AUTHOR_ID || "901a0ce8-d52d-42dc-bc92-536e84273df2";

  const token = await getKiwoomToken(env);
  const [volumeFull, changeFull] = await Promise.all([fetchTopVolume(token), fetchChangeRateRanking(token)]);

  if (volumeFull.length === 0 && changeFull.length === 0) {
    return { skipped: true, reason: "no market data (holiday or closed)" };
  }

  const volumeList = volumeFull.slice(0, 5);
  const changeList = changeFull.slice(0, 5);
  const limitUpList = changeFull.filter(s => s.pred_pre_sig === "1");

  // This script runs the morning after market close, so the data is from
  // the previous trading day, not the day the post is published.
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dataDate = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  const dateLabel = `${dataDate.getUTCFullYear()}.${String(dataDate.getUTCMonth() + 1).padStart(2, "0")}.${String(dataDate.getUTCDate()).padStart(2, "0")}`;

  const aiContent = await buildAiContent(env, volumeList, changeList, limitUpList, dateLabel);
  const content = aiContent || buildTemplateContent(volumeList, changeList, limitUpList, dateLabel);
  const title = `[데이터브리핑] ${dateLabel} 상한가 종목, 거래량·등락률 순위`;

  const insertRes = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      category: "stock",
      subcategory: "주식추천AI",
      title,
      content,
      author_id: botAuthorId,
    }),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    throw new Error(`post insert failed: ${errText}`);
  }

  return { success: true, title, usedAi: !!aiContent, limitUpCount: limitUpList.length };
}

export async function getOutboundIp() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    return (await r.json()).ip;
  } catch {
    return "lookup failed";
  }
}
