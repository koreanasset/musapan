const RSS_URL = "https://trends.google.com/trending/rss?geo=KR";

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchTop10() {
  const r = await fetch(RSS_URL);
  if (!r.ok) throw new Error(`Google Trends RSS fetch failed: ${r.status}`);
  const xml = await r.text();
  // Match only the outer <item> blocks; each item's own <title>/<ht:approx_traffic>
  // appear once before any nested <ht:news_item> sub-blocks, so a simple
  // non-greedy tag match is enough without a full XML parser.
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.slice(0, 10).map((block, i) => ({
    rank: i + 1,
    keyword: decodeEntities(extractTag(block, "title") || ""),
    traffic: extractTag(block, "ht:approx_traffic"),
  }));
}

async function fetchStoredRanking(env) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/google_trends?select=rank,keyword&order=rank.asc`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Error(`fetching stored google_trends failed: ${await r.text()}`);
  return r.json();
}

function sameRanking(fresh, stored) {
  if (fresh.length !== stored.length) return false;
  return fresh.every((item, i) => item.keyword === stored[i].keyword);
}

// Only writes (and bumps updated_at) when the top-10 keyword order actually
// changed — Google's feed itself only refreshes a handful of times a day, so
// polling more often than that shouldn't make the site "update" for no reason.
export async function runGoogleTrendsUpdate(env) {
  const fresh = await fetchTop10();
  if (fresh.length === 0) {
    return { skipped: true, reason: "empty RSS feed" };
  }

  const stored = await fetchStoredRanking(env);
  if (sameRanking(fresh, stored)) {
    return { skipped: true, reason: "ranking unchanged" };
  }

  const now = new Date().toISOString();
  const rows = fresh.map(item => ({ ...item, updated_at: now }));

  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/google_trends?on_conflict=rank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`updating google_trends failed: ${await r.text()}`);

  return { success: true, updated: rows.length, keywords: rows.map(row => row.keyword) };
}
