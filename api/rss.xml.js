const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

function slugify(name) {
  return encodeURIComponent(name.trim().replace(/[\s,/]+/g, "-"));
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

export default async function handler(req, res) {
  const base = `https://${req.headers.host}`;
  let posts = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=id,title,content,category,subcategory,created_at,profiles!posts_author_id_fkey(nickname)&order=id.desc&limit=30`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (r.ok) posts = await r.json();
  } catch {
    posts = [];
  }

  const items = posts
    .map((p) => {
      const path = p.subcategory ? `/${p.category}/${slugify(p.subcategory)}/${p.id}` : `/${p.category}/${p.id}`;
      const link = `${base}${path}`;
      const pubDate = new Date(p.created_at).toUTCString();
      return `  <item>
    <title>${escapeXml(p.title)}</title>
    <link>${escapeXml(link)}</link>
    <guid isPermaLink="true">${escapeXml(link)}</guid>
    <pubDate>${pubDate}</pubDate>
    <author>${escapeXml(p.profiles?.nickname || "코리안에셋")}</author>
    <description><![CDATA[${p.content || ""}]]></description>
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>코리안에셋</title>
  <link>${base}</link>
  <description>주식, 부동산, 보험, 금융정보 커뮤니티</description>
  <language>ko-kr</language>
${items}
</channel>
</rss>
`;

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(xml);
}
