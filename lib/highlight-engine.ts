// ── Types ─────────────────────────────────────────────────────────────────────

export interface RGBColor { r: number; g: number; b: number }

export interface PlayerSignature {
  jersey:  RGBColor;
  shorts:  RGBColor;
  sock:    RGBColor;
  shoe:    RGBColor;
  hasShorts: boolean;
  hasSock:   boolean;
  hasShoe:   boolean;
}

export interface TrackState {
  x: number; y: number;
  vx: number; vy: number;
  framesSinceSeen: number;
  lastExitX: number;
}

export interface FrameScore {
  t: number;
  hasPlayer: boolean;
  ballNear: boolean;
  playerX: number; playerY: number;
  score: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const SAMPLE_FPS    = 1;
export const SAMPLE_W      = 240;
export const JERSEY_THRESH = 55;
export const COLOR_THRESH  = 60;
export const HIGHLIGHT_S   = 15;
export const MOTION_THRESH = 30;
export const DIRS4: ReadonlyArray<[number, number]> = [[-1,0],[1,0],[0,-1],[0,1]];

// ── Color utilities ───────────────────────────────────────────────────────────

export function colorDist(r: number, g: number, b: number, ref: RGBColor) {
  return (Math.abs(r-ref.r) + Math.abs(g-ref.g) + Math.abs(b-ref.b)) / 3;
}

export function avgColorFromData(data: Uint8ClampedArray, excludeSkin = false): RGBColor {
  let rS=0, gS=0, bS=0, n=0;
  for (let i=0; i<data.length; i+=4) {
    const r=data[i], g=data[i+1], b=data[i+2];
    if (excludeSkin && r>140 && r>g*1.3 && r>b*1.3) continue;
    rS+=r; gS+=g; bS+=b; n++;
  }
  return n ? {r:rS/n, g:gS/n, b:bS/n} : {r:128,g:128,b:128};
}

export function colorVariance(data: Uint8ClampedArray, avg: RGBColor): number {
  let v=0, n=0;
  for (let i=0; i<data.length; i+=4) { v+=colorDist(data[i],data[i+1],data[i+2],avg); n++; }
  return n ? v/n : 0;
}

export function regionMatchRatio(
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

export function extractPlayerSignature(img: HTMLImageElement): PlayerSignature {
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

// ── Per-frame analysis ────────────────────────────────────────────────────────

export function analyzeFrame(
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

  let best=blobs[0], bestScore=-Infinity;
  for (const b of blobs) {
    let s = Math.min(b.size*0.3, 40) - b.spread*0.2;
    const halfH = b.bh/2;
    if (sig.hasShorts) s += regionMatchRatio(d,w,h,b.cx,b.cy+halfH*0.7,b.bw*0.7,halfH*0.4,sig.shorts,COLOR_THRESH)*45;
    if (sig.hasSock)   s += regionMatchRatio(d,w,h,b.cx,b.cy+halfH*1.5,b.bw*0.5,halfH*0.25,sig.sock,COLOR_THRESH)*35;
    if (sig.hasShoe)   s += regionMatchRatio(d,w,h,b.cx,b.cy+halfH*1.8,b.bw*0.6,halfH*0.25,sig.shoe,COLOR_THRESH)*50;
    const decay = Math.exp(-track.framesSinceSeen*0.5);
    if (track.framesSinceSeen < 30) {
      const predX=track.x+track.vx*(track.framesSinceSeen+1), predY=track.y+track.vy*(track.framesSinceSeen+1);
      s += Math.max(0, 90 - Math.hypot(b.cx-predX,b.cy-predY)*1.2) * decay;
      const maxMove = 60+track.framesSinceSeen*55;
      if (Math.hypot(b.cx-track.x,b.cy-track.y) > maxMove) s*=0.15;
      if (track.lastExitX>=0 && track.framesSinceSeen<5) {
        const exitLeft=track.lastExitX<w*0.15, exitRight=track.lastExitX>w*0.85;
        const bLeft=b.cx<w*0.15, bRight=b.cx>w*0.85;
        if ((exitLeft&&bRight)||(exitRight&&bLeft)) s*=0.1;
      }
    }
    if (s>bestScore) { bestScore=s; best=b; }
  }

  const playerX=best.cx, playerY=best.cy, playerR=Math.sqrt(best.size/Math.PI)*1.8;
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
  const confidence = Math.min(1, Math.max(0, bestScore) / 150);
  const baseScore = ballNear ? 3.0 : 0.3;
  return {t:0,hasPlayer:true,ballNear,playerX,playerY,score:baseScore*(0.5+confidence*0.5)};
}

// ── Beat WAV generator ────────────────────────────────────────────────────────

export function generateBeatWAV(durationSec: number): Uint8Array {
  const SR = 44100;
  const N   = Math.ceil(SR * durationSec);
  const mix = new Float32Array(N);
  const beatSec = 60 / 120;
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
  const renderSnare = (startSec: number) => {
    const s0 = Math.round(startSec * SR);
    const len = Math.min(Math.round(0.20 * SR), N - s0);
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      mix[s0 + j] += 0.50 * ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 200 * t) * 0.4) * Math.exp(-t * 25);
    }
  };
  const renderHat = (startSec: number, open: boolean) => {
    const s0 = Math.round(startSec * SR);
    const dur = open ? 0.14 : 0.045;
    const len = Math.min(Math.round(dur * SR), N - s0);
    const amp = open ? 0.20 : 0.16;
    const dec = open ? 18 : 100;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      mix[s0 + j] += amp * (Math.random() * 2 - 1) * Math.exp(-t * dec);
    }
  };
  const renderBass = (startSec: number, freq: number) => {
    const s0 = Math.round(startSec * SR);
    const len = Math.min(Math.round(beatSec * SR), N - s0);
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      ph += (2 * Math.PI * freq) / SR;
      mix[s0 + j] += 0.38 * (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * Math.min(1, t * 40) * Math.exp(-t * 2);
    }
  };
  const bassLine = [55, 55, 82, 73];
  const totalBeats = Math.ceil(durationSec / beatSec) + 4;
  for (let b = 0; b < totalBeats; b++) {
    const t = b * beatSec;
    const bib = b % 4;
    if (bib === 0 || bib === 2) renderKick(t);
    if (bib === 1 || bib === 3) renderSnare(t);
    renderHat(t, bib === 2);
    renderHat(t + beatSec / 2, false);
    renderBass(t, bassLine[bib]);
  }
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
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true);
  dv.setUint16(32, 2, true);  dv.setUint16(34, 16, true);
  [0x64,0x61,0x74,0x61].forEach((c,i)=>{ u8[36+i]=c; });
  dv.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(pcm);
  return u8;
}

// ── Window & segment finders ──────────────────────────────────────────────────

export function findBestWindow(scores: FrameScore[], totalDuration: number, bgmBpm=0): [number,number] {
  if (scores.length === 0) return [0, Math.min(totalDuration, HIGHLIGHT_S)];
  const n = scores.length;
  const windowFrames = Math.min(n, Math.max(1, Math.round(HIGHLIGHT_S * SAMPLE_FPS)));
  const cumSum = new Array(n + 1).fill(0);
  const cumPlayer = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    cumSum[i + 1]    = cumSum[i]    + scores[i].score;
    cumPlayer[i + 1] = cumPlayer[i] + (scores[i].hasPlayer ? 1 : 0);
  }
  let bestWinStart = 0, bestWinScore = -Infinity;
  for (let i = 0; i <= n - windowFrames; i++) {
    const ws = cumSum[i + windowFrames] - cumSum[i];
    const playerRatio = (cumPlayer[i + windowFrames] - cumPlayer[i]) / windowFrames;
    const adjusted = ws * (0.3 + playerRatio * 0.7);
    if (adjusted > bestWinScore) { bestWinScore = adjusted; bestWinStart = i; }
  }
  const winEnd = Math.min(bestWinStart + windowFrames, n);
  let peakIdx = bestWinStart;
  for (let i = bestWinStart + 1; i < winEnd; i++) {
    if (scores[i].score > scores[peakIdx].score) peakIdx = i;
  }
  let startT = scores[bestWinStart].t;
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

export function findHighlightSegments(scores: FrameScore[], totalDuration: number): Array<[number, number]> {
  const events: Array<[number, number]> = [];
  let runStart = -1;
  for (let i = 0; i < scores.length; i++) {
    const active = scores[i].hasPlayer && scores[i].ballNear;
    if (active  && runStart < 0) runStart = i;
    if (!active && runStart >= 0) { events.push([scores[runStart].t, scores[i - 1].t]); runStart = -1; }
  }
  if (runStart >= 0) events.push([scores[runStart].t, scores[scores.length - 1].t]);
  if (events.length === 0) return [];
  const merged: Array<[number, number]> = [[events[0][0], events[0][1]]];
  for (let i = 1; i < events.length; i++) {
    const last = merged[merged.length - 1];
    if (events[i][0] - last[1] <= 3.0) { last[1] = events[i][1]; }
    else { merged.push([events[i][0], events[i][1]]); }
  }
  return merged.map(([s, e]) => [Math.max(0, s - 0.8), Math.min(totalDuration, e + 0.8)] as [number, number]);
}

// ── Native video seek ─────────────────────────────────────────────────────────

export function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
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

// ── MediaRecorder-based cutters ───────────────────────────────────────────────

export async function cutVideoNative(
  videoEl: HTMLVideoElement, startT: number, endT: number,
  bgmBlob: Blob | null, onProgress?: (p: number) => void,
): Promise<Blob> {
  const duration = Math.max(0.5, endT - startT);
  const w = Math.min(720, videoEl.videoWidth || 720);
  const h = Math.round(w * (videoEl.videoHeight || 1280) / Math.max(videoEl.videoWidth || 720, 1));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx2 = canvas.getContext("2d")!;
  const captureFn = (canvas as any).captureStream ?? (canvas as any).mozCaptureStream;
  if (typeof captureFn !== "function") throw new Error("当前浏览器暂不支持视频录制，请使用 Chrome 浏览器或最新版微信。");
  const canvasStream: MediaStream = captureFn.call(canvas, 30);
  const mimeType = ["video/mp4;codecs=avc1,mp4a.40.2","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"]
    .find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) ?? "video/webm";
  const safeType = mimeType.split(";")[0] || "video/webm";
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
    const drawLoop = () => { if (!stopped) { ctx2.drawImage(videoEl, 0, 0, w, h); requestAnimationFrame(drawLoop); } };
    requestAnimationFrame(drawLoop);
    const wallStart = Date.now();
    const tick = setInterval(() => {
      const elapsed = (Date.now() - wallStart) / 1000;
      onProgress?.(Math.min(elapsed / duration, 0.95));
      if (elapsed >= duration + 0.5) { clearInterval(tick); stopAll(); }
    }, 200);
    setTimeout(() => { clearInterval(tick); stopAll(); }, (duration + 4) * 1000);
  });
}

export async function cutMultiVideoNative(
  clips: Array<{ el: HTMLVideoElement; start: number; end: number; dur: number }>,
  bgmBlob: Blob | null, onProgress?: (p: number) => void,
): Promise<Blob> {
  const totalDur = clips.reduce((s, c) => s + c.dur, 0);
  const first = clips[0].el;
  const w = Math.min(720, first.videoWidth || 720);
  const h = Math.round(w * (first.videoHeight || 1280) / Math.max(first.videoWidth || 720, 1));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const captureFn = (canvas as any).captureStream ?? (canvas as any).mozCaptureStream;
  if (typeof captureFn !== "function") throw new Error("当前浏览器不支持视频录制");
  const canvasStream: MediaStream = captureFn.call(canvas, 30);
  const mimeType = ["video/mp4;codecs=avc1,mp4a.40.2","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"]
    .find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) ?? "video/webm";
  const safeType = mimeType.split(";")[0] || "video/webm";
  const audioTracks: MediaStreamTrack[] = [];
  let audioCtx: AudioContext | null = null;
  if (bgmBlob) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        audioCtx = new AC() as AudioContext;
        const dest = audioCtx.createMediaStreamDestination();
        const buf = await audioCtx.decodeAudioData(await bgmBlob.arrayBuffer());
        const src = audioCtx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const gain = audioCtx.createGain(); gain.gain.value = 0.8;
        src.connect(gain); gain.connect(dest);
        src.start(0); src.stop(audioCtx.currentTime + totalDur + 2);
        audioTracks.push(...dest.stream.getAudioTracks());
      }
    } catch {}
  }
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
  const recorder = new MediaRecorder(stream, { mimeType: safeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => { audioCtx?.close().catch(()=>{}); resolve(new Blob(chunks, { type: recorder.mimeType || safeType })); };
    recorder.onerror = () => reject(new Error("视频录制失败，请重试"));
    recorder.start(200);
    let clipIdx = 0, elapsed = 0, stopped = false;
    let activeEl: HTMLVideoElement | null = null;
    const drawLoop = () => { if (!stopped) { if (activeEl) ctx.drawImage(activeEl, 0, 0, w, h); requestAnimationFrame(drawLoop); } };
    requestAnimationFrame(drawLoop);
    const runNextClip = async () => {
      if (clipIdx >= clips.length || stopped) {
        stopped = true;
        try { recorder.stop(); } catch {}
        return;
      }
      const clip = clips[clipIdx++];
      activeEl = clip.el;
      await seekVideoTo(clip.el, clip.start).catch(() => {});
      clip.el.play().catch(() => {});
      const clipStart = Date.now();
      const tick = setInterval(() => {
        const e = (Date.now() - clipStart) / 1000;
        onProgress?.((elapsed + e) / totalDur);
        if (e >= clip.dur + 0.5 || clip.el.currentTime >= clip.end) {
          clearInterval(tick);
          clip.el.pause();
          elapsed += clip.dur;
          runNextClip();
        }
      }, 200);
      setTimeout(() => { clearInterval(tick); clip.el.pause(); elapsed += clip.dur; runNextClip(); }, (clip.dur + 2) * 1000);
    };
    runNextClip().catch(reject);
  });
}
