"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Section = "messages" | "groups" | "channels" | "files" | "profile";
type Chat = { id: string; name: string; handle: string; kind: "person" | "group" | "channel"; color: string; initials: string; message: string; time: string; unread: number; online?: boolean; members?: number; pinned?: boolean };
type Message = { id: number; chatId: string; text: string; mine: boolean; time: string; attachment?: string };
type Story = { id: string; name: string; color: string; seen?: boolean; own?: boolean };
type FileItem = { id: number; name: string; size: string; type: string; date: string; chat: string };

const initialChats: Chat[] = [
  { id: "sara", name: "سارة أحمد", handle: "@sara.ahmed", kind: "person", color: "#f3a5c8", initials: "س", message: "تمام، هبعتلك الملخص دلوقتي ✨", time: "10:42", unread: 2, online: true },
  { id: "bac", name: "تانية بكالوريا 📚", handle: "@bac.study", kind: "group", color: "#9b8cf7", initials: "ب", message: "مراجعة الفيزياء الساعة 7", time: "10:30", unread: 5, members: 128, pinned: true },
  { id: "english", name: "English with friends", handle: "@english.club", kind: "group", color: "#8ac9bb", initials: "E", message: "New vocabulary sheet uploaded", time: "09:56", unread: 0, members: 42 },
  { id: "notes", name: "ملخصات وامتحانات", handle: "@notes.eg", kind: "channel", color: "#f3bb76", initials: "م", message: "امتحان شامل — الوحدة الثالثة", time: "أمس", unread: 0, members: 2304 },
  { id: "omar", name: "عمر محمد", handle: "@omar.m", kind: "person", color: "#91b9f9", initials: "ع", message: "بعتلك الملف؟", time: "أمس", unread: 0, online: false },
  { id: "design", name: "مصممين بالعربي", handle: "@design.ar", kind: "channel", color: "#ee9e9e", initials: "ع", message: "إلهام الأسبوع 🎨", time: "الثلاثاء", unread: 0, members: 890 },
];
const initialMessages: Message[] = [
  { id: 1, chatId: "sara", text: "بص على الملخص ده لما تفضى 📚", mine: false, time: "10:38" },
  { id: 2, chatId: "sara", text: "حلو جدًا، تسلمي! هراجع منه", mine: true, time: "10:40" },
  { id: 3, chatId: "sara", text: "تمام، هبعتلك الملخص دلوقتي ✨", mine: false, time: "10:42" },
  { id: 4, chatId: "bac", text: "يا جماعة، مراجعة الفيزياء النهارده الساعة 7. اللي عنده أسئلة يبعتها هنا 💜", mine: false, time: "10:24" },
  { id: 5, chatId: "bac", text: "معايا أسئلة على الفصل التاني، هرفعها بعد شوية", mine: true, time: "10:30" },
  { id: 6, chatId: "english", text: "New vocabulary sheet uploaded. Check the files tab!", mine: false, time: "09:56" },
  { id: 7, chatId: "notes", text: "📌 امتحان شامل على الوحدة الثالثة متاح دلوقتي. حمّلوه وشاركوا إجاباتكم.", mine: false, time: "09:10" },
  { id: 8, chatId: "omar", text: "بعتلك الملف؟", mine: false, time: "أمس" },
];
const initialStories: Story[] = [
  { id: "own", name: "قصتك", color: "#a78bfa", own: true },
  { id: "sara", name: "سارة", color: "#f3a5c8" },
  { id: "omar", name: "عمر", color: "#91b9f9" },
  { id: "mariam", name: "مريم", color: "#f3bb76" },
  { id: "bac", name: "تانية بكالوريا", color: "#8ac9bb" },
  { id: "nour", name: "نور", color: "#ee9e9e" },
];
const initialFiles: FileItem[] = [
  { id: 1, name: "ملخص_الفيزياء.pdf", size: "2.4 MB", type: "PDF", date: "اليوم، 10:20", chat: "تانية بكالوريا 📚" },
  { id: 2, name: "vocabulary-unit-3.docx", size: "840 KB", type: "DOCX", date: "اليوم، 09:55", chat: "English with friends" },
  { id: 3, name: "امتحان_تجريبي_2026.pdf", size: "1.8 MB", type: "PDF", date: "أمس", chat: "ملخصات وامتحانات" },
  { id: 4, name: "شرح_الدرس.mp4", size: "18.2 MB", type: "MP4", date: "أمس", chat: "عمر محمد" },
];

const navItems: { id: Section; label: string; icon: string }[] = [
  { id: "messages", label: "الرسائل", icon: "◌" },
  { id: "groups", label: "الجروبات", icon: "♧" },
  { id: "channels", label: "القنوات", icon: "◉" },
  { id: "files", label: "الملفات", icon: "▤" },
  { id: "profile", label: "بروفايلي", icon: "♙" },
];

function Avatar({ name, color, initials, online = false, size = "md", ring = false }: { name: string; color: string; initials: string; online?: boolean; size?: "sm" | "md" | "lg"; ring?: boolean }) {
  return <span className={`avatar avatar-${size} ${ring ? "avatar-ring" : ""}`} style={{ "--avatar-color": color } as React.CSSProperties} aria-label={name}><span>{initials}</span>{online && <i className="online-dot" />}</span>;
}
function IconButton({ children, label, onClick, className = "" }: { children: React.ReactNode; label: string; onClick?: () => void; className?: string }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`icon-button ${className}`}>{children}</button>;
}

export default function Home() {
  const [section, setSection] = useState<Section>("messages");
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [stories, setStories] = useState<Story[]>(initialStories);
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [activeChat, setActiveChat] = useState("sara");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [modal, setModal] = useState<"group" | "channel" | "profile" | "story" | null>(null);
  const [newName, setNewName] = useState("");
  const [newBio, setNewBio] = useState("بتعلم، بشارك، وبكبر كل يوم ✨");
  const [profileName, setProfileName] = useState("يوسف علي");
  const [username, setUsername] = useState("youssef.dev");
  const [bio, setBio] = useState("بتعلم، بشارك، وبكبر كل يوم ✨");
  const [storyText, setStoryText] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const hydrated = useRef(false);\n  const fileInput = useRef<HTMLInputElement>(null);
  const storyInput = useRef<HTMLInputElement>(null);
  const active = chats.find((chat) => chat.id === activeChat) ?? chats[0];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("luma-social-demo-v1");
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.chats)) setChats(data.chats);
        if (Array.isArray(data.messages)) setMessages(data.messages);
        if (Array.isArray(data.stories)) setStories(data.stories);
        if (Array.isArray(data.files)) setFiles(data.files);
        if (data.profileName) setProfileName(data.profileName);
        if (data.username) setUsername(data.username);
        if (data.bio) setBio(data.bio);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("luma-social-demo-v1", JSON.stringify({ chats, messages, stories, files, profileName, username, bio })); } catch {}
  }, [chats, messages, stories, files, profileName, username, bio]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleChats = useMemo(() => chats.filter((chat) => {
    const typeMatch = section === "groups" ? chat.kind === "group" : section === "channels" ? chat.kind === "channel" : true;
    const searchMatch = (chat.name + chat.handle + chat.message).toLowerCase().includes(search.toLowerCase());
    return typeMatch && searchMatch;
  }), [chats, section, search]);
  const activeMessages = messages.filter((message) => message.chatId === activeChat);

  const sendMessage = (e: FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (!value || !active) return;
    const message: Message = { id: Date.now(), chatId: active.id, text: value, mine: true, time: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) };
    setMessages((old) => [...old, message]);
    setChats((old) => old.map((chat) => chat.id === active.id ? { ...chat, message: value, time: "الآن" } : chat));
    setDraft("");
  };
  const createSpace = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const kind = modal === "channel" ? "channel" : "group";
    const id = `${kind}-${Date.now()}`;
    const chat: Chat = { id, name, handle: "@"+name.toLowerCase().replace(/\s+/g, "."), kind, color: kind === "channel" ? "#f0a6d7" : "#9b8cf7", initials: name.slice(0, 1), message: kind === "channel" ? "قناتك جاهزة للنشر ✨" : "ابدأ أول محادثة في الجروب", time: "الآن", unread: 0, members: 1 };
    setChats((old) => [chat, ...old]);
    setMessages((old) => [...old, { id: Date.now() + 1, chatId: id, text: kind === "channel" ? "أهلًا بيكم في القناة الجديدة! ✨" : "أهلًا بيكم في الجروب! 👋", mine: true, time: "الآن" }]);
    setActiveChat(id);
    setSection(kind === "channel" ? "channels" : "groups");
    setMobileChatOpen(true);
    setNewName("");
    setModal(null);
    setNotice(kind === "channel" ? "اتعملت القناة على النموذج ده." : "اتعمل الجروب على النموذج ده.");
  };
  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    const added: FileItem[] = selected.map((file, i) => {
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toUpperCase() : "FILE";
      const size = file.size > 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(file.size / 1024)) + " KB";
      return { id: Date.now() + i, name: file.name, size, type: ext, date: "الآن", chat: active?.name ?? "ملفاتي" };
    });
    setFiles((old) => [...added, ...old]);
    setMessages((old) => [...old, ...added.map((file, i) => ({ id: Date.now() + i + added.length, chatId: activeChat, text: "📎 " + file.name, mine: true, time: "الآن", attachment: file.name }))]);
    setChats((old) => old.map((chat) => chat.id === activeChat ? { ...chat, message: "📎 " + added[0].name, time: "الآن" } : chat));
    setNotice("اتضافت الملفات للواجهة التجريبية. رفعها للآخرين يحتاج ربط سيرفر تخزين.");
    e.target.value = "";
  };
  const addStory = (e: FormEvent) => {
    e.preventDefault();
    if (!storyText.trim() && !storyInput.current?.files?.length) return;
    setStories((old) => [{ id: "story-" + Date.now(), name: "قصتك", color: "#a78bfa", own: true }, ...old.filter((story) => !story.own)]);
    setNotice("اتضافت الستوري للنموذج التجريبي.");
    setStoryText("");
    setModal(null);
  };
  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    setProfileName(newBio.trim() ? profileName : profileName);
    setBio(newBio);
    setModal(null);
    setNotice("تم حفظ تعديلات البروفايل على هذا الجهاز.");
  };
  const sectionTitle = navItems.find((item) => item.id === section)?.label ?? "الرسائل";

  return (
    <main className="luma-app" dir="rtl">
      <aside className="sidebar">
        <button className="brand" onClick={() => { setSection("messages"); setMobileChatOpen(false); }} aria-label="LUMA الرئيسية">
          <span className="brand-mark">L<span>.</span></span><span className="brand-name">luma<span>مساحتك، بطريقتك</span></span>
        </button>
        <button className="profile-mini" onClick={() => setSection("profile")}>
          <Avatar name={profileName} initials={profileName.slice(0, 1)} color="#a78bfa" size="md" />
          <span className="profile-mini-text"><strong>{profileName}</strong><small>@{username}</small></span><span className="mini-chevron">⌄</span>
        </button>
        <div className="nav-caption">مساحتك</div>
        <nav className="main-nav">
          {navItems.map((item) => <button key={item.id} onClick={() => { setSection(item.id); setMobileChatOpen(false); }} className={`nav-item ${section === item.id ? "active" : ""}`}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.id === "messages" && <span className="nav-count">7</span>}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="upgrade-card"><div className="upgrade-spark">✦</div><strong>مكانك يكبر معاك</strong><p>مذاكرة، صحاب، أفكار وملفات في مكان واحد.</p><button onClick={() => setNotice("أهلًا بيك في LUMA 💜")}>اكتشف LUMA <span>←</span></button></div>
        <div className="sidebar-footer"><span className="status-dot" /> كل اللي يهمك، في مكان واحد <span>v1.0</span></div>
      </aside>

      <section className={`inbox-panel ${mobileChatOpen ? "hide-mobile" : ""}`}>
        <div className="inbox-heading"><div><div className="eyebrow">مساحتك الاجتماعية</div><h1>{sectionTitle}</h1></div><IconButton label="رسالة جديدة" onClick={() => { setNewName(""); setModal("group"); }}>＋</IconButton></div>
        <label className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="دور على شخص، جروب أو قناة..." /><kbd>⌘ K</kbd></label>
        {section === "messages" && <div className="stories-area"><div className="row-title"><span>الستوري</span><button onClick={() => setModal("story")}>أضف ستوري +</button></div><div className="stories-list">{stories.map((story) => <button className="story-item" key={story.id} onClick={() => story.own ? setModal("story") : setNotice(`بتتفرج على ستوري ${story.name} — ميزة الستوري هتكتمل مع السيرفر.`)}><span className={`story-ring ${story.seen ? "seen" : ""}`} style={{ "--story-color": story.color } as React.CSSProperties}><Avatar name={story.name} initials={story.own ? "+" : story.name.slice(0,1)} color={story.color} size="md" /></span><span>{story.name}</span></button>)}</div></div>}
        <div className="list-heading"><span>{section === "groups" ? "جروباتك" : section === "channels" ? "القنوات" : section === "files" ? "المحادثات والملفات" : "آخر المحادثات"}</span><button onClick={() => setNotice("عرض أحدث المحادثات أولًا")}>الأحدث⌄</button></div>
        <div className="chat-list">{visibleChats.map((chat) => <button key={chat.id} className={`chat-row ${activeChat === chat.id ? "selected" : ""}`} onClick={() => { setActiveChat(chat.id); setMobileChatOpen(true); }}><Avatar name={chat.name} initials={chat.initials} color={chat.color} online={chat.online} size="lg" /><span className="chat-row-main"><span className="chat-row-top"><strong>{chat.name}</strong><time>{chat.time}</time></span><span className="chat-preview">{chat.kind === "channel" ? <span className="kind-icon">◉ </span> : chat.kind === "group" ? <span className="kind-icon">♧ </span> : ""}{chat.message}</span><span className="chat-meta"><small>{chat.handle}</small>{chat.unread > 0 && <i>{chat.unread}</i>}</span></span></button>)}
          {visibleChats.length === 0 && <div className="empty-state"><span>⌕</span><strong>مفيش نتائج</strong><p>جرّب كلمة بحث تانية.</p></div>}
        </div>
        <div className="inbox-bottom"><span>✦</span><div><strong>LUMA مجتمعك</strong><small>شارك أفكارك وخليك قريب من الناس.</small></div></div>
      </section>

      <section className={`conversation ${!mobileChatOpen ? "hide-mobile" : ""}`}>
        <header className="conversation-header">
          <IconButton label="رجوع للمحادثات" className="mobile-back" onClick={() => setMobileChatOpen(false)}>→</IconButton>
          {active && <><Avatar name={active.name} initials={active.initials} color={active.color} online={active.online} size="md" /><div className="conversation-person"><strong>{active.name}</strong><small>{active.online ? <><i className="online-dot-inline" /> متصل دلوقتي</> : active.kind === "channel" ? `قناة عامة · ${(active.members ?? 1).toLocaleString("ar-EG")} متابع` : active.kind === "group" ? `جروب · ${(active.members ?? 1).toLocaleString("ar-EG")} عضو` : active.handle}</small></div><div className="header-actions"><IconButton label="بحث في المحادثة" onClick={() => setNotice("البحث داخل المحادثة هيتضاف في التحديث القادم.")}>⌕</IconButton><IconButton label="معلومات المحادثة" onClick={() => setNotice(`${active.name} · ${active.handle}`)}>ⓘ</IconButton><IconButton label="المزيد" onClick={() => setNotice("إعدادات المحادثة هتظهر هنا.")}>•••</IconButton></div></>}
        </header>
        <div className="conversation-banner"><span className="banner-icon">✦</span><span><strong>أهلًا بيك في مساحتك</strong><small>محادثاتك، جروباتك، وقنواتك كلها في مكان واحد.</small></span><button onClick={() => setNotice("شارك LUMA مع أصحابك لما تكتمل خدمة الدعوات.")}>اعرف أكتر ↗</button></div>
        <div className="messages-scroll">
          <div className="date-divider"><span>اليوم</span></div>
          {activeMessages.map((message) => <div className={`message-line ${message.mine ? "mine" : "theirs"}`} key={message.id}>{!message.mine && <Avatar name={active.name} initials={active.initials} color={active.color} size="sm" />}<div className="message-content">{message.attachment && <div className="attachment-card"><span className="file-type">{message.attachment.split(".").pop()?.slice(0,4).toUpperCase()}</span><span><strong>{message.attachment}</strong><small>مرفق · اضغط لإدارة الملف</small></span></div>}<div className="bubble">{message.text}</div><time>{message.time} {message.mine && <span className="read-ticks">✓✓</span>}</time></div></div>)}
          {activeMessages.length === 0 && <div className="empty-state"><span>✦</span><strong>ابدأ الكلام</strong><p>أول رسالة منك هتبدأ الحكاية.</p></div>}
          <div className="conversation-bottom-note">الرسائل في النسخة الحالية محفوظة على جهازك فقط <span>·</span> ربط المحادثات الحقيقية قادم</div>
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <input ref={fileInput} type="file" multiple className="visually-hidden" onChange={handleUpload} />
          <IconButton label="إرفاق ملفات" onClick={() => fileInput.current?.click()}>＋</IconButton>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={active?.kind === "channel" ? "اكتب منشورًا للقناة..." : "اكتب رسالتك هنا..."} aria-label="اكتب رسالة" />
          <IconButton label="إيموجي" onClick={() => setDraft((v) => v + " 💜")}>☺</IconButton>
          <button className="send-button" type="submit" aria-label="إرسال">➤</button>
        </form>
      </section>

      <aside className="details-panel">
        <div className="details-top"><span className="eyebrow">LUMA SPACE</span><button onClick={() => setNotice("إعدادات LUMA هتتضاف قريبًا.")}>⚙</button></div>
        <div className="welcome-card"><div className="welcome-orb">✦</div><div className="welcome-label">مساحة على مزاجك</div><h2>كل دايرتك،<br /><span>في مكان واحد.</span></h2><p>اتكلم، شارك ملفاتك، واعمل مجتمعك الخاص.</p><div className="welcome-decoration"><i /><i /><i /><i /><i /></div></div>
        <div className="quick-actions"><div className="row-title"><span>اعمل مساحتك</span><span className="tiny-label">ابدأ دلوقتي</span></div><button onClick={() => { setNewName(""); setModal("group"); }}><span className="quick-icon purple">♧</span><span><strong>جروب جديد</strong><small>اجمع أصحابك في مكان واحد</small></span><b>←</b></button><button onClick={() => { setNewName(""); setModal("channel"); }}><span className="quick-icon pink">◉</span><span><strong>قناة جديدة</strong><small>شارك محتواك مع المتابعين</small></span><b>←</b></button><button onClick={() => setSection("files")}><span className="quick-icon blue">▤</span><span><strong>ملفاتي</strong><small>مذكرات وصور وفيديوهات</small></span><b>←</b></button></div>
        <div className="files-widget"><div className="row-title"><span>آخر الملفات</span><button onClick={() => setSection("files")}>عرض الكل ↗</button></div>{files.slice(0,3).map((file) => <button className="file-row" key={file.id} onClick={() => setNotice(`${file.name} · ${file.size} — الملف التجريبي مسجل في الواجهة فقط.`)}><span className={`file-type type-${file.type.toLowerCase()}`}>{file.type.slice(0,4)}</span><span><strong>{file.name}</strong><small>{file.size} · {file.date}</small></span><span className="file-more">•••</span></button>)}</div>
        <div className="right-footer"><span>💜</span> اتعمل بحب للمجتمع اللي بيشارك.</div>
      </aside>

      {section === "files" && <div className="files-overlay"><div className="files-page"><div className="files-page-head"><div><span className="eyebrow">مكتبتك الشخصية</span><h2>الملفات <span>({files.length})</span></h2><p>كل المرفقات اللي أضفتها في النموذج التجريبي.</p></div><button onClick={() => fileInput.current?.click()}>＋ ارفع ملف</button></div><div className="file-grid">{files.map((file) => <div className="file-card" key={file.id}><span className={`file-type type-${file.type.toLowerCase()}`}>{file.type.slice(0,4)}</span><strong>{file.name}</strong><small>{file.size} · {file.date}</small><span className="file-from">من: {file.chat}</span></div>)}</div><p className="files-warning">ملاحظة: الملفات بتظهر في الواجهة الحالية فقط. علشان تتخزن وتتشارك فعلًا بين المستخدمين، لازم نربط خدمة تخزين وقاعدة بيانات.</p></div></div>}
      {section === "profile" && <div className="files-overlay"><div className="profile-page"><div className="profile-cover" /><Avatar name={profileName} initials={profileName.slice(0,1)} color="#a78bfa" size="lg" /><h2>{profileName}</h2><p className="profile-handle">@{username}</p><p>{bio}</p><div className="profile-stats"><span><strong>{chats.filter((c) => c.kind === "group").length}</strong><small>جروبات</small></span><span><strong>{chats.filter((c) => c.kind === "channel").length}</strong><small>قنوات</small></span><span><strong>{stories.length}</strong><small>ستوري</small></span></div><button onClick={() => { setNewBio(bio); setModal("profile"); }}>تعديل البروفايل</button><div className="profile-note">الملف الشخصي الحالي تجريبي ومحفوظ على الجهاز.</div></div></div>}

      {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">{modal === "group" ? "مجتمع جديد" : modal === "channel" ? "مساحتك للنشر" : modal === "story" ? "لحظتك" : "هويتك على LUMA"}</span><h2>{modal === "group" ? "اعمل جروب جديد" : modal === "channel" ? "أنشئ قناتك" : modal === "story" ? "أضف ستوري" : "تعديل البروفايل"}</h2></div><IconButton label="إغلاق" onClick={() => setModal(null)}>×</IconButton></div>
        {(modal === "group" || modal === "channel") && <form onSubmit={createSpace}><label className="field-label">{modal === "group" ? "اسم الجروب" : "اسم القناة"}</label><input className="modal-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={modal === "group" ? "مثال: صحاب المدرسة" : "مثال: ملخصات ومراجعات"} autoFocus required maxLength={48} /><div className="modal-hint">{modal === "group" ? "مكان تجمعوا فيه، تتكلموا وتشاركوا ملفات." : "انشر أفكارك وملفاتك وخلي الناس تتابعك."}</div><button className="primary-button" type="submit">إنشاء {modal === "group" ? "الجروب" : "القناة"} <span>←</span></button></form>}
        {modal === "profile" && <form onSubmit={saveProfile}><label className="field-label">الاسم</label><input className="modal-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} required maxLength={32} /><label className="field-label">اسم المستخدم</label><input className="modal-input" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, ""))} required maxLength={24} /><label className="field-label">نبذة عنك</label><textarea className="modal-input" value={newBio} onChange={(e) => setNewBio(e.target.value)} maxLength={140} rows={3} /><button className="primary-button" type="submit">حفظ التعديلات <span>←</span></button></form>}
        {modal === "story" && <form onSubmit={addStory}><label className="field-label">اكتب حاجة حابب تشاركها</label><textarea className="modal-input" value={storyText} onChange={(e) => setStoryText(e.target.value)} placeholder="نهارك عامل إيه؟ 💜" rows={4} /><label className="field-label">أو اختار صورة/فيديو</label><input ref={storyInput} className="story-file-input" type="file" accept="image/*,video/*" /><button className="primary-button" type="submit">نشر الستوري <span>←</span></button></form>}
        <p className="modal-disclaimer">دي نسخة واجهة تجريبية؛ الحسابات والرسائل المشتركة هتحتاج ربط قاعدة بيانات وخدمة تخزين.</p>
      </div></div>}
      {notice && <div className="toast"><span>✦</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}
    </main>
  );
}
