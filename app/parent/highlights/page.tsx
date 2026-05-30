"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { apiLoadGames, apiLoadClips } from "@/lib/gc-api";
import type { ClipRecord } from "@/lib/gc-api";
import { translateError } from "@/lib/translate-error";
import {
  type RGBColor, type PlayerSignature, type TrackState, type FrameScore,
  SAMPLE_FPS, SAMPLE_W, HIGHLIGHT_S, DIRS4,
  extractPlayerSignature, analyzeFrame, generateBeatWAV,
  findBestWindow, seekVideoTo, cutVideoNative, cutMultiVideoNative,
} from "@/lib/highlight-engine";

type Stage = "idle"|"loading"|"extracting_color"|"analyzing"|"cutting"|"done"|"error";

function formatClipLabel(label: string): string {
  if (!label) return "集锦片段";
  const parts = label.split(",").map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" · ") + "的集锦" : label;
}

function fmtClipDate(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime() - new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff <= 7) return `${diff}天前`;
  return `${d.getMonth()+1}/${d.getDate()}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HighlightsPage() {
  const [videoFiles,   setVideoFiles]   = useState<File[]>([]);
  const [photoFile,    setPhotoFile]    = useState<File|null>(null);
  const [photoPreview, setPhotoPreview] = useState<string|null>(null);
  const [stage,        setStage]        = useState<Stage>("idle");
  const [progress,     setProgress]     = useState(0);
  const [statusMsg,    setStatusMsg]    = useState("");
  const [resultUrl,    setResultUrl]    = useState<string|null>(null);
  const [resultBlob,   setResultBlob]   = useState<Blob|null>(null);
  const [resultName,   setResultName]   = useState("highlight.mp4");
  const [procMode,     setProcMode]     = useState<"server"|"client">("server");
  const [formatWarn,   setFormatWarn]   = useState<string|null>(null);
  const [serverUrl,    setServerUrl]    = useState<string|null>(null);
  const [error,        setError]        = useState<string|null>(null);
  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [feedbackTypes,  setFeedbackTypes]  = useState<string[]>([]);
  const [feedbackDone,   setFeedbackDone]   = useState(false);
  const [isWeChat,       setIsWeChat]       = useState(false);
  const [bgmEnabled,     setBgmEnabled]     = useState(false);
  const [bgmUserFile,    setBgmUserFile]    = useState<File|null>(null);
  const [videoDuration,  setVideoDuration]  = useState<number>(0);
  const [childName,      setChildName]      = useState("");
  const [myHighlights,   setMyHighlights]   = useState<Array<{date:string;name:string;dur:number}>>([]);
  const [captionCopied,  setCaptionCopied]  = useState(false);
  const [captionFallback, setCaptionFallback] = useState<string|null>(null);
  const [clipShareUrl,   setClipShareUrl]   = useState<string|null>(null);
  const [analyzeElapsed, setAnalyzeElapsed] = useState(0);
  const [resultDur,      setResultDur]      = useState(0);
  const [hlMode, setHlMode] = useState<"upload"|"from_clips">("upload");
  const [playerClips, setPlayerClips] = useState<Array<ClipRecord & { gameLabel: string; gameId?: string }>|null>(null);
  const [loadingPlayerClips, setLoadingPlayerClips] = useState(false);
  const [clipsLoadError, setClipsLoadError] = useState(false);
  const [gamesWithEvents, setGamesWithEvents] = useState(0);
  const [expandedClipId, setExpandedClipId] = useState<string|null>(null);
  const [nameInputVal,   setNameInputVal]   = useState("");
  const [cloudUrl,       setCloudUrl]       = useState<string|null>(null);
  const [cloudUploading, setCloudUploading] = useState(false);
  const analyzeStartRef = useRef<number>(0);
  const serverCheckDoneRef = useRef(false);
  const serverOkRef = useRef<boolean | null>(null);
  const trackedUrlsRef = useRef<string[]>([]);
  const trackUrl = (url: string) => { trackedUrlsRef.current.push(url); return url; };

  // Revoke all tracked blob URLs on unmount to prevent memory leaks
  useEffect(() => () => {
    trackedUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    trackedUrlsRef.current = [];
  }, []);

  // Server health check on mount — auto-select working mode before user interacts
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    fetch("/api/highlights/encode", { method: "POST", signal: ctrl.signal })
      .then(r => { serverOkRef.current = r.status === 400; })
      .catch(() => { serverOkRef.current = false; })
      .finally(() => {
        clearTimeout(timer);
        serverCheckDoneRef.current = true;
        setProcMode(serverOkRef.current ? "server" : "client");
      });
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, []);

  // Detect WeChat WKWebView once on mount — used to show long-press save hint
  useEffect(() => {
    setIsWeChat(/MicroMessenger/i.test(navigator.userAgent));
    try { const n = localStorage.getItem("child_name"); if (n) setChildName(n); } catch {}
    try { const h = JSON.parse(localStorage.getItem("my_highlights") || "[]"); if (Array.isArray(h)) setMyHighlights(h.slice(0, 5)); } catch {}
  }, []);

  // Auto-switch to clips tab when ?tab=clips is in URL; runs after childName is set
  useEffect(() => {
    if (!childName) return;
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "clips") {
      setHlMode("from_clips");
      if (playerClips === null) loadPlayerClips();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childName]);

  // Load player-specific clips from Supabase when switching to from_clips mode.
  // Accepts an optional nameOverride to avoid stale-closure issues when called
  // immediately after setChildName() (before React re-render).
  const loadPlayerClips = useCallback(async (nameOverride?: string) => {
    const name = nameOverride ?? childName;
    if (!name) { setPlayerClips([]); return; }
    setPlayerClips(null);
    setClipsLoadError(false);
    setLoadingPlayerClips(true);
    try {
      const games = await apiLoadGames();
      setGamesWithEvents(games.filter(g => (g.eventCount ?? 0) > 0).length);
      const results = await Promise.all(
        games.slice(0, 15).map(async (game) => {
          const clips = await apiLoadClips(game.id);
          const gameLabel = `${game.homeScore}-${game.awayScore} ${game.awayTeam}`;
          return clips
            .filter(clip => clip.label.split(",").map(s => s.trim()).includes(name))
            .map(clip => ({ ...clip, gameLabel, gameId: game.id }));
        })
      );
      setPlayerClips(results.flat());
    } catch { setPlayerClips([]); setClipsLoadError(true); }
    setLoadingPlayerClips(false);
  }, [childName]);

  const confirmChildName = useCallback(() => {
    const trimmed = nameInputVal.trim();
    if (!trimmed) return;
    setChildName(trimmed);
    try { localStorage.setItem("child_name", trimmed); } catch {}
    loadPlayerClips(trimmed);
  }, [nameInputVal, loadPlayerClips]);

  // Revoke blob URLs on change/unmount to prevent memory leaks
  useEffect(() => {
    return () => { if (resultUrl) URL.revokeObjectURL(resultUrl); };
  }, [resultUrl]);
  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);
  useEffect(() => {
    if (stage !== "analyzing") { setAnalyzeElapsed(0); return; }
    analyzeStartRef.current = Date.now();
    const iv = setInterval(() => setAnalyzeElapsed(Math.round((Date.now() - analyzeStartRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [stage]);

  const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 5);
    if (!files.length) return;
    // Warn if any file is .mov or has quicktime MIME — HEVC may not be supported
    const hasMov = files.some(f => /\.mov$/i.test(f.name) || f.type === "video/quicktime");
    setFormatWarn(hasMov ? "📱 检测到 iPhone 视频（.MOV）· 建议在手机「设置→相机→格式」选「最兼容」后重新录制，或先转码为 MP4" : null);
    setVideoFiles(prev => {
      const combined = [...prev, ...files].slice(0, 5);
      return combined;
    });
    setVideoDuration(0);
    // probe duration of first new file
    const f = files[0];
    const url = URL.createObjectURL(f);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => { setVideoDuration(vid.duration); URL.revokeObjectURL(url); vid.src = ""; };
    vid.onerror = () => { URL.revokeObjectURL(url); vid.src = ""; };
    vid.src = url;
  }, []);
  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f=e.target.files?.[0]; if (!f) return;
    setPhotoFile(f); setPhotoPreview(trackUrl(URL.createObjectURL(f)));
  },[]);
  const handleBgmFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBgmUserFile(e.target.files?.[0] || null);
  }, []);

  const run = useCallback(async () => {
    if (!videoFiles.length || !photoFile) return;
    setError(null); setResultUrl(null); setResultBlob(null);
    setFeedbackRating(0); setFeedbackTypes([]); setFeedbackDone(false);

    const videoObjectUrls = videoFiles.map(f => trackUrl(URL.createObjectURL(f)));
    const videoEls = videoObjectUrls.map(url => {
      const el = document.createElement("video");
      el.src = url; el.muted = true; el.playsInline = true; el.preload = "auto";
      return el;
    });
    const videoEl = videoEls[0]; // primary element for compat
    const videoFile = videoFiles[0]; // for filename

    try {
      // ── 1. Load all video metadata ────────────────────────────────────────
      setStage("loading"); setProgress(3);
      setStatusMsg(`读取 ${videoEls.length} 个视频信息…`);
      const durations: number[] = await Promise.all(videoEls.map((el, i) =>
        new Promise<number>((res, rej) => {
          const t = setTimeout(() => rej(new Error(`视频${i+1}加载超时`)), 30_000);
          el.onloadedmetadata = () => { clearTimeout(t); res(el.duration); };
          el.onerror = () => { clearTimeout(t); rej(new Error(`无法加载视频${i+1}`)); };
        })
      ));
      const duration = durations[0];
      if (!isFinite(duration) || duration <= 0) throw new Error("无法读取视频时长，请检查文件格式");
      setProgress(12);

      // ── 2. Extract player signature from photo ────────────────────────────
      setStage("extracting_color"); setStatusMsg("提取球员外观特征…");
      const photoUrl = URL.createObjectURL(photoFile);
      const img = new Image();
      try {
        await new Promise<void>((res, rej) => {
          const t = setTimeout(() => rej(new Error("照片加载超时")), 10_000);
          img.onload  = () => { clearTimeout(t); res(); };
          img.onerror = () => { clearTimeout(t); rej(new Error("无法加载照片")); };
          img.src = photoUrl;
        });
      } finally { URL.revokeObjectURL(photoUrl); }
      const sig = extractPlayerSignature(img);
      setProgress(18);

      // ── 3. Frame analysis for all videos ─────────────────────────────────
      setStage("analyzing");
      const analysisCv = document.createElement("canvas");
      analysisCv.width = SAMPLE_W;

      interface ClipSpec { el: HTMLVideoElement; start: number; end: number; dur: number }
      const clipSpecs: ClipSpec[] = [];
      const perClipTargetDur = Math.max(3, Math.round(HIGHLIGHT_S / videoEls.length));
      let highlightCount = 0;

      for (let vi = 0; vi < videoEls.length; vi++) {
        const el = videoEls[vi];
        const vDur = durations[vi];
        const sH = el.videoWidth > 0
          ? Math.round(SAMPLE_W * el.videoHeight / el.videoWidth)
          : Math.round(SAMPLE_W * 9 / 16);
        analysisCv.height = sH;
        const ctx = analysisCv.getContext("2d", { willReadFrequently: true })!;

        const scores: FrameScore[] = [];
        let prevFrame: ImageData | null = null;
        const track: TrackState = { x: -1, y: -1, vx: 0, vy: 0, framesSinceSeen: 999, lastExitX: -1 };
        const framesPerVideo = Math.min(Math.ceil(vDur * SAMPLE_FPS), Math.ceil(90 / videoEls.length));
        const fInterval = vDur / Math.max(framesPerVideo, 1);
        const deadline = Date.now() + 120_000;

        for (let i = 0; i < framesPerVideo; i++) {
          if (Date.now() > deadline) break;
          const t = i * fInterval;
          setStatusMsg(`🔍 扫描 ${videoEls.length > 1 ? `视频${vi+1} ` : ""}${i+1}/${framesPerVideo} 帧${highlightCount > 0 ? ` · 发现 ${highlightCount} 个有球时刻` : "…"}`);
          try {
            await seekVideoTo(el, t);
            ctx.drawImage(el, 0, 0, SAMPLE_W, sH);
            const currFrame = ctx.getImageData(0, 0, SAMPLE_W, sH);
            const fs = analyzeFrame(currFrame, prevFrame, sig, SAMPLE_W, sH, track);
            fs.t = t; scores.push(fs);
            if (fs.hasPlayer) {
              highlightCount++;
              if (track.x >= 0) { track.vx = track.vx*0.5+(fs.playerX-track.x)*0.5; track.vy = track.vy*0.5+(fs.playerY-track.y)*0.5; }
              const nearEdge = fs.playerX < SAMPLE_W*0.08||fs.playerX > SAMPLE_W*0.92||fs.playerY < sH*0.08||fs.playerY > sH*0.92;
              if (nearEdge) track.lastExitX = fs.playerX;
              track.x = fs.playerX; track.y = fs.playerY; track.framesSinceSeen = 0;
            } else { track.framesSinceSeen++; }
            prevFrame = currFrame;
          } catch { continue; }
          const globalProgress = (vi * framesPerVideo + i + 1) / (videoEls.length * framesPerVideo);
          setProgress(18 + Math.round(globalProgress * 52));
        }

        for (let i = 1; i < scores.length - 1; i++) {
          if (scores[i].hasPlayer && !scores[i-1].hasPlayer && !scores[i+1].hasPlayer) {
            scores[i] = { ...scores[i], hasPlayer: false, score: scores[i].score * 0.05 };
          }
        }

        const [s, e] = findBestWindow(scores, vDur, bgmEnabled ? 120 : 0);
        const clampedEnd = Math.min(e, s + perClipTargetDur);
        clipSpecs.push({ el, start: s, end: clampedEnd, dur: clampedEnd - s });
      }

      setProgress(70); setStatusMsg("计算精彩片段…");
      const clipDuration = clipSpecs.reduce((sum, c) => sum + c.dur, 0);
      const clipStart = clipSpecs[0].start;
      const clipEnd = clipSpecs[0].end;

      // ── 5. Build output filename ──────────────────────────────────────────
      const childNameForFile = (() => { try { return localStorage.getItem("child_name") || ""; } catch { return ""; } })();
      const mmdd = (() => { const d = new Date(); return `${(d.getMonth()+1).toString().padStart(2,"0")}${d.getDate().toString().padStart(2,"0")}`; })();
      const outputName = childNameForFile ? `${childNameForFile}_${mmdd}集锦.mp4` : videoFile.name.replace(/\.[^.]+$/, "") + "_highlight.mp4";
      setResultName(outputName);

      setStage("cutting");

      // ── 6a. Server-side FFmpeg path (with auto-fallback to client on 5xx) ───
      let serverDone = false;
      if (procMode === "server") {
        try {
          setStatusMsg("上传到服务器，后台处理中…");
          const fd = new FormData();
          for (let i = 0; i < clipSpecs.length; i++) {
            fd.append(`video_${i}`, videoFiles[i] ?? videoFiles[0], videoFiles[i]?.name ?? outputName);
            fd.append(`start_${i}`, clipSpecs[i].start.toFixed(3));
            fd.append(`end_${i}`, clipSpecs[i].end.toFixed(3));
          }
          fd.append("bgm", bgmEnabled ? "true" : "false");
          fd.append("name", outputName);

          const startResp = await fetch("/api/highlights/encode", { method: "POST", body: fd });
          if (!startResp.ok) {
            let detail = `服务端错误 ${startResp.status}`;
            try { const b = await startResp.json(); if (b.error) detail = b.error; } catch {}
            throw new Error(detail);
          }
          const { jobId, error: startErr } = await startResp.json();
          if (startErr) throw new Error(startErr);

          await new Promise<void>((resolve, reject) => {
            let retries = 0;
            const MAX_RETRIES = 3;
            const overallTimer = setTimeout(() => { reject(new Error("处理超时（>3分钟），请重试")); }, 180_000);
            function connect() {
              const es = new EventSource(`/api/highlights/status/${jobId}`);
              es.onmessage = (e) => {
                retries = 0; // reset on successful message
                try {
                  const data = JSON.parse(e.data) as { status: string; progress: number; stage: string; url?: string; error?: string };
                  if (data.stage) setStatusMsg(data.stage);
                  if (typeof data.progress === "number") setProgress(70 + Math.round(data.progress * 0.28));
                  if (data.status === "done" && data.url) { es.close(); clearTimeout(overallTimer); setServerUrl(data.url); resolve(); }
                  if (data.status === "error") { es.close(); clearTimeout(overallTimer); reject(new Error(data.error || "服务端处理失败")); }
                } catch { es.close(); clearTimeout(overallTimer); reject(new Error("响应解析失败")); }
              };
              es.onerror = () => {
                es.close();
                if (retries < MAX_RETRIES) {
                  retries++;
                  setStatusMsg(`网络波动，正在重连（${retries}/${MAX_RETRIES}）…`);
                  setTimeout(connect, 2000);
                } else {
                  clearTimeout(overallTimer);
                  reject(new Error("连接多次中断，请检查网络后重试"));
                }
              };
            }
            connect();
          });

          setResultDur(Math.round(clipDuration));
          setStage("done"); setProgress(100);
          setStatusMsg(`服务端处理完成 · 视频已保存云端${clipSpecs.length > 1 ? ` · ${clipSpecs.length}段合并` : ""}`);
          try {
            const rec = { date: new Date().toISOString(), name: outputName, dur: Math.round(clipDuration) };
            const prev = JSON.parse(localStorage.getItem("my_highlights") || "[]");
            localStorage.setItem("my_highlights", JSON.stringify([rec, ...prev].slice(0, 10)));
            setMyHighlights([rec, ...prev].slice(0, 10));
          } catch {}
          serverDone = true;
        } catch (serverErr) {
          const msg = serverErr instanceof Error ? serverErr.message : String(serverErr);
          // Auto-fallback on 5xx or missing env var — show warning then continue to client path
          if (/5\d\d/.test(msg) || msg.includes("not set") || msg.includes("SUPABASE")) {
            setStatusMsg("服务端不可用，自动切换本地处理…");
          } else {
            throw serverErr;
          }
        }
      }

      // ── 6b. Client-side MediaRecorder path (client mode OR server fallback) ─
      if (!serverDone) {
        let bgmBlob: Blob | null = null;
        if (bgmEnabled) {
          setStatusMsg("加载BGM…");
          if (bgmUserFile && bgmUserFile.size <= 3 * 1024 * 1024) {
            bgmBlob = bgmUserFile;
          } else {
            try {
              const resp = await Promise.race([
                fetch("/bgm/sport1.mp3"),
                new Promise<never>((_, rej) => setTimeout(() => rej(), 8000)),
              ]) as Response;
              if (resp.ok) bgmBlob = await resp.blob();
            } catch {}
            if (!bgmBlob) {
              const wav = generateBeatWAV(clipDuration + 2);
              bgmBlob = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
            }
          }
        }

        setStatusMsg(`剪辑 ${clipSpecs.length} 段精彩，合计约 ${Math.round(clipDuration)} 秒…`);
        const outputBlob = clipSpecs.length === 1
          ? await cutVideoNative(clipSpecs[0].el, clipSpecs[0].start, clipSpecs[0].end, bgmBlob,
              (p) => setProgress(70 + Math.round(p * 28)))
          : await cutMultiVideoNative(clipSpecs, bgmBlob,
              (p) => setProgress(70 + Math.round(p * 28)));

        setProgress(100);
        setResultBlob(outputBlob);
        setResultUrl(trackUrl(URL.createObjectURL(outputBlob)));
        setResultDur(Math.round(clipDuration));
        setStage("done"); setProgress(100);
        setStatusMsg(clipSpecs.length > 1 ? `${clipSpecs.length}段视频精华合并 · 共${Math.round(clipDuration)}秒` : "");
        try {
          const rec = { date: new Date().toISOString(), name: outputName, dur: Math.round(clipDuration) };
          const prev = JSON.parse(localStorage.getItem("my_highlights") || "[]");
          const next = [rec, ...prev].slice(0, 10);
          localStorage.setItem("my_highlights", JSON.stringify(next));
          setMyHighlights(next);
        } catch {}
      }

    } catch (e) {
      console.error(e);
      setError(translateError((e instanceof Error ? e.message : String(e)) || ""));
      setStage("error");
    } finally {
      videoEls.forEach(el => { el.pause(); el.src = ""; });
      videoObjectUrls.forEach(url => URL.revokeObjectURL(url));
      trackedUrlsRef.current = trackedUrlsRef.current.filter(u => !videoObjectUrls.includes(u));
    }
  }, [videoFiles, photoFile, bgmEnabled, bgmUserFile]);

  const isProcessing = ["loading","extracting_color","analyzing","cutting"].includes(stage);
  const canRun = !!(videoFiles.length > 0 && photoFile && !isProcessing);

  const todayKey = (() => { const d = new Date(); return `home_training_checkin_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; })();
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [streakDays, setStreakDays] = useState(0);
  // Read localStorage after mount to avoid SSR/client hydration mismatch (React #418)
  useEffect(() => {
    try {
      setCheckedInToday(!!localStorage.getItem(todayKey));
      let streak = 0;
      const now = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const k = `home_training_checkin_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
        if (localStorage.getItem(k)) streak++; else break;
      }
      setStreakDays(streak);
    } catch {}
  }, [todayKey]);

  function doCheckin() {
    try { localStorage.setItem(todayKey, "1"); } catch {}
    setCheckedInToday(true);
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
    <div className="-mx-4 -mt-6 px-4 pt-6 pb-16 flex flex-col gap-5 min-h-screen" style={{ background: "radial-gradient(circle at 15% 0%, rgba(255,132,39,0.18), transparent 30%), radial-gradient(circle at 85% 12%, rgba(255,212,71,0.12), transparent 34%), linear-gradient(180deg, #101B2D 0%, #07111F 58%, #05070D 100%)" }}>
      {/* Home training checkin */}
      <div className={`rounded-2xl border p-3 flex items-center justify-between gap-3 ${checkedInToday ? "bg-green-500/10 border-green-500/25" : "bg-amber-500/10 border-amber-500/25"}`}>
        <div>
          <div className="text-xs font-bold text-white mb-0.5">🏠 家庭训练打卡</div>
          {checkedInToday
            ? <div className="text-xs text-green-400">✅ 今日已打卡{streakDays >= 2 ? ` · 已连续 ${streakDays} 天` : ""} 🔥</div>
            : <div className="text-xs text-amber-400">上传一段家训视频，AI 帮你分析成长，连续打卡赢得徽章</div>
          }
        </div>
        {!checkedInToday && (
          <button onClick={doCheckin} className="shrink-0 bg-amber-500 text-white text-xs font-bold px-3 py-2 rounded-xl active:opacity-70">
            今日打卡 →
          </button>
        )}
        {checkedInToday && streakDays >= 3 && (
          <span className="text-xs bg-green-500/15 text-green-300 border border-green-500/25 px-2 py-1 rounded-full font-bold shrink-0">📅 连续打卡达人</span>
        )}
      </div>

      <div className="rounded-3xl p-5 shadow-lg" style={{background:"linear-gradient(135deg,#f7971e 0%,#ffd200 100%)"}}>
        <div className="text-2xl font-black mb-1" style={{color:"#7C3810"}}>🎬 生成{childName ? `${childName}的` : ""}精彩集锦</div>
        <p className="text-sm" style={{color:"#7C3810",opacity:0.85}}>
          {!serverCheckDoneRef.current
            ? "上传比赛视频 + 球员照片，自动剪辑有球精彩片段（约15秒）…"
            : serverOkRef.current
              ? "上传视频到云端，AI 后台处理，可切换到其他页面等待结果。"
              : "上传比赛视频 + 球员照片，自动剪辑有球精彩片段（约15秒），全程本地处理不上传服务器。"}
        </p>
      </div>

      {/* Mode tabs */}
      {stage === "idle" && (
        <div className="flex rounded-2xl bg-white/5 p-1 gap-1">
          <button
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors ${hlMode === "upload" ? "bg-orange-500 text-white shadow-sm" : "text-gray-500"}`}
            onClick={() => setHlMode("upload")}
          >📹 上传视频</button>
          <button
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors ${hlMode === "from_clips" ? "bg-orange-500 text-white shadow-sm" : "text-gray-500"}`}
            onClick={() => { setHlMode("from_clips"); if (playerClips === null) loadPlayerClips(); }}
          >🏀 已标注集锦</button>
        </div>
      )}

      {/* From clips mode */}
      {stage === "idle" && hlMode === "from_clips" && (
        <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white">
              {childName ? `${childName}的比赛集锦` : "比赛集锦"}
            </div>
            <button
              onClick={() => { setPlayerClips(null); loadPlayerClips(); }}
              disabled={loadingPlayerClips}
              className={`text-base px-1 transition-opacity ${loadingPlayerClips ? "text-gray-300 cursor-not-allowed" : "text-gray-400 active:opacity-60"}`}
              title="刷新"
            >↻</button>
          </div>
          {loadingPlayerClips && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-xl bg-white/5 animate-pulse" style={{ height: 56 }} />
              ))}
            </div>
          )}
          {!loadingPlayerClips && clipsLoadError && (
            <div className="text-sm text-center py-6 flex flex-col items-center gap-2">
              <div className="text-2xl">⚠️</div>
              <div className="text-gray-300 font-medium">加载失败，请检查网络后重试</div>
              <button
                onClick={() => { setClipsLoadError(false); loadPlayerClips(); }}
                className="text-xs font-bold text-orange-600 border border-orange-300 px-4 py-1.5 rounded-full active:opacity-70"
              >🔄 重试</button>
            </div>
          )}
          {!loadingPlayerClips && !clipsLoadError && playerClips !== null && playerClips.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6">
              {!childName ? (
                <>
                  <div className="text-2xl mb-2">👤</div>
                  <div className="text-gray-300 font-medium mb-3">先告诉我孩子叫什么名字</div>
                  <div className="flex gap-2 justify-center">
                    <input
                      value={nameInputVal}
                      onChange={e => setNameInputVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") confirmChildName(); }}
                      placeholder="输入孩子的名字"
                      autoFocus
                      className="text-sm rounded-xl border border-orange-400/40 px-3 py-2 outline-none focus:border-orange-500 bg-white/10 text-white w-36"
                    />
                    <button
                      onClick={confirmChildName}
                      disabled={!nameInputVal.trim()}
                      className="text-sm font-bold px-4 py-2 rounded-xl bg-orange-500 text-white disabled:opacity-40 active:opacity-70"
                    >确认</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl mb-2">🏀</div>
                  <div>暂无「{childName}」的比赛集锦</div>
                  {gamesWithEvents > 0 ? (
                    <div className="flex flex-col items-center gap-2 mt-2">
                      <div className="text-xs leading-relaxed text-orange-400">
                        检测到 {gamesWithEvents} 场比赛有精彩记录<br />
                        上传比赛视频，AI 自动生成精彩集锦
                      </div>
                      <button
                        onClick={() => setHlMode("upload")}
                        className="text-xs font-bold text-orange-500 border border-orange-300 px-4 py-1.5 rounded-full active:opacity-70"
                      >
                        📹 去上传视频
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs mt-1">教练生成集锦后，内容会出现在这里</div>
                  )}
                </>
              )}
            </div>
          )}
          {!loadingPlayerClips && playerClips && playerClips.length > 0 && (
            <div className="text-xs text-gray-400 -mt-1">
              {childName}的 {playerClips.length} 个精彩时刻 · 跨 {new Set(playerClips.map(c => c.gameId ?? c.gameLabel)).size} 场比赛
            </div>
          )}
          {!loadingPlayerClips && playerClips && playerClips.length > 0 && playerClips.map((clip, i) => (
            <div key={clip.id} className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{formatClipLabel(clip.label)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{fmtClipDate(clip.created_at)} · {clip.gameLabel}</div>
                </div>
                <button
                  onClick={() => setExpandedClipId(expandedClipId === clip.id ? null : clip.id)}
                  className="text-xs font-bold text-orange-600 bg-orange-500/15 px-3 py-1.5 rounded-full active:opacity-70 shrink-0"
                >
                  {expandedClipId === clip.id ? "▾ 收起" : "▶ 播放"}
                </button>
              </div>
              {expandedClipId === clip.id && (
                <>
                  <video src={clip.public_url} controls playsInline className="w-full rounded-xl" />
                  <button
                    onClick={async () => {
                      const title = childName ? `${childName}的精彩集锦` : "精彩集锦";
                      if ("share" in navigator) {
                        try { await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ url: clip.public_url, title }); return; } catch {}
                      }
                      try { await navigator.clipboard.writeText(clip.public_url); setClipShareUrl("copied:" + clip.public_url); return; } catch {}
                      setClipShareUrl(clip.public_url);
                    }}
                    className="w-full py-2 rounded-xl text-xs font-bold text-orange-600 bg-orange-500/10 border border-orange-500/20 active:opacity-70 transition-opacity"
                  >
                    {clipShareUrl?.startsWith("copied:") && clipShareUrl.slice(7) === clip.public_url ? "✅ 链接已复制" : "📤 分享集锦给家人"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload mode form */}
      <div id="upload-section" />
      {(stage !== "idle" || hlMode === "upload") && (<>
      <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
        <div className="text-sm font-bold text-white mb-3">① 上传比赛视频</div>
        <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${videoFiles.length>0?"border-orange-400/40 bg-orange-500/10":"border-white/15 bg-white/5"}`}>
          <input type="file" accept="video/*" multiple className="hidden" onChange={handleVideoChange} disabled={isProcessing}/>
          {videoFiles.length>0?(
            <><span className="text-2xl">✅</span>
            <span className="text-sm font-medium text-orange-300 text-center">{videoFiles.length}段视频 · 点击添加更多</span>
            <span className="text-xs text-gray-400">最多5段，各取最精彩片段合并</span></>
          ):(
            <><span className="text-3xl text-gray-300">🎥</span>
            <span className="text-sm text-gray-500">点击选择视频（可多选）</span>
            <span className="text-xs text-gray-400">支持 MP4、MOV · 最多5段合并</span></>
          )}
        </label>
        {videoFiles.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {videoFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-orange-500/10 rounded-lg px-3 py-1.5">
                <span className="text-orange-300 font-medium truncate flex-1 mr-2">{f.name}</span>
                <span className="text-gray-400 shrink-0 mr-2">{(f.size/1024/1024).toFixed(1)}MB</span>
                <button
                  type="button"
                  onClick={() => setVideoFiles(prev => prev.filter((_, j) => j !== i))}
                  disabled={isProcessing}
                  className="text-gray-400 font-bold active:opacity-60"
                >✕</button>
              </div>
            ))}
            {formatWarn && (
              <div className="mt-1 flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 text-xs text-amber-300 leading-snug">
                {formatWarn}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
        <div className="text-sm font-bold text-white mb-1">② 上传球员参考照片</div>
        <div className="text-xs text-gray-400 mb-3">全身照效果最佳 · 按队服颜色识别（同队多人会同时追踪，号码识别暂不支持）</div>
        <label className={`flex flex-col items-center rounded-xl border-2 border-dashed cursor-pointer overflow-hidden ${photoFile?"border-orange-400/40 bg-orange-500/10":"border-white/15 bg-white/5 p-6"}`}>
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={isProcessing}/>
          {photoPreview?(
            <>
              <img src={photoPreview} alt="参考照片" className="w-full object-contain" style={{maxHeight:220}}/>
              <div className="w-full flex items-center justify-between px-3 py-2 bg-orange-500/10 border-t border-orange-500/20">
                <span className="text-xs font-medium text-orange-300 truncate flex-1 mr-2">{photoFile?.name}</span>
                <span className="text-xs text-gray-400 shrink-0">点击更换</span>
              </div>
            </>
          ):(
            <div className="flex flex-col items-center gap-2 py-3">
              <span className="text-3xl text-gray-300">🏀</span>
              <span className="text-sm text-gray-500">点击选择球员照片</span>
            </div>
          )}
        </label>
        <div className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-gray-400">
          <span className="shrink-0">🔒</span>
          <span>照片仅用于在视频中识别该球员，处理后不作他用。请确保已征得孩子监护人同意。<span className="text-gray-500">本地处理模式下，视频与照片全程不离开你的设备。</span></span>
        </div>
      </div>

      <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur px-4 py-3">
        <button onClick={()=>{ if(bgmEnabled) setBgmUserFile(null); setBgmEnabled(v=>!v); }} disabled={isProcessing}
          className="flex items-center gap-3 w-full text-left">
          <div className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${bgmEnabled?"bg-orange-500":"bg-white/15"}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${bgmEnabled?"translate-x-5":"translate-x-0.5"}`}/>
          </div>
          <div>
            <div className="text-sm font-bold text-white">添加运动BGM 🎵</div>
            <div className="text-xs text-gray-400">{bgmEnabled?"将替换原声，配上节奏感音乐":"保留视频原声"}</div>
          </div>
        </button>
        {bgmEnabled&&!isProcessing&&(
          <label className="mt-3 flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-2">
            <input type="file" accept="audio/*,.mp3,.m4a,.aac" className="hidden" onChange={handleBgmFileChange}/>
            <span className="text-base shrink-0">🎵</span>
            {bgmUserFile
              ? <span className={`text-xs font-medium truncate flex-1 ${bgmUserFile.size > 3*1024*1024 ? "text-red-500" : "text-orange-600"}`}>
                  {bgmUserFile.name}{bgmUserFile.size > 3*1024*1024 ? `（${(bgmUserFile.size/1024/1024).toFixed(0)}MB 超限，将用内置节拍）` : ""}
                </span>
              : <span className="text-xs text-gray-400 flex-1">自定义音乐（可选，≤3MB）· 留空用内置节拍</span>
            }
            {bgmUserFile&&(
              <button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();setBgmUserFile(null);}}
                className="text-gray-400 text-sm shrink-0 leading-none">✕</button>
            )}
          </label>
        )}
      </div>

      {videoDuration > 60 && !isProcessing && (
        <div className="flex items-center gap-2 px-1 text-xs text-amber-400">
          <span className="shrink-0">⏱</span>
          <span>预计处理时间：{Math.round(videoDuration / 10)}–{Math.round(videoDuration / 5)} 秒（视频 {Math.round(videoDuration)} 秒）</span>
        </div>
      )}

      {/* Processing mode selector */}
      {!isProcessing && (
        <div className="flex flex-col gap-1.5">
          {!serverCheckDoneRef.current && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 px-1">
              <div className="w-3 h-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin shrink-0" />
              <span>正在检测最优处理方式…</span>
            </div>
          )}
          <div className="flex rounded-xl bg-white/5 p-0.5 gap-0.5">
            <button
              onClick={() => setProcMode("server")}
              disabled={serverCheckDoneRef.current && serverOkRef.current === false}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors flex flex-col items-center gap-0.5
                ${serverCheckDoneRef.current && serverOkRef.current === false
                  ? "opacity-40 cursor-not-allowed text-gray-400"
                  : procMode === "server" ? "bg-orange-500 text-white shadow-sm" : "text-gray-400"}`}
            >
              <span className="flex items-center gap-1">
                ☁️ 服务端处理
                {serverCheckDoneRef.current && (
                  <span className={`w-1.5 h-1.5 rounded-full ${serverOkRef.current ? "bg-green-500" : "bg-red-400"}`} />
                )}
              </span>
              <span className="font-normal opacity-70">
                {serverCheckDoneRef.current && serverOkRef.current === false ? "暂不可用" : "快速 · 后台运行 · 云端链接"}
              </span>
            </button>
            <button
              onClick={() => setProcMode("client")}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors flex flex-col items-center gap-0.5 ${procMode === "client" ? "bg-white/15 text-white shadow-sm" : "text-gray-400"}`}
            >
              <span>📱 本地处理</span>
              <span className="font-normal opacity-70">离线可用 · 保存到手机</span>
            </button>
          </div>
        </div>
      )}

      <button onClick={run} disabled={!canRun}
        className={`w-full py-4 rounded-2xl text-base font-bold shadow transition-all ${canRun?"bg-orange-500 text-white active:scale-95":"bg-white/5 text-gray-400 cursor-not-allowed"}`}>
        {isProcessing ? "处理中…" : (videoFiles.length>0 && photoFile) ? `✨ 开始生成集锦${videoFiles.length>1?`（${videoFiles.length}段合并）`:""}` : (videoFiles.length>0 && !photoFile) ? "还差球员照片 ②" : (videoFiles.length===0 && photoFile) ? "还差比赛视频 ①" : "✨ 开始生成集锦"}
      </button>

      {isProcessing&&(
        <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className={`text-sm font-medium flex-1 mr-2 ${stage === "analyzing" ? "text-orange-400" : "text-gray-200"}`}>{statusMsg}</span>
            <span className="text-sm font-bold text-orange-500 shrink-0">{progress}%</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: stage === "done"
                  ? "linear-gradient(90deg, #22c55e, #4ade80)"
                  : "linear-gradient(to right, #fb923c, #fbbf24)"
              }}
            />
          </div>
          {stage === "analyzing" && analyzeElapsed > 5 && (
            <div className="text-xs text-orange-400 text-center">⏱ 已用时 {analyzeElapsed}s，视频越长等待越久，请耐心等待</div>
          )}
          <div className="text-xs text-gray-400 text-center">
            {procMode === "client" ? "全程本地处理，视频不会上传服务器" : "视频上传后台处理，可切换到其他页面"}
          </div>
        </div>
      )}

      {stage==="error"&&error&&(
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4">
          <div className="text-sm font-bold text-red-300 mb-1">处理失败</div>
          <div className="text-xs text-red-300 break-all">{error}</div>
          <button onClick={()=>{setStage("idle");setError(null);setProgress(0);}} className="mt-3 text-sm text-red-300 underline">重试</button>
        </div>
      )}
      </>)} {/* end upload mode wrapper */}

      {stage==="done"&&serverUrl&&(
        <div className="rounded-2xl bg-white/10 border border-orange-500/25 backdrop-blur p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-white">🎉 {childName ? `${childName}的` : ""}集锦已生成！</div>
          {statusMsg && <div className="text-xs text-orange-500 -mt-1">{statusMsg}</div>}
          <video src={serverUrl} controls playsInline className="w-full rounded-xl bg-black" style={{maxHeight:280}}/>
          <button
            onClick={async () => {
              if ("share" in navigator) {
                try { await (navigator as any).share({ url: serverUrl, title: `${childName || ""}的精彩集锦` }); return; } catch {}
              }
              try { await navigator.clipboard.writeText(serverUrl); setClipShareUrl("copied:" + serverUrl); } catch { setClipShareUrl(serverUrl); }
            }}
            className="w-full py-3 rounded-xl bg-orange-500 text-white text-sm font-bold text-center active:scale-95 transition-transform"
          >
            📤 分享集锦给家人
          </button>
          <a href={serverUrl} target="_blank" rel="noopener noreferrer"
            className="w-full py-2.5 rounded-xl border border-white/15 text-gray-300 text-sm font-bold text-center block active:opacity-70">
            🔗 在浏览器中打开（可长按保存）
          </a>
          <div className="text-xs text-green-400 text-center font-medium">✅ 视频已永久保存到云端，随时可分享</div>
          <button onClick={()=>{setStage("idle");setProgress(0);setResultUrl(null);setResultBlob(null);setResultDur(0);setServerUrl(null);setFeedbackRating(0);setFeedbackTypes([]);setFeedbackDone(false);setCaptionCopied(false);setCaptionFallback(null);setCloudUrl(null);setCloudUploading(false);setVideoFiles([]);setFormatWarn(null);}} className="text-sm text-gray-400 text-center">重新制作</button>
        </div>
      )}

      {stage==="done"&&resultUrl&&(
        <div className="rounded-2xl bg-white/10 border border-orange-500/25 backdrop-blur p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-white">🎉 {childName ? `${childName}的` : ""}集锦已生成！</div>
          {statusMsg && <div className="text-xs text-orange-500 -mt-1">{statusMsg}</div>}
          <video src={resultUrl} controls playsInline className="w-full rounded-xl bg-black" style={{maxHeight:280}}/>
          {resultBlob && !isWeChat && "share" in navigator && (
            <button
              onClick={async () => {
                try {
                  const file = new File([resultBlob], resultName, { type: "video/mp4" });
                  if (navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], title: "精彩集锦" });
                  }
                } catch (e) {
                  if (e instanceof Error && e.name !== "AbortError") {
                    // silent fallback — download button remains available
                  }
                }
              }}
              className="w-full py-3 rounded-xl bg-orange-500 text-white text-sm font-bold text-center active:scale-95 transition-transform"
            >
              📤 分享集锦视频
            </button>
          )}
          {!isWeChat && (
            <a href={resultUrl} download={resultName}
              className={`w-full py-3 rounded-xl text-sm font-bold text-center block ${resultBlob && "share" in navigator ? "border border-white/15 text-gray-300" : "bg-orange-500 text-white"}`}>
              ⬇️ 下载集锦视频
            </a>
          )}
          {isWeChat && (
            <div className="rounded-xl p-3 flex flex-col gap-2" style={{background:"linear-gradient(135deg,#fff3e0,#ffe0b2)",border:"1px solid rgba(249,115,22,0.25)"}}>
              <div className="text-xs font-black text-orange-300">📱 微信内保存视频</div>
              {cloudUrl ? (
                <>
                  <div className="text-xs text-green-300 font-medium">✅ 已上传到云端，可直接分享链接</div>
                  <button
                    onClick={async () => {
                      try { await (navigator as any).share?.({ url: cloudUrl, title: "精彩集锦" }); return; } catch {}
                      try { await navigator.clipboard.writeText(cloudUrl); setClipShareUrl("copied:" + cloudUrl); } catch { setClipShareUrl(cloudUrl); }
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-white text-center"
                    style={{ background: "linear-gradient(135deg,#f7971e,#ffd200)" }}
                  >
                    📤 分享云端链接给家人
                  </button>
                  <div className="text-xs text-gray-500 text-center">对方点链接即可观看并保存</div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5 text-xs text-orange-300">
                    <div className="flex items-start gap-1.5"><span className="font-black shrink-0 text-orange-500">方法①</span><span>长按上方视频 → 点「保存视频」→ 存到相册</span></div>
                    <div className="flex items-start gap-1.5"><span className="font-black shrink-0 text-orange-500">方法②</span><span>上传到云端，生成可分享链接（推荐）</span></div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!resultBlob) return;
                      setCloudUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append("video", resultBlob, resultName);
                        fd.append("name", resultName);
                        const resp = await fetch("/api/highlights/upload", { method: "POST", body: fd });
                        const json = await resp.json();
                        if (json.url) setCloudUrl(json.url);
                        else throw new Error(json.error || "upload failed");
                      } catch (e) {
                        alert("上传失败，请检查网络后重试");
                      } finally {
                        setCloudUploading(false);
                      }
                    }}
                    disabled={cloudUploading}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold text-center transition-opacity ${cloudUploading ? "opacity-50 cursor-not-allowed" : "active:opacity-70"}`}
                    style={{ background: "linear-gradient(135deg,#f7971e,#ffd200)", color: "#7C3810" }}
                  >
                    {cloudUploading ? "☁️ 上传中…" : "☁️ 上传云端 · 生成分享链接"}
                  </button>
                </>
              )}
            </div>
          )}
          <button
            onClick={async () => {
              const dur = resultDur > 0 ? resultDur : HIGHLIGHT_S;
              const today = new Date();
              const dateStr = `${today.getMonth()+1}月${today.getDate()}日`;
              const caption = `🏀 ${childName ? childName + "的精彩集锦！" : "精彩集锦！"}${dur}秒精彩瞬间 🔥\n📅 ${dateStr} · 来自「我耀成长」`;
              try {
                await navigator.clipboard.writeText(caption);
                setCaptionCopied(true);
                setTimeout(() => setCaptionCopied(false), 2000);
              } catch {
                setCaptionFallback(caption);
              }
            }}
            className="w-full py-2.5 rounded-xl text-sm font-bold border active:opacity-80 transition-colors"
            style={{ borderColor: captionCopied ? "rgba(34,197,94,0.4)" : "rgba(249,115,22,0.4)", color: captionCopied ? "#16a34a" : "#F97316", background: captionCopied ? "rgba(34,197,94,0.06)" : "rgba(249,115,22,0.06)" }}
          >
            {captionCopied ? "✅ 配文已复制！粘贴到微信群" : "📋 复制配文 · 发给家人群"}
          </button>
          <button onClick={()=>{setStage("idle");setProgress(0);setResultUrl(null);setResultBlob(null);setResultDur(0);setServerUrl(null);setFeedbackRating(0);setFeedbackTypes([]);setFeedbackDone(false);setCaptionCopied(false);setCaptionFallback(null);setCloudUrl(null);setCloudUploading(false);setVideoFiles([]);setFormatWarn(null);}} className="text-sm text-gray-400 text-center">重新制作</button>
          <Link href="/parent/profile/stu-001" className="w-full py-2.5 rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-300 text-sm font-bold text-center block active:scale-95 transition-transform">
            {childName ? `📊 查看${childName}的成长档案` : "📊 查看孩子的成长档案"}
          </Link>
          <div className="border-t border-white/10 pt-3 flex flex-col gap-2">
            {!feedbackDone ? (<>
              <div className="text-xs font-bold text-gray-300">集锦效果怎么样？</div>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(s=>(
                  <button key={s} onClick={()=>setFeedbackRating(s)}
                    className={`text-xl transition-transform active:scale-90 ${feedbackRating>=s?"opacity-100":"opacity-30"}`}>⭐</button>
                ))}
              </div>
              {feedbackRating>0&&feedbackRating<=3&&(
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="text-xs text-gray-500">哪里有问题？（可多选）</div>
                  {["进度卡死","球员识别错误","剪辑位置不准","下载失败","其他"].map(t=>(
                    <label key={t} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={feedbackTypes.includes(t)}
                        onChange={e=>setFeedbackTypes(p=>e.target.checked?[...p,t]:p.filter(x=>x!==t))}/>
                      {t}
                    </label>
                  ))}
                </div>
              )}
              {feedbackRating>0&&(
                <button onClick={()=>{
                  const entry={time:new Date().toISOString(),rating:feedbackRating,types:feedbackTypes,video:videoFiles[0]?.name||""};
                  try{const prev=JSON.parse(localStorage.getItem("highlight_feedback")||"[]");localStorage.setItem("highlight_feedback",JSON.stringify([...prev,entry]));localStorage.setItem("tester_badge","true");}catch{}
                  setFeedbackDone(true);
                }} className="self-start px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-300 text-xs font-bold">
                  提交反馈
                </button>
              )}
            </>) : (
              <div className="flex flex-col items-center gap-1">
                <div className="text-xs text-center text-green-400 font-medium">✅ 感谢反馈，帮助我们持续改进！</div>
                <div className="text-xs text-center text-orange-600 font-bold">🏅 测试员徽章已解锁</div>
              </div>
            )}
          </div>
        </div>
      )}

      {stage==="idle"&&myHighlights.length>0&&(
        <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
          <div className="text-sm font-bold text-white mb-2">📼 历史集锦</div>
          <div className="flex flex-col">
            {myHighlights.map((hl,i)=>(
              <div key={i} className="flex items-center justify-between py-2.5 border-t border-white/5 first:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium truncate">{hl.name.replace(/\.[^.]+$/,"")}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{(() => { const d = new Date(hl.date); const now = new Date(); const hhmm = `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`; const diff = Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime() - new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()) / 86400000); return diff === 0 ? `今天 ${hhmm}` : diff === 1 ? `昨天 ${hhmm}` : diff <= 7 ? `${diff}天前 ${hhmm}` : `${d.getMonth()+1}/${d.getDate()} ${hhmm}`; })()} · {hl.dur}秒</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button
                    className="text-xs text-orange-500 font-medium active:opacity-60 transition-opacity"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  >重新生成 →</button>
                  <button
                    className="text-gray-300 text-sm active:opacity-60 transition-opacity"
                    onClick={() => {
                      const next = myHighlights.filter((_,j) => j !== i);
                      setMyHighlights(next);
                      try { localStorage.setItem("my_highlights", JSON.stringify(next)); } catch {}
                    }}
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-white/5">本地生成的视频不会保存，可随时重新生成</div>
        </div>
      )}

      {stage==="idle"&&(
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
          <div className="text-xs font-bold text-amber-800 mb-2">📸 拍照小贴士 · 效果更好</div>
          <ul className="flex flex-col gap-1.5 text-xs text-amber-300">
            <li>👕 <b>全身入镜</b>：要能看到球衣 + 短裤，颜色越完整识别越准</li>
            <li>☀️ <b>光线充足</b>：避免逆光或阴影遮住球衣颜色</li>
            <li>🧍 <b>单独一人</b>：不要和其他队员挤在一起，避免误识别</li>
            <li>📅 <b>当天照片</b>：和比赛视频同一套队服，颜色最匹配</li>
          </ul>
        </div>
      )}
    </div>

      {/* Fallback sheet for clip URL share (WeChat / restricted env) */}
      {clipShareUrl !== null && !clipShareUrl.startsWith("copied:") && (
        <div className="fixed inset-0 z-[60] flex items-end" style={{ background: "rgba(0,0,0,0.72)" }}>
          <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
            <div className="text-sm font-bold text-white mb-1">🔗 集锦链接</div>
            <div className="text-xs text-gray-500 mb-3">长按下方链接 → 全选 → 复制，粘贴到微信群分享</div>
            <textarea
              readOnly
              value={clipShareUrl}
              className="w-full rounded-xl text-xs text-gray-300 p-3 resize-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", height: 60, fontFamily: "monospace" }}
              onFocus={e => e.target.select()}
            />
            <button onClick={() => setClipShareUrl(null)} className="w-full mt-3 py-3 rounded-xl border border-white/15 text-sm text-gray-400">
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Fallback sheet for caption copy (WeChat / restricted clipboard) */}
      {captionFallback !== null && (
        <div className="fixed inset-0 z-[60] flex items-end" style={{ background: "rgba(0,0,0,0.72)" }}>
          <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
            <div className="text-sm font-bold text-white mb-1">📋 配文</div>
            <div className="text-xs text-gray-500 mb-3">长按下方文字 → 全选 → 复制，分享视频时粘贴</div>
            <textarea
              readOnly
              value={captionFallback}
              className="w-full rounded-xl text-xs text-gray-300 p-3 resize-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", height: 80, fontFamily: "monospace" }}
              onFocus={e => e.target.select()}
            />
            <button onClick={() => setCaptionFallback(null)} className="w-full mt-3 py-3 rounded-xl border border-white/15 text-sm text-gray-400">
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
}

