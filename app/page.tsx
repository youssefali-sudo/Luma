"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    SelfieSegmentation?: new (config: { locateFile: (file: string) => string }) => {
      setOptions: (options: Record<string, unknown>) => void;
      onResults: (callback: (results: { image: HTMLVideoElement; segmentationMask: HTMLCanvasElement }) => void) => void;
      send: (input: { image: HTMLVideoElement }) => Promise<void>;
      close: () => void;
    };
    Peer?: new (id?: string, options?: Record<string, unknown>) => any;
  }
}

type SegmentationResults = { image: HTMLVideoElement; segmentationMask: HTMLCanvasElement };

export default function Home() {
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const segmenterRef = useRef<InstanceType<NonNullable<typeof window.SelfieSegmentation>> | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [callState, setCallState] = useState("STANDBY");
  const [error, setError] = useState("");
  const [dockVisible, setDockVisible] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [scanlines, setScanlines] = useState(true);
  const [brightness, setBrightness] = useState(110);
  const [glow, setGlow] = useState(70);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");

  const drawResults = useCallback((results: SegmentationResults) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = results.image.videoWidth || 640;
    const h = results.image.videoHeight || 480;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(results.image, 0, 0, w, h);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(results.segmentationMask, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "#00bfff";
    ctx.globalAlpha = Math.min(0.7, glow / 130);
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    if (scanlines) {
      ctx.fillStyle = "#66f6ff";
      ctx.globalAlpha = 0.17;
      for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 1);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }, [glow, scanlines]);

  const loadScript = (src: string, marker: string) => new Promise<void>((resolve, reject) => {
    const old = document.querySelector<HTMLScriptElement>(`script[data-${marker}]`);
    if (old) {
      if (marker === "luma-peer" && window.Peer) return resolve();
      if (marker === "luma-seg" && window.SelfieSegmentation) return resolve();
      old.addEventListener("load", () => resolve(), { once: true });
      old.addEventListener("error", () => reject(new Error("تعذر تحميل مكتبة الاتصال أو العزل.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src; script.async = true; script.dataset[marker] = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("تعذر تحميل مكتبة مطلوبة. تحقق من الإنترنت."));
    document.head.appendChild(script);
  });

  const setupPeer = async (requestedId?: string) => {
    await loadScript("https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js", "luma-peer");
    if (!window.Peer) throw new Error("مكتبة الاتصال غير متاحة.");
    const peer = new window.Peer(requestedId, { debug: 1 });
    peerRef.current = peer;
    return await new Promise<string>((resolve, reject) => {
      peer.on("open", (id: string) => { setRoomId(id); setCallState("WAITING"); resolve(id); });
      peer.on("call", (incoming: any) => {
        if (!streamRef.current) { incoming.close(); return; }
        incoming.answer(streamRef.current);
        wireCall(incoming);
      });
      peer.on("error", (e: any) => {
        const message = e?.type === "peer-unavailable" ? "كود الغرفة غير متاح. تأكد أن صديقك أنشأ الغرفة وما زال متصلًا." : "حصل خطأ في الاتصال. جرّب كودًا جديدًا.";
        setError(message); setCallState("ERROR"); reject(new Error(message));
      });
    });
  };

  const wireCall = (call: any) => {
    callRef.current = call;
    call.on("stream", (remote: MediaStream) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remote;
        void remoteVideo.current.play().catch(() => {});
      }
      setCallState("CONNECTED");
    });
    call.on("close", () => { setCallState("WAITING"); if (remoteVideo.current) remoteVideo.current.srcObject = null; });
    call.on("error", () => { setError("انقطع الاتصال. جرّب إعادة الانضمام."); setCallState("ERROR"); });
  };

  const startCamera = async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("الكاميرا تحتاج HTTPS ومتصفحًا يدعمها.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: cameraFacing, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (localVideo.current) { localVideo.current.srcObject = stream; await localVideo.current.play(); }
      setCameraOn(true);
      return stream;
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تشغيل الكاميرا والميكروفون.");
      throw e;
    }
  };

  const createRoom = async () => {
    setError(""); setCallState("INITIALIZING");
    try { if (!streamRef.current) await startCamera(); await setupPeer(); }
    catch (e) { setCallState("ERROR"); if (!(e instanceof Error && error)) setError(e instanceof Error ? e.message : "تعذر إنشاء الغرفة."); }
  };

  const joinRoom = async () => {
    const target = joinCode.trim();
    if (!target) { setError("اكتب كود الغرفة أولًا."); return; }
    setError(""); setCallState("INITIALIZING");
    try {
      const stream = streamRef.current || await startCamera();
      await setupPeer();
      const outgoing = peerRef.current.call(target, stream);
      if (!outgoing) throw new Error("تعذر بدء المكالمة. راجع كود الغرفة.");
      wireCall(outgoing);
    } catch (e) { setCallState("ERROR"); setError(e instanceof Error ? e.message : "تعذر الانضمام للغرفة."); }
  };

  const hangUp = () => {
    callRef.current?.close(); callRef.current = null;
    peerRef.current?.destroy(); peerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    segmenterRef.current?.close(); segmenterRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null; busyRef.current = false;
    setCameraOn(false); setRoomId(""); setCallState("STANDBY");
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js", "luma-seg");
        if (!active || !window.SelfieSegmentation) return;
        const segmenter = new window.SelfieSegmentation({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
        segmenter.setOptions({ modelSelection: 1, selfieMode: false });
        segmenter.onResults(drawResults);
        segmenterRef.current = segmenter;
        const tick = async () => {
          const source = callState === "CONNECTED" && remoteVideo.current?.readyState === 4 ? remoteVideo.current : localVideo.current;
          if (source && source.readyState >= 2 && segmenterRef.current && !busyRef.current) {
            busyRef.current = true;
            try { await segmenterRef.current.send({ image: source }); } catch {}
            busyRef.current = false;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "تعذر تحميل محرك العزل."); }
    };
    void boot();
    return () => {
      active = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      peerRef.current?.destroy();
      segmenterRef.current?.close();
    };
  }, [drawResults, callState]);

  const copyRoom = async () => {
    try { await navigator.clipboard.writeText(roomId); setCallState((s) => s === "CONNECTED" ? s : "WAITING"); }
    catch { setError("انسخ كود الغرفة يدويًا؛ المتصفح منع الوصول للحافظة."); }
  };

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-black text-white" onClick={() => { if (dockVisible === false) setDockVisible(true); }}>
      <video ref={localVideo} muted playsInline className="hidden" />
      <video ref={remoteVideo} playsInline autoPlay className="hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(0,102,255,.12),transparent_60%)]" />
      <div className="hud-corner left-4 top-4" /><div className="hud-corner right-4 top-4 rotate-90" />
      <div className="hud-corner bottom-4 left-4 -rotate-90" /><div className="hud-corner bottom-4 right-4 rotate-180" />
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 py-5">
        <button className="flex items-center gap-3" onClick={(e) => { e.stopPropagation(); setDockVisible((v) => !v); }}>
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/40 bg-cyan-300/10 font-black text-cyan-200 shadow-[0_0_22px_#0066ff33]">L</span>
          <span className="text-left"><span className="block text-sm font-bold tracking-[.3em]">LUMA</span><span className="block text-[9px] tracking-[.25em] text-cyan-100/50">HOLO LINK</span></span>
        </button>
        <span className="flex items-center gap-2 rounded-full border border-cyan-300/20 bg-black/50 px-3 py-2 text-[9px] tracking-[.16em] text-cyan-100/70"><i className={`h-1.5 w-1.5 rounded-full ${callState === "CONNECTED" ? "bg-emerald-400" : "bg-cyan-300"}`} />{callState}</span>
      </header>

      <section className="absolute inset-0 flex items-center justify-center bg-black" onClick={() => setDockVisible((v) => !v)}>
        <canvas ref={canvasRef} aria-label="Hologram video output" className={`h-full w-full object-contain ${mirror ? "-scale-x-100" : ""} ${scanlines ? "scan-overlay" : ""}`} style={{ filter: `brightness(${brightness}%) drop-shadow(0 0 ${glow / 2}px #0066ff)` }} />
        {!cameraOn && callState !== "CONNECTED" && <div className="pointer-events-none absolute flex flex-col items-center px-8 text-center">
          <div className="holo-orb mb-7 grid h-24 w-24 place-items-center rounded-full border border-cyan-300/40 text-4xl text-cyan-200">◈</div>
          <h1 className="text-xl font-medium tracking-[.14em]">HOLOGRAM LINK</h1>
          <p className="mt-2 max-w-xs text-xs leading-6 text-slate-500">أنشئ غرفة وشارك الكود مع صديقك لبدء مكالمة مباشرة</p>
        </div>}
        <div className="pointer-events-none absolute left-7 top-24 text-[9px] leading-5 tracking-[.2em] text-cyan-200/50">LUMA / OPTICAL FEED<br />BG: #000000<br />{callState === "CONNECTED" ? "REMOTE SUBJECT ACTIVE" : "AWAITING SIGNAL"}</div>
        <div className="pointer-events-none absolute bottom-28 right-7 text-right text-[9px] leading-5 tracking-[.18em] text-cyan-100/40">P2P • WEBRTC<br />BLUE SPECTRAL MODE</div>
      </section>

      {dockVisible && <section className="glass-dock absolute bottom-5 left-1/2 z-20 w-[min(94vw,520px)] -translate-x-1/2 rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold tracking-[.2em] text-cyan-100">CONTROL DOCK</span><button className="text-xs text-slate-400" onClick={() => setDockVisible(false)}>إخفاء ×</button></div>
        {!roomId ? <button onClick={createRoom} className="w-full rounded-xl bg-gradient-to-r from-cyan-300 to-blue-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_0_25px_#0066ff44]">Create Hologram Room</button> : <div className="mb-3 rounded-xl border border-cyan-300/20 bg-black/40 p-3"><div className="text-[9px] tracking-[.15em] text-slate-500">YOUR ROOM CODE</div><div className="mt-1 flex items-center justify-between gap-2"><code className="max-w-[70%] overflow-hidden text-ellipsis text-sm text-cyan-100">{roomId}</code><button onClick={copyRoom} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100">Copy code</button></div></div>}
        <div className="mt-3 flex gap-2"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Paste friend's room code" aria-label="Room code" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/60 px-3 py-3 text-xs outline-none placeholder:text-slate-600 focus:border-cyan-300/50" /><button onClick={joinRoom} className="rounded-xl border border-cyan-300/40 px-4 py-3 text-xs font-semibold text-cyan-100">Join Room</button></div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <button onClick={() => setMirror((v) => !v)} className="dock-button">{mirror ? "Mirror ON" : "Mirror OFF"}</button>
          <button onClick={() => setScanlines((v) => !v)} className="dock-button">{scanlines ? "Lines ON" : "Lines OFF"}</button>
          <button onClick={() => setBrightness((v) => v >= 150 ? 70 : v + 20)} className="dock-button">Brightness</button>
          <button onClick={() => cameraOn ? hangUp() : startCamera().catch(() => {})} className="dock-button">{cameraOn ? "Stop" : "Camera"}</button>
        </div>
        {error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-300">{error}</p>}
        <p className="mt-3 text-center text-[9px] leading-4 text-slate-500">الصوت والصورة يمران عبر WebRTC؛ يلزم إذن الكاميرا والميكروفون واتصال الإنترنت للطرفين.</p>
        {callState === "CONNECTED" && <button onClick={hangUp} className="mt-3 w-full rounded-xl border border-rose-300/30 py-2 text-xs text-rose-200">End call</button>}
      </section>}
      {!dockVisible && <button onClick={(e) => { e.stopPropagation(); setDockVisible(true); }} className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-cyan-300/30 bg-slate-950/70 px-5 py-3 text-xs text-cyan-100 backdrop-blur-xl">Open controls</button>}
    </main>
  );
}
