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
  const pageTitle = catInfo ? `${catInfo.name}${sub ? ` - ${sub}` : ""} | 코리안에셋` : "코리안에셋 - 주식, 부동산, 보험, 금융정보 커뮤니티";

  let posts = [];
  if (category) {
    const subFilter = sub ? `&subcategory=eq.${encodeURIComponent(sub)}` : "";
    posts = await fetchPosts(`&category=eq.${encodeURIComponent(category)}${subFilter}`, 100);
  } else {
    posts = await fetchPosts("", 50);
  }

  const navLinks = CATEGORIES.map(c => `<li><a href="${base}/${c.id}">${escapeHtml(c.name)}</a></li>`).join("\n");

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="주식, 부동산, 보험, 금융정보를 다루는 코리안에셋 커뮤니티입니다." />
</head>
<body>
<h1>${escapeHtml(pageTitle)}</h1>
<nav><ul>
${navLinks}
</ul></nav>
<ul>
${renderList(base, posts)}
</ul>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(html);
}
