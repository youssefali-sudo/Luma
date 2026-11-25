"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Profile = { id: string; username: string; display_name: string; bio: string | null; avatar_url: string | null };
type PostRow = {
  id: string; author_id: string; caption: string; media_path: string | null; media_mime: string | null; created_at: string;
  author: Profile | Profile[] | null;
};
type StoryRow = { id: string; user_id: string; media_path: string | null; caption: string; expires_at: string; profile?: Profile | Profile[] | null };
type Tab = "discover" | "search" | "profile" | "groups" | "messages";

function Icon({ name, size = 21 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1-4a7.5 7.5 0 1 1 16-3.5Z" /><path d="M8 11h8M8 14h5" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    heart: <path d="M20.8 8.8c0 5.1-8.8 10-8.8 10S3.2 13.9 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z" />,
    comment: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1-4a7.5 7.5 0 1 1 16-3.5Z" /><path d="M8 11h8" /></>,
    share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.3 10.8 7.4-4.6M8.3 13.2l7.4 4.6" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.home}</svg>;
}

function Avatar({ profile, size = "md" }: { profile: Partial<Profile> | null | undefined; size?: "sm" | "md" | "lg" }) {
  const name = profile?.display_name || profile?.username || "LUMA";
  return <span className={`avatar avatar-${size}`}>{profile?.avatar_url ? <img src={profile.avatar_url} alt={name} /> : <span className="avatar-fallback">{name.slice(0, 1).toUpperCase()}</span>}</span>;
}
function personOf(value: PostRow["author"]): Profile | null {
  return Array.isArray(value) ? value[0] || null : value;
}
function compact(n: number) {
  return n >= 1000000 ? (n / 1000000).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}
function mediaUrl(path: string | null, supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from("luma-media").getPublicUrl(path).data.publicUrl;
}

export default function Home() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [tab, setTab] = useState<Tab>("discover");
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [peopleResults, setPeopleResults] = useState<Profile[]>([]);
  const [caption, setCaption] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [createKind, setCreateKind] = useState<"post" | "story">("post");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<{ id: string; kind: string; created_at: string; actor: { display_name: string; username: string } | null }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3200); }, []);

  const loadFeed = useCallback(async (uid: string) => {
    if (!supabase) return;
    const [postResult, likeResult, followResult, storyResult] = await Promise.all([
      supabase.from("posts").select("id,author_id,caption,media_path,media_mime,created_at,author:profiles!posts_author_id_fkey(id,username,display_name,bio,avatar_url)").order("created_at", { ascending: false }).limit(40),
      supabase.from("post_likes").select("post_id,user_id"),
      supabase.from("follows").select("following_id").eq("follower_id", uid),
      supabase.from("stories").select("id,user_id,media_path,caption,expires_at,profile:profiles!stories_user_id_fkey(id,username,display_name,bio,avatar_url)").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(40),
    ]);
    if (postResult.error) throw postResult.error;
    if (likeResult.error) throw likeResult.error;
    if (followResult.error) throw followResult.error;
    setPosts((postResult.data || []) as unknown as PostRow[]);
    setLikedIds((likeResult.data || []).filter((x) => x.user_id === uid).map((x) => x.post_id));
    setLikeCounts((likeResult.data || []).reduce((acc, row) => ({ ...acc, [row.post_id]: (acc[row.post_id] || 0) + 1 }), {} as Record<string, number>));
    setFollowingIds((followResult.data || []).map((x) => x.following_id));
    const storyData = storyResult.data || [];
    if (storyResult.error && !storyResult.error.message.includes("stories")) throw storyResult.error;
    setStories(storyData as unknown as StoryRow[]);
    const ids = (postResult.data || []).map((x) => x.id);
    if (ids.length) {
      const { data: comments } = await supabase.from("post_comments").select("post_id").in("post_id", ids);
      setCommentCounts((comments || []).reduce((acc, row) => ({ ...acc, [row.post_id]: (acc[row.post_id] || 0) + 1 }), {} as Record<string, number>));
    } else setCommentCounts({});
  }, [supabase]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) { router.replace("/login"); return; }
      const uid = data.session.user.id;
      setUserId(uid);
      try {
        const { data: me, error: profileError } = await supabase.from("profiles").select("id,username,display_name,bio,avatar_url").eq("id", uid).single();
        if (profileError) throw profileError;
        if (active) {
          setProfile(me as Profile);
          setEditName(me.display_name || "");
          setEditBio(me.bio || "");
          await loadFeed(uid);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "تعذر تحميل حسابك. تأكد من تطبيق مخطط قاعدة البيانات.");
      } finally { if (active) setLoading(false); }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, [supabase, router, loadFeed]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase.channel("luma-social-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => { void loadFeed(userId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => { void loadFeed(userId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => { void loadFeed(userId); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, userId, loadFeed]);

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((post) => {
      const author = personOf(post.author);
      return (post.caption + " " + (author?.display_name || "") + " " + (author?.username || "")).toLowerCase().includes(q);
    });
  }, [posts, search]);

  async function uploadFile(file: File, folder: "posts" | "stories") {
    if (!supabase || !userId) throw new Error("سجّل دخولك أولًا.");
    if (file.size > 50 * 1024 * 1024) throw new Error("الحد الأقصى للملف 50 ميجابايت.");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4", "video/webm"];
    if (!allowed.includes(file.type)) throw new Error("نوع الملف غير مدعوم هنا. استخدم صورة أو فيديو MP4/WebM.");
    const ext = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
    const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("luma-media").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    return path;
  }

  async function createContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) return;
    if (!caption.trim() && !selectedFile) { setError("اكتب وصفًا أو اختر صورة/فيديو."); return; }
    setBusy(true); setError("");
    try {
      const path = selectedFile ? await uploadFile(selectedFile, createKind === "post" ? "posts" : "stories") : null;
      if (createKind === "post") {
        const { error: insertError } = await supabase.from("posts").insert({ author_id: userId, caption: caption.trim(), media_path: path, media_mime: selectedFile?.type || null });
        if (insertError) throw insertError;
      } else {
        const { error: insertError } = await supabase.from("stories").insert({ user_id: userId, caption: caption.trim(), media_path: path });
        if (insertError) throw insertError;
      }
      setCaption(""); setSelectedFile(null); setShowCreate(false);
      await loadFeed(userId);
      notify(createKind === "post" ? "اتنشر المنشور على LUMA." : "الستوري اتنشرت وهتختفي بعد 24 ساعة.");
    } catch (e) { setError(e instanceof Error ? e.message : "فشل النشر."); }
    finally { setBusy(false); }
  }

  async function toggleLike(postId: string) {
    if (!supabase) return;
    const liked = likedIds.includes(postId);
    setLikedIds((old) => liked ? old.filter((id) => id !== postId) : [...old, postId]);
    setLikeCounts((old) => ({ ...old, [postId]: Math.max(0, (old[postId] || 0) + (liked ? -1 : 1)) }));
    const result = liked
      ? await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId)
      : await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
    if (result.error) { notify("تعذر حفظ الإعجاب: " + result.error.message); await loadFeed(userId); }
  }

  async function toggleFollow(targetId: string) {
    if (!supabase || targetId === userId) return;
    const followed = followingIds.includes(targetId);
    setFollowingIds((old) => followed ? old.filter((id) => id !== targetId) : [...old, targetId]);
    const result = followed
      ? await supabase.from("follows").delete().eq("follower_id", userId).eq("following_id", targetId)
      : await supabase.from("follows").insert({ follower_id: userId, following_id: targetId });
    if (result.error) { notify("تعذر تحديث المتابعة: " + result.error.message); await loadFeed(userId); }
  }

  async function addComment(postId: string) {
    const body = window.prompt("اكتب تعليقك");
    if (!body?.trim() || !supabase) return;
    const { error: commentError } = await supabase.from("post_comments").insert({ post_id: postId, author_id: userId, body: body.trim() });
    if (commentError) notify("تعذر نشر التعليق: " + commentError.message);
    else { setCommentCounts((old) => ({ ...old, [postId]: (old[postId] || 0) + 1 })); notify("تم نشر تعليقك."); }
  }

  async function searchPeople() {
    if (!supabase || !search.trim()) { setPeopleResults([]); return; }
    const q = search.trim().replace(/[,%()]/g, "");
    const { data, error: searchError } = await supabase.from("profiles").select("id,username,display_name,bio,avatar_url").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(20);
    if (searchError) { notify("تعذر البحث: " + searchError.message); return; }
    setPeopleResults((data || []) as Profile[]);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !profile) return;
    setBusy(true); setError("");
    const { data, error: updateError } = await supabase.from("profiles").update({ display_name: editName.trim(), bio: editBio.trim(), updated_at: new Date().toISOString() }).eq("id", userId).select("id,username,display_name,bio,avatar_url").single();
    if (updateError) setError(updateError.message);
    else { setProfile(data as Profile); setEditProfile(false); notify("اتحفظ ملفك الشخصي."); }
    setBusy(false);
  }

  async function loadNotifications() {
    if (!supabase) return;
    const { data, error: notificationError } = await supabase.from("notifications").select("id,kind,created_at,actor:profiles!notifications_actor_id_fkey(display_name,username)").eq("recipient_id", userId).order("created_at", { ascending: false }).limit(20);
    if (notificationError) { notify("الإشعارات تحتاج تطبيق migration الاجتماعي."); return; }
    setNotifications((data || []) as unknown as typeof notifications);
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", userId).is("read_at", null);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!isSupabaseConfigured()) return <main className="auth-shell" dir="rtl"><section className="auth-form-side"><div className="auth-form-wrap"><span className="auth-overline">LUMA SETUP</span><h2>باقي خطوة واحدة.</h2><p className="auth-subtitle">الواجهة متوصلة بقاعدة بيانات حقيقية، لكن لازم تضيف مفاتيح مشروع Supabase في إعدادات الاستضافة لتفعيل الحسابات.</p><Link className="auth-submit" href="/login">فتح صفحة تسجيل الدخول</Link><p className="setup-hint">المطلوب: NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY، ثم تشغيل ملفات SQL داخل مجلد supabase.</p></div></section></main>;
  if (loading) return <main className="social-app loading-screen" dir="rtl"><div className="loading-orb" /><h1>LUMA</h1><p>بنجهز مساحتك...</p></main>;
  if (!profile) return <main className="social-app loading-screen" dir="rtl"><h1>مش قادرين نحمل ملفك الشخصي</h1><p>{error || "تأكد من تشغيل مخطط قاعدة البيانات في Supabase."}</p><Link href="/login">العودة لتسجيل الدخول</Link></main>;

  return (
    <main className="social-app" dir="rtl">
      <header className="mobile-topbar"><button className="round-icon" aria-label="الرئيسية" onClick={() => setTab("discover")}><Icon name="home" /></button><button className="wordmark" onClick={() => setTab("discover")}>luma<span>.</span></button><button className="round-icon" aria-label="الإشعارات" onClick={() => { setShowNotifications(!showNotifications); void loadNotifications(); }}><Icon name="bell" /></button></header>
      <aside className="desktop-rail">
        <button className="rail-logo" onClick={() => setTab("discover")}>L<span>.</span></button>
        <button className={`rail-button ${tab === "discover" ? "selected" : ""}`} onClick={() => setTab("discover")} aria-label="اكتشف"><Icon name="home" /></button>
        <button className={`rail-button ${tab === "search" ? "selected" : ""}`} onClick={() => setTab("search")} aria-label="بحث"><Icon name="search" /></button>
        <button className="rail-button create-rail" onClick={() => { setCreateKind("post"); setShowCreate(true); }} aria-label="إنشاء"><Icon name="plus" size={26} /></button>
        <button className={`rail-button ${tab === "messages" ? "selected" : ""}`} onClick={() => setTab("messages")} aria-label="الرسائل"><Icon name="chat" /></button>
        <button className={`rail-button ${tab === "profile" ? "selected" : ""}`} onClick={() => setTab("profile")} aria-label="البروفايل"><Icon name="user" /></button>
        <div className="rail-spacer" /><button className="rail-button" onClick={() => void signOut()} aria-label="تسجيل الخروج"><Icon name="logout" /></button><Avatar profile={profile} size="sm" />
      </aside>
      <div className="social-layout">
        <section className="feed-column">
          <div className="feed-topline"><div><span className="eyebrow">YOUR WORLD, YOUR WAY</span><h1>{tab === "profile" ? "Profile" : tab === "search" ? "Search" : tab === "messages" ? "Messages" : tab === "groups" ? "Communities" : "Discover"}</h1></div><button className="round-icon desktop-notify" onClick={() => { setShowNotifications(!showNotifications); void loadNotifications(); }} aria-label="الإشعارات"><Icon name="bell" /></button></div>
          {tab === "search" && <div className="search-field"><Icon name="search" size={20} /><input value={search} onChange={(e) => { setSearch(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") void searchPeople(); }} placeholder="ابحث باسم أو @username..." /><button onClick={() => void searchPeople()}>بحث</button></div>}
          {tab === "discover" && <section className="stories-section"><div className="section-heading"><h2>الستوري <span className="live-dot" /></h2><button onClick={() => { setCreateKind("story"); setShowCreate(true); }}>أضف ستوري +</button></div><div className="stories-strip"><button className="story-person own-story" onClick={() => { setCreateKind("story"); setShowCreate(true); }}><span className="story-circle add-story"><Avatar profile={profile} size="lg" /><i>+</i></span><span>قصتك</span></button>{stories.map((story) => { const p = Array.isArray(story.profile) ? story.profile[0] : story.profile; return <button className="story-person" key={story.id} onClick={() => story.media_path ? window.open(mediaUrl(story.media_path, supabase!), "_blank", "noopener,noreferrer") : notify(story.caption || "ستوري LUMA")}><span className="story-circle"><Avatar profile={p} size="lg" /></span><span>{p?.display_name || p?.username || "عضو"}</span></button>; })}</div></section>}
          {tab === "profile" && <section className="profile-view"><div className="profile-cover"><div className="cover-orb" /><button className="round-icon edit-profile" onClick={() => { setEditName(profile.display_name); setEditBio(profile.bio || ""); setEditProfile(true); }} aria-label="تعديل الملف">تعديل</button></div><div className="profile-main"><Avatar profile={profile} size="lg" ring /><h2>{profile.display_name}</h2><p className="profile-handle">@{profile.username}</p><p className="profile-bio">{profile.bio || "اكتب نبذة تعرّف الناس عليك."}</p><div className="profile-stats"><div><strong>{followingIds.length}</strong><span>Following</span></div><div><strong>{posts.filter((p) => p.author_id === userId).length}</strong><span>Posts</span></div><div><strong>{compact(Object.values(likeCounts).reduce((a,b) => a+b,0))}</strong><span>Likes in feed</span></div></div><div className="profile-actions"><button className="primary-action" onClick={() => { setCreateKind("post"); setShowCreate(true); }}>＋ منشور جديد</button><button className="secondary-action" onClick={() => setEditProfile(true)}>تعديل الملف</button></div></div><div className="profile-grid">{posts.filter((p) => p.author_id === userId).map((post) => <button key={post.id} className="profile-tile" onClick={() => notify(post.caption)}>{post.media_path ? <img src={mediaUrl(post.media_path, supabase!)} alt={post.caption} /> : <span>{post.caption}</span>}</button>)}</div></section>}
          {tab === "messages" && <div className="welcome-card"><span className="eyebrow">PRIVATE MESSAGES</span><h3>قريبًا<br /><em>رسائلك.</em></h3><p>قاعدة الرسائل وسياسات الوصول موجودة في مخطط الأساس. الخطوة التالية توصيل واجهة المحادثات والبث اللحظي.</p><button onClick={() => notify("تم تحديد الرسائل كأولوية للمرحلة التالية.")}>المرحلة التالية</button></div>}
          {tab === "groups" && <div className="welcome-card"><span className="eyebrow">COMMUNITIES</span><h3>جروبات<br /><em>وقنوات.</em></h3><p>سيتم توصيل إنشاء الجروبات والقنوات وإدارة الأعضاء بعد إنهاء أساس الحسابات والمنشورات.</p><button onClick={() => notify("تم تحديد المجتمعات كأولوية للمرحلة التالية.")}>المرحلة التالية</button></div>}
          {(tab === "discover" || tab === "search") && <><div className="trend-heading"><h2>{tab === "search" ? "الأشخاص" : "أحدث المنشورات"}</h2><span className="eyebrow">{posts.length} POSTS</span></div>{tab === "search" && peopleResults.length > 0 && <div className="people-results">{peopleResults.filter((p) => p.id !== userId).map((p) => <div className="suggestion-row" key={p.id}><Avatar profile={p} /><div className="suggestion-copy"><strong>{p.display_name}</strong><span>@{p.username}</span></div><button className={`mini-follow ${followingIds.includes(p.id) ? "on" : ""}`} onClick={() => void toggleFollow(p.id)}>{followingIds.includes(p.id) ? "✓" : "+"}</button></div>)}</div>}
          {filteredPosts.length === 0 ? <div className="empty-feed"><h3>{tab === "search" ? "مفيش نتائج مطابقة" : "لسه مفيش منشورات"}</h3><p>{tab === "search" ? "جرّب اسمًا أو كلمة مختلفة." : "ابدأ المجتمع بأول منشور حقيقي من حسابك."}</p><button className="primary-action" onClick={() => { setCreateKind("post"); setShowCreate(true); }}>انشر أول لحظة</button></div> : <div className="feed-list">{filteredPosts.map((post) => { const author = personOf(post.author); const liked = likedIds.includes(post.id); const following = followingIds.includes(post.author_id); const src = mediaUrl(post.media_path, supabase!); return <article className="post-card" key={post.id}>{src ? post.media_mime?.startsWith("video/") ? <video className="post-image" src={src} controls playsInline /> : <img className="post-image" src={src} alt={post.caption || "LUMA post"} /> : <div className="post-text-media">{post.caption.slice(0, 180)}</div>}<div className="post-shade" /><div className="post-badge">LUMA</div><button className={`post-more ${liked ? "is-liked" : ""}`} aria-label="إعجاب" onClick={() => void toggleLike(post.id)}><Icon name="heart" /></button><div className="post-actions-overlay"><button className={liked ? "is-liked" : ""} onClick={() => void toggleLike(post.id)} aria-label="إعجاب"><Icon name="heart" size={22} /><span>{compact(likeCounts[post.id] || 0)}</span></button><button onClick={() => void addComment(post.id)} aria-label="تعليق"><Icon name="comment" size={21} /><span>{compact(commentCounts[post.id] || 0)}</span></button><button onClick={() => { if (navigator.share) void navigator.share({ title: "LUMA", text: post.caption, url: window.location.href }).catch(() => {}); else notify("انسخ رابط LUMA لمشاركته."); }} aria-label="مشاركة"><Icon name="share" size={20} /><span>Share</span></button></div><div className="post-caption-area"><div className="post-author"><Avatar profile={author} /><div><strong>{author?.display_name || "عضو LUMA"}</strong><span>@{author?.username || "member"}</span></div>{author?.id !== userId && <button className={`follow-button ${following ? "following" : ""}`} onClick={() => void toggleFollow(post.author_id)}>{following ? "Following" : "Follow +"}</button>}</div><p>{post.caption}</p></div></article>; })}</div>}</>}
        </section>
        <aside className="discovery-sidebar"><div className="side-search"><Icon name="search" size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setTab("search")} onKeyDown={(e) => { if (e.key === "Enter") void searchPeople(); }} placeholder="Search LUMA" /><kbd>↵</kbd></div><div className="welcome-card"><div className="welcome-glow" /><span className="eyebrow">A LITTLE SPACE, JUST FOR YOU</span><h3>Find your<br /><em>people.</em></h3><p>اكتشف ناس شبهك، أفكار جديدة، ولحظات تستاهل تتشاف.</p><button onClick={() => setTab("search")}>ابدأ الاستكشاف <span>←</span></button></div><section className="suggestions"><div className="section-heading"><h2>حسابك</h2><button onClick={() => setTab("profile")}>البروفايل</button></div><div className="suggestion-row"><Avatar profile={profile} /><div className="suggestion-copy"><strong>{profile.display_name}</strong><span>@{profile.username}</span></div><button className="mini-follow on" onClick={() => setTab("profile")}><Icon name="user" size={16} /></button></div><button className="secondary-action" style={{ width: "100%", marginTop: 12 }} onClick={() => { setShowNotifications(!showNotifications); void loadNotifications(); }}>الإشعارات</button><button className="secondary-action" style={{ width: "100%", marginTop: 8 }} onClick={() => void signOut()}>تسجيل الخروج</button></section><footer className="side-footer">About · Guidelines · Privacy · Help<br /><span>© 2026 LUMA — مساحتك، بطريقتك.</span></footer></aside>
      </div>
      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي"><button className={tab === "discover" ? "active" : ""} onClick={() => setTab("discover")} aria-label="الرئيسية"><Icon name="home" /></button><button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")} aria-label="بحث"><Icon name="search" /></button><button className="bottom-create" onClick={() => { setCreateKind("post"); setShowCreate(true); }} aria-label="إنشاء"><Icon name="plus" size={25} /></button><button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")} aria-label="الرسائل"><Icon name="chat" /></button><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")} aria-label="البروفايل"><Icon name="user" /></button></nav>
      {showNotifications && <div className="notification-popover"><div><strong>الإشعارات</strong><button onClick={() => setShowNotifications(false)}>×</button></div>{notifications.length ? notifications.map((n) => <p key={n.id}>{n.kind === "follow" ? "بدأ يتابعك" : n.kind === "like" ? "أعجب بمنشورك" : "علّق على منشورك"} — {n.actor?.display_name || "عضو LUMA"} <small>{new Date(n.created_at).toLocaleString()}</small></p>) : <p>مفيش إشعارات جديدة.</p>}</div>}
      {showCreate && <div className="modal-backdrop" onClick={() => !busy && setShowCreate(false)}><form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={createContent}><div className="modal-head"><div><span className="eyebrow">{createKind === "post" ? "SHARE A MOMENT" : "YOUR STORY"}</span><h2>{createKind === "post" ? "انشر لحظتك" : "أضف ستوري"}</h2></div><button type="button" onClick={() => setShowCreate(false)} disabled={busy}>×</button></div><div className="auth-tabs"><button type="button" className={createKind === "post" ? "chosen" : ""} onClick={() => setCreateKind("post")}>منشور</button><button type="button" className={createKind === "story" ? "chosen" : ""} onClick={() => setCreateKind("story")}>ستوري 24 ساعة</button></div><label className="caption-label">إيه اللي في بالك؟<textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="احكي للناس عن لحظتك..." rows={4} maxLength={2200} /></label><label className="image-url-label">صورة أو فيديو<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm" onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedFile(e.target.files?.[0] || null)} /><small>{selectedFile ? `${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : "حتى 50 MB · JPG, PNG, WEBP, MP4"}</small></label>{error && <p className="auth-message" role="alert">{error}</p>}<div className="modal-actions"><span>✦ محتواك محفوظ في حسابك</span><button className="primary-action" type="submit" disabled={busy}>{busy ? "جاري النشر..." : "نشر ↗"}</button></div></form></div>}
      {editProfile && <div className="modal-backdrop" onClick={() => !busy && setEditProfile(false)}><form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveProfile}><div className="modal-head"><div><span className="eyebrow">YOUR PROFILE</span><h2>تعديل الملف الشخصي</h2></div><button type="button" onClick={() => setEditProfile(false)}>×</button></div><label>اسم العرض<input value={editName} onChange={(e) => setEditName(e.target.value)} minLength={2} maxLength={60} required /></label><label>نبذة عنك<textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} maxLength={180} rows={3} /></label>{error && <p className="auth-message">{error}</p>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? "جاري الحفظ..." : "حفظ التغييرات"}</button></form></div>}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </main>
  );
}
