"use client";

import { useRef, useState, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JerseyColor { r: number; g: number; b: number }

interface FrameScore {
  t: number;        // timestamp in seconds
  hasPlayer: boolean;
  ballNear: boolean;
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

const SAMPLE_FPS   = 2;          // frames analyzed per second
const SAMPLE_W     = 320;        // analysis frame width (px)
const JERSEY_THRESH = 55;        // color distance threshold (0-255)
const BALL_MAX_PX  = 35;         // max radius of ball at sample res
const BALL_MIN_PX  = 6;          // min radius
const HIGHLIGHT_S  = 15;         // output duration in seconds
const MOTION_THRESH = 28;        // per-channel diff to count as motion

// ── Color helpers ─────────────────────────────────────────────────────────────

function colorDist(r: number, g: number, b: number, ref: JerseyColor) {
  return (Math.abs(r - ref.r) + Math.abs(g - ref.g) + Math.abs(b - ref.b)) / 3;
}

function extractJerseyColor(img: HTMLImageElement): JerseyColor {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 200 / Math.max(img.naturalWidth, 1));
  canvas.width  = Math.round(img.naturalWidth  * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Sample center 40% horizontally × top 70% vertically (jersey region)
  const x1 = Math.floor(canvas.width  * 0.30);
  const x2 = Math.floor(canvas.width  * 0.70);
  const y1 = Math.floor(canvas.height * 0.10);
  const y2 = Math.floor(canvas.height * 0.70);
  const w  = x2 - x1, h = y2 - y1;
  const data = ctx.getImageData(x1, y1, w, h).data;

  // Collect non-skin pixels (heuristic: avoid R>>G&&R>>B skin tones)
  let rSum = 0, gSum = 0, bSum = 0, cnt = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const isSkin = r > 140 && r > g * 1.3 && r > b * 1.3;
    if (!isSkin) { rSum += r; gSum += g; bSum += b; cnt++; }
  }
  if (cnt === 0) { rSum = 128; gSum = 128; bSum = 128; cnt = 1; }
  return { r: rSum / cnt, g: gSum / cnt, b: bSum / cnt };
}

// ── Frame extraction helpers ──────────────────────────────────────────────────

function drawVideoFrameToCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
) {
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}

function getImageData(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
}

function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = t;
  });
}

// ── Core analysis ─────────────────────────────────────────────────────────────

function analyzeFramePair(
  curr: ImageData,
  prev: ImageData | null,
  jerseyColor: JerseyColor,
  w: number,
  h: number
): FrameScore {
  const d = curr.data;

  // 1. Find player: accumulate jersey-colored pixels
  let pxSum = 0, pySum = 0, pCnt = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (colorDist(d[i], d[i + 1], d[i + 2], jerseyColor) < JERSEY_THRESH) {
        pxSum += x; pySum += y; pCnt++;
      }
    }
  }

  const hasPlayer = pCnt >= 30;
  const playerX = hasPlayer ? pxSum / pCnt : -1;
  const playerY = hasPlayer ? pySum / pCnt : -1;
  const playerR = hasPlayer ? Math.sqrt(pCnt / Math.PI) * 2 : 0;

  if (!hasPlayer || !prev) {
    return { t: 0, hasPlayer, ballNear: false, score: hasPlayer ? 0.2 : 0 };
  }

  // 2. Motion mask: find moving pixels
  const pd = prev.data;
  // Build list of "small moving blobs" (not overlapping player region)
  type Blob = { cx: number; cy: number; size: number };
  const visited = new Uint8Array(w * h);
  const blobs: Blob[] = [];

  // Quick motion flag per pixel
  const motion = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4;
    const diff =
      Math.abs(d[pi] - pd[pi]) +
      Math.abs(d[pi + 1] - pd[pi + 1]) +
      Math.abs(d[pi + 2] - pd[pi + 2]);
    motion[i] = diff > MOTION_THRESH * 3 ? 1 : 0;
  }

  // BFS flood-fill to find connected motion components
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!motion[i] || visited[i]) continue;
    queue.length = 0;
    queue.push(i);
    visited[i] = 1;
    let sx = 0, sy = 0, sz = 0;
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const bx = idx % w, by = Math.floor(idx / w);
      sx += bx; sy += by; sz++;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (!motion[ni] || visited[ni]) continue;
        visited[ni] = 1;
        queue.push(ni);
      }
    }
    if (sz >= BALL_MIN_PX && sz <= BALL_MAX_PX * BALL_MAX_PX * Math.PI) {
      blobs.push({ cx: sx / sz, cy: sy / sz, size: sz });
    }
  }

  // 3. Find smallest blob closest to player that's not overlapping player
  let bestDist = Infinity;
  for (const blob of blobs) {
    const distToPlayer = Math.hypot(blob.cx - playerX, blob.cy - playerY);
    // Skip if blob is inside player silhouette (too close, likely limb movement)
    if (distToPlayer < playerR * 0.8) continue;
    // Only care about blobs within 3 player-radii
    if (distToPlayer > playerR * 3.5) continue;
    // Prefer smaller blobs (ball-like)
    const score = distToPlayer / (blob.size + 1);
    if (score < bestDist) bestDist = score;
  }

  const ballNear = bestDist < Infinity && bestDist < playerR * 0.15;
  const score = ballNear ? 1.0 : hasPlayer ? 0.2 : 0;

  return { t: 0, hasPlayer, ballNear, score };
}

function findBestWindow(scores: FrameScore[], totalDuration: number): [number, number] {
  const windowFrames = Math.floor(HIGHLIGHT_S * SAMPLE_FPS);
  if (scores.length <= windowFrames) return [0, Math.min(totalDuration, HIGHLIGHT_S)];

  let bestSum = 0, bestStart = 0;
  let windowSum = 0;
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
  const [videoFile,  setVideoFile]  = useState<File | null>(null);
  const [photoFile,  setPhotoFile]  = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [stage,      setStage]      = useState<Stage>("idle");
  const [progress,   setProgress]   = useState(0);   // 0-100
  const [statusMsg,  setStatusMsg]  = useState("");
  const [resultUrl,  setResultUrl]  = useState<string | null>(null);
  const [resultName, setResultName] = useState("highlight.mp4");
  const [error,      setError]      = useState<string | null>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const photoRef  = useRef<HTMLImageElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setVideoFile(f);
  }, []);

  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const url = URL.createObjectURL(f);
    setPhotoPreview(url);
  }, []);

  const run = useCallback(async () => {
    if (!videoFile || !photoFile) return;
    setError(null);
    setResultUrl(null);

    try {
      // ── Step 1: Load FFmpeg ────────────────────────────────────────────────
      setStage("loading_ffmpeg");
      setProgress(2);
      setStatusMsg("加载视频处理引擎…（首次约30秒）");

      if (!ffmpegRef.current) {
        const ff = new FFmpeg();
        ff.on("progress", ({ progress: p }) => {
          if (stage === "cutting") setProgress(90 + Math.round(p * 9));
        });
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ff.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`,   "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        ffmpegRef.current = ff;
      }
      setProgress(12);

      // ── Step 2: Extract jersey color from reference photo ─────────────────
      setStage("extracting_color");
      setStatusMsg("分析球员球衣颜色…");

      const photoUrl = URL.createObjectURL(photoFile);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("无法加载参考照片"));
        img.src = photoUrl;
      });
      const jerseyColor = extractJerseyColor(img);
      URL.revokeObjectURL(photoUrl);
      setProgress(20);

      // ── Step 3: Analyze video frames ──────────────────────────────────────
      setStage("analyzing");
      setStatusMsg("扫描视频，寻找精彩时刻…");

      const videoUrl = URL.createObjectURL(videoFile);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res();
        video.onerror = () => rej(new Error("无法加载视频"));
        video.src = videoUrl;
      });

      const duration  = video.duration;
      const aspect    = video.videoWidth / video.videoHeight;
      const sampleH   = Math.round(SAMPLE_W / aspect);
      const totalSamples = Math.ceil(duration * SAMPLE_FPS);

      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_W; canvas.height = sampleH;

      const scores: FrameScore[] = [];
      let prevFrame: ImageData | null = null;

      for (let i = 0; i < totalSamples; i++) {
        const t = i / SAMPLE_FPS;
        await seekVideo(video, t);
        drawVideoFrameToCanvas(video, canvas);
        const currFrame = getImageData(canvas);

        const fs = analyzeFramePair(currFrame, prevFrame, jerseyColor, SAMPLE_W, sampleH);
        fs.t = t;
        scores.push(fs);

        prevFrame = currFrame;
        setProgress(20 + Math.round((i / totalSamples) * 55));
        if (i % 10 === 0) {
          setStatusMsg(`扫描视频 ${Math.round(t)}s / ${Math.round(duration)}s…`);
        }
      }

      video.src = "";
      URL.revokeObjectURL(videoUrl);

      // ── Step 4: Find best 15-second window ───────────────────────────────
      const [startT, endT] = findBestWindow(scores, duration);
      setProgress(78);
      setStatusMsg(`找到精彩片段：${startT.toFixed(1)}s – ${endT.toFixed(1)}s，正在剪辑…`);

      // ── Step 5: Cut with FFmpeg ───────────────────────────────────────────
      setStage("cutting");

      const ff = ffmpegRef.current!;
      const inputName  = "input.mp4";
      const outputName = "highlight.mp4";

      await ff.writeFile(inputName, await fetchFile(videoFile));

      await ff.exec([
        "-ss",  startT.toFixed(3),
        "-i",   inputName,
        "-t",   (endT - startT).toFixed(3),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-vf",  "scale=720:-2",
        "-c:a", "aac",
        "-b:a", "96k",
        "-movflags", "+faststart",
        "-y",   outputName,
      ]);

      const data = await ff.readFile(outputName);
      // Copy to plain ArrayBuffer to satisfy TypeScript's Blob type
      const raw  = data as Uint8Array;
      const copy = new Uint8Array(raw.length);
      copy.set(raw);
      const blob = new Blob([copy.buffer], { type: "video/mp4" });
      const url  = URL.createObjectURL(blob);

      await ff.deleteFile(inputName);
      await ff.deleteFile(outputName);

      const baseName = videoFile.name.replace(/\.[^.]+$/, "");
      setResultName(`${baseName}_highlight.mp4`);
      setResultUrl(url);
      setStage("done");
      setProgress(100);
      setStatusMsg("集锦生成完成！");

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }, [videoFile, photoFile, stage]);

  const isProcessing = ["loading_ffmpeg", "extracting_color", "analyzing", "cutting"].includes(stage);
  const canRun = videoFile && photoFile && !isProcessing;

  return (
    <div className="pb-16 flex flex-col gap-5">
      {/* Header */}
      <div className="rounded-3xl p-5 text-white shadow-lg" style={{ background: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)" }}>
        <div className="text-2xl font-black mb-1" style={{ color: "#7C3810" }}>🎬 生成精彩集锦</div>
        <p className="text-sm" style={{ color: "#7C3810", opacity: 0.85 }}>
          上传比赛视频 + 球员照片，自动剪辑出这位球员有球时的精彩片段（约15秒），全程在手机本地处理。
        </p>
      </div>

      {/* Step 1 — Video */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-bold text-gray-700 mb-3">① 上传比赛视频</div>
        <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${videoFile ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"}`}>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleVideoChange}
            disabled={isProcessing}
          />
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
        <div className="text-xs text-gray-400 mb-3">一张清晰显示球衣颜色的截图即可，系统会识别球衣特征</div>
        <label className={`flex gap-4 items-center rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors ${photoFile ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"}`}>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
            disabled={isProcessing}
          />
          {photoPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={photoRef}
                src={photoPreview}
                alt="参考照片"
                className="w-20 h-20 object-cover rounded-xl border border-orange-200 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-orange-700 break-all">{photoFile?.name}</div>
                <div className="text-xs text-gray-400 mt-1">点击更换照片</div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 w-full py-3">
              <span className="text-3xl text-gray-300">🏀</span>
              <span className="text-sm text-gray-500">点击选择球员照片</span>
              <span className="text-xs text-gray-400">JPG、PNG 均可</span>
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
            <span className="text-sm font-medium text-gray-700">{statusMsg}</span>
            <span className="text-sm font-bold text-orange-500">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-yellow-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 text-center">全程本地处理，视频不会上传服务器</div>
        </div>
      )}

      {/* Error */}
      {stage === "error" && error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
          <div className="text-sm font-bold text-red-700 mb-1">处理失败</div>
          <div className="text-xs text-red-600">{error}</div>
          <button
            onClick={() => { setStage("idle"); setError(null); setProgress(0); }}
            className="mt-3 text-sm text-red-600 underline"
          >
            重试
          </button>
        </div>
      )}

      {/* Result */}
      {stage === "done" && resultUrl && (
        <div className="rounded-2xl bg-white border border-orange-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-gray-800">🎉 集锦已生成！</div>
          <video
            src={resultUrl}
            controls
            playsInline
            className="w-full rounded-xl bg-black"
            style={{ maxHeight: 280 }}
          />
          <a
            href={resultUrl}
            download={resultName}
            className="w-full py-3 rounded-xl bg-orange-500 text-white text-sm font-bold text-center active:scale-95 transition-transform block"
          >
            下载集锦视频
          </a>
          <button
            onClick={() => {
              setStage("idle");
              setProgress(0);
              setResultUrl(null);
              setVideoFile(null);
              setPhotoFile(null);
              setPhotoPreview(null);
            }}
            className="text-sm text-gray-400 text-center"
          >
            重新制作
          </button>
        </div>
      )}

      {/* Tips */}
      {stage === "idle" && (
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
          <div className="text-xs font-bold text-blue-700 mb-2">使用提示</div>
          <ul className="flex flex-col gap-1.5 text-xs text-blue-600">
            <li>• 参考照片尽量选球衣颜色清晰、正面的截图</li>
            <li>• 首次使用需下载约30MB引擎，建议WiFi环境操作</li>
            <li>• 视频越大处理越慢，5分钟视频约需1分钟</li>
            <li>• 全程不上传任何视频，隐私安全有保障</li>
          </ul>
        </div>
      )}
    </div>
  );
}
