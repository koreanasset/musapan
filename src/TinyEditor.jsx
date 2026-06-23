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

export default function TinyEditor({ value, onChange, placeholder, minHeight = 420 }) {
  const id = useId().replace(/:/g, "-");
  const initializedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
        setup: (ed) => {
          ed.on("init", () => {
            if (value) ed.setContent(value);
          });
          ed.on("change keyup undo redo", () => {
            onChangeRef.current(ed.getContent());
          });
        },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <textarea id={id} className="hidden" defaultValue={value} />;
}
