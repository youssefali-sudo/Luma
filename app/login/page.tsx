"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace("/"); });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("لسه إعدادات قاعدة البيانات مش متضافة. اتبع خطوات الإعداد في README.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { username: username.trim(), display_name: displayName.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMessage("الحساب اتعمل. راجع بريدك الإلكتروني لتأكيد الحساب قبل تسجيل الدخول.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حصل خطأ. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell" dir="rtl">
      <section className="auth-showcase">
        <Link href="/" className="auth-brand"><span className="auth-logo">L.</span><span>LUMA</span></Link>
        <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" />
        <div className="auth-copy">
          <span className="auth-kicker">YOUR PEOPLE. YOUR SPACE.</span>
          <h1>مساحتك<br /><span>بتجمعك.</span></h1>
          <p>شاتاتك، جروباتك، قنواتك وملفاتك — كل اللي يهمك في مكان واحد، معمول ليك.</p>
          <div className="auth-feature-list"><span>✦ محادثات خاصة</span><span>✦ جروبات وقنوات</span><span>✦ ستوري وملفات</span></div>
        </div>
        <div className="auth-decoration"><span>لما تكون على طبيعتك،</span><strong>المكان يبقى مكانك.</strong><i>✳</i></div>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-brand"><span className="auth-logo">L.</span><strong>LUMA</strong></div>
        <div className="auth-form-wrap">
          <span className="auth-overline">{mode === "login" ? "أهلاً بعودتك" : "ابدأ حكايتك"}</span>
          <h2>{mode === "login" ? "وحشتنا." : "مكانك مستنيك."}</h2>
          <p className="auth-subtitle">{mode === "login" ? "سجّل دخولك وارجع لمساحتك." : "اعمل حسابك وخلي LUMA مساحتك."}</p>
          <div className="auth-tabs"><button className={mode === "login" ? "chosen" : ""} onClick={() => { setMode("login"); setMessage(""); }}>تسجيل الدخول</button><button className={mode === "signup" ? "chosen" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>حساب جديد</button></div>
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" && <><label>اسمك <input autoComplete="name" value={displayName} onChange={e => setDisplayName(e.target.value)} required minLength={2} maxLength={60} placeholder="الاسم اللي الناس هتشوفه" /></label><label>اسم المستخدم <input autoComplete="username" value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, "").slice(0,24))} required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_.]+" placeholder="youssef.dev" /></label></>}
            <label>البريد الإلكتروني <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" /></label>
            <label>كلمة المرور <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="8 أحرف على الأقل" /></label>
            {message && <div className={message.includes("اتعمل") ? "auth-message success" : "auth-message"} role="status">{message}</div>}
            <button className="auth-submit" disabled={busy || !configured}>{busy ? "لحظة واحدة..." : mode === "login" ? "دخول إلى LUMA  ←" : "إنشاء حساب  ←"}</button>
            {!configured && <p className="setup-hint">يلزم إعداد Supabase أولًا. خطوات الربط موجودة في README.</p>}
          </form>
          <p className="auth-terms">بالمتابعة، أنت توافق على استخدام LUMA باحترام وأمان.</p>
        </div>
        <footer className="auth-footer"><span>© LUMA 2026</span><span>مساحتك، بطريقتك.</span></footer>
      </section>
    </main>
  );
}
