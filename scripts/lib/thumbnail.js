import sharp from "sharp";

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

export async function generateThumbnail(dateLabel, title, { heading = "코리안에셋 데이터브리핑" } = {}) {
  const titleLines = wrapTitle(title, 14);
  const titleSvg = titleLines
    .map((line, i) => `<text x="35" y="${260 + i * 38}" font-size="30" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`)
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="450">
  <rect width="450" height="450" fill="#1e1b4b"/>
  <rect width="450" height="8" fill="#6366f1"/>
  <text x="35" y="100" font-size="22" font-weight="700" fill="#a5b4fc">${escapeXml(heading)}</text>
  <text x="35" y="200" font-size="26" font-weight="700" fill="#818cf8">${escapeXml(dateLabel)}</text>
  ${titleSvg}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function uploadThumbnail(env, pngBuffer, fileName) {
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

export async function insertPost(env, { category, subcategory, title, content, thumbnailUrl, authorId }) {
  const insertRes = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      category,
      subcategory,
      title,
      content,
      thumbnail_url: thumbnailUrl,
      author_id: authorId,
    }),
  });
  if (!insertRes.ok) {
    const errText = await insertRes.text();
    throw new Error(`post insert failed: ${errText}`);
  }
  return insertRes.json();
}
