// JSON-LD structured data for search engines / AdSense review.
// All values here are real site data — do not fill in placeholders
// (fake address, fake founding date, etc.) that Google can flag as inaccurate.

export const SITE_URL = "https://koreanasset.com";

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        "name": "코리안에셋",
        "alternateName": "KoreanAsset",
        "url": SITE_URL,
        "logo": {
          "@type": "ImageObject",
          "url": `${SITE_URL}/logo.png`,
          "width": 572,
          "height": 200
        },
        "description": "주식투자, 부동산, 보험, 금융 정보를 나누는 재테크 커뮤니티. 현직 보험설계사가 운영합니다.",
        "foundingDate": "2026-06-21",
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "customer support",
          "email": "rainbowcrow1234@gmail.com",
          "availableLanguage": "Korean"
        }
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        "url": SITE_URL,
        "name": "코리안에셋",
        "description": "재테크 커뮤니티 — 주식, 부동산, 보험, 금융 정보",
        "publisher": { "@id": `${SITE_URL}/#organization` },
        "inLanguage": "ko-KR"
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function ProfilePageSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "url": `${SITE_URL}/about`,
    "name": "코리안에셋 운영자 소개",
    "mainEntity": {
      "@type": "Person",
      "@id": `${SITE_URL}/about#author`,
      "name": "코리안에셋 운영자",
      "jobTitle": "보험설계사",
      "description": "현직 보험설계사이자 재테크 커뮤니티 코리안에셋 운영자. 생명보험·손해보험·제3보험 판매자격 및 증권투자권유대행인 자격 보유.",
      "url": `${SITE_URL}/about`,
      "image": `${SITE_URL}/about-profile-square.jpg`,
      "worksFor": { "@id": `${SITE_URL}/#organization` },
      "hasCredential": [
        {
          "@type": "EducationalOccupationalCredential",
          "name": "생명보험 판매자격",
          "credentialCategory": "보험 자격증",
          "recognizedBy": { "@type": "Organization", "name": "생명보험협회" }
        },
        {
          "@type": "EducationalOccupationalCredential",
          "name": "손해보험 판매자격",
          "credentialCategory": "보험 자격증",
          "recognizedBy": { "@type": "Organization", "name": "손해보험협회" }
        },
        {
          "@type": "EducationalOccupationalCredential",
          "name": "제3보험 판매자격",
          "credentialCategory": "보험 자격증",
          "recognizedBy": { "@type": "Organization", "name": "금융감독원" }
        },
        {
          "@type": "EducationalOccupationalCredential",
          "name": "증권투자권유대행인",
          "credentialCategory": "금융 자격증",
          "recognizedBy": { "@type": "Organization", "name": "금융투자협회" }
        }
      ],
      "knowsAbout": ["보험", "실손보험", "생명보험", "주식투자", "부동산", "재테크", "금융"]
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// updatedAt: ISO timestamp of the most recent stock_quotes row, if loaded yet
// (see src/StockQuotes.jsx, the only caller). Used for both the crawler-
// facing rendering in api/list-meta.js and this live-page counterpart —
// keep the two in sync if either changes.
export function DatasetSchema({ updatedAt }) {
  const url = `${SITE_URL}/stock/${encodeURIComponent("오늘주식시세")}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": "오늘의 주식시세 - 코스피 코스닥 전종목 시세",
    "description": "코스피, 코스닥 전 종목의 오늘자 현재가, 전일대비, 등락률, 거래량을 장 마감 후 매일 업데이트합니다.",
    "url": url,
    "keywords": ["오늘의 주식시세", "전종목시세", "코스피 시세", "코스닥 시세", "주식시세"],
    "variableMeasured": ["현재가", "전일대비", "등락률", "거래량"],
    "inLanguage": "ko-KR",
    "creator": { "@id": `${SITE_URL}/#organization` },
    "publisher": { "@id": `${SITE_URL}/#organization` },
    ...(updatedAt ? { "dateModified": updatedAt, "temporalCoverage": updatedAt.slice(0, 10) } : {}),
    "distribution": {
      "@type": "DataDownload",
      "encodingFormat": "text/html",
      "contentUrl": url
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// path: relative path from buildPath(view), e.g. "/stock/123"
// categoryName: display name already resolved by the caller (CATEGORIES lookup)
export function ArticleSchema({ post, path, categoryName }) {
  if (!post) return null;
  const url = `${SITE_URL}${path}`;
  const description = stripHtml(post.content || "").slice(0, 200);

  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": description,
    "url": url,
    "datePublished": post.createdAt,
    "dateModified": post.createdAt,
    "image": post.thumbnail || `${SITE_URL}/logo.png`,
    "inLanguage": "ko-KR",
    "author": {
      "@type": "Person",
      "@id": `${SITE_URL}/about#author`,
      "name": "코리안에셋 운영자",
      "jobTitle": "보험설계사",
      "url": `${SITE_URL}/about`
    },
    "publisher": { "@id": `${SITE_URL}/#organization` },
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "articleSection": categoryName || "금융정보"
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
