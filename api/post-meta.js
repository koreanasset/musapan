const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

function slugify(name) {
  return encodeURIComponent(name.trim().replace(/[\s,/]+/g, "-"));
}

function postPath(p) {
  return p.subcategory ? `/${p.category}/${slugify(p.subcategory)}/${p.id}` : `/${p.category}/${p.id}`;
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

export default async function handler(req, res) {
  const base = `https://${req.headers.host}`;
  const id = req.query.id;
  const fallbackImage = `${base}/icon-180-v3.png`;

  let post = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&select=id,title,content,category,subcategory,thumbnail_url`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (r.ok) {
      const rows = await r.json();
      post = rows[0] || null;
    }
  } catch {
    post = null;
  }

  if (!post) {
    res.status(404).send("Not found");
    return;
  }

  const title = post.title;
  const fullText = stripHtml(post.content);
  const description = fullText.slice(0, 150); // meta description: short, by convention
  const image = post.thumbnail_url || fallbackImage;
  // Built from the post's own category/subcategory rather than trusting
  // req.query.path — Vercel's rewrite substitution doesn't re-encode a
  // Korean subcategory segment before dropping it into the destination
  // query string, so that value arrives mojibake'd (broke og:url/canonical).
  const url = `${base}${postPath(post)}`;

  // Meta tags (og:description etc.) stay short for link previews (Kakao,
  // Facebook, Twitter only read these tags). The <body> below carries the
  // FULL post text so search engine crawlers — which read body content,
  // not just meta tags — can index more than a 150-character snippet.
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(url)}" />
<link rel="icon" type="image/png" sizes="32x32" href="${base}/icon-32-v3.png" />
<link rel="icon" type="image/png" sizes="64x64" href="${base}/icon-64-v3.png" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:site_name" content="코리안에셋" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(fullText)}</p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(html);
}
