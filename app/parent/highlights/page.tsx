"use client";

import { useRef, useState, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RGBColor { r: number; g: number; b: number }

/** Appearance signature extracted from the reference photo */
interface PlayerSignature {
  jersey:  RGBColor;   // torso (15%–65% height)
  shorts:  RGBColor;   // thighs (65%–80%)
  sock:    RGBColor;   // ankles (80%–90%)
  shoe:    RGBColor;   // feet   (88%–100%)
  hasShorts: boolean;
  hasSock:   boolean;
  hasShoe:   boolean;
  blobAspect: number;  // expected H/W ratio of jersey blob in video
}

/** Inter-frame tracking state — velocity, recency, exit side */
interface TrackState {
  x: number; y: number;      // last confirmed position (canvas px)
  vx: number; vy: number;    // velocity (px per sample)
  framesSinceSeen: number;   // how many samples since last confident match
  lastExitX: number;         // x when player last left frame (-1 = none)
  lastExitY: number;
}

interface FrameScore {
  t: number;
  hasPlayer: boolean;
  ballNear: boolean;
  playerX: number; playerY: number;
  score: number;
}

type Stage = "idle"|"loading_ffmpeg"|"extracting_color"|"analyzing"|"cutting"|"done"|"error";

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_FPS      = 1;      // 1 frame/s — reliable on mobile
const SAMPLE_W        = 240;    // analysis width
const JERSEY_THRESH   = 55;     // per-channel color match tolerance
const COLOR_THRESH    = 60;     // threshold for shorts/sock/shoe region match
const HIGHLIGHT_S     = 15;
const MOTION_THRESH   = 30;
const SEEK_TIMEOUT    = 6000;   // ms before giving up on a seek

// ── Color utilities ───────────────────────────────────────────────────────────

function colorDist(r: number, g: number, b: number, ref: RGBColor) {
  return (Math.abs(r - ref.r) + Math.abs(g - ref.g) + Math.abs(b - ref.b)) / 3;
}

function avgColorFromData(data: Uint8ClampedArray, excludeSkin = false): RGBColor {
  let rS = 0, gS = 0, bS = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    if (excludeSkin && r > 140 && r > g * 1.3 && r > b * 1.3) continue;
    rS += r; gS += g; bS += b; n++;
  }
  return n ? { r: rS/n, g: gS/n, b: bS/n } : { r: 128, g: 128, b: 128 };
}

function colorVariance(data: Uint8ClampedArray, avg: RGBColor): number {
  let v = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    v += colorDist(data[i], data[i+1], data[i+2], avg); n++;
  }
  return n ? v / n : 0;
}

/** Extract average color of a rectangle in an ImageData */
function sampleRegionColor(
  d: Uint8ClampedArray, w: number,
  cx: number, cy: number, rw: number, rh: number
): RGBColor {
  const x1 = Math.max(0, Math.round(cx - rw/2));
  const x2 = Math.min(w - 1, Math.round(cx + rw/2));
  const y1 = Math.max(0, Math.round(cy - rh/2));
  const y2 = Math.min(Math.floor(d.length / w / 4) - 1, Math.round(cy + rh/2));
  let rS = 0, gS = 0, bS = 0, n = 0;
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const pi = (y * w + x) * 4;
      rS += d[pi]; gS += d[pi+1]; bS += d[pi+2]; n++;
    }
  }
  return n ? { r: rS/n, g: gS/n, b: bS/n } : { r: 128, g: 128, b: 128 };
}

/** Fraction of pixels in a region matching a reference color */
function regionMatchRatio(
  d: Uint8ClampedArray, w: number,
  cx: number, cy: number, rw: number, rh: number,
  ref: RGBColor, thresh: number
): number {
  const h = Math.floor(d.length / w / 4);
  const x1 = Math.max(0, Math.round(cx - rw/2));
  const x2 = Math.min(w - 1, Math.round(cx + rw/2));
  const y1 = Math.max(0, Math.round(cy - rh/2));
  const y2 = Math.min(h - 1, Math.round(cy + rh/2));
  let match = 0, total = 0;
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const pi = (y * w + x) * 4;
      if (colorDist(d[pi], d[pi+1], d[pi+2], ref) < thresh) match++;
      total++;
    }
  }
  return total ? match / total : 0;
}

// ── Signature extraction ──────────────────────────────────────────────────────
// Vertical layout (normalized): head 0-15%, jersey 15-65%, shorts 65-80%,
// socks 80-90%, shoes 88-100%

function extractPlayerSignature(img: HTMLImageElement): PlayerSignature {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 200 / Math.max(img.naturalWidth, 1));
  canvas.width  = Math.round(img.naturalWidth  * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const W = canvas.width, H = canvas.height;

  const band = (y1f: number, y2f: number, x1f = 0.25, x2f = 0.75, noSkin = false) => {
    const d = ctx.getImageData(
      Math.floor(W * x1f), Math.floor(H * y1f),
      Math.floor(W * (x2f - x1f)), Math.floor(H * (y2f - y1f))
    ).data;
    return { color: avgColorFromData(d, noSkin), variance: colorVariance(d, avgColorFromData(d, noSkin)) };
  };

  const jerseyBand  = band(0.15, 0.65, 0.25, 0.75, true);
  const shortsBand  = band(0.63, 0.80, 0.20, 0.80, true);
  const sockBand    = band(0.80, 0.90, 0.25, 0.75, false);
  const shoeBand    = band(0.88, 1.00, 0.20, 0.80, false);

  // Discard a color signal if the region is too noisy (background visible)
  // or if it's the same as the jersey (no new info)
  const isUsable = (band: { color: RGBColor; variance: number }, ref: RGBColor) =>
    band.variance < 65 && colorDist(band.color.r, band.color.g, band.color.b, ref) > 18;

  return {
    jersey:   jerseyBand.color,
    shorts:   shortsBand.color,
    sock:     sockBand.color,
    shoe:     shoeBand.color,
    hasShorts: isUsable(shortsBand, jerseyBand.color),
    hasSock:   isUsable(sockBand,   jerseyBand.color),
    hasShoe:   isUsable(shoeBand,   jerseyBand.color),
    // Rough blob aspect: person torso blob is roughly 2:1 tall
    blobAspect: 1.8,
  };
}

// ── Seek helper ───────────────────────────────────────────────────────────────

function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); video.removeEventListener("seeked", done); resolve(); };
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

// ── Core per-frame analysis ───────────────────────────────────────────────────
//
// Scoring dimensions for each candidate jersey blob:
//
//  1. APPEARANCE — jersey color (primary filter, already enforced by match mask)
//  2. APPEARANCE — shorts color sampled below blob centroid
//  3. APPEARANCE — sock / shoe color sampled at expected ankle/foot position
//  4. APPEARANCE — blob aspect ratio (H/W) vs expected body proportion
//  5. POSITION   — predicted position from last known velocity (×temporal decay)
//  6. TEMPORAL   — confidence decreases exponentially with frames-since-seen
//  7. COURT      — impossible court jumps penalized (max physical speed limit)

function scoreBlob(
  blob: { cx: number; cy: number; size: number; spread: number; bh: number; bw: number },
  sig: PlayerSignature,
  track: TrackState,
  d: Uint8ClampedArray,
  w: number,
): number {
  let s = 0;

  // ── 1. Size & compactness (proxy for how well jersey blob was found)
  s += Math.min(blob.size * 0.3, 40);   // cap at 40
  s -= blob.spread * 0.2;

  // ── 2. Body proportion: H/W aspect ratio
  const aspect = blob.bh / Math.max(blob.bw, 1);
  const aspectDiff = Math.abs(aspect - sig.blobAspect);
  s += Math.max(0, 15 - aspectDiff * 20);

  // Estimated half-height of player blob in canvas px
  const halfH = blob.bh / 2;

  // ── 3. Shorts color — region between knee and waist (below jersey center)
  if (sig.hasShorts) {
    const ratio = regionMatchRatio(d, w, blob.cx, blob.cy + halfH * 0.7, blob.bw * 0.7, halfH * 0.4, sig.shorts, COLOR_THRESH);
    s += ratio * 45;
  }

  // ── 4. Sock color — ankles region
  if (sig.hasSock) {
    const ratio = regionMatchRatio(d, w, blob.cx, blob.cy + halfH * 1.5, blob.bw * 0.5, halfH * 0.25, sig.sock, COLOR_THRESH);
    s += ratio * 35;
  }

  // ── 5. Shoe color — feet region
  if (sig.hasShoe) {
    const ratio = regionMatchRatio(d, w, blob.cx, blob.cy + halfH * 1.8, blob.bw * 0.6, halfH * 0.25, sig.shoe, COLOR_THRESH);
    s += ratio * 50;
  }

  // ── 6. Temporal confidence decay: credibility falls with time since last seen
  const decay = Math.exp(-track.framesSinceSeen * 0.5);  // ~halves every 1.4 frames

  if (track.framesSinceSeen < 30) {  // only use tracking within ~30 seconds
    // ── 7. Velocity-predicted position: most powerful for recent sightings
    const predX = track.x + track.vx * (track.framesSinceSeen + 1);
    const predY = track.y + track.vy * (track.framesSinceSeen + 1);
    const distPred = Math.hypot(blob.cx - predX, blob.cy - predY);
    const velocityBonus = Math.max(0, 90 - distPred * 1.2) * decay;
    s += velocityBonus;

    // ── 8. Court boundary constraint: penalize physically impossible jumps
    // Max reasonable movement per frame at 1fps (player sprints ~6m/s, court ~28m wide)
    // At 240px canvas width ≈ 28m, 6m/s = ~51px/s
    const maxMove = 60 + track.framesSinceSeen * 55;  // relaxes over time
    const actualMove = Math.hypot(blob.cx - track.x, blob.cy - track.y);
    if (actualMove > maxMove) {
      s *= 0.15;  // near-zero score for physically impossible position
    }

    // ── 9. Exit side constraint: if player left from one edge, can't jump to opposite
    if (track.lastExitX >= 0 && track.framesSinceSeen < 5) {
      const exitLeft  = track.lastExitX < w * 0.15;
      const exitRight = track.lastExitX > w * 0.85;
      const blobLeft  = blob.cx < w * 0.15;
      const blobRight = blob.cx > w * 0.85;
      if ((exitLeft && blobRight) || (exitRight && blobLeft)) {
        s *= 0.1;   // penalty for teleporting across the court
      }
    }
  }

  return s;
}

function analyzeFrame(
  curr: ImageData,
  prev: ImageData | null,
  sig: PlayerSignature,
  w: number,
  h: number,
  track: TrackState,
): FrameScore {
  const d = curr.data;

  // ── Find jersey-colored pixels ──────────────────────────────────────────────
  const match = new Uint8Array(w * h);
  let totalMatch = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (colorDist(d[i], d[i+1], d[i+2], sig.jersey) < JERSEY_THRESH) {
        match[y * w + x] = 1; totalMatch++;
      }
    }
  }

  if (totalMatch < 20) {
    return { t:0, hasPlayer:false, ballNear:false, playerX:-1, playerY:-1, score:0 };
  }

  // ── BFS: connected components of jersey pixels ─────────────────────────────
  type Blob = { cx: number; cy: number; size: number; spread: number; bh: number; bw: number };
  const visited = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const queue: number[] = [];

  for (let i = 0; i < w * h; i++) {
    if (!match[i] || visited[i]) continue;
    queue.length = 0; queue.push(i); visited[i] = 1;
    let sx=0, sy=0, sz=0, head=0;
    let minX=w, maxX=0, minY=h, maxY=0;
    while (head < queue.length) {
      const idx = queue[head++];
      const bx = idx % w, by = Math.floor(idx / w);
      sx+=bx; sy+=by; sz++;
      if (bx<minX) minX=bx; if (bx>maxX) maxX=bx;
      if (by<minY) minY=by; if (by>maxY) maxY=by;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx=bx+dx, ny=by+dy;
        if (nx<0||nx>=w||ny<0||ny>=h) continue;
        const ni=ny*w+nx;
        if (!match[ni]||visited[ni]) continue;
        visited[ni]=1; queue.push(ni);
      }
    }
    if (sz >= 15) {
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const spread = (bw * bh) / sz;
      blobs.push({ cx: sx/sz, cy: sy/sz, size: sz, spread, bw, bh });
    }
  }

  if (blobs.length === 0) {
    return { t:0, hasPlayer:false, ballNear:false, playerX:-1, playerY:-1, score:0 };
  }

  // ── Pick best blob ──────────────────────────────────────────────────────────
  let best = blobs[0], bestScore = -Infinity;
  for (const b of blobs) {
    const s = scoreBlob(b, sig, track, d, w);
    if (s > bestScore) { bestScore = s; best = b; }
  }

  const playerX = best.cx, playerY = best.cy;
  const playerR = Math.sqrt(best.size / Math.PI) * 1.8;

  // ── Ball proximity via motion blobs ────────────────────────────────────────
  let ballNear = false;
  if (prev) {
    const pd = prev.data;
    const motion = new Uint8Array(w * h);
    for (let i = 0; i < w*h; i++) {
      const pi = i*4;
      motion[i] = (Math.abs(d[pi]-pd[pi])+Math.abs(d[pi+1]-pd[pi+1])+Math.abs(d[pi+2]-pd[pi+2])) > MOTION_THRESH*3 ? 1 : 0;
    }
    const vis2 = new Uint8Array(w*h), q2: number[] = [];
    for (let i = 0; i < w*h; i++) {
      if (!motion[i]||vis2[i]) continue;
      q2.length=0; q2.push(i); vis2[i]=1;
      let sx=0,sy=0,sz=0,head=0;
      while (head<q2.length) {
        const idx=q2[head++];
        const bx=idx%w, by=Math.floor(idx/w);
        sx+=bx; sy+=by; sz++;
        for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx=bx+dx, ny=by+dy;
          if (nx<0||nx>=w||ny<0||ny>=h) continue;
          const ni=ny*w+nx;
          if (!motion[ni]||vis2[ni]) continue;
          vis2[ni]=1; q2.push(ni);
        }
      }
      if (sz>=4 && sz<=800) {
        const cx=sx/sz, cy=sy/sz;
        const dist=Math.hypot(cx-playerX, cy-playerY);
        if (dist > playerR*0.5 && dist < playerR*4) ballNear=true;
      }
    }
  }

  return { t:0, hasPlayer:true, ballNear, playerX, playerY, score: ballNear ? 1.0 : 0.3 };
}

function findBestWindow(scores: FrameScore[], totalDuration: number): [number, number] {
  const wf = Math.max(1, Math.floor(HIGHLIGHT_S * SAMPLE_FPS));
  if (scores.length <= wf) return [0, Math.min(totalDuration, HIGHLIGHT_S)];
  let bestSum=-1, bestStart=0, windowSum=0;
  for (let i=0; i<scores.length; i++) {
    windowSum += scores[i].score;
    if (i >= wf) windowSum -= scores[i-wf].score;
    if (i >= wf-1 && windowSum > bestSum) { bestSum=windowSum; bestStart=i-wf+1; }
  }
  const startT = Math.max(0, scores[bestStart].t - 0.5);
  return [startT, Math.min(totalDuration, startT + HIGHLIGHT_S)];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HighlightsPage() {
  const [videoFile,    setVideoFile]    = useState<File|null>(null);
  const [photoFile,    setPhotoFile]    = useState<File|null>(null);
  const [photoPreview, setPhotoPreview] = useState<string|null>(null);
  const [stage,        setStage]        = useState<Stage>("idle");
  const [progress,     setProgress]     = useState(0);
  const [statusMsg,    setStatusMsg]    = useState("");
  const [resultUrl,    setResultUrl]    = useState<string|null>(null);
  const [resultName,   setResultName]   = useState("highlight.mp4");
  const [error,        setError]        = useState<string|null>(null);
  const ffmpegRef = useRef<FFmpeg|null>(null);

  const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) setVideoFile(f);
  }, []);
  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f));
  }, []);

  const run = useCallback(async () => {
    if (!videoFile || !photoFile) return;
    setError(null); setResultUrl(null);

    try {
      // ── Step 1: FFmpeg ───────────────────────────────────────────────────
      setStage("loading_ffmpeg"); setProgress(2); setStatusMsg("加载视频处理引擎…（首次约30秒）");
      if (!ffmpegRef.current) {
        const ff = new FFmpeg();
        await ff.load({ coreURL:"/ffmpeg/ffmpeg-core.js", wasmURL:"/ffmpeg/ffmpeg-core.wasm" });
        ffmpegRef.current = ff;
      }
      setProgress(12);

      // ── Step 2: Player signature ─────────────────────────────────────────
      setStage("extracting_color"); setStatusMsg("提取球员外观特征…");
      const photoUrl = URL.createObjectURL(photoFile);
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload=()=>res(); img.onerror=()=>rej(new Error("无法加载照片")); img.src=photoUrl; });
      const sig = extractPlayerSignature(img);
      URL.revokeObjectURL(photoUrl);
      setProgress(20);

      // ── Step 3: Video analysis ───────────────────────────────────────────
      setStage("analyzing"); setStatusMsg("扫描视频…");
      const videoUrl = URL.createObjectURL(videoFile);
      const video = document.createElement("video");
      video.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px";
      video.preload="auto"; video.muted=true; video.playsInline=true;
      document.body.appendChild(video);

      await new Promise<void>((res, rej) => {
        video.onloadedmetadata=()=>res();
        video.onerror=()=>rej(new Error("无法加载视频"));
        video.src=videoUrl;
      });

      const duration   = video.duration;
      const sampleH    = Math.round(SAMPLE_W / (video.videoWidth / Math.max(video.videoHeight, 1)));
      const totalSamples = Math.ceil(duration * SAMPLE_FPS);

      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_W; canvas.height = sampleH;

      const scores: FrameScore[] = [];
      let prevFrame: ImageData|null = null;

      // Initialize tracking state
      const track: TrackState = { x:-1, y:-1, vx:0, vy:0, framesSinceSeen:999, lastExitX:-1, lastExitY:-1 };

      for (let i=0; i<totalSamples; i++) {
        const t = i / SAMPLE_FPS;
        await seekVideo(video, t);
        drawFrame(video, canvas);
        const currFrame = getImageData(canvas);

        const fs = analyzeFrame(currFrame, prevFrame, sig, SAMPLE_W, sampleH, track);
        fs.t = t;
        scores.push(fs);

        // Update tracking state
        if (fs.hasPlayer) {
          // Update velocity (exponential smoothing)
          if (track.x >= 0) {
            track.vx = track.vx * 0.5 + (fs.playerX - track.x) * 0.5;
            track.vy = track.vy * 0.5 + (fs.playerY - track.y) * 0.5;
          }
          // Check if player is near edge (for exit-side tracking)
          const nearEdge = fs.playerX < SAMPLE_W*0.08 || fs.playerX > SAMPLE_W*0.92
                        || fs.playerY < sampleH*0.08  || fs.playerY > sampleH*0.92;
          if (nearEdge) { track.lastExitX = fs.playerX; track.lastExitY = fs.playerY; }

          track.x = fs.playerX; track.y = fs.playerY;
          track.framesSinceSeen = 0;
        } else {
          track.framesSinceSeen++;
        }

        prevFrame = currFrame;
        setProgress(20 + Math.round((i / totalSamples) * 55));
        if (i % 5 === 0) setStatusMsg(`扫描视频 ${Math.round(t)}s / ${Math.round(duration)}s…`);
      }

      document.body.removeChild(video);
      URL.revokeObjectURL(videoUrl);

      // ── Step 4: Best window ──────────────────────────────────────────────
      const [startT, endT] = findBestWindow(scores, duration);
      setProgress(78); setStatusMsg(`精彩片段：${startT.toFixed(1)}s – ${endT.toFixed(1)}s，正在剪辑…`);

      // ── Step 5: FFmpeg cut ───────────────────────────────────────────────
      setStage("cutting");
      const ff = ffmpegRef.current!;
      ff.on("progress", ({ progress: p }) => setProgress(78 + Math.round(p * 20)));

      await ff.writeFile("input.mp4", await fetchFile(videoFile));
      await ff.exec([
        "-ss", startT.toFixed(3), "-i", "input.mp4",
        "-t",  (endT - startT).toFixed(3),
        "-c:v","libx264","-preset","ultrafast","-crf","28",
        "-vf", "scale=720:-2",
        "-c:a","aac","-b:a","96k","-movflags","+faststart",
        "-y",  "highlight.mp4",
      ]);

      const data = await ff.readFile("highlight.mp4");
      const raw  = data as Uint8Array;
      const copy = new Uint8Array(raw.length); copy.set(raw);
      const blob = new Blob([copy.buffer], { type:"video/mp4" });
      await ff.deleteFile("input.mp4"); await ff.deleteFile("highlight.mp4");

      setResultUrl(URL.createObjectURL(blob));
      setResultName(videoFile.name.replace(/\.[^.]+$/,"") + "_highlight.mp4");
      setStage("done"); setProgress(100); setStatusMsg("集锦生成完成！");

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }, [videoFile, photoFile]);

  const isProcessing = ["loading_ffmpeg","extracting_color","analyzing","cutting"].includes(stage);
  const canRun = !!(videoFile && photoFile && !isProcessing);

  return (
    <div className="pb-16 flex flex-col gap-5">
      <div className="rounded-3xl p-5 shadow-lg" style={{ background:"linear-gradient(135deg,#f7971e 0%,#ffd200 100%)" }}>
        <div className="text-2xl font-black mb-1" style={{ color:"#7C3810" }}>🎬 生成精彩集锦</div>
        <p className="text-sm" style={{ color:"#7C3810", opacity:0.85 }}>
          上传比赛视频 + 球员照片，自动剪辑有球精彩片段（约15秒），全程本地处理不上传服务器。
        </p>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-bold text-gray-700 mb-3">① 上传比赛视频</div>
        <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${videoFile ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-gray-50"}`}>
          <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} disabled={isProcessing} />
          {videoFile ? (
            <><span className="text-2xl">✅</span>
            <span className="text-sm font-medium text-orange-700 text-center break-all">{videoFile.name}</span>
            <span className="text-xs text-gray-400">{(videoFile.size/1024/1024).toFixed(1)} MB · 点击更换</span></>
          ) : (
            <><span className="text-3xl text-gray-300">🎥</span>
            <span className="text-sm text-gray-500">点击选择视频文件</span>
            <span className="text-xs text-gray-400">支持 MP4、MOV 等格式</span></>
          )}
        </label>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-bold text-gray-700 mb-1">② 上传球员参考照片</div>
        <div className="text-xs text-gray-400 mb-3">全身照效果最佳，系统会识别球衣、裤子、鞋袜的颜色特征</div>
        <label className={`flex gap-4 items-center rounded-xl border-2 border-dashed p-4 cursor-pointer ${photoFile ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-gray-50"}`}>
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={isProcessing} />
          {photoPreview ? (
            <><img src={photoPreview} alt="参考照片" className="w-20 h-20 object-cover rounded-xl border border-orange-200 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-orange-700 break-all">{photoFile?.name}</div>
              <div className="text-xs text-gray-400 mt-1">点击更换</div>
            </div></>
          ) : (
            <div className="flex flex-col items-center gap-2 w-full py-3">
              <span className="text-3xl text-gray-300">🏀</span>
              <span className="text-sm text-gray-500">点击选择球员照片</span>
            </div>
          )}
        </label>
      </div>

      <button onClick={run} disabled={!canRun}
        className={`w-full py-4 rounded-2xl text-base font-bold shadow transition-all ${canRun ? "bg-orange-500 text-white active:scale-95" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
        {isProcessing ? "处理中…" : "✨ 开始生成集锦"}
      </button>

      {isProcessing && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 flex-1 mr-2">{statusMsg}</span>
            <span className="text-sm font-bold text-orange-500 shrink-0">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-yellow-400 transition-all duration-500" style={{ width:`${progress}%` }} />
          </div>
          <div className="text-xs text-gray-400 text-center">全程本地处理，视频不会上传服务器</div>
        </div>
      )}

      {stage==="error" && error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
          <div className="text-sm font-bold text-red-700 mb-1">处理失败</div>
          <div className="text-xs text-red-600 break-all">{error}</div>
          <button onClick={() => { setStage("idle"); setError(null); setProgress(0); }} className="mt-3 text-sm text-red-600 underline">重试</button>
        </div>
      )}

      {stage==="done" && resultUrl && (
        <div className="rounded-2xl bg-white border border-orange-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-gray-800">🎉 集锦已生成！</div>
          <video src={resultUrl} controls playsInline className="w-full rounded-xl bg-black" style={{ maxHeight:280 }} />
          <a href={resultUrl} download={resultName} className="w-full py-3 rounded-xl bg-orange-500 text-white text-sm font-bold text-center block">下载集锦视频</a>
          <button onClick={() => { setStage("idle"); setProgress(0); setResultUrl(null); setVideoFile(null); setPhotoFile(null); setPhotoPreview(null); }} className="text-sm text-gray-400 text-center">重新制作</button>
        </div>
      )}

      {stage==="idle" && (
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
          <div className="text-xs font-bold text-blue-700 mb-2">识别原理（5类特征交叉验证）</div>
          <ul className="flex flex-col gap-1 text-xs text-blue-600">
            <li>👕 <b>外观</b>：球衣 + 裤子 + 袜子 + 鞋子颜色</li>
            <li>📐 <b>体态</b>：球员轮廓高宽比例</li>
            <li>📍 <b>位置</b>：速度矢量预测下一帧出现位置</li>
            <li>⏱ <b>时间</b>：越久没见到，位置置信度越低</li>
            <li>🏀 <b>球场</b>：超出物理速度极限的跳变会被惩罚</li>
          </ul>
          <div className="mt-2 text-xs text-blue-500">提示：参考照片用全身照效果更好</div>
        </div>
      )}
    </div>
  );
}
