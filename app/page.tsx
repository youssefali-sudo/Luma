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
type HoloColor = "cyan" | "gold" | "green" | "red";
type Mode = "glass" | "ar";
const COLORS: Record<HoloColor, string> = {
  cyan: "#00cfff",
  gold: "#ffb52e",
  green: "#39ff78",
  red: "#ff3158",
};

function loadScript(src: string, marker: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const selector = `script[data-luma-lib="${marker}"]`;
    const existing = document.querySelector<HTMLScriptElement>(selector);
    const ready = marker === "luma-peer" ? !!window.Peer : !!window.SelfieSegmentation;
    if (ready) return resolve();
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("تعذر تحميل مكتبة مطلوبة. تحقق من الإنترنت.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute("data-luma-lib", marker);
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("تعذر تحميل مكتبة مطلوبة. تحقق من الإنترنت."));
    document.head.appendChild(script);
  });
}

export default function Home() {
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const rearVideo = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rearStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const segmenterRef = useRef<InstanceType<NonNullable<typeof window.SelfieSegmentation>> | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const modeRef = useRef<Mode>("glass");
  const colorRef = useRef<HoloColor>("cyan");
  const scaleRef = useRef(1);
  const positionRef = useRef({ x: 50, y: 57 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ distance: number; scale: number; x: number; y: number } | null>(null);

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
  const [mode, setMode] = useState<Mode>("glass");
  const [holoColor, setHoloColor] = useState<HoloColor>("cyan");
  const [holoScale, setHoloScale] = useState(1);
  const [holoPosition, setHoloPosition] = useState({ x: 50, y: 57 });
  const [rearCameraOn, setRearCameraOn] = useState(false);
  const visualSettingsRef = useRef({ brightness, glow, mirror, scanlines });
  visualSettingsRef.current = { brightness, glow, mirror, scanlines };

  const drawResults = useCallback((results: SegmentationResults) => {
    const visual = visualSettingsRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = results.image.videoWidth || 640;
    const h = results.image.videoHeight || 480;
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    let maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      maskCanvas = document.createElement("canvas");
      maskCanvasRef.current = maskCanvas;
    }
    if (maskCanvas.width !== w || maskCanvas.height !== h) {
      maskCanvas.width = w;
      maskCanvas.height = h;
    }
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    maskCtx.clearRect(0, 0, w, h);
    maskCtx.drawImage(results.image, 0, 0, w, h);
    maskCtx.globalCompositeOperation = "destination-in";
    maskCtx.drawImage(results.segmentationMask, 0, 0, w, h);
    maskCtx.globalCompositeOperation = "source-atop";
    maskCtx.fillStyle = COLORS[colorRef.current];
    maskCtx.globalAlpha = Math.min(0.58, visual.glow / 150);
    maskCtx.fillRect(0, 0, w, h);
    maskCtx.globalAlpha = 1;
    if (visual.scanlines) {
      maskCtx.fillStyle = COLORS[colorRef.current];
      maskCtx.globalAlpha = 0.13;
      for (let y = 0; y < h; y += 6) maskCtx.fillRect(0, y, w, 1);
      maskCtx.globalAlpha = 1;
    }
    maskCtx.globalCompositeOperation = "destination-in";
    maskCtx.drawImage(results.segmentationMask, 0, 0, w, h);
    maskCtx.globalCompositeOperation = "source-over";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (modeRef.current === "glass") {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / w, canvas.height / h);
      const dw = w * scale;
      const dh = h * scale;
      ctx.save();
      if (visual.mirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(maskCanvas, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      const scale = Math.min(canvas.width / w, canvas.height / h) * scaleRef.current * 0.72;
      const dw = w * scale;
      const dh = h * scale;
      const x = canvas.width * positionRef.current.x / 100 - dw / 2;
      const y = canvas.height * positionRef.current.y / 100 - dh / 2;
      ctx.save();
      ctx.filter = `brightness(${visual.brightness}%) drop-shadow(0 0 ${visual.glow / 2}px ${COLORS[colorRef.current]})`;
      ctx.drawImage(maskCanvas, x, y, dw, dh);
      ctx.restore();
    }
  }, []);

  const wireCall = (call: any) => {
    callRef.current = call;
    call.on("stream", (remote: MediaStream) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remote;
        void remoteVideo.current.play().catch(() => {});
      }
      setCallState("CONNECTED");
    });
    call.on("close", () => {
      setCallState("WAITING");
      if (remoteVideo.current) remoteVideo.current.srcObject = null;
    });
    call.on("error", () => {
      setError("انقطع الاتصال. جرّب إعادة الانضمام.");
      setCallState("ERROR");
    });
  };

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
        const message = e?.type === "peer-unavailable"
          ? "كود الغرفة غير متاح. تأكد أن صديقك أنشأ الغرفة وما زال متصلًا."
          : "حصل خطأ في الاتصال. جرّب كودًا جديدًا.";
        setError(message);
        setCallState("ERROR");
        reject(new Error(message));
      });
    });
  };

  const startCamera = async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("الكاميرا تحتاج HTTPS ومتصفحًا يدعمها.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: cameraFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
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

  const startRearCamera = async () => {
    if (rearStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      rearStreamRef.current = stream;
      if (rearVideo.current) {
        rearVideo.current.srcObject = stream;
        await rearVideo.current.play();
      }
      setRearCameraOn(true);
    } catch {
      setError("تعذر فتح الكاميرا الخلفية. بعض الهواتف لا تسمح بتشغيل الكاميرتين معًا؛ أوقف الكاميرا الأمامية أو جرّب هاتفًا آخر.");
      setRearCameraOn(false);
    }
  };

  const stopRearCamera = () => {
    rearStreamRef.current?.getTracks().forEach((track) => track.stop());
    rearStreamRef.current = null;
    if (rearVideo.current) rearVideo.current.srcObject = null;
    setRearCameraOn(false);
  };

  const switchMode = async (next: Mode) => {
    modeRef.current = next;
    setMode(next);
    if (next === "ar") await startRearCamera();
    else stopRearCamera();
  };

  const createRoom = async () => {
    setError("");
    setCallState("INITIALIZING");
    try { if (!streamRef.current) await startCamera(); await setupPeer(); }
    catch (e) { setCallState("ERROR"); setError(e instanceof Error ? e.message : "تعذر إنشاء الغرفة."); }
  };

  const joinRoom = async () => {
    const target = joinCode.trim();
    if (!target) { setError("اكتب كود الغرفة أولًا."); return; }
    setError("");
    setCallState("INITIALIZING");
    try {
      const stream = streamRef.current || await startCamera();
      await setupPeer();
      const outgoing = peerRef.current.call(target, stream);
      if (!outgoing) throw new Error("تعذر بدء المكالمة. راجع كود الغرفة.");
      wireCall(outgoing);
    } catch (e) {
      setCallState("ERROR");
      setError(e instanceof Error ? e.message : "تعذر الانضمام للغرفة.");
    }
  };

  const hangUp = () => {
    callRef.current?.close();
    callRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopRearCamera();
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    segmenterRef.current?.close();
    segmenterRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    busyRef.current = false;
    setCameraOn(false);
    setRoomId("");
    setCallState("STANDBY");
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js", "luma-seg");
        if (!active || !window.SelfieSegmentation) return;
        const segmenter = new window.SelfieSegmentation({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
        });
        segmenter.setOptions({ modelSelection: 1, selfieMode: false });
        segmenter.onResults(drawResults);
        segmenterRef.current = segmenter;
        const tick = async () => {
          const remoteReady = !!remoteVideo.current?.srcObject && remoteVideo.current.readyState >= 2;
          const source = remoteReady ? remoteVideo.current : localVideo.current;
          if (source && source.readyState >= 2 && segmenterRef.current && !busyRef.current) {
            busyRef.current = true;
            try { await segmenterRef.current.send({ image: source }); } catch {}
            busyRef.current = false;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "تعذر تحميل محرك العزل.");
      }
    };
    void boot();
    return () => {
      active = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      rearStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerRef.current?.destroy();
      segmenterRef.current?.close();
    };
  }, [drawResults]);

  const copyRoom = async () => {
    try { await navigator.clipboard.writeText(roomId); }
    catch { setError("انسخ كود الغرفة يدويًا؛ المتصفح منع الوصول للحافظة."); }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (modeRef.current !== "ar") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      gestureRef.current = { distance: 0, scale: scaleRef.current, x: e.clientX, y: e.clientY };
    } else if (pointersRef.current.size >= 2) {
      const points = Array.from(pointersRef.current.values());
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      gestureRef.current = { distance: Math.hypot(dx, dy), scale: scaleRef.current, x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (modeRef.current !== "ar" || !pointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    const previous = pointersRef.current.get(e.pointerId)!;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = Array.from(pointersRef.current.values());
    if (points.length >= 2) {
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      const distance = Math.hypot(dx, dy);
      const start = gestureRef.current;
      if (start?.distance) {
        const nextScale = Math.max(0.35, Math.min(2.2, start.scale * distance / start.distance));
        scaleRef.current = nextScale;
        setHoloScale(nextScale);
      }
    } else {
      const dx = e.clientX - previous.x;
      const dy = e.clientY - previous.y;
      const next = {
        x: Math.max(12, Math.min(88, positionRef.current.x + dx / window.innerWidth * 100)),
        y: Math.max(18, Math.min(85, positionRef.current.y + dy / window.innerHeight * 100)),
      };
      positionRef.current = next;
      setHoloPosition(next);
      gestureRef.current = { distance: 0, scale: scaleRef.current, x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    gestureRef.current = null;
  };

  const selectColor = (color: HoloColor) => {
    colorRef.current = color;
    setHoloColor(color);
  };

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <video ref={localVideo} muted playsInline className="hidden" />
      <video ref={remoteVideo} playsInline autoPlay className="hidden" />
      <video ref={rearVideo} muted playsInline autoPlay className={mode === "ar" && rearCameraOn ? "absolute inset-0 z-0 h-full w-full object-cover" : "hidden"} />
      {mode === "glass" && <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(0,102,255,.12),transparent_60%)]" />}
      <div className="hud-corner left-4 top-4" /><div className="hud-corner right-4 top-4 rotate-90" />
      <div className="hud-corner bottom-4 left-4 -rotate-90" /><div className="hud-corner bottom-4 right-4 rotate-180" />

      <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-5">
        <button className="flex items-center gap-3" onClick={() => setDockVisible((v) => !v)}>
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/40 bg-cyan-300/10 font-black text-cyan-200 shadow-[0_0_22px_#0066ff33]">L</span>
          <span className="text-left"><span className="block text-sm font-bold tracking-[.3em]">LUMA</span><span className="block text-[9px] tracking-[.25em] text-cyan-100/50">HOLO LINK</span></span>
        </button>
        <span className="flex items-center gap-2 rounded-full border border-cyan-300/20 bg-black/50 px-3 py-2 text-[9px] tracking-[.16em] text-cyan-100/70"><i className={`h-1.5 w-1.5 rounded-full ${callState === "CONNECTED" ? "bg-emerald-400" : "bg-cyan-300"}`} />{callState}</span>
      </header>

      {mode === "ar" && !rearCameraOn && <div className="absolute inset-0 z-0 grid place-items-center bg-slate-950 px-8 text-center text-sm text-slate-300">جارٍ تشغيل الكاميرا الخلفية… اسمح للمتصفح باستخدام الكاميرا.</div>}
      <canvas
        ref={canvasRef}
        aria-label="Hologram video output"
        className={`absolute inset-0 z-10 h-full w-full ${mode === "ar" ? "touch-none cursor-grab active:cursor-grabbing" : "pointer-events-none"}`}
        style={mode === "glass" ? { filter: `brightness(${brightness}%) drop-shadow(0 0 ${glow / 2}px ${COLORS[holoColor]})` } : { filter: `brightness(${brightness}%)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {mode === "ar" && rearCameraOn && <div className="holo-base-ring pointer-events-none absolute z-10" style={{ left: `${holoPosition.x}%`, top: `${Math.min(92, holoPosition.y + 17 * holoScale)}%`, transform: `translate(-50%,-50%) scale(${holoScale})`, borderColor: COLORS[holoColor], boxShadow: `0 0 18px ${COLORS[holoColor]}, inset 0 0 14px ${COLORS[holoColor]}` }} />}
      {mode === "glass" && !cameraOn && callState !== "CONNECTED" && <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-8 text-center">
        <div className="holo-orb mb-7 grid h-24 w-24 place-items-center rounded-full border border-cyan-300/40 text-4xl text-cyan-200">◈</div>
        <h1 className="text-xl font-medium tracking-[.14em]">HOLOGRAM LINK</h1>
        <p className="mt-2 max-w-xs text-xs leading-6 text-slate-500">أنشئ غرفة وشارك الكود مع صديقك لبدء مكالمة مباشرة</p>
      </div>}
      <div className="pointer-events-none absolute left-7 top-24 z-20 text-[9px] leading-5 tracking-[.2em] text-cyan-200/70">LUMA / {mode === "ar" ? "AR ROOM FEED" : "OPTICAL FEED"}<br />{mode === "ar" ? "CAMERA: REAR" : "BG: #000000"}<br />{callState === "CONNECTED" ? "REMOTE SUBJECT ACTIVE" : "AWAITING SIGNAL"}</div>
      {mode === "ar" && <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/50 px-3 py-2 text-[10px] text-white/80">اسحب بإصبع واحد للتحريك • قرّب إصبعين للتكبير</div>}

      {dockVisible && <section className="glass-dock absolute bottom-4 left-1/2 z-30 max-h-[62dvh] w-[min(94vw,540px)] -translate-x-1/2 overflow-y-auto rounded-2xl p-3" onPointerDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold tracking-[.2em] text-cyan-100">CONTROL DOCK</span><button className="text-xs text-slate-400" onClick={() => setDockVisible(false)}>إخفاء ×</button></div>
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-black/50 p-1">
          <button onClick={() => void switchMode("glass")} className={`rounded-lg px-3 py-2 text-xs ${mode === "glass" ? "bg-cyan-300 text-slate-950 font-bold" : "text-slate-300"}`}>Glass Mode</button>
          <button onClick={() => void switchMode("ar")} className={`rounded-lg px-3 py-2 text-xs ${mode === "ar" ? "bg-cyan-300 text-slate-950 font-bold" : "text-slate-300"}`}>AR Room Mode</button>
        </div>
        {!roomId ? <button onClick={createRoom} className="w-full rounded-xl bg-gradient-to-r from-cyan-300 to-blue-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_0_25px_#0066ff44]">Create Hologram Room</button> : <div className="mb-3 rounded-xl border border-cyan-300/20 bg-black/40 p-3"><div className="text-[9px] tracking-[.15em] text-slate-500">YOUR ROOM CODE</div><div className="mt-1 flex items-center justify-between gap-2"><code className="max-w-[70%] overflow-hidden text-ellipsis text-sm text-cyan-100">{roomId}</code><button onClick={copyRoom} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100">Copy code</button></div></div>}
        <div className="mt-3 flex gap-2"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Paste friend's room code" aria-label="Room code" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/60 px-3 py-3 text-xs outline-none placeholder:text-slate-600 focus:border-cyan-300/50" /><button onClick={joinRoom} className="rounded-xl border border-cyan-300/40 px-4 py-3 text-xs font-semibold text-cyan-100">Join Room</button></div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {(["cyan", "gold", "green", "red"] as HoloColor[]).map((color) => <button key={color} onClick={() => selectColor(color)} className={`rounded-xl border px-1 py-2 text-[10px] ${holoColor === color ? "border-white/70 bg-white/10" : "border-white/10 bg-black/40"}`} style={{ color: COLORS[color] }}>{({ cyan: "Cyan Blue", gold: "Iron Gold", green: "Matrix Green", red: "Crimson" })[color]}</button>)}
        </div>
        {mode === "ar" && <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3"><div className="mb-2 flex justify-between text-[10px] text-slate-300"><span>Hologram size</span><span>{Math.round(holoScale * 100)}%</span></div><input aria-label="Hologram size" type="range" min="35" max="220" value={Math.round(holoScale * 100)} onChange={(e) => { const v = Number(e.target.value) / 100; scaleRef.current = v; setHoloScale(v); }} className="w-full" /></div>}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <button onClick={() => setMirror((v) => !v)} className="dock-button">{mirror ? "Mirror ON" : "Mirror OFF"}</button>
          <button onClick={() => setScanlines((v) => !v)} className="dock-button">{scanlines ? "Lines ON" : "Lines OFF"}</button>
          <button onClick={() => setBrightness((v) => v >= 150 ? 70 : v + 20)} className="dock-button">Brightness</button>
          <button onClick={() => cameraOn ? hangUp() : startCamera().catch(() => {})} className="dock-button">{cameraOn ? "Stop" : "Camera"}</button>
        </div>
        {error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-300">{error}</p>}
        {mode === "ar" && !rearCameraOn && <p className="mt-2 text-[10px] leading-4 text-amber-200/80">ملاحظة: بعض الهواتف لا تشغّل الكاميرتين الأمامية والخلفية في وقت واحد.</p>}
        <p className="mt-3 text-center text-[9px] leading-4 text-slate-500">الصوت والصورة عبر WebRTC؛ يلزم إذن الكاميرا والميكروفون والإنترنت للطرفين. وضع AR يدمج الشخص داخل معاينة الكاميرا فقط، وليس مجسمًا ثلاثي الأبعاد حقيقيًا.</p>
        {callState === "CONNECTED" && <button onClick={hangUp} className="mt-3 w-full rounded-xl border border-rose-300/30 py-2 text-xs text-rose-200">End call</button>}
      </section>}
      {!dockVisible && <button onClick={() => setDockVisible(true)} className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-cyan-300/30 bg-slate-950/70 px-5 py-3 text-xs text-cyan-100 backdrop-blur-xl">Open controls</button>}
    </main>
  );
}
