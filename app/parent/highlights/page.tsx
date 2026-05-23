"use client";

import { useRef, useState, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RGBColor { r: number; g: number; b: number }
// Alias kept for backwards compat within file
type JerseyColor = RGBColor;

interface PlayerSignature {
  jersey: RGBColor;
  shoe: RGBColor;
  hasShoe: boolean;  // false if shoe region is too uniform/ambiguous to use
}

interface FrameScore {
  t: number;
  hasPlayer: boolean;
  ballNear: boolean;
  playerX: number;
  playerY: number;
  score: number;
}

type Stage =
  | "idle"
  | "loading_ffmpeg"
  | "extracting_color"
  | "analyzing"
  | "cutting"
  | "done"
  | "error";

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_FPS    = 1;    // 1 frame per second — fast & reliable on mobile
const SAMPLE_W      = 240;  // analysis width (px) — smaller = faster on mobile
const JERSEY_THRESH = 55;   // jersey color match threshold (per channel)
const HIGHLIGHT_S   = 15;   // output clip length
const MOTION_THRESH = 30;   // frame-diff threshold to count pixel as moving
const SEEK_TIMEOUT  = 6000; // ms — give up waiting for seeked event after this

// ── Color helpers ─────────────────────────────────────────────────────────────

function colorDist(r: number, g: number, b: number, ref: JerseyColor) {
  return (Math.abs(r - ref.r) + Math.abs(g - ref.g) + Math.abs(b - ref.b)) / 3;
}

function avgColor(data: Uint8ClampedArray, excludeSkin = false): RGBColor {
  let rSum = 0, gSum = 0, bSum = 0, cnt = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (excludeSkin && r > 140 && r > g * 1.3 && r > b * 1.3) continue;
    rSum += r; gSum += g; bSum += b; cnt++;
  }
  if (cnt === 0) return { r: 128, g: 128, b: 128 };
  return { r: rSum / cnt, g: gSum / cnt, b: bSum / cnt };
}

function colorVariance(data: Uint8ClampedArray, avg: RGBColor): number {
  let v = 0, cnt = 0;
  for (let i = 0; i < data.length; i += 4) {
    v += colorDist(data[i], data[i+1], data[i+2], avg);
    cnt++;
  }
  return cnt ? v / cnt : 0;
}

function extractPlayerSignature(img: HTMLImageElement): PlayerSignature {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 200 / Math.max(img.naturalWidth, 1));
  canvas.width  = Math.round(img.naturalWidth  * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const W = canvas.width, H = canvas.height;

  // Jersey region: center 40% wide, top 15%–70% tall (torso)
  const jx1 = Math.floor(W * 0.30), jx2 = Math.floor(W * 0.70);
  const jy1 = Math.floor(H * 0.15), jy2 = Math.floor(H * 0.70);
  const jerseyData = ctx.getImageData(jx1, jy1, jx2-jx1, jy2-jy1).data;
  const jersey = avgColor(jerseyData, true);

  // Shoe region: center 60% wide, bottom 15% of image (feet)
  const sx1 = Math.floor(W * 0.20), sx2 = Math.floor(W * 0.80);
  const sy1 = Math.floor(H * 0.85), sy2 = H;
  const shoeData = ctx.getImageData(sx1, sy1, sx2-sx1, sy2-sy1).data;
  const shoe = avgColor(shoeData, false);

  // Discard shoe signal if too uniform (floor/background visible) or
  // if it's just the same as jersey (full-body uniform color edge case)
  const shoeVariance = colorVariance(shoeData, shoe);
  const shoeJerseyDist = colorDist(shoe.r, shoe.g, shoe.b, jersey);
  const hasShoe = shoeVariance < 60 && shoeJerseyDist > 20;

  return { jersey, shoe, hasShoe };
}

// ── Frame seek (with timeout for WKWebView/WeChat compatibility) ──────────────

function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); video.removeEventListener("seeked", done); resolve(); };
    // Timeout: if seeked never fires (WKWebView quirk), just continue anyway
    const timer = setTimeout(done, SEEK_TIMEOUT);
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

function drawFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
}

function getImageData(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
}

// ── Per-frame analysis ────────────────────────────────────────────────────────
// Dimensions used to identify the target player:
//   1. Jersey color match (primary)
//   2. Shoe color match — sampled below the jersey blob centroid
//   3. Spatial continuity — prefer blobs near last known position
//   4. Blob compactness — loose/scattered matches are noise, not a jersey
// Ball proximity detected via frame-diff motion blobs near player.

function analyzeFrame(
  curr: ImageData,
  prev: ImageData | null,
  sig: PlayerSignature,
  w: number,
  h: number,
  prevPlayerX: number,
  prevPlayerY: number,
): FrameScore {
  const d = curr.data;
  const jerseyColor = sig.jersey;

  // ── 1. Find all jersey-colored pixels ──────────────────────────────────────
  const match = new Uint8Array(w * h);
  let totalMatch = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (colorDist(d[i], d[i + 1], d[i + 2], jerseyColor) < JERSEY_THRESH) {
        match[y * w + x] = 1;
        totalMatch++;
      }
    }
  }

  if (totalMatch < 20) {
    return { t: 0, hasPlayer: false, ballNear: false, playerX: -1, playerY: -1, score: 0 };
  }

  // ── 2. BFS: find connected blobs of matching pixels ────────────────────────
  type Blob = { cx: number; cy: number; size: number; spread: number };
  const visited = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const queue: number[] = [];

  for (let i = 0; i < w * h; i++) {
    if (!match[i] || visited[i]) continue;
    queue.length = 0;
    queue.push(i);
    visited[i] = 1;
    let sx = 0, sy = 0, sz = 0, head = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const bx = idx % w, by = Math.floor(idx / w);
      sx += bx; sy += by; sz++;
      if (bx < minX) minX = bx; if (bx > maxX) maxX = bx;
      if (by < minY) minY = by; if (by > maxY) maxY = by;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (!match[ni] || visited[ni]) continue;
        visited[ni] = 1; queue.push(ni);
      }
    }
    if (sz >= 15) {
      const spread = ((maxX - minX + 1) * (maxY - minY + 1)) / sz;
      blobs.push({ cx: sx / sz, cy: sy / sz, size: sz, spread });
    }
  }

  if (blobs.length === 0) {
    return { t: 0, hasPlayer: false, ballNear: false, playerX: -1, playerY: -1, score: 0 };
  }

  // ── 3. Score each blob: size + compactness + shoe match + temporal proximity ─
  let best = blobs[0], bestScore = -Infinity;
  const playerHeight = Math.sqrt(blobs[0].size) * 3; // rough estimate

  for (const b of blobs) {
    let s = b.size - b.spread * 0.5;   // larger & more compact = better

    // Shoe color cross-validation: sample pixels ~1 player-height below jersey centroid
    if (sig.hasShoe) {
      const shoeY = Math.min(h - 1, Math.round(b.cy + playerHeight * 0.8));
      const shoeX = Math.round(b.cx);
      // Sample a small patch around the expected shoe position
      let shoeMatch = 0, shoeCnt = 0;
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const nx = shoeX + dx, ny = shoeY + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const pi = (ny * w + nx) * 4;
          if (colorDist(d[pi], d[pi+1], d[pi+2], sig.shoe) < JERSEY_THRESH) shoeMatch++;
          shoeCnt++;
        }
      }
      const shoeRatio = shoeCnt ? shoeMatch / shoeCnt : 0;
      s += shoeRatio * 60;   // up to +60 bonus for shoe match
    }

    // Temporal continuity: prefer blob near last known position
    if (prevPlayerX >= 0) {
      const dist = Math.hypot(b.cx - prevPlayerX, b.cy - prevPlayerY);
      s += Math.max(0, 80 - dist);
    }
    if (s > bestScore) { bestScore = s; best = b; }
  }

  const playerX = best.cx, playerY = best.cy;
  const playerR = Math.sqrt(best.size / Math.PI) * 1.8;

  // ── 4. Ball proximity via frame-diff motion blobs ─────────────────────────
  let ballNear = false;
  if (prev) {
    const pd = prev.data;
    const motion = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const pi = i * 4;
      const diff = Math.abs(d[pi]-pd[pi]) + Math.abs(d[pi+1]-pd[pi+1]) + Math.abs(d[pi+2]-pd[pi+2]);
      motion[i] = diff > MOTION_THRESH * 3 ? 1 : 0;
    }

    const vis2 = new Uint8Array(w * h);
    const q2: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (!motion[i] || vis2[i]) continue;
      q2.length = 0; q2.push(i); vis2[i] = 1;
      let sx = 0, sy = 0, sz = 0, head = 0;
      while (head < q2.length) {
        const idx = q2[head++];
        const bx = idx % w, by = Math.floor(idx / w);
        sx += bx; sy += by; sz++;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = bx + dx, ny = by + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (!motion[ni] || vis2[ni]) continue;
          vis2[ni] = 1; q2.push(ni);
        }
      }
      // Ball-sized blob: small (not a running player), near player but outside silhouette
      if (sz >= 4 && sz <= 800) {
        const cx = sx / sz, cy = sy / sz;
        const dist = Math.hypot(cx - playerX, cy - playerY);
        if (dist > playerR * 0.5 && dist < playerR * 4) {
          ballNear = true;
        }
      }
    }
  }

  const score = ballNear ? 1.0 : 0.3;
  return { t: 0, hasPlayer: true, ballNear, playerX, playerY, score };
}

function findBestWindow(scores: FrameScore[], totalDuration: number): [number, number] {
  const windowFrames = Math.max(1, Math.floor(HIGHLIGHT_S * SAMPLE_FPS));
  if (scores.length <= windowFrames) return [0, Math.min(totalDuration, HIGHLIGHT_S)];

  let bestSum = -1, bestStart = 0, windowSum = 0;
  for (let i = 0; i < scores.length; i++) {
    windowSum += scores[i].score;
    if (i >= windowFrames) windowSum -= scores[i - windowFrames].score;
    if (i >= windowFrames - 1 && windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = i - windowFrames + 1;
    }
  }

  const startT = Math.max(0, scores[bestStart].t - 0.5);
  const endT   = Math.min(totalDuration, startT + HIGHLIGHT_S);
  return [startT, endT];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HighlightsPage() {
  const [videoFile,    setVideoFile]    = useState<File | null>(null);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [stage,        setStage]        = useState<Stage>("idle");
  const [progress,     setProgress]     = useState(0);
  const [statusMsg,    setStatusMsg]    = useState("");
  const [resultUrl,    setResultUrl]    = useState<string | null>(null);
  const [resultName,   setResultName]   = useState("highlight.mp4");
  const [error,        setError]        = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);

  const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) setVideoFile(f);
  }, []);

  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }, []);

  const run = useCallback(async () => {
    if (!videoFile || !photoFile) return;
    setError(null); setResultUrl(null);

    try {
      // ── Step 1: Load FFmpeg (self-hosted, same origin) ────────────────────
      setStage("loading_ffmpeg"); setProgress(2);
      setStatusMsg("加载视频处理引擎…（首次约30秒）");

      if (!ffmpegRef.current) {
        const ff = new FFmpeg();
        await ff.load({
          coreURL: "/ffmpeg/ffmpeg-core.js",
          wasmURL: "/ffmpeg/ffmpeg-core.wasm",
        });
        ffmpegRef.current = ff;
      }
      setProgress(12);

      // ── Step 2: Extract jersey color ──────────────────────────────────────
      setStage("extracting_color"); setStatusMsg("分析球员球衣颜色…");
      const photoUrl = URL.createObjectURL(photoFile);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("无法加载参考照片"));
        img.src = photoUrl;
      });
      const sig = extractPlayerSignature(img);
      URL.revokeObjectURL(photoUrl);
      setProgress(20);

      // ── Step 3: Analyze video frames ──────────────────────────────────────
      setStage("analyzing"); setStatusMsg("扫描视频…");

      const videoUrl = URL.createObjectURL(videoFile);
      // Append to DOM — required for reliable seeking on some mobile browsers
      const video = document.createElement("video");
      video.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      document.body.appendChild(video);

      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res();
        video.onerror = () => rej(new Error("无法加载视频"));
        video.src = videoUrl;
      });

      const duration  = video.duration;
      const aspect    = video.videoWidth / Math.max(video.videoHeight, 1);
      const sampleH   = Math.round(SAMPLE_W / aspect);
      const totalSamples = Math.ceil(duration * SAMPLE_FPS);

      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_W; canvas.height = sampleH;

      const scores: FrameScore[] = [];
      let prevFrame: ImageData | null = null;
      let prevPX = -1, prevPY = -1;

      for (let i = 0; i < totalSamples; i++) {
        const t = i / SAMPLE_FPS;
        await seekVideo(video, t);
        drawFrame(video, canvas);
        const currFrame = getImageData(canvas);

        const fs = analyzeFrame(currFrame, prevFrame, sig, SAMPLE_W, sampleH, prevPX, prevPY);
        fs.t = t;
        scores.push(fs);

        if (fs.hasPlayer) { prevPX = fs.playerX; prevPY = fs.playerY; }
        prevFrame = currFrame;

        setProgress(20 + Math.round((i / totalSamples) * 55));
        if (i % 5 === 0) setStatusMsg(`扫描视频 ${Math.round(t)}s / ${Math.round(duration)}s…`);
      }

      document.body.removeChild(video);
      URL.revokeObjectURL(videoUrl);

      // ── Step 4: Best window ───────────────────────────────────────────────
      const [startT, endT] = findBestWindow(scores, duration);
      setProgress(78);
      setStatusMsg(`精彩片段：${startT.toFixed(1)}s – ${endT.toFixed(1)}s，正在剪辑…`);

      // ── Step 5: FFmpeg cut ─────────────────────────────────────────────────
      setStage("cutting");
      const ff = ffmpegRef.current!;

      ff.on("progress", ({ progress: p }) => setProgress(78 + Math.round(p * 20)));

      await ff.writeFile("input.mp4", await fetchFile(videoFile));
      await ff.exec([
        "-ss", startT.toFixed(3),
        "-i",  "input.mp4",
        "-t",  (endT - startT).toFixed(3),
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-vf",  "scale=720:-2",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        "-y", "highlight.mp4",
      ]);

      const data = await ff.readFile("highlight.mp4");
      const raw  = data as Uint8Array;
      const copy = new Uint8Array(raw.length);
      copy.set(raw);
      const blob = new Blob([copy.buffer], { type: "video/mp4" });

      await ff.deleteFile("input.mp4");
      await ff.deleteFile("highlight.mp4");

      setResultUrl(URL.createObjectURL(blob));
      setResultName(videoFile.name.replace(/\.[^.]+$/, "") + "_highlight.mp4");
      setStage("done"); setProgress(100); setStatusMsg("集锦生成完成！");

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }, [videoFile, photoFile]);

  const isProcessing = ["loading_ffmpeg", "extracting_color", "analyzing", "cutting"].includes(stage);
  const canRun = !!(videoFile && photoFile && !isProcessing);

  return (
    <div className="pb-16 flex flex-col gap-5">
      {/* Header */}
      <div className="rounded-3xl p-5 shadow-lg" style={{ background: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)" }}>
        <div className="text-2xl font-black mb-1" style={{ color: "#7C3810" }}>🎬 生成精彩集锦</div>
        <p className="text-sm" style={{ color: "#7C3810", opacity: 0.85 }}>
          上传比赛视频 + 球员照片，自动剪辑有球精彩片段（约15秒），全程本地处理不上传服务器。
        </p>
      </div>

      {/* Step 1 — Video */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-bold text-gray-700 mb-3">① 上传比赛视频</div>
        <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${videoFile ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-gray-50"}`}>
          <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} disabled={isProcessing} />
          {videoFile ? (
            <>
              <span className="text-2xl">✅</span>
              <span className="text-sm font-medium text-orange-700 text-center break-all">{videoFile.name}</span>
              <span className="text-xs text-gray-400">{(videoFile.size / 1024 / 1024).toFixed(1)} MB · 点击更换</span>
            </>
          ) : (
            <>
              <span className="text-3xl text-gray-300">🎥</span>
              <span className="text-sm text-gray-500">点击选择视频文件</span>
              <span className="text-xs text-gray-400">支持 MP4、MOV 等格式</span>
            </>
          )}
        </label>
      </div>

      {/* Step 2 — Photo */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-bold text-gray-700 mb-1">② 上传球员参考照片</div>
        <div className="text-xs text-gray-400 mb-3">清晰显示球衣颜色的截图即可，识别依据：球衣色 + 位置连续性</div>
        <label className={`flex gap-4 items-center rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors ${photoFile ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-gray-50"}`}>
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={isProcessing} />
          {photoPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="参考照片" className="w-20 h-20 object-cover rounded-xl border border-orange-200 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-orange-700 break-all">{photoFile?.name}</div>
                <div className="text-xs text-gray-400 mt-1">点击更换</div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 w-full py-3">
              <span className="text-3xl text-gray-300">🏀</span>
              <span className="text-sm text-gray-500">点击选择球员照片</span>
            </div>
          )}
        </label>
      </div>

      {/* Run button */}
      <button
        onClick={run}
        disabled={!canRun}
        className={`w-full py-4 rounded-2xl text-base font-bold shadow transition-all ${canRun ? "bg-orange-500 text-white active:scale-95" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
      >
        {isProcessing ? "处理中…" : "✨ 开始生成集锦"}
      </button>

      {/* Progress */}
      {isProcessing && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 flex-1 mr-2">{statusMsg}</span>
            <span className="text-sm font-bold text-orange-500 shrink-0">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-yellow-400 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-gray-400 text-center">全程本地处理，视频不会上传服务器</div>
        </div>
      )}

      {/* Error */}
      {stage === "error" && error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
          <div className="text-sm font-bold text-red-700 mb-1">处理失败</div>
          <div className="text-xs text-red-600 break-all">{error}</div>
          <button onClick={() => { setStage("idle"); setError(null); setProgress(0); }} className="mt-3 text-sm text-red-600 underline">重试</button>
        </div>
      )}

      {/* Result */}
      {stage === "done" && resultUrl && (
        <div className="rounded-2xl bg-white border border-orange-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-gray-800">🎉 集锦已生成！</div>
          <video src={resultUrl} controls playsInline className="w-full rounded-xl bg-black" style={{ maxHeight: 280 }} />
          <a href={resultUrl} download={resultName} className="w-full py-3 rounded-xl bg-orange-500 text-white text-sm font-bold text-center block">下载集锦视频</a>
          <button onClick={() => { setStage("idle"); setProgress(0); setResultUrl(null); setVideoFile(null); setPhotoFile(null); setPhotoPreview(null); }} className="text-sm text-gray-400 text-center">重新制作</button>
        </div>
      )}

      {/* Tips */}
      {stage === "idle" && (
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
          <div className="text-xs font-bold text-blue-700 mb-2">使用提示</div>
          <ul className="flex flex-col gap-1.5 text-xs text-blue-600">
            <li>• 参考照片选球衣清晰、正面的截图，识别效果更好</li>
            <li>• 识别逻辑：球衣颜色 × 鞋子颜色 × 轮廓紧凑度 × 位置连续性四维交叉</li>
            <li>• 首次使用需下载约31MB引擎，建议WiFi操作</li>
            <li>• 5分钟视频约需1分钟处理时间</li>
            <li>• 全程不上传任何视频，隐私安全</li>
          </ul>
        </div>
      )}
    </div>
  );
}
