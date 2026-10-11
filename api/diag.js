// TEMPORARY diagnostic — remove once the sanitize-html question is settled.
// Reports which Node the deployment actually runs and whether sanitize-html
// loads and works there, without being able to take a real page down: the
// import is dynamic and wrapped, so a failure is reported, not thrown.
export default async function handler(req, res) {
  const out = { node: process.version };
  try {
    const m = await import("sanitize-html");
    const sanitize = m.default || m;
    out.loaded = typeof sanitize;
    out.sample = sanitize('<h1>제목</h1><p>안녕</p><script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">링크</a>', {
      allowedTags: ["p", "h2", "a", "img"],
      allowedAttributes: { a: ["href", "rel"], img: ["src", "alt", "loading"] },
      allowedSchemes: ["http", "https", "mailto"],
      transformTags: {
        h1: "h2",
        a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: "noopener" } }),
        img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, alt: attribs.alt || "사진", loading: "lazy" } }),
      },
    });
  } catch (e) {
    out.error = String((e && e.message) || e).slice(0, 600);
    out.code = e && e.code;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(out));
}
