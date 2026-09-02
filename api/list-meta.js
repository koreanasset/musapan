const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const CATEGORIES = [
  { id: "stock", name: "주식투자" },
  { id: "realestate", name: "부동산" },
  { id: "insurance", name: "보험대란성지" },
  { id: "finance", name: "금융정보" },
  { id: "politics", name: "정치사회" },
  { id: "community", name: "커뮤니티" },
];

// Subcategories whose list (not just detail) requires login on the real
// site; keep them out of the crawler-facing listing too.
const LIST_REQUIRES_LOGIN = new Set(["보험대란알림"]);

// "오늘주식시세" isn't a post board (see STOCK_QUOTES_SUB in src/App.jsx) —
// it's a live data table (musapan/src/StockQuotes.jsx) reading the
// stock_quotes table directly. Crawlers (including Mediapartners-Google,
// AdSense's reviewer bot — see the user-agent list in vercel.json) hit
// this endpoint instead of the real React page, so without this branch
// they'd see a title with an empty post list under it: zero actual
// content, which is exactly the "thin page" signal a review is looking
// to avoid, not a truthful reflection of what the page is.
const STOCK_QUOTES_SUB = "오늘주식시세";
const STOCK_QUOTES_ROWS = 100;

async function fetchStockQuotes() {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/stock_quotes?select=stk_cd,stk_nm,market,cur_prc,pred_pre,flu_rt,trde_qty,updated_at&order=trde_qty.desc&limit=${STOCK_QUOTES_ROWS}`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

function renderStockQuotesTable(rows) {
  if (rows.length === 0) return "<p>오늘자 시세 데이터를 아직 준비 중입니다.</p>";
  const updatedAt = rows[0].updated_at
    ? new Date(rows[0].updated_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  const body = rows
    .map(r => {
      const dir = r.pred_pre > 0 ? "상승" : r.pred_pre < 0 ? "하락" : "보합";
      const sign = r.flu_rt > 0 ? "+" : "";
      return `<tr><td>${escapeHtml(r.stk_nm)}</td><td>${escapeHtml(r.market)}</td><td>${Number(r.cur_prc).toLocaleString()}원</td><td>${dir} ${Number(Math.abs(r.pred_pre)).toLocaleString()}</td><td>${sign}${r.flu_rt}%</td><td>${Number(r.trde_qty).toLocaleString()}주</td></tr>`;
    })
    .join("\n");
  return `<p>코리안에셋이 매일 장 마감 후 코스피·코스닥 전 종목의 현재가, 전일대비, 등락률, 거래량을 정리해 보여드리는 시세 게시판입니다.${updatedAt ? ` (${escapeHtml(updatedAt)} 장 마감 기준, 거래량 상위 ${rows.length}종목)` : ""}</p>
<table>
<thead><tr><th>종목명</th><th>시장</th><th>현재가</th><th>전일대비</th><th>등락률</th><th>거래량</th></tr></thead>
<tbody>
${body}
</tbody>
</table>`;
}

function slugify(name) {
  return encodeURIComponent(name.trim().replace(/[\s,/]+/g, "-"));
}

function escapeHtml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function postPath(p) {
  return p.subcategory ? `/${p.category}/${slugify(p.subcategory)}/${p.id}` : `/${p.category}/${p.id}`;
}

async function fetchPosts(filterQuery, limit) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=id,title,content,category,subcategory,created_at${filterQuery}&order=id.desc&limit=${limit}`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

function renderList(base, posts) {
  return posts
    .filter(p => !LIST_REQUIRES_LOGIN.has(p.subcategory))
    .map(p => {
      const link = `${base}${postPath(p)}`;
      const excerpt = stripHtml(p.content).slice(0, 100);
      return `<li><a href="${escapeHtml(link)}">${escapeHtml(p.title)}</a> - ${escapeHtml(excerpt)}</li>`;
    })
    .join("\n");
}

export default async function handler(req, res) {
  const base = `https://${req.headers.host}`;
  const category = req.query.category || null;
  const sub = req.query.sub || null;

  const catInfo = CATEGORIES.find(c => c.id === category);
  const isStockQuotes = category === "stock" && sub === STOCK_QUOTES_SUB;
  const pageTitle = isStockQuotes
    ? "오늘의 주식시세 - 코스피 코스닥 전종목 시세 | 코리안에셋"
    : catInfo ? `${catInfo.name}${sub ? ` - ${sub}` : ""} | 코리안에셋` : "코리안에셋 - 주식, 부동산, 보험, 금융정보 커뮤니티";
  const pageDescription = isStockQuotes
    ? "코스피, 코스닥 전 종목의 오늘자 현재가, 전일대비, 등락률, 거래량을 장 마감 후 매일 업데이트합니다."
    : "주식, 부동산, 보험, 금융정보를 다루는 코리안에셋 커뮤니티입니다.";
  const canonicalPath = category ? `/${category}${sub ? `/${slugify(sub)}` : ""}` : "/";

  let posts = [];
  let bodyHtml;
  if (isStockQuotes) {
    bodyHtml = renderStockQuotesTable(await fetchStockQuotes());
  } else {
    if (category) {
      const subFilter = sub ? `&subcategory=eq.${encodeURIComponent(sub)}` : "";
      posts = await fetchPosts(`&category=eq.${encodeURIComponent(category)}${subFilter}`, 100);
    } else {
      posts = await fetchPosts("", 50);
    }
    bodyHtml = `<ul>\n${renderList(base, posts)}\n</ul>`;
  }

  const navLinks = CATEGORIES.map(c => `<li><a href="${base}/${c.id}">${escapeHtml(c.name)}</a></li>`).join("\n");

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(pageDescription)}" />
<link rel="canonical" href="${escapeHtml(base + canonicalPath)}" />
<link rel="icon" type="image/png" sizes="32x32" href="${base}/icon-32-v3.png" />
<link rel="icon" type="image/png" sizes="64x64" href="${base}/icon-64-v3.png" />
</head>
<body>
<h1>${escapeHtml(pageTitle)}</h1>
<nav><ul>
${navLinks}
</ul></nav>
${bodyHtml}
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(html);
}
