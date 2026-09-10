import { useEffect, useRef, useId } from "react";
import { supabase } from "./lib/supabaseClient";

function loadTinyMCEScript() {
  if (window.tinymce) return Promise.resolve();
  if (window.__tinymceLoading) return window.__tinymceLoading;
  window.__tinymceLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/tinymce/tinymce.min.js";
    script.referrerPolicy = "origin";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.__tinymceLoading;
}

function escapeHtml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

// Uploads a pasted/dropped/inserted image to the same "post-images" bucket
// the thumbnail uploader uses, and hands TinyMCE back the public URL.
function uploadEditorImage(userId, blob, filename) {
  return new Promise((resolve, reject) => {
    if (!blob.type.startsWith("image/")) {
      reject("이미지 파일만 첨부할 수 있습니다.");
      return;
    }
    if (blob.size > 5 * 1024 * 1024) {
      reject("5MB 이하의 이미지만 첨부할 수 있습니다.");
      return;
    }
    const ext = (filename && filename.includes(".")) ? filename.split(".").pop() : (blob.type.split("/")[1] || "png");
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    supabase.storage.from("post-images").upload(path, blob).then(({ error: uploadError }) => {
      if (uploadError) {
        reject(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("post-images").getPublicUrl(path);
      resolve(data.publicUrl);
    });
  });
}

export default function TinyEditor({ value, onChange, placeholder, minHeight = 420, linkablePosts = [], userId }) {
  const id = useId().replace(/:/g, "-");
  const initializedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const linkablePostsRef = useRef(linkablePosts);
  linkablePostsRef.current = linkablePosts;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    // Guard against React 18 StrictMode's dev-only double-invoke of effects;
    // TinyMCE attaches an iframe/editor instance imperatively and isn't safe
    // to tear down and recreate synchronously.
    if (initializedRef.current) return;
    initializedRef.current = true;

    loadTinyMCEScript().then(() => {
      window.tinymce.init({
        selector: `#${id}`,
        license_key: "gpl",
        height: minHeight,
        placeholder,
        menubar: false,
        language: "ko_KR",
        language_url: "/tinymce/langs/ko_KR.js",
        plugins: "lists link image table code wordcount advlist autolink charmap searchreplace visualblocks fullscreen preview",
        toolbar:
          "undo redo | blocks fontfamily fontsize | bold italic underline strikethrough forecolor backcolor | " +
          "alignleft aligncenter alignright | bullist numlist | link image imageGallery table | code fullscreen",
        // Without this, the cursor only turns into a text I-beam directly
        // over existing text — the empty space below the last line (which
        // is most of the box when a post is short) stays the plain arrow.
        // Other editors show the I-beam anywhere in the editable area so it
        // reads as "click here to type", not just on text you've already
        // written. The placeholder ("내용을 입력하세요") is TinyMCE's own
        // ::before overlay on the empty body, not part of the normal text
        // flow, so it needs its own rule — it doesn't just inherit body's.
        // h2 color matches the real post view's .post-content h2 rule
        // (index.css) — TinyMCE's default color swatch #10, "Blue".
        content_style: "body { font-family: -apple-system, sans-serif; font-size: 15px; cursor: text; } body[data-mce-placeholder]::before { cursor: text !important; } h2 { color: #3598db; }",
        branding: false,
        promotion: false,
        // Lets the toolbar's image button (and drag-drop/paste) upload a
        // local file straight into the "post-images" bucket instead of only
        // accepting an already-hosted image URL.
        automatic_uploads: true,
        paste_data_images: true,
        images_upload_handler: (blobInfo) =>
          uploadEditorImage(userIdRef.current, blobInfo.blob(), blobInfo.filename())
            .catch(err => { throw typeof err === "string" ? err : (err?.message || "업로드에 실패했습니다."); }),
        // TinyMCE defaults to relative_urls:true + remove_script_host:true,
        // which rewrites a pasted absolute same-origin URL (e.g. a link to
        // another post) into a host-relative href computed from *this*
        // page's path. That relative href then re-resolves against
        // whatever page it's later viewed from, producing a doubled path
        // (and a 404) unless viewed from the exact same directory it was
        // saved from. Keep pasted URLs absolute and untouched.
        relative_urls: false,
        remove_script_host: false,
        convert_urls: false,
        setup: (ed) => {
          ed.on("init", () => {
            if (value) ed.setContent(value);
          });
          ed.on("change keyup undo redo", () => {
            onChangeRef.current(ed.getContent());
          });
          // Multi-file picker -> uploads all of them, then inserts a single
          // grid block (2 columns for exactly 2 images, 3 for 3+) so photos
          // sit side by side in a row instead of stacking one per line like
          // the regular "image" button's single insert does. Grid, not a
          // swipeable carousel: no JS needed to display it, so it also
          // renders correctly on the crawler-facing post page (api/post-
          // meta.js), which can't run any client script.
          ed.ui.registry.addButton("imageGallery", {
            icon: "gallery",
            tooltip: "사진 여러 장 한번에 삽입",
            onAction: () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.multiple = true;
              input.onchange = async () => {
                const files = Array.from(input.files || []);
                if (files.length === 0) return;
                ed.setProgressState(true);
                const results = await Promise.allSettled(
                  files.map(f => uploadEditorImage(userIdRef.current, f, f.name))
                );
                ed.setProgressState(false);
                const urls = results.filter(r => r.status === "fulfilled").map(r => r.value);
                const failed = results.length - urls.length;
                if (urls.length === 0) {
                  alert("업로드에 실패했습니다.");
                  return;
                }
                if (urls.length === 1) {
                  ed.insertContent(`<img src="${urls[0]}" alt="" />`);
                } else {
                  const cols = urls.length >= 3 ? 3 : 2;
                  const imgsHtml = urls.map(u => `<img src="${u}" alt="" />`).join("");
                  ed.insertContent(`<div class="post-image-gallery cols-${cols}">${imgsHtml}</div><p></p>`);
                }
                if (failed > 0) alert(`${failed}장은 업로드에 실패했습니다 (5MB 이하 이미지만 가능).`);
              };
              input.click();
            },
          });
          // WordPress-style "[[" internal-link picker: type [[ then a few
          // letters of one of your own post titles to insert a real link
          // without leaving the editor or hand-copying a URL (see the
          // relative_urls note above for why a hand-pasted URL is fragile).
          ed.ui.registry.addAutocompleter("musapan-my-posts", {
            trigger: "[[",
            minChars: 0,
            maxResults: 10,
            fetch: (pattern) => {
              const query = pattern.trim().toLowerCase();
              const matches = linkablePostsRef.current
                .filter(p => !query || p.title.toLowerCase().includes(query))
                .slice(0, 10)
                .map(p => ({
                  type: "autocompleteitem",
                  value: `<a href="${p.url}">${escapeHtml(p.title)}</a>`,
                  text: p.title,
                }));
              return Promise.resolve(matches);
            },
            onAction: (autocompleteApi, rng, value) => {
              ed.selection.setRng(rng);
              ed.insertContent(value);
              autocompleteApi.hide();
            },
          });
        },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <textarea id={id} className="hidden" defaultValue={value} />;
}
