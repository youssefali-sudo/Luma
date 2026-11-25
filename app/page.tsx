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
  }
}

type SegmentationResults = { image: HTMLVideoElement; segmentationMask: HTMLCanvasElement };

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segmenterRef = useRef<InstanceType<NonNullable<typeof window.SelfieSegmentation>> | null>(null);
  const busyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [flipY, setFlipY] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [glow, setGlow] = useState(65);
  const [scanlines, setScanlines] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [status, setStatus] = useState("STANDBY");

  const drawResults = useCallback((results: SegmentationResults) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = results.image.videoWidth || 640;
    const height = results.image.videoHeight || 480;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // Draw the person through the segmentation mask; the surrounding pixels stay pure black.
    ctx.save();
    ctx.filter = `brightness(${brightness}%) saturate(1.25) contrast(1.08)`;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(results.segmentationMask, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(results.image, 0, 0, width, height);
    ctx.restore();

    // A restrained cyan overlay gives the cut-out a holographic look without obscuring it.
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = glow / 350;
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (scanlines) {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = "#55eaff";
      for (let y = 2; y < height; y += 7) ctx.fillRect(0, y, width, 1);
      ctx.restore();
    }
    ctx.restore();
  }, [brightness, glow, scanlines]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setStatus("STANDBY");
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    setLoading(true);
    setStatus("INITIALIZING");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("الكاميرا تحتاج HTTPS أو localhost ومتصفحًا يدعمها.");
      }
      if (!window.SelfieSegmentation) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>('script[data-luma-mediapipe="true"]');
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("تعذر تحميل محرك العزل.")), { once: true });
            if (window.SelfieSegmentation) resolve();
            return;
          }
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
          script.async = true;
          script.dataset.lumaMediapipe = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("تعذر تحميل محرك العزل. تحقق من اتصال الإنترنت."));
          document.head.appendChild(script);
        });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: cameraFacing, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("عنصر الفيديو غير جاهز.");
      video.srcObject = stream;
      await video.play();

      const Segmenter = window.SelfieSegmentation;
      if (!Segmenter) throw new Error("محرك العزل غير متاح.");
      const segmenter = new Segmenter({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });
      segmenter.setOptions({ modelSelection: 1, selfieMode: false });
      segmenter.onResults((results) => {
        drawResults(results);
        busyRef.current = false;
      });
      segmenterRef.current = segmenter;
      setCameraOn(true);
      setStatus("LIVE");
      const tick = async () => {
        const currentVideo = videoRef.current;
        if (currentVideo && currentVideo.readyState >= 2 && segmenterRef.current && !busyRef.current) {
          busyRef.current = true;
          try {
            await segmenterRef.current.send({ image: currentVideo });
          } catch {
            busyRef.current = false;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      stopCamera();
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء تشغيل الكاميرا.");
      setStatus("ERROR");
    } finally {
      setLoading(false);
    }
  }, [cameraFacing, drawResults, stopCamera]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    segmenterRef.current?.close();
  }, []);

  useEffect(() => {
    if (!cameraOn) return;
    // Redraw with the latest visual controls on the next segmentation frame.
  }, [brightness, glow, scanlines, cameraOn]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setError("تعذر تفعيل ملء الشاشة في هذا المتصفح.");
    }
  };

  const reset = () => {
    setBrightness(100);
    setGlow(65);
    setMirror(true);
    setFlipY(false);
    setScanlines(true);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070c]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(15,91,130,.19),transparent_55%)]" />
      <header className="relative z-10 flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-xl font-black text-cyan-200">L</div>
          <div>
            <div className="text-lg font-bold tracking-[.22em]">LUMA</div>
            <div className="text-[10px] uppercase tracking-[.25em] text-slate-500">Holographic studio</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] tracking-[.15em] text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${cameraOn ? "bg-emerald-400 shadow-[0_0_9px_#34d399]" : "bg-slate-600"}`} />
          {status}
        </div>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-8 lg:grid-cols-[1fr_310px] lg:py-10">
        <div className="min-w-0">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.28em] text-cyan-300/80">Live projection mode</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Make presence <span className="text-cyan-300">visible.</span></h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">اعزل الشخص عن الخلفية واعرضه على سواد كامل لتجربة Pepper&apos;s Ghost.</p>
            </div>
            <button onClick={() => setControlsVisible((v) => !v)} className="hidden rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 sm:block">
              {controlsVisible ? "Hide controls" : "Show controls"}
            </button>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-black shadow-[0_0_70px_rgba(8,145,178,.08)]">
            <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-[10px] tracking-[.15em] text-slate-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" /> OUTPUT / PURE BLACK
            </div>
            <div className="pointer-events-none absolute right-4 top-4 z-10 text-[10px] tracking-[.16em] text-slate-600">LUMA • 01</div>
            <div className="preview-grid relative flex aspect-[4/3] min-h-[300px] items-center justify-center overflow-hidden bg-black sm:aspect-video">
              <video ref={videoRef} playsInline muted className="hidden" />
              <canvas
                ref={canvasRef}
                aria-label="Live isolated subject preview"
                className={`relative z-[1] h-full w-full object-contain ${mirror ? "-scale-x-100" : ""} ${flipY ? "-scale-y-100" : ""} ${scanlines ? "scanlines" : ""}`}
                style={{ filter: `brightness(${brightness}%) drop-shadow(0 0 18px rgba(34,211,238,${glow / 200}))` }}
              />
              {!cameraOn && (
                <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center bg-black/90 px-6 text-center">
                  <div className="pulse-glow mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/[0.06]">
                    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-cyan-200"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h7A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" strokeWidth="1.5"/><path d="m16 9 4-2v10l-4-2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                  </div>
                  <h2 className="text-lg font-medium text-slate-100">Your stage is waiting</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">شغّل الكاميرا للسماح لـ LUMA بعزل الشخص وعرضه على خلفية سوداء.</p>
                  <button disabled={loading} onClick={startCamera} className="mt-6 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">
                    {loading ? "Initializing engine…" : "Start live camera"}
                  </button>
                  {error && <p role="alert" className="mt-4 max-w-md text-xs leading-5 text-rose-300">{error}</p>}
                </div>
              )}
              {cameraOn && (
                <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-emerald-300/20 bg-black/70 px-3 py-2 text-[10px] tracking-wider text-emerald-200">
                  ● SEGMENTATION ACTIVE
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#070b12] px-4 py-3">
              <div className="text-[10px] tracking-[.16em] text-slate-500">BACKGROUND <span className="ml-2 text-slate-300">#000000</span></div>
              <div className="flex gap-2">
                <button onClick={toggleFullscreen} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:border-cyan-300/30 hover:text-cyan-200">⛶ Full screen</button>
                {cameraOn && <button onClick={stopCamera} className="rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-400/10">Stop camera</button>}
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-600">ملاحظة: سواد الشاشة يقلل الضوء المتسرب، لكنه لا يضمن اختفاءه تمامًا في كل شاشة أو غرفة.</p>
        </div>

        <aside className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Studio controls</h2>
              <button onClick={reset} className="text-xs text-cyan-300 hover:text-cyan-100">Reset</button>
            </div>
            {controlsVisible ? (
              <div className="space-y-6">
                <div>
                  <div className="mb-3 text-xs font-medium text-slate-300">Camera source</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setCameraFacing("user")} className={`rounded-lg border px-3 py-2.5 text-xs ${cameraFacing === "user" ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-400"}`}>Front camera</button>
                    <button onClick={() => setCameraFacing("environment")} className={`rounded-lg border px-3 py-2.5 text-xs ${cameraFacing === "environment" ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-400"}`}>Rear camera</button>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-slate-500">أوقف الكاميرا قبل تغيير المصدر ثم شغّلها من جديد.</p>
                  {cameraOn && <button onClick={stopCamera} className="mt-2 text-xs text-cyan-300 underline">Stop to switch camera</button>}
                </div>
                <div className="h-px bg-white/[0.07]" />
                <div>
                  <div className="mb-3 text-xs font-medium text-slate-300">Orientation</div>
                  <div className="space-y-2">
                    <button onClick={() => setMirror((v) => !v)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-xs ${mirror ? "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100" : "border-white/10 text-slate-400"}`}><span>↔ Horizontal mirror</span><span>{mirror ? "ON" : "OFF"}</span></button>
                    <button onClick={() => setFlipY((v) => !v)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-xs ${flipY ? "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100" : "border-white/10 text-slate-400"}`}><span>↕ Vertical flip</span><span>{flipY ? "ON" : "OFF"}</span></button>
                  </div>
                </div>
                <div className="h-px bg-white/[0.07]" />
                <div>
                  <div className="mb-3 flex justify-between text-xs"><label htmlFor="brightness" className="text-slate-300">Brightness</label><span className="text-cyan-200">{brightness}%</span></div>
                  <input id="brightness" aria-label="Brightness" type="range" min="40" max="160" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full" />
                </div>
                <div>
                  <div className="mb-3 flex justify-between text-xs"><label htmlFor="glow" className="text-slate-300">Hologram glow</label><span className="text-cyan-200">{glow}%</span></div>
                  <input id="glow" aria-label="Hologram glow" type="range" min="0" max="100" value={glow} onChange={(e) => setGlow(Number(e.target.value))} className="w-full" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.08] px-3 py-3">
                  <label htmlFor="scanlines" className="text-xs text-slate-300">Cyan scan lines</label>
                  <button id="scanlines" role="switch" aria-checked={scanlines} onClick={() => setScanlines((v) => !v)} className={`relative h-5 w-9 rounded-full transition ${scanlines ? "bg-cyan-300/70" : "bg-slate-700"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${scanlines ? "left-[18px]" : "left-0.5"}`} /></button>
                </div>
                {error && <p role="alert" className="text-xs leading-5 text-rose-300">{error}</p>}
              </div>
            ) : (
              <button onClick={() => setControlsVisible(true)} className="w-full rounded-lg border border-cyan-300/20 py-3 text-xs text-cyan-200">Show controls</button>
            )}
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2"><span className="text-cyan-300">✳</span><h3 className="text-xs font-semibold">Optical setup</h3></div>
            <p className="text-xs leading-5 text-slate-400">ضع لوحًا شفافًا مائلًا بزاوية قريبة من 45° بين الشاشة ومكان ظهور الصورة، وقلّل إضاءة الغرفة لتحسين تأثير Pepper&apos;s Ghost.</p>
            <div className="mt-4 rounded-lg border border-white/[0.07] bg-black/40 p-3 text-[10px] leading-5 text-slate-500">هذا تأثير انعكاس بصري ثنائي الأبعاد، وليس إسقاطًا حقيقيًا في الهواء أو مجسمًا ثلاثي الأبعاد.</div>
          </div>
          <div className="px-1 text-[10px] leading-5 text-slate-600">LUMA MVP 0.1 · Camera segmentation runs in your browser. Camera access requires permission and HTTPS (or localhost).</div>
        </aside>
      </section>
    </main>
  );
}