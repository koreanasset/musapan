import { useState } from "react";
import { Link as LinkIcon } from "lucide-react";

function openShareWindow(shareUrl) {
  window.open(shareUrl, "_blank", "width=600,height=600,noopener,noreferrer");
}

function loadKakaoSdk() {
  return new Promise((resolve, reject) => {
    if (window.Kakao) return resolve(window.Kakao);
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(window.Kakao);
    script.onerror = () => reject(new Error("Kakao SDK load failed"));
    document.head.appendChild(script);
  });
}

function KakaoIcon({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.79 1.85 5.24 4.65 6.67-.2.75-.73 2.71-.84 3.13-.13.51.19.5.4.36.16-.1 2.57-1.74 3.6-2.45.7.1 1.42.16 2.19.16 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
    </svg>
  );
}

function XIcon({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M18.244 2H21l-6.52 7.47L22 22h-6.828l-4.78-6.26L4.9 22H2.14l7.03-8.04L2 2h6.914l4.32 5.71L18.244 2zm-1.197 18h1.833L7.084 4H5.117L17.047 20z" />
    </svg>
  );
}

function FacebookIcon({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M14 8.5h2V5.5h-2c-2.21 0-4 1.79-4 4V11H8v3h2v7h3v-7h2.5l.5-3H13V9.5c0-.55.45-1 1-1z" />
    </svg>
  );
}

function NaverIcon({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M16.2 3v9.2L7.8 3H3v18h4.8v-9.2L16.2 21H21V3z" />
    </svg>
  );
}

function BandIcon({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M4 17.5c3-1.6 5.6-2.6 8-2.6.9 0 1.6.5 1.6 1.3 0 1.1-1.3 1.7-3.4 2.5-2.6 1-4.2 1.9-4.2 3.4 0 1.3 1.4 2.1 3.6 2.1 2.9 0 5.8-1.2 8.4-2.9l-1-1.9c-2.2 1.4-4.6 2.3-6.7 2.3-.8 0-1.3-.3-1.3-.8 0-.6.9-1 2.8-1.7 2.9-1.1 4.8-2.1 4.8-4.1 0-1.9-1.8-3-4.5-3-2.7 0-5.6 1-8.6 2.7z" />
      <circle cx="16.5" cy="6" r="2.5" />
    </svg>
  );
}

export default function ShareButtons({ url, title, thumbnail }) {
  const [copied, setCopied] = useState(false);

  async function shareKakao() {
    const key = import.meta.env.VITE_KAKAO_JS_KEY;
    if (!key) {
      alert("카카오톡 공유는 Kakao Developers 앱 키 등록 후 사용할 수 있습니다.");
      return;
    }
    try {
      const Kakao = await loadKakaoSdk();
      if (!Kakao.isInitialized()) Kakao.init(key);
      Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title,
          description: "코리안에셋",
          imageUrl: thumbnail || `${window.location.origin}/logo.png`,
          link: { mobileWebUrl: url, webUrl: url }
        },
        buttons: [{ title: "자세히 보기", link: { mobileWebUrl: url, webUrl: url } }]
      });
    } catch {
      alert("카카오톡 공유를 불러오지 못했습니다.");
    }
  }

  function shareFacebook() {
    openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
  }
  function shareX() {
    openShareWindow(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`);
  }
  function shareBand() {
    openShareWindow(`https://band.us/plugin/share?body=${encodeURIComponent(title)}&route=${encodeURIComponent(url)}`);
  }
  function shareNaverBlog() {
    openShareWindow(`https://blog.naver.com/openapi/share?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`);
  }
  function shareNaverCafe() {
    openShareWindow(`https://share.naver.com/web/shareView?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const buttons = [
    { key: "kakao", label: "카카오톡", onClick: shareKakao, bg: "#FEE500", fg: "#3C1E1E", Icon: KakaoIcon },
    { key: "naverblog", label: "네이버블로그", onClick: shareNaverBlog, bg: "#03C75A", fg: "#fff", Icon: NaverIcon },
    { key: "navercafe", label: "네이버카페", onClick: shareNaverCafe, bg: "#03C75A", fg: "#fff", Icon: NaverIcon },
    { key: "band", label: "밴드", onClick: shareBand, bg: "#00C73C", fg: "#fff", Icon: BandIcon },
    { key: "x", label: "X", onClick: shareX, bg: "#000000", fg: "#fff", Icon: XIcon },
    { key: "facebook", label: "페이스북", onClick: shareFacebook, bg: "#1877F2", fg: "#fff", Icon: FacebookIcon }
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap py-3 border-t border-gray-100">
      <span className="text-xs text-gray-400 mr-1 shrink-0">공유하기</span>
      {buttons.map(({ key, label, onClick, bg, fg, Icon }) => (
        <button
          key={key}
          onClick={onClick}
          title={label}
          aria-label={label}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:opacity-80 transition shrink-0"
          style={{ backgroundColor: bg, color: fg }}
        >
          <Icon size={16} />
        </button>
      ))}
      <button
        onClick={copyLink}
        title="주소복사"
        aria-label="주소복사"
        className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 transition shrink-0"
      >
        <LinkIcon size={16} />
      </button>
      {copied && <span className="text-xs text-indigo-600">링크가 복사되었습니다</span>}
    </div>
  );
}
