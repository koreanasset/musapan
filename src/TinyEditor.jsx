import { useEffect, useRef, useId } from "react";

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

export default function TinyEditor({ value, onChange, placeholder, minHeight = 420, linkablePosts = [] }) {
  const id = useId().replace(/:/g, "-");
  const initializedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const linkablePostsRef = useRef(linkablePosts);
  linkablePostsRef.current = linkablePosts;

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
        plugins: "lists link image table code wordcount advlist autolink charmap searchreplace visualblocks fullscreen preview",
        toolbar:
          "undo redo | blocks fontfamily fontsize | bold italic underline strikethrough forecolor backcolor | " +
          "alignleft aligncenter alignright | bullist numlist | link image table | code fullscreen",
        content_style: "body { font-family: -apple-system, sans-serif; font-size: 15px; }",
        branding: false,
        promotion: false,
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
