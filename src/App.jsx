import { useState, useEffect, useCallback, useRef } from "react";
import { TrendingUp, Home, Shield, Coins, Megaphone, Users, Target, Search, Bell, Mail, User, Eye, ThumbsUp, ThumbsDown, X, Flame, Trophy, ChevronRight, UserCircle2, Ban, MessageSquareText } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

const CATEGORIES = [
  { id: "hot", name: "실시간인기글", icon: Flame, color: "#ef4444", sub: ["오늘의 인기글", "주간 인기글", "댓글 많은 글"] },
  { id: "stock", name: "주식투자", icon: TrendingUp, color: "#3b82f6", sub: ["주식추천AI", "국내주식", "해외주식", "ETF, ETN", "중요공시/뉴스", "주식토론방", "무사어판 칼럼"] },
  { id: "realestate", name: "부동산", icon: Home, color: "#10b981", sub: ["분양정보", "경매, 공매", "부동산토론"] },
  { id: "insurance", name: "보험대란성지", icon: Shield, color: "#f43f5e", sub: ["보험대란알림", "Hey보험딜러 비교견적내줘", "내보험 진단하기", "청구 보상 후기"] },
  { id: "finance", name: "금융정보", icon: Coins, color: "#eab308", sub: ["가상화폐", "신용카드", "대출", "세금 및 연말정산", "정부지원금, 복지혜택"] },
  { id: "politics", name: "정치사회", icon: Megaphone, color: "#8b5cf6", sub: ["정치토론방", "사회, 사건사고", "생활 법률", "보수", "중도", "진보"] },
  { id: "community", name: "커뮤니티", icon: Users, color: "#06b6d4", sub: ["유머, 움짤", "자유게시판", "스포츠", "육아 정보", "뷰티 정보", "헬스, 다이어트, 운동"] },
  { id: "point", name: "포인트놀이터", icon: Target, color: "#f97316", sub: ["포인트 복권방", "포인트 교환처"] },
];

const BOARD_CATEGORIES = CATEGORIES.filter(c => c.id !== "hot" && c.id !== "point");

function buildPath(view) {
  if (view.page === "detail" && view.postId) {
    if (view.category) {
      const base = view.subcategory ? `/${view.category}/${encodeURIComponent(view.subcategory)}` : `/${view.category}`;
      return `${base}/${view.postId}`;
    }
    return `/post/${view.postId}`;
  }
  if (view.page === "hot") return "/hot";
  if (view.page === "point") return "/point";
  if (view.page === "category" && view.category) {
    if (view.subcategory) return `/${view.category}/${encodeURIComponent(view.subcategory)}`;
    return `/${view.category}`;
  }
  return "/";
}

function parseViewFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const home = { page: "home", category: null, subcategory: null, postId: null };
  if (parts.length === 0) return home;
  if (parts[0] === "post" && parts[1]) {
    const postId = Number(parts[1]);
    if (!Number.isNaN(postId)) return { page: "detail", category: null, subcategory: null, postId };
  }
  if (parts[0] === "hot") return { page: "hot", category: "hot", subcategory: null, postId: null };
  if (parts[0] === "point") return { page: "point", category: "point", subcategory: null, postId: null };
  const cat = BOARD_CATEGORIES.find(c => c.id === parts[0]);
  if (cat) {
    if (parts.length === 1) return { page: "category", category: cat.id, subcategory: null, postId: null };
    const last = parts[parts.length - 1];
    const maybeId = Number(last);
    if (!Number.isNaN(maybeId)) {
      const subcategory = parts.length >= 3 ? parts[1] : null;
      return { page: "detail", category: cat.id, subcategory, postId: maybeId };
    }
    return { page: "category", category: cat.id, subcategory: parts[1] || null, postId: null };
  }
  return home;
}

const BOARD_PERMISSIONS = {
  "보험대란알림": { write: "master", list: "member", detail: "member" },
  "Hey보험딜러 비교견적내줘": { write: "member", list: "guest", detail: "owner" },
  "내보험 진단하기": { write: "member", list: "guest", detail: "owner" },
  "주식추천AI": { write: "master", list: "guest", detail: "member" },
  "무사어판 칼럼": { write: "master", list: "guest", detail: "guest" },
};

const ADMIN_POINTS_CAP = 9999;
const RANK_THRESHOLDS = [0, 50, 300, 600, 1200, 2000];
const RANK_ORDER = ["이순신", "퇴계이황", "율곡이이", "세종대왕", "신사임당", "무사어판"];

function pointsProgress(user) {
  if (!user) return 0;
  if (user.role === "master" || user.role === "staff") {
    return Math.min(100, (user.points / ADMIN_POINTS_CAP) * 100);
  }
  const points = user.points || 0;
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= RANK_THRESHOLDS[i]) {
      if (i === RANK_THRESHOLDS.length - 1) return 100;
      const lower = RANK_THRESHOLDS[i];
      const upper = RANK_THRESHOLDS[i + 1];
      return Math.min(100, ((points - lower) / (upper - lower)) * 100);
    }
  }
  return 0;
}

function pointLabel(user) {
  if (!user) return "이순신";
  if (user.role === "master") return "마스터";
  if (user.role === "staff") return "스탭";
  const points = user.points || 0;
  if (points >= 2000) return "무사어판";
  if (points >= 1200) return "신사임당";
  if (points >= 600) return "세종대왕";
  if (points >= 300) return "율곡이이";
  if (points >= 50) return "퇴계이황";
  return "이순신";
}

function rankEmoji(user) {
  if (!user) return "🥈";
  if (user.role === "master") return "👑";
  if (user.role === "staff") return "🪖";
  const points = user.points || 0;
  if (points >= 2000) return "💎";
  if (points >= 1200) return "💰";
  if (points >= 600) return "🟢";
  if (points >= 300) return "🟠";
  if (points >= 50) return "🟣";
  return "🥈";
}

function maskIp(ip, isAdmin) {
  if (!ip) return "-";
  if (isAdmin) return ip;
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.xxx.xx`;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

async function getClientIp() {
  try {
    const res = await fetch("/api/ip");
    const data = await res.json();
    return data.ip || null;
  } catch {
    return null;
  }
}

const AVATAR_COLORS = ["#f87171", "#fb923c", "#fbbf24", "#34d399", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6"];
function avatarColorFor(nickname) {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) hash = (hash * 31 + nickname.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

function Avatar({ nickname, size = 28, avatarUrl }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={nickname}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, backgroundColor: avatarColorFor(nickname) }}
      className="rounded-full flex items-center justify-center text-white shrink-0"
    >
      <UserCircle2 size={size * 0.75} strokeWidth={1.5} />
    </div>
  );
}

function NicknameMenu({ nickname, currentUser, blockedList, onToggleBlock, onMessage, onViewProfile, onClose }) {
  const isMe = currentUser && currentUser.nickname === nickname;
  const isBlocked = blockedList.includes(nickname);
  return (
    <div
      style={{ position: "fixed", zIndex: 9999, minWidth: "160px" }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl py-1.5"
      onClick={e => e.stopPropagation()}
    >
      <button onClick={() => { onViewProfile(nickname); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">
        <UserCircle2 size={14} /> 회원정보 보기
      </button>
      {!isMe && (
        <>
          <button onClick={() => { onMessage(nickname); onClose(); }} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">
            <MessageSquareText size={14} /> 쪽지보내기
          </button>
          <button onClick={() => { onToggleBlock(nickname); onClose(); }} className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 flex items-center gap-2" style={{ color: isBlocked ? "#6b7280" : "#ef4444" }}>
            <Ban size={14} /> {isBlocked ? "차단 해제" : "차단하기"}
          </button>
        </>
      )}
    </div>
  );
}

function NicknameButton({ nickname, currentUser, onClick, className }) {
  const isBlocked = currentUser && (currentUser.blocked || []).includes(nickname);
  return (
    <button onClick={onClick} className={`${className} inline-flex items-center gap-1`}>
      {nickname}
      {isBlocked && <Ban size={12} className="text-red-400" />}
    </button>
  );
}

function Sidebar({ currentUser, openAuth, profiles }) {
  const topUsers = [...(profiles || [])]
    .filter(u => u.points >= 100 && u.role !== "master" && u.role !== "staff")
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  return (
    <>
      <div className="bg-gray-900 text-white rounded-lg p-4">
        <p className="flex items-center gap-1.5 text-sm text-gray-300 mb-1"><Trophy size={14} className="text-yellow-400" /> 나의 포인트</p>
        {currentUser ? (
          <>
            <p className="text-3xl font-extrabold mb-1">{currentUser.points} P</p>
            <p className="text-xs text-gray-400 mb-2">{pointLabel(currentUser)}</p>
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400" style={{ width: `${pointsProgress(currentUser)}%` }} />
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">오늘도 활동하고 포인트 적립하세요!</p>
          </>
        ) : (
          <button onClick={() => openAuth("login")} className="text-xs text-indigo-300 hover:underline mt-1">로그인하고 포인트 모으기 →</button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="flex items-center gap-1.5 font-bold text-sm mb-1">
          <span className="w-2 h-2 rounded-full bg-gray-300" /> 실시간 검색어
        </p>
        <p className="text-xs text-gray-300 text-center py-4">v2에서 제공될 예정입니다.</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="flex items-center gap-1.5 font-bold text-sm mb-3">
          <Trophy size={14} className="text-yellow-500" /> 우수회원
        </p>
        {topUsers.length === 0 ? (
          <p className="text-xs text-gray-300 text-center py-3">아직 활동 데이터가 없습니다.<br />첫 활동을 시작해보세요!</p>
        ) : (
          <div className="space-y-2">
            {topUsers.map((u, i) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className={`w-4 text-center font-bold ${i === 0 ? "text-yellow-500" : "text-gray-400"}`}>{i + 1}</span>
                  {u.nickname}
                </span>
                <span className="text-gray-400 text-xs font-medium">{u.points}P</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function mapComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    author: row.profiles?.nickname || "알수없음",
    text: row.text,
    likes: row.likes,
    dislikes: row.dislikes,
    likedBy: row.liked_by || [],
    dislikedBy: row.disliked_by || [],
    ip: row.ip,
  };
}

function mapPost(row) {
  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory,
    title: row.title,
    content: row.content,
    authorId: row.author_id,
    author: row.profiles?.nickname || "알수없음",
    date: formatDate(row.created_at),
    views: row.views,
    likes: row.likes,
    dislikes: row.dislikes,
    likedBy: row.liked_by || [],
    dislikedBy: row.disliked_by || [],
    ip: row.ip,
    comments: (row.comments || []).map(mapComment).sort((a, b) => a.id - b.id),
  };
}

const POST_SELECT = "*, profiles!posts_author_id_fkey(nickname, role, points), comments(*, profiles!comments_author_id_fkey(nickname, role, points))";

export default function App() {
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [view, setView] = useState(() => parseViewFromPath(window.location.pathname));
  const [profiles, setProfiles] = useState([]);
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authModal, setAuthModal] = useState(null);
  const [authForm, setAuthForm] = useState({ email: "", password: "", password2: "", nickname: "", keepLoggedIn: true });
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [authStep, setAuthStep] = useState("form");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetNewPassword2, setResetNewPassword2] = useState("");
  const [showWrite, setShowWrite] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", content: "", category: "community", subcategory: null });
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [search, setSearch] = useState("");
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquiries, setInquiries] = useState([]);
  const [inquiryForm, setInquiryForm] = useState({ title: "", content: "" });
  const [inquiryError, setInquiryError] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ nickname: "", currentPassword: "", newPassword: "", newPassword2: "" });
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [showMessages, setShowMessages] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageTab, setMessageTab] = useState("received");
  const [messageDetail, setMessageDetail] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: "", subject: "", content: "" });
  const [composeError, setComposeError] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [selectedFont] = useState({ family: "'Noto Sans KR', sans-serif", weight: 900, ls: "-0.03em" });
  const [hoveredNav, setHoveredNav] = useState(null);
  const [clickedNav, setClickedNav] = useState(null);
  const [hoveredSub, setHoveredSub] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [nicknameMenu, setNicknameMenu] = useState(null);
  const [profileView, setProfileView] = useState(null);
  const [hotTab, setHotTab] = useState("today");
  const [legalModal, setLegalModal] = useState(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isPoppingRef = useRef(false);
  const didMountRef = useRef(false);

  useEffect(() => {
    history.replaceState(view, "", buildPath(view));
  }, []);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (isPoppingRef.current) {
      isPoppingRef.current = false;
      return;
    }
    history.pushState(view, "", buildPath(view));
  }, [view]);

  useEffect(() => {
    function onPopState(e) {
      isPoppingRef.current = true;
      setView(e.state || parseViewFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*");
    if (data) setProfiles(data);
  }, []);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    const { data, error } = await supabase.from("posts").select(POST_SELECT).order("id", { ascending: false });
    if (!error && data) setPosts(data.map(mapPost));
    setPostsLoading(false);
  }, []);

  const loadMessages = useCallback(async (userId) => {
    const { data } = await supabase
      .from("messages")
      .select("*, sender:profiles!messages_from_id_fkey(nickname), receiver:profiles!messages_to_id_fkey(nickname)")
      .or(`from_id.eq.${userId},to_id.eq.${userId}`)
      .order("id", { ascending: false });
    if (data) {
      setMessages(data.map(m => ({
        id: m.id,
        fromId: m.from_id,
        toId: m.to_id,
        from: m.sender?.nickname || "알수없음",
        to: m.receiver?.nickname || "알수없음",
        subject: m.subject,
        content: m.content,
        date: formatDateTime(m.created_at),
        read: m.read,
      })));
    }
  }, []);

  const loadNotifications = useCallback(async (userId) => {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("id", { ascending: false });
    if (data) {
      setNotifications(data.map(n => ({ id: n.id, type: n.type, text: n.text, read: n.read, link: n.link, time: formatDate(n.created_at) })));
    }
  }, []);

  const loadInquiries = useCallback(async (profile) => {
    let query = supabase.from("inquiries").select("*, profiles(nickname)").order("id", { ascending: false });
    if (profile.role !== "master") query = query.eq("author_id", profile.id);
    const { data } = await query;
    if (data) {
      setInquiries(data.map(q => ({ id: q.id, title: q.title, content: q.content, author: q.profiles?.nickname, date: formatDate(q.created_at), status: q.status, answer: q.answer })));
    }
  }, []);

  const loadProfileFor = useCallback(async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) {
      setCurrentUser(data);
      loadProfiles();
      loadMessages(data.id);
      loadNotifications(data.id);
      loadInquiries(data);
    }
  }, [loadProfiles, loadMessages, loadNotifications, loadInquiries]);

  useEffect(() => {
    loadProfiles();
    loadPosts();
  }, [loadProfiles, loadPosts]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfileFor(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") {
        setAuthModal("login");
        setAuthStep("resetPassword");
      }
      if (newSession) {
        loadProfileFor(newSession.user.id);
      } else {
        setCurrentUser(null);
        setMessages([]);
        setNotifications([]);
        setInquiries([]);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfileFor]);

  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel(`notifications-${currentUser.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${currentUser.id}` }, (payload) => {
        const n = payload.new;
        setNotifications(prev => [{ id: n.id, type: n.type, text: n.text, read: n.read, link: n.link, time: formatDate(n.created_at) }, ...prev]);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    function onVisible() {
      if (document.visibilityState === "visible") {
        loadNotifications(currentUser.id);
        loadMessages(currentUser.id);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [currentUser?.id, loadNotifications, loadMessages]);

  const currentPost = posts.find(p => p.id === view.postId);
  const isBlockedByMe = (nickname) => currentUser && (currentUser.blocked || []).includes(nickname);
  const findUser = (nickname) => profiles.find(u => u.nickname === nickname);

  async function findUserOrFetch(nickname) {
    const cached = findUser(nickname);
    if (cached) return cached;
    const { data } = await supabase.from("profiles").select("*").eq("nickname", nickname).maybeSingle();
    return data || null;
  }

  function canListPost(post) {
    const perm = BOARD_PERMISSIONS[post.subcategory];
    if (!perm || perm.list !== "member") return true;
    return !!currentUser;
  }

  function canViewDetail(post) {
    const perm = BOARD_PERMISSIONS[post.subcategory];
    if (!perm || perm.detail === "guest") return true;
    if (perm.detail === "member") return !!currentUser;
    if (perm.detail === "owner") return !!currentUser && (currentUser.nickname === post.author || currentUser.role === "master");
    return true;
  }

  function canWriteToSubcategory(subcat) {
    const perm = BOARD_PERMISSIONS[subcat];
    if (!perm || perm.write !== "master") return true;
    return !!currentUser && currentUser.role === "master";
  }

  const hotPosts = [...posts]
    .filter(p => !isBlockedByMe(p.author))
    .filter(p => canListPost(p))
    .sort((a, b) => (b.likes + b.comments.length * 2) - (a.likes + a.comments.length * 2))
    .slice(0, 15);

  function postsByCategory(catId, subcat) {
    return posts
      .filter(p => p.category === catId && !isBlockedByMe(p.author))
      .filter(p => !subcat || p.subcategory === subcat)
      .filter(p => canListPost(p))
      .sort((a, b) => b.id - a.id);
  }

  function realtimeHotPosts() {
    return [...posts]
      .filter(p => !isBlockedByMe(p.author))
      .filter(p => canListPost(p))
      .filter(p => p.likes >= 5)
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 15);
  }

  function weeklyHotPosts() {
    return [...posts]
      .filter(p => !isBlockedByMe(p.author))
      .filter(p => canListPost(p))
      .sort((a, b) => (b.likes + b.comments.length * 2) - (a.likes + a.comments.length * 2))
      .slice(0, 15);
  }

  function mostCommentedPosts() {
    return [...posts]
      .filter(p => !isBlockedByMe(p.author))
      .filter(p => canListPost(p))
      .sort((a, b) => b.comments.length - a.comments.length)
      .slice(0, 15);
  }

  async function openPost(id) {
    const target = posts.find(p => p.id === id);
    setView({ page: "detail", category: target?.category || null, subcategory: target?.subcategory || null, postId: id });
    await supabase.from("posts").update({ views: (target?.views || 0) + 1 }).eq("id", id);
    setPosts(posts.map(p => p.id === id ? { ...p, views: p.views + 1 } : p));
  }

  function openWrite() {
    const validCategory = BOARD_CATEGORIES.some(c => c.id === view.category) ? view.category : "community";
    let prefillSub = view.category === validCategory ? (view.subcategory || null) : null;
    if (prefillSub && !canWriteToSubcategory(prefillSub)) prefillSub = null;
    setEditingPostId(null);
    setNewPost({ title: "", content: "", category: validCategory, subcategory: prefillSub });
    setShowWrite(true);
  }

  function openEditPost(post) {
    setEditingPostId(post.id);
    setNewPost({ title: post.title, content: post.content, category: post.category, subcategory: post.subcategory });
    setShowWrite(true);
  }

  function canModify(authorNickname) {
    return !!currentUser && (currentUser.nickname === authorNickname || currentUser.role === "master");
  }

  async function deletePost(post) {
    if (!window.confirm("게시물을 삭제하시겠습니까? 댓글도 함께 삭제되며 복구할 수 없습니다.")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) return;
    setPosts(prev => prev.filter(p => p.id !== post.id));
    setView({ page: "category", category: post.category, subcategory: post.subcategory || null, postId: null });
  }

  function startEditComment(c) {
    setEditingCommentId(c.id);
    setEditCommentText(c.text);
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditCommentText("");
  }

  async function saveEditComment(postId, commentId) {
    if (!editCommentText.trim()) return;
    const { error } = await supabase.from("comments").update({ text: editCommentText }).eq("id", commentId);
    if (error) return;
    setPosts(prev => prev.map(p => p.id === postId ? {
      ...p,
      comments: p.comments.map(c => c.id === commentId ? { ...c, text: editCommentText } : c),
    } : p));
    setEditingCommentId(null);
    setEditCommentText("");
  }

  async function deleteComment(postId, commentId) {
    if (!window.confirm("댓글을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) return;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: p.comments.filter(c => c.id !== commentId) } : p));
  }

  function resetAuthForm() {
    setAuthForm({ email: "", password: "", password2: "", nickname: "", keepLoggedIn: true });
    setAuthError("");
    setAuthInfo("");
    setAuthStep("form");
    setResetNewPassword("");
    setResetNewPassword2("");
  }

  function openAuth(type) {
    resetAuthForm();
    setAuthModal(type);
  }

  async function handleSignup() {
    const { email, password, password2, nickname } = authForm;
    if (!email.trim() || !password.trim() || !nickname.trim()) {
      setAuthError("모든 항목을 입력해주세요.");
      return;
    }
    if (!email.includes("@")) {
      setAuthError("올바른 이메일 형식이 아닙니다.");
      return;
    }
    if (password.length < 6) {
      setAuthError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (password !== password2) {
      setAuthError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (profiles.some(u => u.nickname === nickname.trim())) {
      setAuthError("이미 사용중인 닉네임입니다.");
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { nickname: nickname.trim() } },
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthError("");
    setAuthInfo("가입 확인 이메일을 보냈습니다. 이메일의 링크를 클릭한 후 로그인해주세요.");
    setAuthStep("done");
  }

  async function startForgotPassword() {
    if (!authForm.email.trim()) {
      setAuthError("이메일을 입력해주세요.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(authForm.email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthError("");
    setAuthInfo("비밀번호 재설정 링크를 이메일로 보냈습니다.");
    setAuthStep("done");
  }

  async function confirmNewPassword() {
    if (!resetNewPassword || resetNewPassword.length < 6) {
      setAuthError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (resetNewPassword !== resetNewPassword2) {
      setAuthError("비밀번호가 일치하지 않습니다.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: resetNewPassword });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthModal(null);
  }

  async function handleLogin() {
    const { email, password } = authForm;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setAuthError("이메일 또는 비밀번호가 일치하지 않습니다.");
      return;
    }
    setAuthModal(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setView({ page: "home", category: null, subcategory: null, postId: null });
  }

  async function addNotificationFor(targetUserId, { type, text, link }) {
    if (!targetUserId) return;
    await supabase.from("notifications").insert({ user_id: targetUserId, type, text, link: link || null });
    if (currentUser && targetUserId === currentUser.id) loadNotifications(currentUser.id);
  }

  async function addPointsTo(profile, amount) {
    if (!profile) return;
    const before = pointLabel(profile);
    const isAdminRole = profile.role === "master" || profile.role === "staff";
    const rawPoints = profile.points + amount;
    const newPoints = isAdminRole ? Math.min(rawPoints, ADMIN_POINTS_CAP) : Math.max(0, rawPoints);
    await supabase.from("profiles").update({ points: newPoints }).eq("id", profile.id);
    setProfiles(prev => prev.map(u => u.id === profile.id ? { ...u, points: newPoints } : u));
    if (currentUser && currentUser.id === profile.id) {
      setCurrentUser(prev => ({ ...prev, points: newPoints }));
    }
    const after = pointLabel({ ...profile, points: newPoints });
    if (before !== after) {
      const beforeIdx = RANK_ORDER.indexOf(before);
      const afterIdx = RANK_ORDER.indexOf(after);
      const isPromotion = beforeIdx !== -1 && afterIdx !== -1 ? afterIdx > beforeIdx : true;
      const text = isPromotion ? `등급이 '${after}'로 승급했습니다! 🎉` : `등급이 '${after}'로 강등되었습니다.`;
      addNotificationFor(profile.id, { type: "point", text, link: null });
    }
  }

  async function submitPost() {
    if (!newPost.title.trim() || !newPost.content.trim() || !currentUser) return;
    if (newPost.subcategory && !canWriteToSubcategory(newPost.subcategory)) return;

    if (editingPostId) {
      const { data, error } = await supabase.from("posts").update({
        category: newPost.category,
        subcategory: newPost.subcategory || null,
        title: newPost.title,
        content: newPost.content,
      }).eq("id", editingPostId).select(POST_SELECT).single();
      if (error || !data) return;
      const mapped = mapPost(data);
      setPosts(prev => prev.map(p => p.id === editingPostId ? mapped : p));
      setEditingPostId(null);
      setNewPost({ title: "", content: "", category: "community", subcategory: null });
      setShowWrite(false);
      setView({ page: "detail", category: mapped.category, subcategory: mapped.subcategory, postId: mapped.id });
      return;
    }

    const ip = await getClientIp();
    const { data, error } = await supabase.from("posts").insert({
      category: newPost.category,
      subcategory: newPost.subcategory || null,
      title: newPost.title,
      content: newPost.content,
      author_id: currentUser.id,
      ip,
    }).select(POST_SELECT).single();
    if (error || !data) return;
    const mapped = mapPost(data);
    setPosts(prev => [mapped, ...prev]);
    await addPointsTo(currentUser, 5);
    setNewPost({ title: "", content: "", category: "community", subcategory: null });
    setShowWrite(false);
    setView({ page: "detail", category: mapped.category, subcategory: mapped.subcategory, postId: mapped.id });
  }

  async function submitComment() {
    if (!commentDraft.trim() || !currentPost || !currentUser) return;
    const ip = await getClientIp();
    const { data, error } = await supabase.from("comments").insert({
      post_id: currentPost.id,
      author_id: currentUser.id,
      text: commentDraft,
      ip,
    }).select("*, profiles!comments_author_id_fkey(nickname, role, points)").single();
    if (error || !data) return;
    const mapped = mapComment(data);
    setPosts(prev => prev.map(p => p.id === currentPost.id ? { ...p, comments: [...p.comments, mapped] } : p));
    await addPointsTo(currentUser, 1);
    if (currentPost.author !== currentUser.nickname) {
      const authorProfile = await findUserOrFetch(currentPost.author);
      if (authorProfile) {
        addNotificationFor(authorProfile.id, {
          type: "comment",
          text: `${currentUser.nickname}님이 내 글 "${currentPost.title}"에 댓글을 남겼습니다.`,
          link: { page: "detail", postId: currentPost.id },
        });
      }
    }
    setCommentDraft("");
  }

  async function voteOnPost(postId, type) {
    if (!currentUser) { openAuth("login"); return; }
    const post = posts.find(p => p.id === postId);
    if (!post || post.author === currentUser.nickname) return;
    const likedBy = post.likedBy || [];
    const dislikedBy = post.dislikedBy || [];
    const hasLiked = likedBy.includes(currentUser.id);
    const hasDisliked = dislikedBy.includes(currentUser.id);
    if ((type === "like" && hasLiked) || (type === "dislike" && hasDisliked)) return;

    let newLikedBy = likedBy;
    let newDislikedBy = dislikedBy;
    let likesDelta = 0, dislikesDelta = 0, pointsDelta = 0;

    if (type === "like") {
      if (hasDisliked) { newDislikedBy = dislikedBy.filter(n => n !== currentUser.id); dislikesDelta -= 1; pointsDelta += 1; }
      newLikedBy = [...likedBy, currentUser.id];
      likesDelta += 1; pointsDelta += 3;
    } else {
      if (hasLiked) { newLikedBy = likedBy.filter(n => n !== currentUser.id); likesDelta -= 1; pointsDelta -= 3; }
      newDislikedBy = [...dislikedBy, currentUser.id];
      dislikesDelta += 1; pointsDelta -= 1;
    }

    const newLikes = post.likes + likesDelta;
    const newDislikes = (post.dislikes || 0) + dislikesDelta;
    await supabase.from("posts").update({ likes: newLikes, dislikes: newDislikes, liked_by: newLikedBy, disliked_by: newDislikedBy }).eq("id", postId);
    setPosts(posts.map(p => p.id === postId ? { ...p, likes: newLikes, dislikes: newDislikes, likedBy: newLikedBy, dislikedBy: newDislikedBy } : p));

    const authorProfile = await findUserOrFetch(post.author);
    if (authorProfile && pointsDelta !== 0) addPointsTo(authorProfile, pointsDelta);
    if (authorProfile && type === "like" && !hasLiked) {
      addNotificationFor(authorProfile.id, {
        type: "like",
        text: `${currentUser.nickname}님이 내 글 "${post.title}"을 추천했습니다.`,
        link: { page: "detail", postId: post.id },
      });
    }
  }

  async function voteOnComment(postId, commentId, type) {
    if (!currentUser) { openAuth("login"); return; }
    const post = posts.find(p => p.id === postId);
    const comment = post?.comments.find(c => c.id === commentId);
    if (!comment || comment.author === currentUser.nickname) return;
    const likedBy = comment.likedBy || [];
    const dislikedBy = comment.dislikedBy || [];
    const hasLiked = likedBy.includes(currentUser.id);
    const hasDisliked = dislikedBy.includes(currentUser.id);
    if ((type === "like" && hasLiked) || (type === "dislike" && hasDisliked)) return;

    let newLikedBy = likedBy;
    let newDislikedBy = dislikedBy;
    let likesDelta = 0, dislikesDelta = 0, pointsDelta = 0;

    if (type === "like") {
      if (hasDisliked) { newDislikedBy = dislikedBy.filter(n => n !== currentUser.id); dislikesDelta -= 1; pointsDelta += 1; }
      newLikedBy = [...likedBy, currentUser.id];
      likesDelta += 1; pointsDelta += 1;
    } else {
      if (hasLiked) { newLikedBy = likedBy.filter(n => n !== currentUser.id); likesDelta -= 1; pointsDelta -= 1; }
      newDislikedBy = [...dislikedBy, currentUser.id];
      dislikesDelta += 1; pointsDelta -= 1;
    }

    const newLikes = (comment.likes || 0) + likesDelta;
    const newDislikes = (comment.dislikes || 0) + dislikesDelta;
    await supabase.from("comments").update({ likes: newLikes, dislikes: newDislikes, liked_by: newLikedBy, disliked_by: newDislikedBy }).eq("id", commentId);
    setPosts(posts.map(p => p.id === postId ? {
      ...p,
      comments: p.comments.map(c => c.id === commentId ? { ...c, likes: newLikes, dislikes: newDislikes, likedBy: newLikedBy, dislikedBy: newDislikedBy } : c),
    } : p));

    const authorProfile = await findUserOrFetch(comment.author);
    if (authorProfile && pointsDelta !== 0) addPointsTo(authorProfile, pointsDelta);
    if (authorProfile && type === "like" && !hasLiked) {
      addNotificationFor(authorProfile.id, {
        type: "like",
        text: `${currentUser.nickname}님이 내 댓글을 추천했습니다.`,
        link: { page: "detail", postId },
      });
    }
  }

  function requireAuth(fn) {
    if (!currentUser) { openAuth("login"); return; }
    fn();
  }

  async function submitInquiry() {
    if (!inquiryForm.title.trim() || !inquiryForm.content.trim()) {
      setInquiryError("제목과 내용을 모두 입력해주세요.");
      return;
    }
    const { error } = await supabase.from("inquiries").insert({
      author_id: currentUser.id,
      title: inquiryForm.title,
      content: inquiryForm.content,
    });
    if (error) {
      setInquiryError(error.message);
      return;
    }
    await loadInquiries(currentUser);
    setInquiryForm({ title: "", content: "" });
    setInquiryError("");
  }

  function openProfile() {
    setProfileForm({ nickname: currentUser.nickname, currentPassword: "", newPassword: "", newPassword2: "" });
    setProfileError("");
    setProfileSuccess("");
    setShowProfile(true);
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("이미지 파일만 업로드할 수 있습니다.");
      setProfileSuccess("");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError("2MB 이하의 이미지만 업로드할 수 있습니다.");
      setProfileSuccess("");
      return;
    }
    const ext = file.name.split(".").pop();
    const path = `${currentUser.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      setProfileError(uploadError.message);
      setProfileSuccess("");
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", currentUser.id);
    if (error) {
      setProfileError(error.message);
      setProfileSuccess("");
      return;
    }
    setCurrentUser(prev => ({ ...prev, avatar_url: avatarUrl }));
    setProfiles(prev => prev.map(u => u.id === currentUser.id ? { ...u, avatar_url: avatarUrl } : u));
    setProfileError("");
    setProfileSuccess("프로필 사진이 변경되었습니다.");
  }

  async function updateNickname() {
    if (!profileForm.nickname.trim()) {
      setProfileError("닉네임을 입력해주세요.");
      setProfileSuccess("");
      return;
    }
    if (profileForm.nickname !== currentUser.nickname && profiles.some(u => u.nickname === profileForm.nickname)) {
      setProfileError("이미 사용중인 닉네임입니다.");
      setProfileSuccess("");
      return;
    }
    const { error } = await supabase.from("profiles").update({ nickname: profileForm.nickname }).eq("id", currentUser.id);
    if (error) {
      setProfileError(error.message);
      setProfileSuccess("");
      return;
    }
    setCurrentUser(prev => ({ ...prev, nickname: profileForm.nickname }));
    setProfiles(prev => prev.map(u => u.id === currentUser.id ? { ...u, nickname: profileForm.nickname } : u));
    setProfileError("");
    setProfileSuccess("닉네임이 변경되었습니다.");
  }

  async function updatePassword() {
    const { currentPassword, newPassword, newPassword2 } = profileForm;
    if (!currentPassword || !newPassword || !newPassword2) {
      setProfileError("비밀번호 관련 항목을 모두 입력해주세요.");
      setProfileSuccess("");
      return;
    }
    if (newPassword.length < 6) {
      setProfileError("새 비밀번호는 6자 이상이어야 합니다.");
      setProfileSuccess("");
      return;
    }
    if (newPassword !== newPassword2) {
      setProfileError("새 비밀번호가 일치하지 않습니다.");
      setProfileSuccess("");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });
    if (signInError) {
      setProfileError("현재 비밀번호가 일치하지 않습니다.");
      setProfileSuccess("");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setProfileError(error.message);
      setProfileSuccess("");
      return;
    }
    setProfileForm(prev => ({ ...prev, currentPassword: "", newPassword: "", newPassword2: "" }));
    setProfileError("");
    setProfileSuccess("비밀번호가 변경되었습니다.");
  }

  async function handleDeleteAccount() {
    if (!window.confirm("정말로 탈퇴하시겠습니까?\n작성한 게시물, 댓글, 쪽지, 알림 등 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.")) return;
    const { error } = await supabase.rpc("delete_user");
    if (error) {
      setProfileError(error.message);
      return;
    }
    await supabase.auth.signOut();
    setShowProfile(false);
    setView({ page: "home", category: null, subcategory: null, postId: null });
  }

  function openMessages() {
    setMessageTab("received");
    setMessageDetail(null);
    setShowMessages(true);
  }

  async function openMessageDetail(msg) {
    if (!msg.read && msg.toId === currentUser.id) {
      await supabase.from("messages").update({ read: true }).eq("id", msg.id);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
    }
    setMessageDetail(msg);
  }

  async function deleteMessage(id) {
    await supabase.from("messages").delete().eq("id", id);
    setMessages(messages.filter(m => m.id !== id));
    setMessageDetail(null);
  }

  function openCompose(toNickname = "") {
    setComposeForm({ to: toNickname, subject: "", content: "" });
    setComposeError("");
    setShowCompose(true);
  }

  async function sendMessage() {
    const { to, subject, content } = composeForm;
    if (!to.trim() || !subject.trim() || !content.trim()) {
      setComposeError("받는 사람, 제목, 내용을 모두 입력해주세요.");
      return;
    }
    if (to.trim().toLowerCase() === currentUser.nickname.toLowerCase()) {
      setComposeError("본인에게는 쪽지를 보낼 수 없습니다.");
      return;
    }
    const toProfile = profiles.find(u => u.nickname.toLowerCase() === to.trim().toLowerCase());
    if (!toProfile) {
      setComposeError("존재하지 않는 닉네임입니다.");
      return;
    }
    const { error } = await supabase.from("messages").insert({
      from_id: currentUser.id,
      to_id: toProfile.id,
      subject: subject.trim(),
      content: content.trim(),
    });
    if (error) {
      setComposeError(error.message);
      return;
    }
    await loadMessages(currentUser.id);
    setShowCompose(false);
    setMessageTab("sent");
  }

  function openNotifications() {
    setShowNotifications(true);
  }

  async function readNotification(n) {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.link?.page === "detail") {
      openPost(n.link.postId);
      setShowNotifications(false);
    }
  }

  async function markAllRead() {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unread.map(n => n.id));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function openNicknameMenu(nickname, e) {
    e.stopPropagation();
    if (!currentUser) { openAuth("login"); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setNicknameMenu({ nickname, x: rect.left, y: rect.bottom + 4 });
  }

  function closeNicknameMenu() {
    setNicknameMenu(null);
  }

  async function toggleBlock(nickname) {
    const blocked = currentUser.blocked || [];
    const newBlocked = blocked.includes(nickname) ? blocked.filter(n => n !== nickname) : [...blocked, nickname];
    await supabase.from("profiles").update({ blocked: newBlocked }).eq("id", currentUser.id);
    setCurrentUser(prev => ({ ...prev, blocked: newBlocked }));
    setProfiles(prev => prev.map(u => u.id === currentUser.id ? { ...u, blocked: newBlocked } : u));
  }

  function viewProfile(nickname) {
    setProfileView(nickname);
  }

  const filteredSearchPosts = search
    ? posts.filter(p => (p.title.includes(search) || p.content.includes(search)) && canListPost(p))
    : null;

  if (postsLoading && posts.length === 0) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 text-sm">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@900&display=swap');
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
        .nav-font { font-family: 'Pretendard', sans-serif; font-weight: 700; }
      `}</style>

      <div className="bg-gray-900 text-gray-300 text-xs">
        <div className="max-w-6xl mx-auto px-4 h-8 flex items-center justify-end gap-3">
          {currentUser ? (
            <>
              <span className="text-gray-400">{currentUser.nickname}님</span>
              <span className="text-gray-600">|</span>
              <button onClick={() => setShowInquiry(true)} className="hover:text-white">1:1문의</button>
              <span className="text-gray-600">|</span>
              <button onClick={handleLogout} className="hover:text-white">로그아웃</button>
            </>
          ) : (
            <>
              <button onClick={() => requireAuth(() => setShowInquiry(true))} className="hover:text-white">1:1문의</button>
              <span className="text-gray-600">|</span>
              <button onClick={() => openAuth("signup")} className="hover:text-white">회원가입</button>
              <span className="text-gray-600">|</span>
              <button onClick={() => openAuth("login")} className="hover:text-white">로그인</button>
            </>
          )}
        </div>
      </div>

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-6">
          <button onClick={() => setView({ page: "home", category: null, subcategory: null, postId: null })} className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt="코리안에셋" className="h-5 w-auto shrink-0" />
            <span className="text-2xl" style={{ fontFamily: selectedFont.family, fontWeight: selectedFont.weight, letterSpacing: selectedFont.ls }}>
              <span style={{ color: "#111827" }}>코리안</span><span style={{ color: "#fe0000" }}>에셋</span>
            </span>
          </button>
          <div className="flex-1 max-w-md relative hidden md:block">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="검색"
              className="w-full pl-4 pr-10 py-2.5 bg-gray-100 rounded-full outline-none focus:ring-2 focus:ring-indigo-300 text-sm"
            />
            <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
            <button onClick={() => requireAuth(openProfile)} className="flex flex-col items-center gap-0.5 hover:text-indigo-600">
              <User size={18} /><span>내정보</span>
            </button>
            <button onClick={() => requireAuth(openMessages)} className="flex flex-col items-center gap-0.5 hover:text-indigo-600 relative">
              <Mail size={18} />
              {currentUser && messages.filter(m => m.toId === currentUser.id && !m.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
              <span>쪽지</span>
            </button>
            <button onClick={() => requireAuth(openNotifications)} className="flex flex-col items-center gap-0.5 hover:text-indigo-600 relative">
              <Bell size={18} />
              {currentUser && notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
              <span>알림</span>
            </button>
          </div>
        </div>
        <nav className="border-t border-gray-100 bg-gray-50 relative z-30 overflow-visible">
          <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto overflow-y-visible">
            {CATEGORIES.map(c => {
              const isOpen = isMobile ? clickedNav === c.id : hoveredNav === c.id;
              return (
                <div
                  key={c.id}
                  className="relative"
                  onMouseEnter={() => !isMobile && setHoveredNav(c.id)}
                  onMouseLeave={() => !isMobile && setHoveredNav(null)}
                >
                  <button
                    onClick={() => {
                      if (isMobile) {
                        setClickedNav(clickedNav === c.id ? null : c.id);
                      } else {
                        if (c.id === "hot") setHotTab("today");
                        setView({ page: c.id === "hot" || c.id === "point" ? c.id : "category", category: c.id, subcategory: null, postId: null });
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-3 text-sm nav-font whitespace-nowrap border-b-2 transition ${
                      view.category === c.id ? "border-red-500 text-red-500" : isOpen ? "border-red-400 text-red-500" : "border-transparent text-gray-600"
                    }`}
                  >
                    <c.icon size={15} style={{ color: view.category === c.id || isOpen ? "#ef4444" : c.color }} />
                    {c.name}
                  </button>
                  {c.sub && c.sub.length > 0 && isOpen && (
                    <div
                      style={{ position: "fixed", zIndex: 9999, minWidth: "200px" }}
                      ref={el => {
                        if (el) {
                          const btn = el.parentElement.querySelector("button");
                          const rect = btn.getBoundingClientRect();
                          el.style.left = rect.left + "px";
                          el.style.top = rect.bottom + "px";
                        }
                      }}
                      className="bg-white border border-gray-200 rounded-b-lg shadow-xl py-1.5"
                    >
                      {c.sub.map((s, i) => {
                        const subKey = `${c.id}-${i}`;
                        return (
                          <button
                            key={i}
                            onMouseEnter={() => setHoveredSub(subKey)}
                            onMouseLeave={() => setHoveredSub(null)}
                            onClick={() => {
                              if (c.id === "hot") {
                                const tabMap = { 0: "today", 1: "weekly", 2: "comments" };
                                setHotTab(tabMap[i] || "today");
                                setView({ page: "hot", category: "hot", subcategory: null, postId: null });
                              } else if (c.id === "point") {
                                setView({ page: "point", category: "point", subcategory: null, postId: null });
                              } else {
                                setView({ page: "category", category: c.id, subcategory: s, postId: null });
                              }
                              setHoveredNav(null);
                              setClickedNav(null);
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "8px 16px",
                              fontSize: "0.875rem",
                              whiteSpace: "nowrap",
                              background: hoveredSub === subKey ? "#fef2f2" : "transparent",
                              color: hoveredSub === subKey ? "#ef4444" : "#4b5563",
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {search ? (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-bold mb-2">"{search}" 검색결과 ({filteredSearchPosts.length})</h2>
            <div className="divide-y divide-gray-100">
              {filteredSearchPosts.map(p => (
                <button key={p.id} onClick={() => { setSearch(""); openPost(p.id); }} className="w-full text-left py-2 hover:text-indigo-600 flex items-center justify-between">
                  <span>{p.title}</span>
                  <span className="text-xs text-gray-400">{p.author}</span>
                </button>
              ))}
              {filteredSearchPosts.length === 0 && <p className="text-gray-400 text-sm py-2">검색 결과가 없습니다.</p>}
            </div>
          </div>
        ) : view.page === "home" ? (
          <table className="w-full border-separate" style={{ borderSpacing: "20px" }}>
            <tbody>
              <tr>
                <td className="align-top p-0" style={{ width: "calc(100% - 280px)" }}>
                  <div className="space-y-5">
                    <section className="bg-white rounded-lg border border-gray-200 p-4">
                      <h2 className="flex items-center gap-1.5 font-bold text-base mb-3">
                        <Flame size={18} className="text-red-500" /> 떡상폭발 게시물
                      </h2>
                      <div className="divide-y divide-gray-100">
                        {hotPosts.map((p, i) => {
                          const cat = CATEGORIES.find(c => c.id === p.category);
                          return (
                            <button key={p.id} onClick={() => openPost(p.id)} className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-gray-50 -mx-1 px-1 rounded">
                              <span className={`font-bold w-4 text-center ${i === 0 ? "text-red-500" : "text-gray-400"}`}>{i + 1}</span>
                              <span className="text-sm font-bold px-2 py-1 rounded" style={{ color: cat.color, backgroundColor: cat.color + "1A" }}>{cat.name}</span>
                              <span className="text-xs text-gray-400">{p.date}</span>
                              <span className="flex-1 font-medium truncate">{p.title} {p.comments.length > 0 && <span className="text-indigo-500">[{p.comments.length}]</span>}</span>
                              <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0"><Eye size={11} />{p.views}</span>
                              <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0"><ThumbsUp size={11} />{p.likes}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {BOARD_CATEGORIES.map(c => {
                        const list = postsByCategory(c.id).slice(0, 4);
                        return (
                          <section key={c.id} className="bg-white rounded-lg border border-gray-200 p-4">
                            <button onClick={() => setView({ page: "category", category: c.id, subcategory: null, postId: null })} className="flex items-center gap-1.5 font-bold text-base mb-2 hover:text-indigo-600 w-full">
                              <c.icon size={20} style={{ color: c.color }} />
                              {c.name}
                              <ChevronRight size={14} className="text-gray-300 ml-auto" />
                            </button>
                            {list.length === 0 ? (
                              <p className="text-gray-300 text-sm py-3 text-center">게시물이 없습니다.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {list.map(p => (
                                  <button key={p.id} onClick={() => openPost(p.id)} className="w-full text-left flex items-center justify-between gap-2 hover:text-indigo-600">
                                    <span className="truncate">{p.title} {p.comments.length > 0 && <span className="text-indigo-500 text-xs">[{p.comments.length}]</span>}</span>
                                    <span className="text-xs text-gray-400 shrink-0">{p.date}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </div>
                </td>
                <td className="align-top p-0" style={{ width: "280px" }}>
                  <div className="space-y-4">
                    <Sidebar currentUser={currentUser} openAuth={openAuth} profiles={profiles} />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        ) : view.page === "hot" ? (
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2 mb-3">
              <Flame size={22} className="text-red-500" /> 실시간인기글
            </h2>
            <div className="flex gap-1.5 mb-3">
              <button onClick={() => setHotTab("today")} className={`text-sm px-3 py-1.5 rounded-full font-medium ${hotTab === "today" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"}`}>오늘의 인기글</button>
              <button onClick={() => setHotTab("weekly")} className={`text-sm px-3 py-1.5 rounded-full font-medium ${hotTab === "weekly" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"}`}>주간 인기글</button>
              <button onClick={() => setHotTab("comments")} className={`text-sm px-3 py-1.5 rounded-full font-medium ${hotTab === "comments" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"}`}>댓글 많은 글</button>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {(() => {
                const list = hotTab === "today" ? realtimeHotPosts() : hotTab === "weekly" ? weeklyHotPosts() : mostCommentedPosts();
                if (list.length === 0) {
                  return <p className="text-center text-gray-300 py-10 text-sm">{hotTab === "today" ? "추천 5개 이상 받은 게시물이 아직 없습니다." : "게시물이 없습니다."}</p>;
                }
                return list.map((p, i) => {
                  const cat = CATEGORIES.find(c => c.id === p.category);
                  return (
                    <div key={p.id} className="w-full px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
                      <button onClick={() => openPost(p.id)} className="flex-1 min-w-0 text-left flex items-center gap-3">
                        <span className={`font-bold w-5 text-center shrink-0 ${i === 0 ? "text-red-500" : "text-gray-400"}`}>{i + 1}</span>
                        <span className="text-xs font-bold px-2 py-1 rounded shrink-0" style={{ color: cat.color, backgroundColor: cat.color + "1A" }}>{cat.name}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate">{p.title}</span>
                          {p.comments.length > 0 && <span className="text-indigo-500 text-xs ml-1">[{p.comments.length}]</span>}
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <Avatar nickname={p.author} size={18} avatarUrl={findUser(p.author)?.avatar_url} />
                            <span>{rankEmoji(findUser(p.author))}</span>
                            <NicknameButton nickname={p.author} currentUser={currentUser} onClick={(e) => openNicknameMenu(p.author, e)} className="hover:text-indigo-600" />
                            <span>{p.date}</span>
                            <span className="flex items-center gap-0.5"><Eye size={10} />{p.views}</span>
                            <span className="flex items-center gap-0.5"><ThumbsUp size={10} />{p.likes}</span>
                          </div>
                        </div>
                      </button>
                      <ChevronRight size={16} className="text-gray-300 shrink-0 cursor-pointer" onClick={() => openPost(p.id)} />
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : view.page === "category" ? (
          <div>
            <button onClick={() => setView({ page: "home", category: null, subcategory: null, postId: null })} className="text-sm text-gray-500 hover:text-gray-700 mb-3">
              ← 메인으로
            </button>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg flex items-center gap-2">
                {(() => {
                  const c = CATEGORIES.find(c => c.id === view.category);
                  return (
                    <>
                      <c.icon size={22} style={{ color: c.color }} />
                      {c.name}
                      {view.subcategory && (
                        <>
                          <ChevronRight size={16} className="text-gray-300" />
                          <span className="text-gray-500 text-base font-medium">{view.subcategory}</span>
                        </>
                      )}
                    </>
                  );
                })()}
              </h2>
              <button
                onClick={() => requireAuth(openWrite)}
                className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700"
              >
                글쓰기
              </button>
            </div>
            {(() => {
              const cat = CATEGORIES.find(c => c.id === view.category);
              if (!cat.sub || cat.sub.length === 0) return null;
              return (
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  <button
                    onClick={() => setView({ ...view, subcategory: null })}
                    className={`text-xs px-2.5 py-1 rounded-full ${!view.subcategory ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500"}`}
                  >
                    전체
                  </button>
                  {cat.sub.map(s => {
                    const restricted = !canListPost({ subcategory: s }) ? "🔒 " : "";
                    return (
                      <button
                        key={s}
                        onClick={() => setView({ ...view, subcategory: s })}
                        className={`text-xs px-2.5 py-1 rounded-full ${view.subcategory === s ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500"}`}
                      >
                        {restricted}{s}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {view.subcategory && !canListPost({ subcategory: view.subcategory }) ? (
                <div className="text-center py-10">
                  <Shield size={28} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm mb-1">로그인이 필요한 게시판입니다.</p>
                  <button onClick={() => openAuth("login")} className="text-xs text-indigo-600 hover:underline">로그인하기</button>
                </div>
              ) : (
                <>
                  {postsByCategory(view.category, view.subcategory).length === 0 && (
                    <p className="text-center text-gray-300 py-10 text-sm">게시물이 없습니다.</p>
                  )}
                  {postsByCategory(view.category, view.subcategory).map(p => (
                    <div key={p.id} className="w-full px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
                      <button onClick={() => openPost(p.id)} className="flex-1 min-w-0 text-left flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate">{p.title}</span>
                          {p.subcategory && <span className="text-[11px] text-gray-400 ml-1.5 bg-gray-100 px-1.5 py-0.5 rounded">{p.subcategory}</span>}
                          {!canViewDetail(p) && <span className="text-[11px] text-gray-400 ml-1">🔒</span>}
                          {p.comments.length > 0 && <span className="text-indigo-500 text-xs ml-1">[{p.comments.length}]</span>}
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <Avatar nickname={p.author} size={18} avatarUrl={findUser(p.author)?.avatar_url} />
                            <span>{rankEmoji(findUser(p.author))}</span>
                            <NicknameButton nickname={p.author} currentUser={currentUser} onClick={(e) => openNicknameMenu(p.author, e)} className="hover:text-indigo-600" />
                            <span>{p.date}</span>
                            <span className="flex items-center gap-0.5"><Eye size={10} />{p.views}</span>
                            <span className="flex items-center gap-0.5"><ThumbsUp size={10} />{p.likes}</span>
                          </div>
                        </div>
                      </button>
                      <ChevronRight size={16} className="text-gray-300 shrink-0 cursor-pointer" onClick={() => openPost(p.id)} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : view.page === "point" ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Target size={40} className="text-orange-400 mx-auto mb-3" />
            <h2 className="font-bold text-lg mb-1">포인트놀이터</h2>
            <p className="text-gray-400 text-sm">준비중인 기능입니다. 글쓰기(+5P), 댓글(+1P), 추천받기(+3P)로 지금부터 포인트를 모아보세요!</p>
          </div>
        ) : view.page === "detail" && currentPost ? (
          <div>
            <button onClick={() => setView({ page: "category", category: currentPost.category, subcategory: currentPost.subcategory || null, postId: null })} className="text-sm text-gray-500 hover:text-gray-700 mb-3">
              ← 목록으로
            </button>
            {!canViewDetail(currentPost) ? (
              <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
                <Shield size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-1">
                  {!currentUser ? "로그인이 필요한 게시글입니다." : "비공개 게시글입니다."}
                </p>
                <p className="text-gray-400 text-xs">
                  {BOARD_PERMISSIONS[currentPost.subcategory]?.detail === "owner" ? "작성자와 운영자만 볼 수 있어요." : "회원만 볼 수 있는 게시글이에요."}
                </p>
                {!currentUser && (
                  <button onClick={() => openAuth("login")} className="mt-4 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">로그인하기</button>
                )}
              </div>
            ) : (
              <>
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <span className="text-sm font-bold px-2.5 py-1 rounded" style={{
                    color: CATEGORIES.find(c => c.id === currentPost.category).color,
                    backgroundColor: CATEGORIES.find(c => c.id === currentPost.category).color + "1A"
                  }}>
                    {CATEGORIES.find(c => c.id === currentPost.category).name}
                  </span>
                  {currentPost.subcategory && <span className="text-xs text-gray-400 ml-2">› {currentPost.subcategory}</span>}
                  <h1 className="text-xl font-bold mt-2 mb-3">{currentPost.title}</h1>
                  <div className="flex items-center gap-3 text-sm text-gray-400 pb-3 border-b border-gray-100">
                    <Avatar nickname={currentPost.author} size={28} avatarUrl={findUser(currentPost.author)?.avatar_url} />
                    <span>{rankEmoji(findUser(currentPost.author))}</span>
                    <NicknameButton nickname={currentPost.author} currentUser={currentUser} onClick={(e) => openNicknameMenu(currentPost.author, e)} className="font-bold text-base text-gray-700 hover:text-indigo-600" />
                    <span className="text-gray-300">|</span>
                    <span>IP: {maskIp(currentPost.ip, currentUser?.role === "master")}</span>
                    <span>{currentPost.date}</span>
                    <span className="flex items-center gap-1"><Eye size={12} />{currentPost.views}</span>
                  </div>
                  <p className="py-4 whitespace-pre-line text-gray-800 leading-relaxed text-base">{currentPost.content}</p>
                  {(() => {
                    const isOwnPost = currentUser && currentPost.author === currentUser.nickname;
                    const alreadyLiked = currentUser && currentPost.likedBy.includes(currentUser.id);
                    const alreadyDisliked = currentUser && currentPost.dislikedBy.includes(currentUser.id);
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => voteOnPost(currentPost.id, "like")}
                            disabled={isOwnPost || alreadyLiked}
                            title={isOwnPost ? "본인 글은 추천할 수 없습니다" : undefined}
                            className={`flex items-center gap-1.5 text-sm border rounded-full px-3 py-1.5 transition ${
                              alreadyLiked
                                ? "border-red-200 bg-red-50 text-red-500 cursor-default"
                                : isOwnPost
                                ? "border-gray-200 text-gray-300 cursor-not-allowed"
                                : "border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                            }`}
                          >
                            <ThumbsUp size={14} /> 추천 {currentPost.likes}
                          </button>
                          <button
                            onClick={() => voteOnPost(currentPost.id, "dislike")}
                            disabled={isOwnPost || alreadyDisliked}
                            title={isOwnPost ? "본인 글은 비추천할 수 없습니다" : undefined}
                            className={`flex items-center gap-1.5 text-sm border rounded-full px-3 py-1.5 transition ${
                              alreadyDisliked
                                ? "border-blue-200 bg-blue-50 text-blue-500 cursor-default"
                                : isOwnPost
                                ? "border-gray-200 text-gray-300 cursor-not-allowed"
                                : "border-gray-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-500"
                            }`}
                          >
                            <ThumbsDown size={14} /> 비추천 {currentPost.dislikes || 0}
                          </button>
                        </div>
                        {canModify(currentPost.author) && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEditPost(currentPost)} className="text-xs text-gray-400 border border-gray-200 rounded-full px-3 py-1.5 hover:bg-gray-50">
                              수정
                            </button>
                            <button onClick={() => deletePost(currentPost)} className="text-xs text-gray-400 border border-gray-200 rounded-full px-3 py-1.5 hover:bg-red-50 hover:border-red-200 hover:text-red-500">
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5 mt-3">
                  <h3 className="text-sm font-bold mb-3">댓글 {currentPost.comments.length}</h3>
                  {(() => {
                    const best = [...currentPost.comments]
                      .filter(c => !isBlockedByMe(c.author))
                      .filter(c => (c.likes || 0) >= 5)
                      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
                      .slice(0, 3);
                    if (best.length === 0) return null;
                    return (
                      <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-xs font-bold text-yellow-700 mb-2 flex items-center gap-1"><Trophy size={12} /> 베스트댓글</p>
                        <div className="space-y-2">
                          {best.map(c => (
                            <div key={`best-${c.id}`} className="flex gap-2 text-sm items-start">
                              <Avatar nickname={c.author} size={24} avatarUrl={findUser(c.author)?.avatar_url} />
                              <span className="mt-0.5">{rankEmoji(findUser(c.author))}</span>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <NicknameButton nickname={c.author} currentUser={currentUser} onClick={(e) => openNicknameMenu(c.author, e)} className="font-bold text-sm text-gray-700 hover:text-indigo-600" />
                                  <span className="text-[11px] text-amber-600 font-bold">👍 {c.likes}</span>
                                </div>
                                <p className="text-gray-600">{c.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="space-y-3 mb-4">
                    {currentPost.comments.filter(c => !isBlockedByMe(c.author)).map(c => {
                      const isOwnComment = currentUser && c.author === currentUser.nickname;
                      const alreadyLikedComment = currentUser && c.likedBy.includes(currentUser.id);
                      const alreadyDislikedComment = currentUser && c.dislikedBy.includes(currentUser.id);
                      return (
                        <div key={c.id} className="flex gap-2 text-sm items-start">
                          <Avatar nickname={c.author} size={26} avatarUrl={findUser(c.author)?.avatar_url} />
                          <span className="mt-0.5">{rankEmoji(findUser(c.author))}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <NicknameButton nickname={c.author} currentUser={currentUser} onClick={(e) => openNicknameMenu(c.author, e)} className="font-bold text-sm text-gray-700 hover:text-indigo-600" />
                              <span className="text-[11px] text-gray-300">IP: {maskIp(c.ip, currentUser?.role === "master")}</span>
                            </div>
                            {editingCommentId === c.id ? (
                              <div className="flex gap-1.5 mt-1">
                                <input
                                  value={editCommentText}
                                  onChange={e => setEditCommentText(e.target.value)}
                                  onKeyDown={e => e.key === "Enter" && saveEditComment(currentPost.id, c.id)}
                                  className="flex-1 px-2 py-1 text-sm bg-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                                  autoFocus
                                />
                                <button onClick={() => saveEditComment(currentPost.id, c.id)} className="text-xs text-indigo-600 font-medium px-2">저장</button>
                                <button onClick={cancelEditComment} className="text-xs text-gray-400 px-2">취소</button>
                              </div>
                            ) : (
                              <p className="text-gray-600">{c.text}</p>
                            )}
                            <div className="mt-1 flex items-center gap-1.5">
                              <button
                                onClick={() => voteOnComment(currentPost.id, c.id, "like")}
                                disabled={isOwnComment || alreadyLikedComment}
                                title={isOwnComment ? "본인 댓글은 추천할 수 없습니다" : undefined}
                                className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border transition ${
                                  alreadyLikedComment
                                    ? "border-red-200 bg-red-50 text-red-500 cursor-default"
                                    : isOwnComment
                                    ? "border-gray-200 text-gray-300 cursor-not-allowed"
                                    : "border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                                }`}
                              >
                                <ThumbsUp size={10} /> {c.likes || 0}
                              </button>
                              <button
                                onClick={() => voteOnComment(currentPost.id, c.id, "dislike")}
                                disabled={isOwnComment || alreadyDislikedComment}
                                title={isOwnComment ? "본인 댓글은 비추천할 수 없습니다" : undefined}
                                className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border transition ${
                                  alreadyDislikedComment
                                    ? "border-blue-200 bg-blue-50 text-blue-500 cursor-default"
                                    : isOwnComment
                                    ? "border-gray-200 text-gray-300 cursor-not-allowed"
                                    : "border-gray-200 text-gray-400 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-500"
                                }`}
                              >
                                <ThumbsDown size={10} /> {c.dislikes || 0}
                              </button>
                              {canModify(c.author) && editingCommentId !== c.id && (
                                <>
                                  <button onClick={() => startEditComment(c)} className="text-[11px] text-gray-400 hover:underline px-1">수정</button>
                                  <button onClick={() => deleteComment(currentPost.id, c.id)} className="text-[11px] text-gray-400 hover:text-red-500 hover:underline px-1">삭제</button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {currentPost.comments.length === 0 && <p className="text-sm text-gray-300">첫 댓글을 남겨보세요</p>}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={commentDraft}
                      onChange={e => setCommentDraft(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && requireAuth(submitComment)}
                      onFocus={() => !currentUser && openAuth("login")}
                      placeholder={currentUser ? "댓글을 입력하세요" : "로그인 후 댓글을 남길 수 있어요"}
                      className="flex-1 px-3 py-2 text-sm bg-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <button onClick={() => requireAuth(submitComment)} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">등록</button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </main>

      <footer className="bg-gray-900 text-gray-400 text-xs mt-8">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center">
          <p className="text-white font-bold mb-2">무사어판</p>
          <p className="flex justify-center gap-3 mb-2">
            <button onClick={() => setLegalModal("about")} className="hover:text-white">회사소개</button>
            <button onClick={() => setLegalModal("terms")} className="hover:text-white">이용약관</button>
            <button onClick={() => setLegalModal("privacy")} className="hover:text-white text-gray-300">개인정보처리방침</button>
            <button onClick={() => setLegalModal("ad")} className="hover:text-white">광고/제휴문의</button>
          </p>
          <p>© 2026 koreanAsset. All rights reserved.</p>
        </div>
      </footer>

      {legalModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4" onClick={() => setLegalModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">
                {legalModal === "about" ? "회사소개" : legalModal === "terms" ? "이용약관" : legalModal === "privacy" ? "개인정보처리방침" : "광고/제휴문의"}
              </h3>
              <button onClick={() => setLegalModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>

            {legalModal === "about" && (
              <div className="text-sm text-gray-600 leading-relaxed space-y-3">
                <p>무사어판은 주식, 부동산, 보험, 금융 정보를 함께 나누는 커뮤니티입니다.</p>
                <p>회원분들이 자유롭게 정보를 공유하고 소통할 수 있는 공간을 만드는 것을 목표로 운영하고 있습니다.</p>
              </div>
            )}

            {legalModal === "terms" && (
              <div className="text-sm text-gray-600 leading-relaxed space-y-4">
                <div>
                  <p className="font-bold text-gray-800 mb-1">제1조 (목적)</p>
                  <p>이 약관은 무사어판(이하 "사이트")이 제공하는 서비스의 이용 조건 및 절차, 회원과 사이트의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">제2조 (게시물의 책임)</p>
                  <p>회원이 작성한 게시물의 내용에 대한 책임은 작성자 본인에게 있으며, 사이트는 게시물의 정확성, 신뢰성을 보증하지 않습니다.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">제3조 (투자 정보에 대한 책임)</p>
                  <p>주식추천AI 게시판 등에서 제공되는 모든 투자 관련 정보는 참고 자료일 뿐이며, 이를 근거로 한 투자의 최종 판단과 책임은 투자자 본인에게 있습니다. 투자로 인해 발생하는 손해에 대해 사이트는 어떠한 법적 책임도 지지 않습니다.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">제4조 (보험 중개 관련 책임)</p>
                  <p>본 사이트는 보험 가입자와 보험설계사 간의 정보 교류 및 중개의 장을 제공할 뿐이며, 실제 보험 상담, 계약의 체결·변경·해지 및 그로 인해 발생하는 모든 분쟁은 계약 당사자 간에 해결해야 합니다. 사이트는 보험 계약 내용이나 그로 인한 손해에 대해 어떠한 책임도 지지 않습니다.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">제5조 (회원 탈퇴)</p>
                  <p>회원은 "내정보" 메뉴의 회원 탈퇴 기능을 통해 언제든지 자유롭게 탈퇴할 수 있습니다. 탈퇴 시 해당 회원이 작성한 게시물, 댓글, 쪽지, 알림, 1:1문의 등 모든 데이터는 즉시 영구적으로 삭제되며, 삭제된 데이터는 복구할 수 없습니다.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">제6조 (약관의 변경)</p>
                  <p>사이트는 필요한 경우 관련 법령을 위배하지 않는 범위에서 이 약관을 변경할 수 있으며, 변경된 약관은 공지 후 효력이 발생합니다.</p>
                </div>
              </div>
            )}

            {legalModal === "privacy" && (
              <div className="text-sm text-gray-600 leading-relaxed space-y-4">
                <div>
                  <p className="font-bold text-gray-800 mb-1">1. 수집하는 개인정보 항목</p>
                  <p>이메일 주소, 비밀번호(Supabase Auth에 암호화 저장), 닉네임</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">2. 개인정보의 수집 및 이용 목적</p>
                  <p>회원 식별 및 로그인, 비밀번호 분실 시 본인 확인(이메일 인증), 공지사항 전달, 부정 이용 방지</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">3. 개인정보의 보유 및 이용 기간</p>
                  <p>회원 탈퇴 시까지 보관합니다. 회원은 "내정보" 메뉴에서 직접 탈퇴를 신청할 수 있으며, 탈퇴 즉시 계정 정보 및 작성한 게시물·댓글·쪽지·알림·1:1문의 등 관련 데이터가 전부 삭제됩니다. 단, 관련 법령에서 별도로 보관 의무를 정한 정보가 있는 경우 해당 기간 동안 보관 후 파기합니다.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">4. 개인정보의 제3자 제공</p>
                  <p>이용자의 개인정보는 원칙적으로 외부에 제공하지 않습니다.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-1">5. 회원 탈퇴 및 개인정보 파기 절차</p>
                  <p>회원은 로그인 후 "내정보" 화면 하단의 "회원 탈퇴" 버튼을 통해 즉시 탈퇴를 신청할 수 있습니다. 탈퇴 신청과 동시에 회원의 계정 및 개인정보, 작성한 게시물·댓글·쪽지·알림·문의 내역이 데이터베이스에서 영구적으로 삭제되며, 이후 복구가 불가능합니다.</p>
                </div>
              </div>
            )}

            {legalModal === "ad" && (
              <div className="text-sm text-gray-600 leading-relaxed space-y-3">
                <p>광고 게재, 제휴 문의는 아래 이메일로 연락해주시면 확인 후 안내드리겠습니다.</p>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-6 border-t border-gray-100 pt-4">
              문의사항은 <a href="mailto:rainbowcrow1234@gmail.com" className="text-indigo-600 hover:underline">rainbowcrow1234@gmail.com</a> 으로 연락주세요.
            </p>
          </div>
        </div>
      )}

      {authModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4" onClick={() => setAuthModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">
                {authStep === "resetPassword" ? "새 비밀번호 설정" : authStep === "done" ? "안내" : authModal === "login" ? "로그인" : authModal === "forgot" ? "비밀번호 찾기" : "회원가입"}
              </h3>
              <button onClick={() => setAuthModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>

            {authStep === "resetPassword" ? (
              <form onSubmit={e => { e.preventDefault(); confirmNewPassword(); }}>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={e => setResetNewPassword(e.target.value)}
                  placeholder="새 비밀번호"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 mb-2"
                />
                <input
                  type="password"
                  value={resetNewPassword2}
                  onChange={e => setResetNewPassword2(e.target.value)}
                  placeholder="새 비밀번호 확인"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 mb-2"
                />
                {authError && <p className="text-xs text-red-500 mb-2">{authError}</p>}
                <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700">비밀번호 변경하기</button>
              </form>
            ) : authStep === "done" ? (
              <div>
                <p className="text-sm text-gray-600 mb-4">{authInfo}</p>
                <button onClick={() => setAuthModal(null)} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700">확인</button>
              </div>
            ) : authModal === "forgot" ? (
              <form onSubmit={e => { e.preventDefault(); startForgotPassword(); }}>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                  placeholder="가입한 이메일"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 mb-2"
                />
                {authError && <p className="text-xs text-red-500 mb-2">{authError}</p>}
                <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700">재설정 링크 받기</button>
                <p className="text-center text-xs text-gray-400 mt-3">
                  <button type="button" onClick={() => openAuth("login")} className="text-indigo-600 font-medium">로그인으로 돌아가기</button>
                </p>
              </form>
            ) : (
              <form onSubmit={e => { e.preventDefault(); (authModal === "login" ? handleLogin : handleSignup)(); }}>
                <div className="space-y-2.5">
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                    placeholder="이메일"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                    placeholder="비밀번호 (6자 이상)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  {authModal === "signup" && (
                    <>
                      <input
                        type="password"
                        value={authForm.password2}
                        onChange={e => setAuthForm({ ...authForm, password2: e.target.value })}
                        placeholder="비밀번호 확인"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      <input
                        value={authForm.nickname}
                        onChange={e => setAuthForm({ ...authForm, nickname: e.target.value })}
                        placeholder="닉네임"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </>
                  )}
                </div>

                {authError && <p className="text-xs text-red-500 mt-2">{authError}</p>}

                {authModal === "login" && (
                  <div className="mt-3">
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={authForm.keepLoggedIn}
                        onChange={e => setAuthForm({ ...authForm, keepLoggedIn: e.target.checked })}
                        className="rounded cursor-pointer"
                      />
                      로그인 상태 유지
                    </label>
                    {authForm.keepLoggedIn && (
                      <p className="text-[11px] text-amber-700 mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
                        ⚠️ 공용 PC, 회사·학교 컴퓨터, 다른 사람과 함께 쓰는 기기에서는 이 옵션을 체크하지 마세요. 로그아웃하지 않으면 다음에 이 기기를 쓰는 사람도 내 계정으로 접속될 수 있어요. 사용 후에는 꼭 로그아웃해주세요.
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 mt-4"
                >
                  {authModal === "login" ? "로그인" : "가입하기"}
                </button>

                <p className="text-center text-xs text-gray-400 mt-3">
                  {authModal === "login" ? (
                    <>
                      계정이 없으신가요? <button type="button" onClick={() => openAuth("signup")} className="text-indigo-600 font-medium">회원가입</button>
                      <br />
                      <button type="button" onClick={() => openAuth("forgot")} className="text-gray-400 mt-1 hover:underline">비밀번호를 잊으셨나요?</button>
                    </>
                  ) : (
                    <>이미 계정이 있으신가요? <button type="button" onClick={() => openAuth("login")} className="text-indigo-600 font-medium">로그인</button></>
                  )}
                </p>
              </form>
            )}
          </div>
        </div>
      )}

      {nicknameMenu && currentUser && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 9997 }} onClick={closeNicknameMenu} />
          <div style={{ position: "fixed", left: nicknameMenu.x, top: nicknameMenu.y, zIndex: 9999 }}>
            <NicknameMenu
              nickname={nicknameMenu.nickname}
              currentUser={currentUser}
              blockedList={currentUser.blocked || []}
              onToggleBlock={toggleBlock}
              onMessage={(nick) => openCompose(nick)}
              onViewProfile={viewProfile}
              onClose={closeNicknameMenu}
            />
          </div>
        </>
      )}

      {profileView && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4" onClick={() => setProfileView(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end">
              <button onClick={() => setProfileView(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex justify-center mb-3">
              <Avatar nickname={profileView} size={64} avatarUrl={findUser(profileView)?.avatar_url} />
            </div>
            <h3 className="font-bold text-lg mb-1">{profileView}</h3>
            <p className="text-sm text-gray-400 mb-4 flex items-center justify-center gap-1">
              {(() => {
                const u = profiles.find(u => u.nickname === profileView);
                return (<><span>{rankEmoji(u)}</span><span>{u ? pointLabel(u) : "일반 회원"}</span></>);
              })()}
            </p>
            <div className="flex gap-2 justify-center">
              {currentUser && currentUser.nickname !== profileView && (
                <>
                  <button onClick={() => { setProfileView(null); openCompose(profileView); }} className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                    쪽지보내기
                  </button>
                  <button
                    onClick={() => toggleBlock(profileView)}
                    className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                  >
                    {isBlockedByMe(profileView) ? "차단 해제" : "차단하기"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showNotifications && currentUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4" onClick={() => setShowNotifications(false)}>
          <div className="bg-white rounded-xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2"><Bell size={18} />알림</h3>
              <div className="flex items-center gap-3">
                {notifications.some(n => !n.read) && (
                  <button onClick={markAllRead} className="text-xs text-indigo-600 hover:underline">모두 읽음</button>
                )}
                <button onClick={() => setShowNotifications(false)}><X size={18} className="text-gray-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-center text-gray-300 text-sm py-10">알림이 없습니다.</p>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => readNotification(n)}
                    className={`w-full text-left px-5 py-3 border-b border-gray-50 hover:bg-gray-50 flex items-start gap-2.5 ${!n.read ? "bg-indigo-50/40" : ""}`}
                  >
                    <span className="mt-1.5 shrink-0">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-red-500 block" />}
                    </span>
                    <span className="flex-1">
                      <span className={`text-sm block ${!n.read ? "font-medium text-gray-900" : "text-gray-500"}`}>{n.text}</span>
                      <span className="text-[11px] text-gray-300">{n.time}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showMessages && currentUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4" onClick={() => setShowMessages(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2"><Mail size={18} />쪽지</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => openCompose()} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
                  쪽지 쓰기
                </button>
                <button onClick={() => setShowMessages(false)}><X size={18} className="text-gray-400" /></button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="w-2/5 border-r border-gray-100 flex flex-col">
                <div className="flex border-b border-gray-100 shrink-0">
                  <button
                    onClick={() => { setMessageTab("received"); setMessageDetail(null); }}
                    className={`flex-1 py-2.5 text-sm font-medium ${messageTab === "received" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-400"}`}
                  >
                    받은 쪽지 {messages.filter(m => m.toId === currentUser.id && !m.read).length > 0 && (
                      <span className="text-red-500">({messages.filter(m => m.toId === currentUser.id && !m.read).length})</span>
                    )}
                  </button>
                  <button
                    onClick={() => { setMessageTab("sent"); setMessageDetail(null); }}
                    className={`flex-1 py-2.5 text-sm font-medium ${messageTab === "sent" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-400"}`}
                  >
                    보낸 쪽지
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {(messageTab === "received"
                    ? messages.filter(m => m.toId === currentUser.id)
                    : messages.filter(m => m.fromId === currentUser.id)
                  ).length === 0 && (
                    <p className="text-center text-gray-300 text-sm py-10">쪽지가 없습니다.</p>
                  )}
                  {(messageTab === "received"
                    ? messages.filter(m => m.toId === currentUser.id)
                    : messages.filter(m => m.fromId === currentUser.id)
                  ).map(m => (
                    <button
                      key={m.id}
                      onClick={() => openMessageDetail(m)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${messageDetail?.id === m.id ? "bg-indigo-50" : ""}`}
                    >
                      <div className="flex items-center gap-1.5">
                        {messageTab === "received" && !m.read && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        <span className={`text-sm truncate ${messageTab === "received" && !m.read ? "font-bold" : "font-medium"}`}>{m.subject}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-gray-400">{messageTab === "received" ? m.from : `to. ${m.to}`}</span>
                        <span className="text-[11px] text-gray-300">{m.date}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-3/5 flex flex-col">
                {messageDetail ? (
                  <>
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h4 className="font-bold mb-2">{messageDetail.subject}</h4>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{messageTab === "received" ? `보낸사람: ${messageDetail.from}` : `받는사람: ${messageDetail.to}`}</span>
                        <span>{messageDetail.date}</span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4">
                      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{messageDetail.content}</p>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-100 flex gap-2 shrink-0">
                      {messageTab === "received" && (
                        <button onClick={() => openCompose(messageDetail.from)} className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                          답장
                        </button>
                      )}
                      <button onClick={() => deleteMessage(messageDetail.id)} className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-500">
                        삭제
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
                    쪽지를 선택해주세요
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompose && currentUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 px-4" onClick={() => setShowCompose(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">쪽지 쓰기</h3>
              <button onClick={() => setShowCompose(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-2.5">
              <input
                value={composeForm.to}
                onChange={e => setComposeForm({ ...composeForm, to: e.target.value })}
                placeholder="받는 사람 닉네임"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <input
                value={composeForm.subject}
                onChange={e => setComposeForm({ ...composeForm, subject: e.target.value })}
                placeholder="제목"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <textarea
                value={composeForm.content}
                onChange={e => setComposeForm({ ...composeForm, content: e.target.value })}
                placeholder="내용을 입력하세요"
                rows={5}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>
            {composeError && <p className="text-xs text-red-500 mt-2">{composeError}</p>}
            <button onClick={sendMessage} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 mt-4">
              보내기
            </button>
          </div>
        </div>
      )}

      {showProfile && currentUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4" onClick={() => setShowProfile(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">내정보</h3>
              <button onClick={() => setShowProfile(false)}><X size={18} className="text-gray-400" /></button>
            </div>

            <div className="mb-5 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              이메일: <span className="font-medium text-gray-600">{session?.user?.email}</span>
            </div>

            <div className="mb-5">
              <p className="text-sm font-bold mb-2">프로필 사진</p>
              <div className="flex items-center gap-3">
                <Avatar nickname={currentUser.nickname} size={48} avatarUrl={currentUser.avatar_url} />
                <label className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                  사진 변경
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="mb-5">
              <p className="text-sm font-bold mb-2">닉네임 변경</p>
              <div className="flex gap-2">
                <input
                  value={profileForm.nickname}
                  onChange={e => setProfileForm({ ...profileForm, nickname: e.target.value })}
                  placeholder="닉네임"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button onClick={updateNickname} className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap">
                  변경
                </button>
              </div>
            </div>

            <div className="mb-2">
              <p className="text-sm font-bold mb-2">비밀번호 변경</p>
              <div className="space-y-2">
                <input
                  type="password"
                  value={profileForm.currentPassword}
                  onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                  placeholder="현재 비밀번호"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <input
                  type="password"
                  value={profileForm.newPassword}
                  onChange={e => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                  placeholder="새 비밀번호 (6자 이상)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <input
                  type="password"
                  value={profileForm.newPassword2}
                  onChange={e => setProfileForm({ ...profileForm, newPassword2: e.target.value })}
                  placeholder="새 비밀번호 확인"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button onClick={updatePassword} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700">
                  비밀번호 변경
                </button>
              </div>
            </div>

            {profileError && <p className="text-xs text-red-500 mt-3">{profileError}</p>}
            {profileSuccess && <p className="text-xs text-emerald-600 mt-3">{profileSuccess}</p>}

            <div className="mt-5 pt-4 border-t border-gray-100">
              <button onClick={handleDeleteAccount} className="text-xs text-gray-400 hover:text-red-500 hover:underline">
                회원 탈퇴
              </button>
            </div>
          </div>
        </div>
      )}

      {showInquiry && currentUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4" onClick={() => setShowInquiry(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">1:1문의</h3>
              <button onClick={() => setShowInquiry(false)}><X size={18} className="text-gray-400" /></button>
            </div>

            <div className="space-y-2.5 mb-4">
              <input
                value={inquiryForm.title}
                onChange={e => setInquiryForm({ ...inquiryForm, title: e.target.value })}
                placeholder="문의 제목"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <textarea
                value={inquiryForm.content}
                onChange={e => setInquiryForm({ ...inquiryForm, content: e.target.value })}
                placeholder="문의 내용을 입력해주세요. 관리자가 확인 후 답변드립니다."
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              {inquiryError && <p className="text-xs text-red-500">{inquiryError}</p>}
              <button onClick={submitInquiry} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700">
                문의 등록
              </button>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-bold mb-2">나의 문의내역</p>
              {inquiries.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-6">등록된 문의가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {inquiries.map(q => (
                    <div key={q.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm">{q.title}</p>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${q.status === "답변완료" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                          {q.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 whitespace-pre-line mb-1">{q.content}</p>
                      <p className="text-[11px] text-gray-300">{q.date}</p>
                      {q.answer && (
                        <div className="mt-2 bg-gray-50 rounded-lg p-2.5">
                          <p className="text-[11px] font-medium text-indigo-600 mb-1">관리자 답변</p>
                          <p className="text-xs text-gray-600 whitespace-pre-line">{q.answer}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showWrite && currentUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4" onClick={() => { setShowWrite(false); setEditingPostId(null); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">{editingPostId ? "글 수정" : "글쓰기"}</h3>
              <button onClick={() => { setShowWrite(false); setEditingPostId(null); }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {BOARD_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setNewPost({ ...newPost, category: c.id, subcategory: null })}
                  className={`text-xs px-2.5 py-1 rounded-full ${newPost.category === c.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {(() => {
              const cat = BOARD_CATEGORIES.find(c => c.id === newPost.category);
              if (!cat || !cat.sub || cat.sub.length === 0) return null;
              return (
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  <button
                    onClick={() => setNewPost({ ...newPost, subcategory: null })}
                    className={`text-[11px] px-2 py-1 rounded-full border ${!newPost.subcategory ? "border-indigo-500 text-indigo-600 bg-indigo-50" : "border-gray-200 text-gray-400"}`}
                  >
                    세부선택안함
                  </button>
                  {cat.sub.map(s => {
                    const locked = !canWriteToSubcategory(s);
                    return (
                      <button
                        key={s}
                        onClick={() => { if (!locked) setNewPost({ ...newPost, subcategory: s }); }}
                        disabled={locked}
                        title={locked ? "마스터만 작성할 수 있는 게시판입니다" : undefined}
                        className={`text-[11px] px-2 py-1 rounded-full border flex items-center gap-1 ${
                          locked
                            ? "border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50"
                            : newPost.subcategory === s
                            ? "border-indigo-500 text-indigo-600 bg-indigo-50"
                            : "border-gray-200 text-gray-400"
                        }`}
                      >
                        {locked && <Shield size={10} />}
                        {s}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <input
              value={newPost.title}
              onChange={e => setNewPost({ ...newPost, title: e.target.value })}
              placeholder="제목"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 mb-2"
            />
            <textarea
              value={newPost.content}
              onChange={e => setNewPost({ ...newPost, content: e.target.value })}
              placeholder="내용을 입력하세요"
              rows={6}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 mb-3 resize-none"
            />
            <button onClick={submitPost} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700">
              {editingPostId ? "수정하기" : "등록하기 (+5P)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
