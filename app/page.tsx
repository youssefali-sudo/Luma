"use client";

import { FormEvent, useMemo, useState } from "react";

type Tab = "discover" | "search" | "profile";
type Post = { id: number; name: string; handle: string; avatar: string; image: string; caption: string; likes: number; comments: number; tag: string; following?: boolean; liked?: boolean };

const people = [
  { name: "Lily M", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=faces", color: "#dc9ccf" },
  { name: "Camilia", avatar: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&h=120&fit=crop&crop=faces", color: "#a48bf0" },
  { name: "Kim009", avatar: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=120&h=120&fit=crop&crop=faces", color: "#efb58d" },
  { name: "Mark07", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&crop=faces", color: "#84b8b0" },
  { name: "Nour", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&h=120&fit=crop&crop=faces", color: "#d9a0a6" },
  { name: "Omar", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&h=120&fit=crop&crop=faces", color: "#a9a2ed" },
];

const seedPosts: Post[] = [
  { id: 1, name: "Charlotte Aya", handle: "@charlotte", avatar: people[1].avatar, image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1000&h=1300&fit=crop&crop=faces", caption: "A little reminder to make room for the things that make you feel alive. 🌻", likes: 23500, comments: 358, tag: "Lifestyle" },
  { id: 2, name: "Olivia Kaira", handle: "@olivia", avatar: people[0].avatar, image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=1000&h=1200&fit=crop&crop=faces", caption: "City lights, late nights, and a playlist on repeat. ✨", likes: 18900, comments: 125, tag: "Fashion" },
  { id: 3, name: "Maya Studio", handle: "@mayastudio", avatar: people[4].avatar, image: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1000&h=1200&fit=crop", caption: "Somewhere between the golden hour and a deep breath. 🌅", likes: 12400, comments: 96, tag: "Travel" },
];

const suggestions = [
  { name: "Mariam Adel", handle: "@mariam.adel", avatar: people[4].avatar, note: "مصممة محتوى" },
  { name: "Youssef N.", handle: "@youssef.n", avatar: people[5].avatar, note: "Photography" },
  { name: "Lily M", handle: "@lilym", avatar: people[0].avatar, note: "Creator · 12k followers" },
];

function Icon({ name, size = 21 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1-4a7.5 7.5 0 1 1 16-3.5Z" /><path d="M8 11h8M8 14h5" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    heart: <path d="M20.8 8.8c0 5.1-8.8 10-8.8 10S3.2 13.9 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z" />,
    comment: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1-4a7.5 7.5 0 1 1 16-3.5Z" /><path d="M8 11h8" /></>,
    share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.3 10.8 7.4-4.6M8.3 13.2l7.4 4.6" /></>,
    sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
    back: <path d="m15 18-6-6 6-6" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    edit: <><path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="M13 20h7" /></>,
    play: <path d="m9 6 10 6-10 6Z" />,
  };
  return <svg {...common}>{paths[name] || paths.home}</svg>;
}

function Avatar({ src, name, size = "md", ring = false }: { src: string; name: string; size?: "sm" | "md" | "lg"; ring?: boolean }) {
  return <span className={`avatar avatar-${size} ${ring ? "avatar-ring" : ""}`}><img src={src} alt={name} /></span>;
}

function compact(n: number) {
  return n >= 1000000 ? (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M" : n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k" : String(n);
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("discover");
  const [posts, setPosts] = useState(seedPosts);
  const [following, setFollowing] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("For you");
  const [showCreate, setShowCreate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [newImage, setNewImage] = useState("");
  const [profileTab, setProfileTab] = useState("Videos");
  const [toast, setToast] = useState("");

  const filteredPosts = useMemo(() => posts.filter((p) => (tab !== "search" || (p.name + p.handle + p.caption + p.tag).toLowerCase().includes(search.toLowerCase())) && (filter === "For you" || p.tag === filter)), [posts, tab, search, filter]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }

  function toggleLike(id: number) {
    setPosts((current) => current.map((post) => post.id === id ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) } : post));
  }

  function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const caption = newCaption.trim();
    if (!caption && !newImage) return;
    setPosts((current) => [{ id: Date.now(), name: "You", handle: "@yourspace", avatar: people[2].avatar, image: newImage || "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1000&h=1200&fit=crop", caption, likes: 0, comments: 0, tag: "Lifestyle" }, ...current]);
    setNewCaption("");
    setNewImage("");
    setShowCreate(false);
    setTab("discover");
    notify("اتضاف المنشور للمعاينة ✨");
  }

  return (
    <main className="social-app" dir="rtl">
      <header className="mobile-topbar">
        <button className="round-icon" aria-label="القائمة" onClick={() => setTab("discover")}><span className="hamburger">☰</span></button>
        <button className="wordmark" onClick={() => setTab("discover")}>luma<span>.</span></button>
        <button className="round-icon" aria-label="الإشعارات" onClick={() => setShowNotifications(!showNotifications)}><Icon name="bell" /></button>
      </header>

      <aside className="desktop-rail">
        <button className="rail-logo" onClick={() => setTab("discover")}>L<span>.</span></button>
        <button className={`rail-button ${tab === "discover" ? "selected" : ""}`} onClick={() => setTab("discover")} aria-label="اكتشف"><Icon name="home" /></button>
        <button className={`rail-button ${tab === "search" ? "selected" : ""}`} onClick={() => setTab("search")} aria-label="بحث"><Icon name="search" /></button>
        <button className="rail-button create-rail" onClick={() => setShowCreate(true)} aria-label="إنشاء"><Icon name="plus" size={26} /></button>
        <button className="rail-button" onClick={() => notify("الرسائل الحقيقية هتتربط بقاعدة البيانات في المرحلة التالية.")} aria-label="الرسائل"><Icon name="chat" /></button>
        <button className={`rail-button ${tab === "profile" ? "selected" : ""}`} onClick={() => setTab("profile")} aria-label="البروفايل"><Icon name="user" /></button>
        <div className="rail-spacer" />
        <Avatar src={people[2].avatar} name="You" size="sm" />
      </aside>

      <div className="social-layout">
        <section className="feed-column">
          <div className="feed-topline">
            <div><span className="eyebrow">YOUR WORLD, YOUR WAY</span><h1>{tab === "profile" ? "Profile" : tab === "search" ? "Search" : "Discover"}</h1></div>
            <button className="round-icon desktop-notify" onClick={() => setShowNotifications(!showNotifications)} aria-label="الإشعارات"><Icon name="bell" /></button>
          </div>

          {tab === "search" && <label className="search-field"><Icon name="search" size={20} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن أشخاص أو محتوى..." /><button type="button" onClick={() => notify("فلاتر البحث قريبًا")} aria-label="الفلاتر"><Icon name="sliders" /></button></label>}

          {tab === "discover" && <section className="stories-section">
            <div className="section-heading"><h2>الستوري <span className="live-dot" /></h2><button onClick={() => notify("مشاهدة الستوري هتتربط بالحسابات الحقيقية قريبًا")}>عرض الكل <span>←</span></button></div>
            <div className="stories-strip">
              <button className="story-person own-story" onClick={() => setShowCreate(true)}><span className="story-circle add-story"><Avatar src={people[2].avatar} name="قصتك" size="lg" /><i>+</i></span><span>أضف ستوري</span></button>
              {people.map((person) => <button className="story-person" key={person.name} onClick={() => notify(`ستوري ${person.name} — معاينة تصميم`)}><span className="story-circle"><Avatar src={person.avatar} name={person.name} size="lg" /></span><span>{person.name}</span></button>)}
            </div>
          </section>}

          {tab === "profile" ? <section className="profile-view">
            <div className="profile-cover"><div className="cover-orb" /><button className="round-icon edit-profile" onClick={() => notify("تعديل الملف الشخصي هيتربط بالحساب بعد تفعيل تسجيل الدخول")} aria-label="تعديل الملف"><Icon name="edit" /></button></div>
            <div className="profile-main"><Avatar src={people[2].avatar} name="Eleanor Rosie" size="lg" ring /><h2>يوسف علي</h2><p className="profile-handle">@yourspace</p><p className="profile-bio">Videomaker &amp; photographer ✨<br />بشارك لحظاتي وحاجات بحبها.</p>
              <div className="profile-stats"><div><strong>132k</strong><span>Followers</span></div><div><strong>120</strong><span>Following</span></div><div><strong>{compact(posts.reduce((sum, post) => sum + post.likes, 0))}</strong><span>Likes</span></div></div>
              <div className="profile-actions"><button className="primary-action" onClick={() => setShowCreate(true)}>＋ منشور جديد</button><button className="secondary-action" onClick={() => notify("البروفايل متصمم للمعاينة")}><Icon name="edit" size={16} /> تعديل الملف</button></div>
            </div>
            <div className="profile-tabs">{["Videos", "Photos", "Reels"].map((t) => <button className={profileTab === t ? "active" : ""} key={t} onClick={() => setProfileTab(t)}>{t}</button>)}</div>
            <div className="profile-grid">{posts.map((post) => <button key={post.id} className="profile-tile" onClick={() => notify(post.caption)}><img src={post.image} alt={post.caption} /><span><Icon name="heart" size={14} /> {compact(post.likes)}</span></button>)}</div>
          </section> : <>
            <div className="trend-heading"><h2>{tab === "search" ? "نتائج الاستكشاف" : "Trending"}</h2><div className="filter-pills">{["For you", "Lifestyle", "Fashion", "Travel"].map((f) => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div></div>
            <div className="feed-list">
              {filteredPosts.map((post) => <article className="post-card" key={post.id}>
                <img className="post-image" src={post.image} alt={post.caption || "منشور من مجتمع LUMA"} />
                <div className="post-shade" />
                <div className="post-badge">{post.tag}</div>
                <button className={`post-more ${post.liked ? "is-liked" : ""}`} aria-label="المزيد" onClick={() => notify("خيارات المنشور قريبًا")}><Icon name="more" /></button>
                <div className="post-actions-overlay">
                  <button className={post.liked ? "is-liked" : ""} onClick={() => toggleLike(post.id)} aria-label="إعجاب"><Icon name="heart" size={22} /><span>{compact(post.likes)}</span></button>
                  <button onClick={() => notify("التعليقات هتتربط بقاعدة البيانات قريبًا")} aria-label="تعليقات"><Icon name="comment" size={21} /><span>{compact(post.comments)}</span></button>
                  <button onClick={() => { if (navigator.share) navigator.share({ title: "LUMA", text: post.caption, url: window.location.href }).catch(() => {}); else notify("انسخ رابط المنشور لمشاركته."); }} aria-label="مشاركة"><Icon name="share" size={20} /><span>Share</span></button>
                </div>
                <div className="post-caption-area"><div className="post-author"><Avatar src={post.avatar} name={post.name} size="md" /><div><strong>{post.name}</strong><span>{post.handle}</span></div><button className={`follow-button ${following.includes(post.handle) ? "following" : ""}`} onClick={() => setFollowing((old) => old.includes(post.handle) ? old.filter((x) => x !== post.handle) : [...old, post.handle])}>{following.includes(post.handle) ? "Following" : "Follow +"}</button></div><p>{post.caption}</p></div>
              </article>)}
            </div>
          </>}
        </section>

        <aside className="discovery-sidebar">
          <div className="side-search"><Icon name="search" size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setTab("search")} placeholder="Search LUMA" /><kbd>⌘ K</kbd></div>
          <div className="welcome-card"><div className="welcome-glow" /><span className="eyebrow">A LITTLE SPACE, JUST FOR YOU</span><h3>Find your<br /><em>people.</em></h3><p>اكتشف ناس شبهك، أفكار جديدة، ولحظات تستاهل تتشاف.</p><button onClick={() => setTab("search")}>ابدأ الاستكشاف <span>←</span></button></div>
          <section className="suggestions"><div className="section-heading"><h2>ناس ممكن تعجبك</h2><button onClick={() => setTab("search")}>الكل</button></div>{suggestions.map((person) => <div className="suggestion-row" key={person.handle}><Avatar src={person.avatar} name={person.name} size="md" /><div className="suggestion-copy"><strong>{person.name}</strong><span>{person.note}</span></div><button className={`mini-follow ${following.includes(person.handle) ? "on" : ""}`} onClick={() => setFollowing((old) => old.includes(person.handle) ? old.filter((x) => x !== person.handle) : [...old, person.handle])}>{following.includes(person.handle) ? "✓" : "+"}</button></div>)}</section>
          <section className="trending-tags"><div className="section-heading"><h2>مواضيع رائجة</h2><span>✦</span></div>{["#LumaMoments", "#DailyInspo", "#StreetStyle", "#TravelDiaries"].map((tag, i) => <button key={tag} onClick={() => { setFilter(["For you", "Lifestyle", "Fashion", "Travel"][i]); setTab("discover"); }}><span>{tag}</span><small>{["12.8k", "8.4k", "6.2k", "4.9k"][i]} منشور</small></button>)}</section>
          <footer className="side-footer">About · Guidelines · Privacy · Help<br /><span>© 2026 LUMA — مساحتك، بطريقتك.</span></footer>
        </aside>
      </div>

      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي">
        <button className={tab === "discover" ? "active" : ""} onClick={() => setTab("discover")} aria-label="الرئيسية"><Icon name="home" /></button>
        <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")} aria-label="بحث"><Icon name="search" /></button>
        <button className="bottom-create" onClick={() => setShowCreate(true)} aria-label="إنشاء"><Icon name="plus" size={25} /></button>
        <button onClick={() => notify("الرسائل الحقيقية هتتربط بقاعدة البيانات في المرحلة التالية.")} aria-label="الرسائل"><Icon name="chat" /></button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")} aria-label="البروفايل"><Icon name="user" /></button>
      </nav>

      {showNotifications && <div className="notification-popover"><div><strong>الإشعارات</strong><button onClick={() => setShowNotifications(false)}>×</button></div><p>✨ أهلًا بيك في LUMA</p><small>دي معاينة الإشعارات. هتتربط بحسابك لما نفعّل السيرفر.</small></div>}
      {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={createPost}><div className="modal-head"><div><span className="eyebrow">SHARE A MOMENT</span><h2>انشر لحظتك</h2></div><button type="button" onClick={() => setShowCreate(false)}>×</button></div><label className="caption-label">إيه اللي في بالك؟<textarea value={newCaption} onChange={(e) => setNewCaption(e.target.value)} placeholder="احكي للناس عن لحظتك..." rows={4} /></label><label className="image-url-label">رابط صورة (اختياري)<input value={newImage} onChange={(e) => setNewImage(e.target.value)} placeholder="https://..." /></label><div className="modal-actions"><span>✦ خليك على طبيعتك</span><button className="primary-action" type="submit">نشر المنشور ↗</button></div></form></div>}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </main>
  );
}
