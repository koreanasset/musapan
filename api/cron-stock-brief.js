const KIWOOM_BASE = "https://api.kiwoom.com";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BOT_AUTHOR_ID = process.env.STOCK_BRIEF_AUTHOR_ID || "901a0ce8-d52d-42dc-bc92-536e84273df2";

async function getKiwoomToken() {
  const r = await fetch(`${KIWOOM_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: process.env.KIWOOM_APP_KEY,
      secretkey: process.env.KIWOOM_APP_SECRET,
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
  return (data.tdy_trde_qty_upper || []).slice(0, 5);
}

async function fetchTopChangeRate(token) {
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
  return (data.pred_pre_flu_rt_upper || []).slice(0, 5);
}

function cleanName(name) {
  return String(name || "").trim();
}

function cleanPrice(v) {
  return String(v || "").replace(/^[+-]/, "");
}

function buildTemplateContent(volumeList, changeList, dateLabel) {
  const volRows = volumeList
    .map((s, i) => `<li>${i + 1}. ${cleanName(s.stk_nm)} - 현재가 ${cleanPrice(s.cur_prc)}원, 등락률 ${s.flu_rt}%, 거래량 ${Number(s.trde_qty).toLocaleString()}주</li>`)
    .join("\n");
  const changeRows = changeList
    .map((s, i) => `<li>${i + 1}. ${cleanName(s.stk_nm)} - 현재가 ${cleanPrice(s.cur_prc)}원, 등락률 ${s.flu_rt}%</li>`)
    .join("\n");

  return `<p>${dateLabel} 코스피 시장 데이터를 자동으로 정리해드립니다. 아래 내용은 매수·매도를 권유하는 의견이 아니라, 거래량과 등락률 수치를 객관적으로 요약한 정보입니다. 투자 판단과 책임은 투자자 본인에게 있습니다.</p>
<h2>거래량 상위 종목</h2>
<ul>
${volRows}
</ul>
<h2>등락률 상위 종목</h2>
<ul>
${changeRows}
</ul>
<p>본 정보는 키움증권 OpenAPI를 통해 자동 수집된 데이터이며, 특정 종목의 매수 또는 매도를 추천하지 않습니다.</p>`;
}

async function buildAiContent(volumeList, changeList, dateLabel) {
  if (!ANTHROPIC_API_KEY) return null;
  const prompt = `다음은 ${dateLabel} 코스피 시장의 거래량 상위 5종목과 등락률 상위 5종목 데이터다.

거래량 상위: ${JSON.stringify(volumeList.map(s => ({ 종목명: cleanName(s.stk_nm), 현재가: cleanPrice(s.cur_prc), 등락률: s.flu_rt, 거래량: s.trde_qty })))}
등락률 상위: ${JSON.stringify(changeList.map(s => ({ 종목명: cleanName(s.stk_nm), 현재가: cleanPrice(s.cur_prc), 등락률: s.flu_rt })))}

이 데이터를 바탕으로 커뮤니티 게시판에 올릴 글을 HTML로 작성해줘. 반드시 지킬 것:
- <p>, <h2>, <ul><li> 태그만 사용 (마크다운 금지, 코드블록 금지)
- 매수/매도 추천, 투자 권유, "사세요", "좋습니다", "유망합니다" 같은 표현 절대 금지. 객관적 수치 설명만.
- 두 리스트(거래량 상위, 등락량 상위)를 각각 소제목(h2)으로 나눠서 정리
- 글 맨 앞에 "이 글은 매수·매도 권유가 아니며 투자 판단의 책임은 본인에게 있다"는 안내문 포함
- 글 맨 끝에 "키움증권 OpenAPI로 자동 수집된 데이터"라는 출처 문구 포함
- 다른 설명 없이 HTML 본문만 출력`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
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

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  try {
    const token = await getKiwoomToken();
    const [volumeList, changeList] = await Promise.all([fetchTopVolume(token), fetchTopChangeRate(token)]);

    if (volumeList.length === 0 && changeList.length === 0) {
      res.status(200).json({ skipped: true, reason: "no market data (holiday or closed)" });
      return;
    }

    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateLabel = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;

    const aiContent = await buildAiContent(volumeList, changeList, dateLabel);
    const content = aiContent || buildTemplateContent(volumeList, changeList, dateLabel);
    const title = `[데이터브리핑] ${dateLabel} 코스피 거래량·등락률 상위 종목`;

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        category: "stock",
        subcategory: "주식추천AI",
        title,
        content,
        author_id: BOT_AUTHOR_ID,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      res.status(500).json({ error: "post insert failed", detail: errText });
      return;
    }

    res.status(200).json({ success: true, title, usedAi: !!aiContent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
