"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { apiLoadGames, apiLoadClips } from "@/lib/gc-api";
import type { ClipRecord } from "@/lib/gc-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RGBColor { r: number; g: number; b: number }
type JerseyColor = RGBColor;

interface PlayerSignature {
  jersey:  RGBColor;
  shorts:  RGBColor;
  sock:    RGBColor;
  shoe:    RGBColor;
  hasShorts: boolean;
  hasSock:   boolean;
  hasShoe:   boolean;
}

interface TrackState {
  x: number; y: number;
  vx: number; vy: number;
  framesSinceSeen: number;
  lastExitX: number;
}

interface FrameScore {
  t: number;
  hasPlayer: boolean;
  ballNear: boolean;
  playerX: number; playerY: number;
  score: number;
}

type Stage = "idle"|"loading"|"extracting_color"|"analyzing"|"cutting"|"done"|"error";

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_FPS     = 1;
const SAMPLE_W       = 240;
const JERSEY_THRESH  = 55;
const COLOR_THRESH   = 60;
const HIGHLIGHT_S    = 15;
const MOTION_THRESH  = 30;
// Hoisted once — reused by both BFS loops in analyzeFrame every frame
const DIRS4: ReadonlyArray<[number, number]> = [[-1,0],[1,0],[0,-1],[0,1]];

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

// ── Color utilities ───────────────────────────────────────────────────────────

function colorDist(r: number, g: number, b: number, ref: RGBColor) {
  return (Math.abs(r-ref.r) + Math.abs(g-ref.g) + Math.abs(b-ref.b)) / 3;
}

function avgColorFromData(data: Uint8ClampedArray, excludeSkin = false): RGBColor {
  let rS=0, gS=0, bS=0, n=0;
  for (let i=0; i<data.length; i+=4) {
    const r=data[i], g=data[i+1], b=data[i+2];
    if (excludeSkin && r>140 && r>g*1.3 && r>b*1.3) continue;
    rS+=r; gS+=g; bS+=b; n++;
  }
  return n ? {r:rS/n, g:gS/n, b:bS/n} : {r:128,g:128,b:128};
}

function colorVariance(data: Uint8ClampedArray, avg: RGBColor): number {
  let v=0, n=0;
  for (let i=0; i<data.length; i+=4) { v+=colorDist(data[i],data[i+1],data[i+2],avg); n++; }
  return n ? v/n : 0;
}

function regionMatchRatio(
  d: Uint8ClampedArray, w: number, h: number,
  cx: number, cy: number, rw: number, rh: number,
  ref: RGBColor, thresh: number
): number {
  const x1=Math.max(0,Math.round(cx-rw/2)), x2=Math.min(w-1,Math.round(cx+rw/2));
  const y1=Math.max(0,Math.round(cy-rh/2)), y2=Math.min(h-1,Math.round(cy+rh/2));
  let match=0, total=0;
  for (let y=y1; y<=y2; y++) for (let x=x1; x<=x2; x++) {
    const pi=(y*w+x)*4;
    if (colorDist(d[pi],d[pi+1],d[pi+2],ref) < thresh) match++;
    total++;
  }
  return total ? match/total : 0;
}

// ── Signature from reference photo ───────────────────────────────────────────

function extractPlayerSignature(img: HTMLImageElement): PlayerSignature {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 200/Math.max(img.naturalWidth,1));
  canvas.width  = Math.round(img.naturalWidth*scale);
  canvas.height = Math.round(img.naturalHeight*scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const W=canvas.width, H=canvas.height;

  const band = (y1f:number, y2f:number, x1f=0.25, x2f=0.75, noSkin=false) => {
    const d = ctx.getImageData(Math.floor(W*x1f),Math.floor(H*y1f),Math.floor(W*(x2f-x1f)),Math.floor(H*(y2f-y1f))).data;
    const color = avgColorFromData(d, noSkin);
    return { color, variance: colorVariance(d, color) };
  };

  const jersey = band(0.15, 0.65, 0.25, 0.75, true);
  const shorts  = band(0.63, 0.80, 0.20, 0.80, true);
  const sock    = band(0.80, 0.90, 0.25, 0.75, false);
  const shoe    = band(0.88, 1.00, 0.20, 0.80, false);

  const usable = (b:{color:RGBColor;variance:number}, ref:RGBColor) =>
    b.variance < 65 && colorDist(b.color.r,b.color.g,b.color.b,ref) > 18;

  return {
    jersey: jersey.color, shorts: shorts.color, sock: sock.color, shoe: shoe.color,
    hasShorts: usable(shorts, jersey.color),
    hasSock:   usable(sock,   jersey.color),
    hasShoe:   usable(shoe,   jersey.color),
  };
}

// ── Per-frame analysis (same 5-dimension scoring) ─────────────────────────────

function analyzeFrame(
  curr: ImageData, prev: ImageData|null,
  sig: PlayerSignature, w: number, h: number,
  track: TrackState,
): FrameScore {
  const d = curr.data;

  const match = new Uint8Array(w*h);
  let total=0;
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
    const i=(y*w+x)*4;
    if (colorDist(d[i],d[i+1],d[i+2],sig.jersey) < JERSEY_THRESH) { match[y*w+x]=1; total++; }
  }
  if (total < 20) return {t:0,hasPlayer:false,ballNear:false,playerX:-1,playerY:-1,score:0};

  // BFS blobs
  type Blob = {cx:number;cy:number;size:number;spread:number;bw:number;bh:number};
  const visited = new Uint8Array(w*h), blobs:Blob[] = [], queue:number[]=[];
  for (let i=0; i<w*h; i++) {
    if (!match[i]||visited[i]) continue;
    queue.length=0; queue.push(i); visited[i]=1;
    let sx=0,sy=0,sz=0,head=0,minX=w,maxX=0,minY=h,maxY=0;
    while (head<queue.length) {
      const idx=queue[head++], bx=idx%w, by=Math.floor(idx/w);
      sx+=bx; sy+=by; sz++;
      if (bx<minX)minX=bx; if (bx>maxX)maxX=bx;
      if (by<minY)minY=by; if (by>maxY)maxY=by;
      for (const [dx,dy] of DIRS4) {
        const nx=bx+dx, ny=by+dy;
        if (nx<0||nx>=w||ny<0||ny>=h) continue;
        const ni=ny*w+nx;
        if (!match[ni]||visited[ni]) continue;
        visited[ni]=1; queue.push(ni);
      }
    }
    if (sz>=15) {
      const bw=maxX-minX+1, bh=maxY-minY+1;
      blobs.push({cx:sx/sz,cy:sy/sz,size:sz,spread:(bw*bh)/sz,bw,bh});
    }
  }
  if (!blobs.length) return {t:0,hasPlayer:false,ballNear:false,playerX:-1,playerY:-1,score:0};

  // Score each blob (5 dimensions)
  let best=blobs[0], bestScore=-Infinity;
  for (const b of blobs) {
    let s = Math.min(b.size*0.3, 40) - b.spread*0.2;
    const halfH = b.bh/2;

    // Shorts
    if (sig.hasShorts) s += regionMatchRatio(d,w,h,b.cx,b.cy+halfH*0.7,b.bw*0.7,halfH*0.4,sig.shorts,COLOR_THRESH)*45;
    // Socks
    if (sig.hasSock)   s += regionMatchRatio(d,w,h,b.cx,b.cy+halfH*1.5,b.bw*0.5,halfH*0.25,sig.sock,COLOR_THRESH)*35;
    // Shoes
    if (sig.hasShoe)   s += regionMatchRatio(d,w,h,b.cx,b.cy+halfH*1.8,b.bw*0.6,halfH*0.25,sig.shoe,COLOR_THRESH)*50;

    // Position / temporal
    const decay = Math.exp(-track.framesSinceSeen*0.5);
    if (track.framesSinceSeen < 30) {
      const predX=track.x+track.vx*(track.framesSinceSeen+1), predY=track.y+track.vy*(track.framesSinceSeen+1);
      s += Math.max(0, 90 - Math.hypot(b.cx-predX,b.cy-predY)*1.2) * decay;
      // Court speed limit
      const maxMove = 60+track.framesSinceSeen*55;
      if (Math.hypot(b.cx-track.x,b.cy-track.y) > maxMove) s*=0.15;
      // Exit side
      if (track.lastExitX>=0 && track.framesSinceSeen<5) {
        const exitLeft=track.lastExitX<w*0.15, exitRight=track.lastExitX>w*0.85;
        const bLeft=b.cx<w*0.15, bRight=b.cx>w*0.85;
        if ((exitLeft&&bRight)||(exitRight&&bLeft)) s*=0.1;
      }
    }
    if (s>bestScore) { bestScore=s; best=b; }
  }

  const playerX=best.cx, playerY=best.cy, playerR=Math.sqrt(best.size/Math.PI)*1.8;

  // Ball proximity via motion diff
  let ballNear=false;
  if (prev) {
    const pd=prev.data, motion=new Uint8Array(w*h);
    for (let i=0;i<w*h;i++) {
      const pi=i*4;
      motion[i]=(Math.abs(d[pi]-pd[pi])+Math.abs(d[pi+1]-pd[pi+1])+Math.abs(d[pi+2]-pd[pi+2]))>MOTION_THRESH*3?1:0;
    }
    const vis2=new Uint8Array(w*h), q2:number[]=[];
    for (let i=0;i<w*h;i++) {
      if (!motion[i]||vis2[i]) continue;
      q2.length=0; q2.push(i); vis2[i]=1;
      let sx=0,sy=0,sz=0,head=0;
      while (head<q2.length) {
        const idx=q2[head++], bx=idx%w, by=Math.floor(idx/w);
        sx+=bx; sy+=by; sz++;
        for (const [dx,dy] of DIRS4) {
          const nx=bx+dx, ny=by+dy;
          if (nx<0||nx>=w||ny<0||ny>=h) continue;
          const ni=ny*w+nx;
          if (!motion[ni]||vis2[ni]) continue;
          vis2[ni]=1; q2.push(ni);
        }
      }
      if (sz>=4&&sz<=800) {
        const cx=sx/sz, cy=sy/sz, dist=Math.hypot(cx-playerX,cy-playerY);
        if (dist>playerR*0.5&&dist<playerR*4) ballNear=true;
      }
    }
  }

  // Confidence: how well the best blob matched all features (0–1)
  const confidence = Math.min(1, Math.max(0, bestScore) / 150);
  const baseScore = ballNear ? 3.0 : 0.3;
  return {t:0,hasPlayer:true,ballNear,playerX,playerY,score:baseScore*(0.5+confidence*0.5)};
}

// ── In-browser beat WAV generator ────────────────────────────────────────────
// Generates a simple 120BPM sport beat entirely in JS — no network request needed.
// Frequencies chosen to survive phone speaker low-pass filter (>180Hz).
function generateBeatWAV(durationSec: number): Uint8Array {
  const SR = 44100;
  const N   = Math.ceil(SR * durationSec);
  const mix = new Float32Array(N);

  const beatSec = 60 / 120; // 0.5s @ 120 BPM

  // 808-style kick: frequency sweeps 180→50 Hz — the signature hip-hop thud
  const renderKick = (startSec: number) => {
    const s0 = Math.round(startSec * SR);
    const len = Math.min(Math.round(0.55 * SR), N - s0);
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      const freq = 50 + 130 * Math.exp(-t * 22);
      ph += (2 * Math.PI * freq) / SR;
      mix[s0 + j] += 0.75 * Math.sin(ph) * Math.exp(-t * 7);
    }
  };

  // Snare: noise burst + tonal body — sounds like a real snare, not a beep
  const renderSnare = (startSec: number) => {
    const s0 = Math.round(startSec * SR);
    const len = Math.min(Math.round(0.20 * SR), N - s0);
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      const body = Math.sin(2 * Math.PI * 200 * t);
      mix[s0 + j] += 0.50 * ((Math.random() * 2 - 1) * 0.6 + body * 0.4) * Math.exp(-t * 25);
    }
  };

  // Hi-hat: white noise, closed (short) or open (longer)
  const renderHat = (startSec: number, open: boolean) => {
    const s0  = Math.round(startSec * SR);
    const dur = open ? 0.14 : 0.045;
    const len = Math.min(Math.round(dur * SR), N - s0);
    const amp = open ? 0.20 : 0.16;
    const dec = open ? 18 : 100;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      mix[s0 + j] += amp * (Math.random() * 2 - 1) * Math.exp(-t * dec);
    }
  };

  // Sub-bass line: A-minor groove (A1–E2–D2), adds the hip-hop feel
  const renderBass = (startSec: number, freq: number) => {
    const s0  = Math.round(startSec * SR);
    const len = Math.min(Math.round(beatSec * SR), N - s0);
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      ph += (2 * Math.PI * freq) / SR;
      const env = Math.min(1, t * 40) * Math.exp(-t * 2);
      mix[s0 + j] += 0.38 * (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * env;
    }
  };

  // Schedule events: kick on 1+3, snare on 2+4, hats on every 8th note, bass groove
  const bassLine = [55, 55, 82, 73]; // A1, A1, E2, D2
  const totalBeats = Math.ceil(durationSec / beatSec) + 4;
  for (let b = 0; b < totalBeats; b++) {
    const t = b * beatSec;
    const bib = b % 4; // beat-in-bar (0–3)
    if (bib === 0 || bib === 2) renderKick(t);
    if (bib === 1 || bib === 3) renderSnare(t);
    renderHat(t, bib === 2);          // open hat on beat 3
    renderHat(t + beatSec / 2, false); // offbeat closed hat
    renderBass(t, bassLine[bib]);
  }

  // Normalize to 0.9 peak so overlapping hits don't clip
  let peak = 0;
  for (let i = 0; i < N; i++) if (Math.abs(mix[i]) > peak) peak = Math.abs(mix[i]);
  const gain = peak > 0 ? 0.9 / peak : 1;
  const pcm = new Int16Array(N);
  for (let i = 0; i < N; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, mix[i] * gain)) * 32767);

  const dataBytes = N * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv  = new DataView(buf);
  const u8  = new Uint8Array(buf);
  [0x52,0x49,0x46,0x46].forEach((c,i)=>{ u8[i]=c; });
  dv.setUint32(4, 36 + dataBytes, true);
  [0x57,0x41,0x56,0x45].forEach((c,i)=>{ u8[8+i]=c; });
  [0x66,0x6D,0x74,0x20].forEach((c,i)=>{ u8[12+i]=c; });
  dv.setUint32(16, 16, true);  dv.setUint16(20, 1, true);  dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true);  dv.setUint32(28, SR * 2, true);
  dv.setUint16(32, 2, true);   dv.setUint16(34, 16, true);
  [0x64,0x61,0x74,0x61].forEach((c,i)=>{ u8[36+i]=c; });
  dv.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(pcm);
  return u8;
}

function findBestWindow(scores:FrameScore[], totalDuration:number, bgmBpm=0):[number,number] {
  if (scores.length === 0) return [0, Math.min(totalDuration, HIGHLIGHT_S)];

  const n = scores.length;
  const windowFrames = Math.min(n, Math.max(1, Math.round(HIGHLIGHT_S * SAMPLE_FPS)));

  // Sliding window: pick contiguous window with highest cumulative score,
  // weighted by player presence ratio to avoid "unrelated frames" in the clip.
  const cumSum    = new Array(n + 1).fill(0);
  const cumPlayer = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    cumSum[i + 1]    = cumSum[i]    + scores[i].score;
    cumPlayer[i + 1] = cumPlayer[i] + (scores[i].hasPlayer ? 1 : 0);
  }

  let bestWinStart = 0, bestWinScore = -Infinity;
  for (let i = 0; i <= n - windowFrames; i++) {
    const ws = cumSum[i + windowFrames] - cumSum[i];
    const playerRatio = (cumPlayer[i + windowFrames] - cumPlayer[i]) / windowFrames;
    // Penalize windows where the target player rarely appears — reduces unrelated frames
    const adjusted = ws * (0.3 + playerRatio * 0.7);
    if (adjusted > bestWinScore) { bestWinScore = adjusted; bestWinStart = i; }
  }

  // Peak frame within best window (reference point for beat-sync)
  const winEnd = Math.min(bestWinStart + windowFrames, n);
  let peakIdx = bestWinStart;
  for (let i = bestWinStart + 1; i < winEnd; i++) {
    if (scores[i].score > scores[peakIdx].score) peakIdx = i;
  }

  let startT = scores[bestWinStart].t;

  // Beat-sync: nudge startT so peak frame lands on a BGM measure downbeat (120 BPM → 2s measures)
  if (bgmBpm > 0) {
    const measureLen = (60 / bgmBpm) * 4;
    const peakInClip = scores[peakIdx].t - startT;
    const nearestDownbeat = Math.round(peakInClip / measureLen) * measureLen;
    const shift = nearestDownbeat - peakInClip;
    if (Math.abs(shift) <= measureLen / 2) startT = Math.max(0, startT - shift);
  }

  const endT = Math.min(totalDuration, startT + HIGHLIGHT_S);
  return [Math.max(0, endT - HIGHLIGHT_S), endT];
}

// ── Multi-segment event finder ────────────────────────────────────────────────
// Collects all runs where the player has the ball, merges nearby runs, pads them.
// Returns empty array when detection was too sparse — caller falls back to findBestWindow.
function findHighlightSegments(
  scores: FrameScore[], totalDuration: number
): Array<[number, number]> {
  const events: Array<[number, number]> = [];
  let runStart = -1;
  for (let i = 0; i < scores.length; i++) {
    const active = scores[i].hasPlayer && scores[i].ballNear;
    if (active  && runStart < 0) runStart = i;
    if (!active && runStart >= 0) {
      events.push([scores[runStart].t, scores[i - 1].t]);
      runStart = -1;
    }
  }
  if (runStart >= 0) events.push([scores[runStart].t, scores[scores.length - 1].t]);
  if (events.length === 0) return [];

  // Merge events within 3s of each other
  const merged: Array<[number, number]> = [[events[0][0], events[0][1]]];
  for (let i = 1; i < events.length; i++) {
    const last = merged[merged.length - 1];
    if (events[i][0] - last[1] <= 3.0) { last[1] = events[i][1]; }
    else { merged.push([events[i][0], events[i][1]]); }
  }

  // Add 0.8s padding on each side, clip to video bounds
  return merged.map(([s, e]) => [
    Math.max(0, s - 0.8),
    Math.min(totalDuration, e + 0.8),
  ] as [number, number]);
}

// ── Native seek — browser hardware decoder, works for any file size ───────────
function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.05) { resolve(); return; }
    const timer = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error(`seek timeout at ${time}s`));
    }, 8000);
    const onSeeked = () => { clearTimeout(timer); video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

// ── Cut video via MediaRecorder — no WASM, no file size limit ─────────────────
async function cutVideoNative(
  videoEl: HTMLVideoElement,
  startT: number,
  endT: number,
  bgmBlob: Blob | null,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const duration = Math.max(0.5, endT - startT);
  const w = Math.min(720, videoEl.videoWidth || 720);
  const h = Math.round(w * (videoEl.videoHeight || 1280) / Math.max(videoEl.videoWidth || 720, 1));

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx2 = canvas.getContext("2d")!;

  const captureFn = (canvas as any).captureStream ?? (canvas as any).mozCaptureStream;
  if (typeof captureFn !== "function") {
    throw new Error("当前浏览器暂不支持视频录制，请使用 Chrome 浏览器或最新版微信。");
  }
  const canvasStream: MediaStream = captureFn.call(canvas, 30);

  const mimeType = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) ?? "video/webm";
  const safeType = mimeType.split(";")[0] || "video/webm";

  // Mix audio: video source + optional BGM via Web Audio API
  const audioTracks: MediaStreamTrack[] = [];
  let audioCtx: AudioContext | null = null;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      audioCtx = new AC() as AudioContext;
      const dest = audioCtx.createMediaStreamDestination();
      try {
        const vidSrc = audioCtx.createMediaElementSource(videoEl);
        const vidGain = audioCtx.createGain();
        vidGain.gain.value = bgmBlob ? 0.3 : 1.0;
        vidSrc.connect(vidGain); vidGain.connect(dest);
      } catch {}
      if (bgmBlob) {
        try {
          const buf = await audioCtx.decodeAudioData(await bgmBlob.arrayBuffer());
          const src = audioCtx.createBufferSource();
          src.buffer = buf; src.loop = true;
          const gain = audioCtx.createGain(); gain.gain.value = 0.7;
          src.connect(gain); gain.connect(dest);
          src.start(0); src.stop(audioCtx.currentTime + duration + 2);
        } catch {}
      }
      audioTracks.push(...dest.stream.getAudioTracks());
    }
  } catch {}

  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
  const recorder = new MediaRecorder(stream, { mimeType: safeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  await seekVideoTo(videoEl, startT);

  return new Promise<Blob>((resolve, reject) => {
    let stopped = false;
    const stopAll = () => {
      if (stopped) return; stopped = true;
      try { recorder.stop(); } catch {}
      videoEl.pause();
      audioCtx?.close().catch(() => {});
    };

    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || safeType }));
    recorder.onerror = () => reject(new Error("视频录制失败，请重试"));

    recorder.start(200);
    videoEl.play().catch(() => {});

    // Draw canvas in real time
    const drawLoop = () => { if (!stopped) { ctx2.drawImage(videoEl, 0, 0, w, h); requestAnimationFrame(drawLoop); } };
    requestAnimationFrame(drawLoop);

    // Progress + stop condition
    const wallStart = Date.now();
    const tick = setInterval(() => {
      const elapsed = (Date.now() - wallStart) / 1000;
      onProgress?.(Math.min(elapsed / duration, 0.95));
      if (elapsed >= duration + 0.5) { clearInterval(tick); stopAll(); }
    }, 200);
    setTimeout(() => { clearInterval(tick); stopAll(); }, (duration + 4) * 1000);
  });
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
  const [resultBlob,   setResultBlob]   = useState<Blob|null>(null);
  const [resultName,   setResultName]   = useState("highlight.mp4");
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
  const [gamesWithEvents, setGamesWithEvents] = useState(0);
  const [expandedClipId, setExpandedClipId] = useState<string|null>(null);
  const [nameInputVal,   setNameInputVal]   = useState("");
  const analyzeStartRef = useRef<number>(0);

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
    } catch { setPlayerClips([]); }
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
    const f = e.target.files?.[0];
    if (!f) return;
    setVideoFile(f);
    setVideoDuration(0);
    const url = URL.createObjectURL(f);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => { setVideoDuration(vid.duration); URL.revokeObjectURL(url); };
    vid.onerror = () => URL.revokeObjectURL(url);
    vid.src = url;
  }, []);
  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f=e.target.files?.[0]; if (!f) return;
    setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f));
  },[]);
  const handleBgmFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBgmUserFile(e.target.files?.[0] || null);
  }, []);

  const run = useCallback(async () => {
    if (!videoFile || !photoFile) return;
    setError(null); setResultUrl(null); setResultBlob(null);
    setFeedbackRating(0); setFeedbackTypes([]); setFeedbackDone(false);

    const videoObjectUrl = URL.createObjectURL(videoFile);
    const videoEl = document.createElement("video");
    videoEl.src = videoObjectUrl;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = "auto";

    try {
      // ── 1. Load video metadata (native, any file size) ────────────────────
      setStage("loading"); setProgress(3);
      setStatusMsg("读取视频信息…");
      const duration: number = await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error("视频加载超时，请检查文件格式")), 30_000);
        videoEl.onloadedmetadata = () => { clearTimeout(t); res(videoEl.duration); };
        videoEl.onerror = () => { clearTimeout(t); rej(new Error("无法加载视频，请检查文件格式（支持 MP4、MOV）")); };
      });
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

      // ── 3. Frame analysis via native seek — no WASM, no file size limit ──
      setStage("analyzing");
      const analysisCv = document.createElement("canvas");
      analysisCv.width = SAMPLE_W;
      const sampleH = videoEl.videoWidth > 0
        ? Math.round(SAMPLE_W * videoEl.videoHeight / videoEl.videoWidth)
        : Math.round(SAMPLE_W * 9 / 16);
      analysisCv.height = sampleH;
      const ctx = analysisCv.getContext("2d", { willReadFrequently: true })!;

      const scores: FrameScore[] = [];
      let prevFrame: ImageData | null = null;
      const track: TrackState = { x: -1, y: -1, vx: 0, vy: 0, framesSinceSeen: 999, lastExitX: -1 };
      const MAX_ANALYSIS_FRAMES = 90;
      const totalFrames = Math.min(Math.ceil(duration * SAMPLE_FPS), MAX_ANALYSIS_FRAMES);
      const frameInterval = duration / Math.max(totalFrames, 1);
      const analysisDeadline = Date.now() + 180_000;

      for (let i = 0; i < totalFrames; i++) {
        if (Date.now() > analysisDeadline) { setStatusMsg(`分析超时，已处理 ${i}/${totalFrames} 帧，继续生成…`); break; }
        const t = i * frameInterval;
        setStatusMsg(`分析帧 ${i + 1} / ${totalFrames}（${Math.round(t)}s）`);
        try {
          await seekVideoTo(videoEl, t);
          ctx.drawImage(videoEl, 0, 0, SAMPLE_W, sampleH);
          const currFrame = ctx.getImageData(0, 0, SAMPLE_W, sampleH);
          const fs = analyzeFrame(currFrame, prevFrame, sig, SAMPLE_W, sampleH, track);
          fs.t = t;
          scores.push(fs);
          if (fs.hasPlayer) {
            if (track.x >= 0) {
              track.vx = track.vx * 0.5 + (fs.playerX - track.x) * 0.5;
              track.vy = track.vy * 0.5 + (fs.playerY - track.y) * 0.5;
            }
            const nearEdge = fs.playerX < SAMPLE_W * 0.08 || fs.playerX > SAMPLE_W * 0.92
                          || fs.playerY < sampleH * 0.08  || fs.playerY > sampleH * 0.92;
            if (nearEdge) track.lastExitX = fs.playerX;
            track.x = fs.playerX; track.y = fs.playerY; track.framesSinceSeen = 0;
          } else { track.framesSinceSeen++; }
          prevFrame = currFrame;
        } catch { continue; }
        setProgress(18 + Math.round(((i + 1) / totalFrames) * 52));
      }

      setProgress(70); setStatusMsg("计算精彩片段…");

      // Temporal noise suppression
      for (let i = 1; i < scores.length - 1; i++) {
        if (scores[i].hasPlayer && !scores[i - 1].hasPlayer && !scores[i + 1].hasPlayer) {
          scores[i] = { ...scores[i], hasPlayer: false, score: scores[i].score * 0.05 };
        }
      }

      // ── 4. Find highlight window ──────────────────────────────────────────
      const [clipStart, clipEnd] = findBestWindow(scores, duration, bgmEnabled ? 120 : 0);
      const clipDuration = clipEnd - clipStart;

      // ── 5. Load BGM ───────────────────────────────────────────────────────
      setStage("cutting");
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

      // ── 6. Cut clip natively via MediaRecorder ────────────────────────────
      setStatusMsg(`精彩片段 ${clipStart.toFixed(1)}s–${clipEnd.toFixed(1)}s，实时剪辑中（约 ${Math.round(clipDuration)} 秒）…`);
      const outputBlob = await cutVideoNative(
        videoEl, clipStart, clipEnd, bgmBlob,
        (p) => setProgress(70 + Math.round(p * 28)),
      );

      setProgress(100);
      setResultBlob(outputBlob);
      setResultUrl(URL.createObjectURL(outputBlob));
      setResultDur(Math.round(clipDuration));
      const childNameForFile = (() => { try { return localStorage.getItem("child_name") || ""; } catch { return ""; } })();
      const mmdd = (() => { const d = new Date(); return `${(d.getMonth()+1).toString().padStart(2,"0")}${d.getDate().toString().padStart(2,"0")}`; })();
      const outputName = childNameForFile ? `${childNameForFile}_${mmdd}集锦.mp4` : videoFile.name.replace(/\.[^.]+$/, "") + "_highlight.mp4";
      setResultName(outputName);
      setStage("done"); setProgress(100); setStatusMsg("");
      try {
        const rec = { date: new Date().toISOString(), name: outputName, dur: Math.round(clipDuration) };
        const prev = JSON.parse(localStorage.getItem("my_highlights") || "[]");
        const next = [rec, ...prev].slice(0, 10);
        localStorage.setItem("my_highlights", JSON.stringify(next));
        setMyHighlights(next);
      } catch {}

    } catch (e) {
      console.error(e);
      setError((e instanceof Error ? e.message : String(e)) || "未知错误，请重试");
      setStage("error");
    } finally {
      videoEl.pause(); videoEl.src = "";
      URL.revokeObjectURL(videoObjectUrl);
    }
  }, [videoFile, photoFile, bgmEnabled, bgmUserFile]);

  const isProcessing = ["loading","extracting_color","analyzing","cutting"].includes(stage);
  const canRun = !!(videoFile && photoFile && !isProcessing);

  return (
    <>
    <div className="pb-16 flex flex-col gap-5">
      <div className="rounded-3xl p-5 shadow-lg" style={{background:"linear-gradient(135deg,#f7971e 0%,#ffd200 100%)"}}>
        <div className="text-2xl font-black mb-1" style={{color:"#7C3810"}}>🎬 生成{childName ? `${childName}的` : ""}精彩集锦</div>
        <p className="text-sm" style={{color:"#7C3810",opacity:0.85}}>
          上传比赛视频 + 球员照片，自动剪辑有球精彩片段（约15秒），全程本地处理不上传服务器。
        </p>
      </div>

      {/* Mode tabs */}
      {stage === "idle" && (
        <div className="flex rounded-2xl bg-gray-100 p-1 gap-1">
          <button
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors ${hlMode === "upload" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500"}`}
            onClick={() => setHlMode("upload")}
          >📹 上传视频</button>
          <button
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors ${hlMode === "from_clips" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500"}`}
            onClick={() => { setHlMode("from_clips"); if (playerClips === null) loadPlayerClips(); }}
          >🏀 已标注集锦</button>
        </div>
      )}

      {/* From clips mode */}
      {stage === "idle" && hlMode === "from_clips" && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-gray-700">
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
                <div key={i} className="rounded-xl bg-gray-100 animate-pulse" style={{ height: 56 }} />
              ))}
            </div>
          )}
          {!loadingPlayerClips && playerClips !== null && playerClips.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6">
              {!childName ? (
                <>
                  <div className="text-2xl mb-2">👤</div>
                  <div className="text-gray-600 font-medium mb-3">先告诉我孩子叫什么名字</div>
                  <div className="flex gap-2 justify-center">
                    <input
                      value={nameInputVal}
                      onChange={e => setNameInputVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") confirmChildName(); }}
                      placeholder="输入孩子的名字"
                      autoFocus
                      className="text-sm rounded-xl border border-orange-300 px-3 py-2 outline-none focus:border-orange-500 bg-white text-gray-800 w-36"
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
            <div key={clip.id} className="rounded-xl border border-orange-100 bg-orange-50 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{formatClipLabel(clip.label)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{fmtClipDate(clip.created_at)} · {clip.gameLabel}</div>
                </div>
                <button
                  onClick={() => setExpandedClipId(expandedClipId === clip.id ? null : clip.id)}
                  className="text-xs font-bold text-orange-600 bg-orange-100 px-3 py-1.5 rounded-full active:opacity-70 shrink-0"
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
                    className="w-full py-2 rounded-xl text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 active:opacity-70 transition-opacity"
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
      {(stage !== "idle" || hlMode === "upload") && (<>
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-bold text-gray-700 mb-3">① 上传比赛视频</div>
        <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${videoFile?"border-orange-300 bg-orange-50":"border-gray-200 bg-gray-50"}`}>
          <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} disabled={isProcessing}/>
          {videoFile?(
            <><span className="text-2xl">✅</span>
            <span className="text-sm font-medium text-orange-700 text-center break-all">{videoFile.name}</span>
            <span className="text-xs text-gray-400">{(videoFile.size/1024/1024).toFixed(1)} MB · 点击更换</span></>
          ):(
            <><span className="text-3xl text-gray-300">🎥</span>
            <span className="text-sm text-gray-500">点击选择视频文件</span>
            <span className="text-xs text-gray-400">支持 MP4、MOV 等格式</span></>
          )}
        </label>
        {videoFile && videoFile.size > 500 * 1024 * 1024 && (
          <div className="mt-2 flex items-start gap-1 text-xs text-amber-600">
            <span className="shrink-0">⏱</span>
            <span>视频较大（{(videoFile.size/1024/1024).toFixed(0)}MB），帧分析预计 2–4 分钟，请在 WiFi 下耐心等待</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-bold text-gray-700 mb-1">② 上传球员参考照片</div>
        <div className="text-xs text-gray-400 mb-3">全身照效果最佳 · 按队服颜色识别（同队多人会同时追踪，号码识别暂不支持）</div>
        <label className={`flex flex-col items-center rounded-xl border-2 border-dashed cursor-pointer overflow-hidden ${photoFile?"border-orange-300 bg-orange-50":"border-gray-200 bg-gray-50 p-6"}`}>
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={isProcessing}/>
          {photoPreview?(
            <>
              <img src={photoPreview} alt="参考照片" className="w-full object-contain" style={{maxHeight:220}}/>
              <div className="w-full flex items-center justify-between px-3 py-2 bg-orange-50 border-t border-orange-100">
                <span className="text-xs font-medium text-orange-700 truncate flex-1 mr-2">{photoFile?.name}</span>
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
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3">
        <button onClick={()=>{ if(bgmEnabled) setBgmUserFile(null); setBgmEnabled(v=>!v); }} disabled={isProcessing}
          className="flex items-center gap-3 w-full text-left">
          <div className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${bgmEnabled?"bg-orange-500":"bg-gray-200"}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${bgmEnabled?"translate-x-5":"translate-x-0.5"}`}/>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-700">添加运动BGM 🎵</div>
            <div className="text-xs text-gray-400">{bgmEnabled?"将替换原声，配上节奏感音乐":"保留视频原声"}</div>
          </div>
        </button>
        {bgmEnabled&&!isProcessing&&(
          <label className="mt-3 flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
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
        <div className="flex items-center gap-2 px-1 text-xs text-amber-600">
          <span className="shrink-0">⏱</span>
          <span>预计处理时间：{Math.round(videoDuration / 10)}–{Math.round(videoDuration / 5)} 秒（视频 {Math.round(videoDuration)} 秒）</span>
        </div>
      )}

      <button onClick={run} disabled={!canRun}
        className={`w-full py-4 rounded-2xl text-base font-bold shadow transition-all ${canRun?"bg-orange-500 text-white active:scale-95":"bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
        {isProcessing ? "处理中…" : (videoFile && photoFile) ? "✨ 开始生成集锦" : (videoFile && !photoFile) ? "还差球员照片 ②" : (!videoFile && photoFile) ? "还差比赛视频 ①" : "✨ 开始生成集锦"}
      </button>

      {isProcessing&&(
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 flex-1 mr-2">{statusMsg}</span>
            <span className="text-sm font-bold text-orange-500 shrink-0">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-yellow-400 transition-all duration-500" style={{width:`${progress}%`}}/>
          </div>
          {stage === "analyzing" && analyzeElapsed > 5 && (
            <div className="text-xs text-orange-400 text-center">🔍 已用时 {analyzeElapsed}s，视频越长等待越久</div>
          )}
          <div className="text-xs text-gray-400 text-center">全程本地处理，视频不会上传服务器</div>
        </div>
      )}

      {stage==="error"&&error&&(
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
          <div className="text-sm font-bold text-red-700 mb-1">处理失败</div>
          <div className="text-xs text-red-600 break-all">{error}</div>
          <button onClick={()=>{setStage("idle");setError(null);setProgress(0);}} className="mt-3 text-sm text-red-600 underline">重试</button>
        </div>
      )}
      </>)} {/* end upload mode wrapper */}

      {stage==="done"&&resultUrl&&(
        <div className="rounded-2xl bg-white border border-orange-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-gray-800">🎉 {childName ? `${childName}的` : ""}集锦已生成！</div>
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
              className={`w-full py-3 rounded-xl text-sm font-bold text-center block ${resultBlob && "share" in navigator ? "border border-gray-200 text-gray-600" : "bg-orange-500 text-white"}`}>
              ⬇️ 下载集锦视频
            </a>
          )}
          {isWeChat && (
            <div className="rounded-xl p-3 flex flex-col gap-2" style={{background:"linear-gradient(135deg,#fff3e0,#ffe0b2)",border:"1px solid rgba(249,115,22,0.25)"}}>
              <div className="text-xs font-black text-orange-800">📱 如何保存并分享这个视频</div>
              <div className="flex flex-col gap-1.5 text-xs text-orange-700">
                <div className="flex items-start gap-1.5"><span className="font-black shrink-0 text-orange-500">①</span><span>长按上方视频播放区域</span></div>
                <div className="flex items-start gap-1.5"><span className="font-black shrink-0 text-orange-500">②</span><span>点击「保存视频」存到相册</span></div>
                <div className="flex items-start gap-1.5"><span className="font-black shrink-0 text-orange-500">③</span><span>打开相册 → 选视频 → 发给家人群</span></div>
              </div>
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
          <button onClick={()=>{setStage("idle");setProgress(0);setResultUrl(null);setResultBlob(null);setResultDur(0);setFeedbackRating(0);setFeedbackTypes([]);setFeedbackDone(false);setCaptionCopied(false);setCaptionFallback(null);}} className="text-sm text-gray-400 text-center">重新制作</button>
          <Link href="/parent/profile/stu-001" className="w-full py-2.5 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 text-sm font-bold text-center block active:scale-95 transition-transform">
            {childName ? `📊 查看${childName}的成长档案` : "📊 查看孩子的成长档案"}
          </Link>
          <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
            {!feedbackDone ? (<>
              <div className="text-xs font-bold text-gray-600">集锦效果怎么样？</div>
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
                    <label key={t} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={feedbackTypes.includes(t)}
                        onChange={e=>setFeedbackTypes(p=>e.target.checked?[...p,t]:p.filter(x=>x!==t))}/>
                      {t}
                    </label>
                  ))}
                </div>
              )}
              {feedbackRating>0&&(
                <button onClick={()=>{
                  const entry={time:new Date().toISOString(),rating:feedbackRating,types:feedbackTypes,video:videoFile?.name||""};
                  try{const prev=JSON.parse(localStorage.getItem("highlight_feedback")||"[]");localStorage.setItem("highlight_feedback",JSON.stringify([...prev,entry]));localStorage.setItem("tester_badge","true");}catch{}
                  setFeedbackDone(true);
                }} className="self-start px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-xs font-bold">
                  提交反馈
                </button>
              )}
            </>) : (
              <div className="flex flex-col items-center gap-1">
                <div className="text-xs text-center text-green-600 font-medium">✅ 感谢反馈，帮助我们持续改进！</div>
                <div className="text-xs text-center text-orange-600 font-bold">🏅 测试员徽章已解锁</div>
              </div>
            )}
          </div>
        </div>
      )}

      {stage==="idle"&&myHighlights.length>0&&(
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-bold text-gray-700 mb-2">📼 历史集锦</div>
          <div className="flex flex-col">
            {myHighlights.map((hl,i)=>(
              <div key={i} className="flex items-center justify-between py-2.5 border-t border-gray-50 first:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 font-medium truncate">{hl.name.replace(/\.[^.]+$/,"")}</div>
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
          <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">本地生成的视频不会保存，可随时重新生成</div>
        </div>
      )}

      {stage==="idle"&&(
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
          <div className="text-xs font-bold text-amber-800 mb-2">📸 拍照小贴士 · 效果更好</div>
          <ul className="flex flex-col gap-1.5 text-xs text-amber-700">
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

