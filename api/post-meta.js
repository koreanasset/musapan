import sanitizeHtml from "sanitize-html";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SITE_URL = "https://koreanasset.com"; // see api/list-meta.js's note on why this isn't imported from src/SchemaMarkup.jsx

// These three post daily, in an near-identical template with only the
// numbers changing (오늘의 특징주: stockBrief.js, 중요공시/뉴스:
// disclosureBrief.js, 경매, 공매: onbidBrief.js) — Search Console flagged
// this exact pattern as "Discovered - currently not indexed" and growing
// (118 pages and climbing as of 2026-09-02): Google isn't rejecting them
// individually, it's decided the pattern isn't worth crawling at all.
// noindex tells Google that deliberately instead of leaving it to notice
// on its own, which is a healthier signal for the site's overall quality
// than a pile of "discovered but ignored" URLs.
// 분양정보 (aptBrief.js) is deliberately NOT in this set: each post is
// about a distinct real apartment, not a repeating daily rollup — it's
// unique content, not this pattern (also currently hidden entirely; see
// HIDDEN_SUBCATEGORIES).
// Gated on is_auto_generated too — the automation posts to these same
// subcategories under the site's own "코리안에셋" account, which is also
// how the owner posts real hand-written articles, so subcategory alone
// isn't enough: it noindexed a real post once (2026-09-03) before this
// column existed.
const NOINDEX_SUBCATEGORIES = new Set(["오늘의 특징주", "중요공시/뉴스", "경매, 공매"]);

const CATEGORY_NAMES = {
  stock: "주식투자",
  realestate: "부동산",
  insurance: "보험대란성지",
  finance: "금융정보",
  politics: "정치사회",
  community: "커뮤니티",
};

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

// Matches ArticleSchema in src/SchemaMarkup.jsx — that component only ever
// renders on the live React page, which crawlers (Googlebot,
// Mediapartners-Google, KakaoTalk, etc. — see vercel.json) never actually
// reach for a post URL; they get this server-rendered path instead. Keep
// the two in sync if either changes.
function articleJsonLd(post, url, image) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": stripHtml(post.content).slice(0, 200),
    "url": url,
    "datePublished": post.created_at,
    "dateModified": post.created_at,
    "image": image,
    "inLanguage": "ko-KR",
    "author": { "@type": "Person", "name": "코리안에셋 운영자", "url": `${SITE_URL}/about` },
    "publisher": { "@type": "Organization", "name": "코리안에셋", "url": SITE_URL },
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "articleSection": CATEGORY_NAMES[post.category] || "금융정보",
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

// What a crawler gets as the post body. This used to be
// `<p>${stripHtml(content)}</p>` — every post flattened into one paragraph of
// plain text, with its images, headings, lists and links all thrown away
// (measured 2026-10-11: originals had 1-9 images, 3-7 h2s, lists and links;
// the served page had 0 of each). Googlebot and AdSense's Mediapartners-Google
// are both routed here instead of the real page (see vercel.json), so that
// stripped version is the *only* thing either of them ever evaluates — the
// structure and photos that make a post look like a real article never
// reached them. Serve the post's actual HTML structure instead, sanitized
// (members can write posts; the browser side uses DOMPurify, this is the
// server-side equivalent).
function renderPostBody(post) {
  let imgCount = 0;
  return sanitizeHtml(post.content || "", {
    allowedTags: [
      "p", "br", "hr", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
      "strong", "em", "b", "i", "u", "s", "a", "img", "blockquote", "pre", "code",
      "table", "thead", "tbody", "tr", "td", "th", "div", "span", "figure", "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "title", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      // One h1 per page (the title); a body h1 becomes an h2.
      h1: "h2",
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: "noopener" } }),
      // Editor-inserted images mostly have no alt text.
      img: (tagName, attribs) => {
        imgCount += 1;
        return { tagName, attribs: { ...attribs, alt: attribs.alt || `${post.title} 사진 ${imgCount}`, loading: "lazy" } };
      },
    },
  });
}

async function fetchRelatedPosts(post) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?category=eq.${encodeURIComponent(post.category)}&id=neq.${post.id}&select=id,title,category,subcategory&order=id.desc&limit=6`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const base = `https://${req.headers.host}`;
  const id = req.query.id;
  const fallbackImage = `${base}/icon-180-v3.png`;

  let post = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&select=id,title,content,category,subcategory,thumbnail_url,created_at,is_auto_generated`,
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
  const related = await fetchRelatedPosts(post);

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
${post.is_auto_generated && NOINDEX_SUBCATEGORIES.has(post.subcategory) ? '<meta name="robots" content="noindex, follow" />\n' : ""}<link rel="canonical" href="${escapeHtml(url)}" />
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
${articleJsonLd(post, url, image)}
<style>
body{font-family:-apple-system,"Segoe UI","Malgun Gothic",sans-serif;max-width:760px;margin:0 auto;padding:16px;line-height:1.7;color:#1f2937}
img{max-width:100%;height:auto}h1{font-size:1.5em;line-height:1.35}h2{font-size:1.3em;color:#3598db}
header,footer{font-size:.9em;color:#6b7280}table{border-collapse:collapse}td,th{border:1px solid #e5e7eb;padding:.4em .6em}
</style>
</head>
<body>
<header><a href="${base}/">코리안에셋</a>${CATEGORY_NAMES[post.category] ? ` › <a href="${base}/${escapeHtml(post.category)}">${escapeHtml(CATEGORY_NAMES[post.category])}</a>` : ""}</header>
<article>
<h1>${escapeHtml(title)}</h1>
<p><time datetime="${escapeHtml(post.created_at || "")}">${escapeHtml((post.created_at || "").slice(0, 10).replace(/-/g, "."))}</time></p>
${renderPostBody(post)}
</article>
${related.length > 0 ? `<nav>
<h2>같은 게시판의 다른 글</h2>
<ul>
${related.map(p => `<li><a href="${base}${postPath(p)}">${escapeHtml(p.title)}</a></li>`).join("\n")}
</ul>
</nav>` : ""}
<footer><a href="${base}/about">소개</a> · <a href="${base}/terms">이용약관</a> · <a href="${base}/privacy">개인정보처리방침</a></footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(html);
}
