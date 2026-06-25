import sharp from "sharp";

const KIWOOM_BASE = "https://api.kiwoom.com";
const MARKETS = ["0", "1"]; // 0 = 코스피, 1 = 코스닥

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
  const lists = await Promise.all(MARKETS.map(mrkt_tp => rkinfo(token, "ka10030", {
    mrkt_tp,
    sort_tp: "1",
    mang_stk_incls: "0",
    crd_tp: "0",
    trde_qty_tp: "0",
    pric_tp: "0",
    trde_prica_tp: "0",
    mrkt_open_tp: "0",
    stex_tp: "3",
  }).then(d => d.tdy_trde_qty_upper || [])));

  // Kiwoom occasionally returns a sentinel overflow value (2^32-1) for
  // trde_qty on thinly-traded leveraged/inverse products; drop those rows.
  const merged = dedupeByCode(lists.flat()).filter(s => Number(s.trde_qty) < 1_000_000_000);
  merged.sort((a, b) => Number(b.trde_qty) - Number(a.trde_qty));
  return merged;
}

// pred_pre_sig: 1=상한가, 2=상승, 3=보합, 4=하락, 5=하한가 (Kiwoom convention)
async function fetchChangeRateRanking(token) {
  const lists = await Promise.all(MARKETS.map(mrkt_tp => rkinfo(token, "ka10027", {
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
  }).then(d => d.pred_pre_flu_rt_upper || [])));

  const merged = dedupeByCode(lists.flat());
  merged.sort((a, b) => parseFloat(b.flu_rt) - parseFloat(a.flu_rt));
  return merged;
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

function buildTemplateContent(volumeList, changeList, limitUpList, dateLabel) {
  const limitUpSection = limitUpList.length > 0
    ? `<h2>상한가 종목</h2>\n<ul>\n${listRows(limitUpList, false)}\n</ul>\n`
    : `<h2>상한가 종목</h2>\n<p>${dateLabel} 상한가에 도달한 종목이 없습니다.</p>\n`;

  return `<p>${dateLabel} 코스피·코스닥 시장 마감 데이터를 자동으로 정리해드립니다. 아래 내용은 매수·매도를 권유하는 의견이 아니라, 거래량·등락률·상한가 수치를 객관적으로 요약한 정보입니다. 투자 판단과 책임은 투자자 본인에게 있습니다.</p>
${limitUpSection}
<h2>거래량 상위 종목</h2>
<ul>
${listRows(volumeList, true)}
</ul>
<h2>등락률 상위 종목</h2>
<ul>
${listRows(changeList, false)}
</ul>`;
}

async function buildAiContent(env, volumeList, changeList, limitUpList, dateLabel) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const toPlain = (s, withVolume) => ({
    종목명: cleanName(s.stk_nm),
    현재가: cleanPrice(s.cur_prc),
    등락률: s.flu_rt,
    ...(withVolume ? { 거래량: s.trde_qty } : {}),
  });

  const prompt = `다음은 ${dateLabel}(전 거래일) 코스피·코스닥 시장 마감 기준 데이터다.

상한가 종목: ${JSON.stringify(limitUpList.map(s => toPlain(s, false)))}
거래량 상위 5종목: ${JSON.stringify(volumeList.slice(0, 5).map(s => toPlain(s, true)))}
등락률 상위 5종목: ${JSON.stringify(changeList.slice(0, 5).map(s => toPlain(s, false)))}

이 데이터를 바탕으로 커뮤니티 게시판에 올릴 글을 HTML로 작성해줘. 반드시 지킬 것:
- <p>, <h2>, <ul><li> 태그만 사용 (마크다운 금지, 코드블록 금지)
- 매수/매도 추천, 투자 권유, "사세요", "좋습니다", "유망합니다" 같은 표현 절대 금지. 객관적 수치 설명만.
- "오늘", "오늘의" 같은 표현 대신 정확한 날짜(${dateLabel})를 명시할 것. 이 날짜는 글이 올라가는 날이 아니라 데이터가 집계된 전 거래일임.
- 코스피와 코스닥을 합쳐서 집계한 데이터임을 자연스럽게 언급할 것
- 상한가 종목, 거래량 상위, 등락률 상위를 각각 소제목(h2)으로 나눠서 정리. 상한가 종목이 없으면 "상한가에 도달한 종목이 없습니다"라고 적을 것
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

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function wrapTitle(title, maxCharsPerLine) {
  const words = title.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

async function generateThumbnail(dateLabel, title) {
  const titleLines = wrapTitle(title, 14);
  const titleSvg = titleLines
    .map((line, i) => `<text x="35" y="${260 + i * 38}" font-size="30" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`)
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="450">
  <rect width="450" height="450" fill="#1e1b4b"/>
  <rect width="450" height="8" fill="#6366f1"/>
  <text x="35" y="100" font-size="22" font-weight="700" fill="#a5b4fc">코리안에셋 데이터브리핑</text>
  <text x="35" y="200" font-size="26" font-weight="700" fill="#818cf8">${escapeXml(dateLabel)}</text>
  ${titleSvg}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function uploadThumbnail(env, pngBuffer, fileName) {
  const path = `stock-brief/${fileName}`;
  const uploadRes = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/post-images/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "x-upsert": "true",
    },
    body: pngBuffer,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`thumbnail upload failed: ${errText}`);
  }
  return `${env.VITE_SUPABASE_URL}/storage/v1/object/public/post-images/${path}`;
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
  const thumbnailTitle = "상한가 종목, 거래량·등락률 순위";
  const title = `[데이터브리핑] ${dateLabel} ${thumbnailTitle}`;

  let thumbnailUrl = null;
  try {
    const pngBuffer = await generateThumbnail(dateLabel, thumbnailTitle);
    thumbnailUrl = await uploadThumbnail(env, pngBuffer, `${dataDate.toISOString().slice(0, 10)}.png`);
  } catch {
    thumbnailUrl = null;
  }

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
      thumbnail_url: thumbnailUrl,
      author_id: botAuthorId,
    }),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    throw new Error(`post insert failed: ${errText}`);
  }

  return { success: true, title, usedAi: !!aiContent, limitUpCount: limitUpList.length, thumbnailUrl };
}

export async function getOutboundIp() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    return (await r.json()).ip;
  } catch {
    return "lookup failed";
  }
}
