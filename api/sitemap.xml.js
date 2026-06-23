const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const STATIC_PATHS = ["/", "/hot", "/point", "/stock", "/realestate", "/insurance", "/finance", "/politics", "/community"];

function slugify(name) {
  return encodeURIComponent(name.trim().replace(/[\s,]+/g, "-"));
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

export default async function handler(req, res) {
  const base = `https://${req.headers.host}`;
  let posts = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id,category,subcategory,created_at&order=id.desc&limit=5000`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) posts = await r.json();
  } catch {
    posts = [];
  }

  const urls = [
    ...STATIC_PATHS.map((p) => ({ loc: `${base}${p}`, priority: p === "/" ? "1.0" : "0.8" })),
    ...posts.map((p) => {
      const path = p.subcategory ? `/${p.category}/${slugify(p.subcategory)}/${p.id}` : `/${p.category}/${p.id}`;
      return { loc: `${base}${path}`, lastmod: (p.created_at || "").slice(0, 10), priority: "0.6" };
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ""}    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(xml);
}
