import { useEffect, useRef } from "react";

// Manual (non-Auto) ad unit, deliberately rendered only inside actual post
// content — AdSense's rejection reason was ads appearing on content-less
// screens, which Auto ads' page-wide auto-scanning can't reliably avoid in
// an SPA (the script keeps scanning as client-side navigation swaps screens
// in and out). A manual <ins> only exists in the DOM while this component
// is mounted, so it can never appear anywhere but here.
export default function AdUnit({ adSlot = "3462237439" }) {
  const insRef = useRef(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (pushedRef.current) return;
    pushedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle.js not loaded yet or blocked (ad blocker) — safe to ignore.
    }
  }, []);

  return (
    <ins
      ref={insRef}
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client="ca-pub-5928272811428879"
      data-ad-slot={adSlot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
