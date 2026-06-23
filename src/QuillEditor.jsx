import { useEffect, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  [{ font: [] }],
  [{ size: ["small", false, "large", "huge"] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ align: [] }],
  ["blockquote", "code-block"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "image"],
  ["clean"],
];

export default function QuillEditor({ value, onChange, placeholder }) {
  const containerRef = useRef(null);
  const quillRef = useRef(null);
  const initializedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    // Guard against React 18 StrictMode's dev-only double-invoke of effects:
    // Quill mutates the DOM imperatively and isn't safe to tear down and
    // recreate synchronously, so each component instance only initializes once.
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    const editorEl = document.createElement("div");
    containerRef.current.appendChild(editorEl);

    const quill = new Quill(editorEl, {
      theme: "snow",
      placeholder,
      modules: { toolbar: TOOLBAR_OPTIONS },
    });
    quillRef.current = quill;

    if (value) quill.root.innerHTML = value;

    quill.on("text-change", () => {
      onChangeRef.current(quill.root.innerHTML);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="bg-white" />;
}
