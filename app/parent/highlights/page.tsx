"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

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

type Stage = "idle"|"loading_ffmpeg"|"extracting_color"|"writing"|"analyzing"|"cutting"|"done"|"error";

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_FPS     = 1;
const SAMPLE_W       = 240;
const JERSEY_THRESH  = 55;
const COLOR_THRESH   = 60;
const HIGHLIGHT_S    = 15;
const MOTION_THRESH  = 30;

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
  const ctx = canvas.getContext("2d")!;
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

// ── Frame loading from PNG bytes ──────────────────────────────────────────────
// Use Image element — universally supported including WeChat WKWebView

function loadImageFromBytes(bytes: Uint8Array): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const copy = new Uint8Array(bytes.length); copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: "image/png" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    const timer = setTimeout(() => { cleanup(); reject(new Error("frame load timeout")); }, 8000);
    img.onload  = () => { clearTimeout(timer); cleanup(); resolve(img); };
    img.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error("frame load failed")); };
    img.src = url;
  });
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
      for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
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
        for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
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

  // ballNear scores 3× higher than "player visible" — ensures key moments dominate
  return {t:0,hasPlayer:true,ballNear,playerX,playerY,score:ballNear?3.0:0.3};
}

function findBestWindow(scores:FrameScore[], totalDuration:number):[number,number] {
  if (scores.length === 0) return [0, Math.min(totalDuration, HIGHLIGHT_S)];

  // Find the single peak frame — the most important moment
  let peakIdx = 0, peakScore = -Infinity;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i].score > peakScore) { peakScore = scores[i].score; peakIdx = i; }
  }

  const peakT = scores[peakIdx].t;

  // Center 15s around the peak moment, biased slightly before
  // (60% of window before peak so you see the build-up, 40% after)
  const before = HIGHLIGHT_S * 0.6;
  const startT = Math.max(0, peakT - before);
  const endT   = Math.min(totalDuration, startT + HIGHLIGHT_S);
  // If we hit the end boundary, pull start back
  const adjStart = Math.max(0, endT - HIGHLIGHT_S);
  return [adjStart, endT];
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
  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [feedbackTypes,  setFeedbackTypes]  = useState<string[]>([]);
  const [feedbackDone,   setFeedbackDone]   = useState(false);
  const ffmpegRef = useRef<FFmpeg|null>(null);

  // Revoke blob URL whenever resultUrl changes or component unmounts
  // (prevents holding an entire encoded video in memory after user discards result)
  useEffect(() => {
    return () => { if (resultUrl) URL.revokeObjectURL(resultUrl); };
  }, [resultUrl]);

  const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f=e.target.files?.[0]; if (f) setVideoFile(f);
  },[]);
  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f=e.target.files?.[0]; if (!f) return;
    setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f));
  },[]);

  const run = useCallback(async () => {
    if (!videoFile||!photoFile) return;
    setError(null); setResultUrl(null);
    setFeedbackRating(0); setFeedbackTypes([]); setFeedbackDone(false);

    try {
      // ── 1. Load FFmpeg ────────────────────────────────────────────────────
      setStage("loading_ffmpeg"); setProgress(2);
      setStatusMsg("加载视频处理引擎…（首次需30–60秒，请耐心等待）");

      if (!ffmpegRef.current) {
        const ff = new FFmpeg();

        // Animate progress 2→11% while WASM compiles, so it doesn't look frozen
        let fake = 2;
        const ticker = setInterval(() => {
          fake = Math.min(11, fake + 0.25);
          setProgress(Math.round(fake));
        }, 1000);

        try {
          await Promise.race([
            ff.load({ coreURL:"/ffmpeg/ffmpeg-core.js", wasmURL:"/ffmpeg/ffmpeg-core.wasm" }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("视频引擎加载超时（90秒），请在Safari中打开后重试")), 90_000)
            ),
          ]);
        } finally {
          clearInterval(ticker);
        }

        ffmpegRef.current = ff;
      }
      setProgress(12);

      // ── 2. Extract player signature from photo ────────────────────────────
      setStage("extracting_color"); setStatusMsg("提取球员外观特征…");
      const photoUrl = URL.createObjectURL(photoFile);
      const img = new Image();
      await new Promise<void>((res,rej)=>{ img.onload=()=>res(); img.onerror=()=>rej(new Error("无法加载照片")); img.src=photoUrl; });
      const sig = extractPlayerSignature(img);
      URL.revokeObjectURL(photoUrl);
      setProgress(18);

      // ── 3. Write video to FFmpeg FS ───────────────────────────────────────
      setStage("writing"); setStatusMsg("读取视频文件…");
      const ff = ffmpegRef.current!;
      await ff.writeFile("input.mp4", await fetchFile(videoFile));
      setProgress(30);

      // ── 4. Probe duration via FFmpeg log ──────────────────────────────────
      setStage("analyzing"); setStatusMsg("读取视频信息…");
      let duration = 0;
      const onLog = ({ message }: { message: string }) => {
        const m = message.match(/Duration:\s+(\d+):(\d+):([\d.]+)/);
        if (m) duration = parseInt(m[1])*3600 + parseInt(m[2])*60 + parseFloat(m[3]);
      };
      ff.on("log", onLog);
      try { await ff.exec(["-i", "input.mp4", "-t", "0", "-f", "null", "probe"]); } catch {}
      ff.off("log", onLog);
      if (duration <= 0) duration = Math.max(10, videoFile.size / 1024 / 1024 * 8);
      setProgress(33);

      // ── 5. Extract + analyze frames one at a time ─────────────────────────
      // Single-frame extract: no bulk FS writes, minimal memory on mobile
      setStage("analyzing");
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_W;
      let sampleH = Math.round(SAMPLE_W * 9/16);

      const scores: FrameScore[] = [];
      let prevFrame: ImageData|null = null;
      const track: TrackState = {x:-1,y:-1,vx:0,vy:0,framesSinceSeen:999,lastExitX:-1};
      const totalFrames = Math.ceil(duration * SAMPLE_FPS);

      for (let i = 0; i < totalFrames; i++) {
        const t = i / SAMPLE_FPS;
        setStatusMsg(`分析帧 ${i+1} / ${totalFrames}（${Math.round(t)}s）`);

        // Extract single frame at time t
        try {
          await ff.exec([
            "-ss", t.toFixed(3),
            "-i", "input.mp4",
            "-frames:v", "1",
            "-vf", `scale=${SAMPLE_W}:-2`,
            "-f", "image2",
            "-update", "1",   // always overwrite same file
            "frame.png",
          ]);
        } catch {
          break; // seek past end of video
        }

        let pngBytes: Uint8Array;
        try {
          const raw = await ff.readFile("frame.png");
          pngBytes = raw as Uint8Array;
          await ff.deleteFile("frame.png");
        } catch {
          break;
        }

        const frameImg = await loadImageFromBytes(pngBytes);
        if (i === 0) {
          sampleH = Math.round(SAMPLE_W * frameImg.naturalHeight / Math.max(frameImg.naturalWidth, 1));
          canvas.height = sampleH;
        }

        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(frameImg, 0, 0, SAMPLE_W, sampleH);
        const currFrame = ctx.getImageData(0, 0, SAMPLE_W, sampleH);

        const fs = analyzeFrame(currFrame, prevFrame, sig, SAMPLE_W, sampleH, track);
        fs.t = t;
        scores.push(fs);

        if (fs.hasPlayer) {
          if (track.x >= 0) {
            track.vx = track.vx*0.5 + (fs.playerX - track.x)*0.5;
            track.vy = track.vy*0.5 + (fs.playerY - track.y)*0.5;
          }
          const nearEdge = fs.playerX < SAMPLE_W*0.08 || fs.playerX > SAMPLE_W*0.92
                        || fs.playerY < sampleH*0.08  || fs.playerY > sampleH*0.92;
          if (nearEdge) track.lastExitX = fs.playerX;
          track.x = fs.playerX; track.y = fs.playerY; track.framesSinceSeen = 0;
        } else {
          track.framesSinceSeen++;
        }

        prevFrame = currFrame;
        setProgress(33 + Math.round(((i+1) / totalFrames) * 43));
      }

      setProgress(76); setStatusMsg("计算最佳片段…");

      // ── 6. Find best window ───────────────────────────────────────────────
      const [startT, endT] = findBestWindow(scores, duration);
      setProgress(78); setStatusMsg(`精彩片段：${startT.toFixed(1)}s – ${endT.toFixed(1)}s，正在剪辑…`);

      // ── 7. Cut video (file already in FS) ────────────────────────────────
      setStage("cutting");
      const onProgress = ({progress:p}:{progress:number}) => setProgress(78+Math.round(p*20));
      ff.on("progress", onProgress);
      await ff.exec([
        "-ss", startT.toFixed(3), "-i","input.mp4",
        "-t",  (endT-startT).toFixed(3),
        "-c:v","libx264","-preset","ultrafast","-crf","28",
        "-vf", "scale=720:-2",
        "-c:a","aac","-b:a","96k","-movflags","+faststart",
        "-y","highlight.mp4",
      ]);
      ff.off("progress", onProgress);

      const data = await ff.readFile("highlight.mp4");
      const raw  = data as Uint8Array;
      const copy = new Uint8Array(raw.length); copy.set(raw);
      const blob = new Blob([copy.buffer],{type:"video/mp4"});
      await ff.deleteFile("input.mp4"); await ff.deleteFile("highlight.mp4");

      setResultUrl(URL.createObjectURL(blob));
      setResultName(videoFile.name.replace(/\.[^.]+$/,"")+"_highlight.mp4");
      setStage("done"); setProgress(100); setStatusMsg("集锦生成完成！");

    } catch(e) {
      console.error(e);
      if (ffmpegRef.current) {
        try { await ffmpegRef.current.deleteFile("input.mp4"); } catch {}
        try { await ffmpegRef.current.deleteFile("frame.png"); } catch {}
        try { await ffmpegRef.current.deleteFile("highlight.mp4"); } catch {}
      }
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "未知错误，请在Safari浏览器中打开后重试");
      setStage("error");
    }
  }, [videoFile, photoFile]);

  const isProcessing = ["loading_ffmpeg","extracting_color","writing","analyzing","cutting"].includes(stage);
  const canRun = !!(videoFile && photoFile && !isProcessing);

  return (
    <div className="pb-16 flex flex-col gap-5">
      <div className="rounded-3xl p-5 shadow-lg" style={{background:"linear-gradient(135deg,#f7971e 0%,#ffd200 100%)"}}>
        <div className="text-2xl font-black mb-1" style={{color:"#7C3810"}}>🎬 生成精彩集锦</div>
        <p className="text-sm" style={{color:"#7C3810",opacity:0.85}}>
          上传比赛视频 + 球员照片，自动剪辑有球精彩片段（约15秒），全程本地处理不上传服务器。
        </p>
      </div>

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
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-bold text-gray-700 mb-1">② 上传球员参考照片</div>
        <div className="text-xs text-gray-400 mb-3">全身照效果最佳，会识别球衣、裤子、鞋袜颜色</div>
        <label className={`flex gap-4 items-center rounded-xl border-2 border-dashed p-4 cursor-pointer ${photoFile?"border-orange-300 bg-orange-50":"border-gray-200 bg-gray-50"}`}>
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={isProcessing}/>
          {photoPreview?(
            <><img src={photoPreview} alt="参考照片" className="w-20 h-20 object-cover rounded-xl border border-orange-200 shrink-0"/>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-orange-700 break-all">{photoFile?.name}</div>
              <div className="text-xs text-gray-400 mt-1">点击更换</div>
            </div></>
          ):(
            <div className="flex flex-col items-center gap-2 w-full py-3">
              <span className="text-3xl text-gray-300">🏀</span>
              <span className="text-sm text-gray-500">点击选择球员照片</span>
            </div>
          )}
        </label>
      </div>

      <button onClick={run} disabled={!canRun}
        className={`w-full py-4 rounded-2xl text-base font-bold shadow transition-all ${canRun?"bg-orange-500 text-white active:scale-95":"bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
        {isProcessing?"处理中…":"✨ 开始生成集锦"}
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

      {stage==="done"&&resultUrl&&(
        <div className="rounded-2xl bg-white border border-orange-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-gray-800">🎉 集锦已生成！</div>
          <video src={resultUrl} controls playsInline className="w-full rounded-xl bg-black" style={{maxHeight:280}}/>
          <a href={resultUrl} download={resultName} className="w-full py-3 rounded-xl bg-orange-500 text-white text-sm font-bold text-center block">下载集锦视频</a>
          <button onClick={()=>{setStage("idle");setProgress(0);setResultUrl(null);setVideoFile(null);setPhotoFile(null);setPhotoPreview(null);}} className="text-sm text-gray-400 text-center">重新制作</button>
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
                  try{const prev=JSON.parse(localStorage.getItem("highlight_feedback")||"[]");localStorage.setItem("highlight_feedback",JSON.stringify([...prev,entry]));}catch{}
                  setFeedbackDone(true);
                }} className="self-start px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-xs font-bold">
                  提交反馈
                </button>
              )}
            </>) : (
              <div className="text-xs text-center text-green-600 font-medium">✅ 感谢反馈，帮助我们持续改进！</div>
            )}
          </div>
        </div>
      )}

      {stage==="idle"&&(
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
          <div className="text-xs font-bold text-blue-700 mb-2">识别原理（5类特征交叉验证）</div>
          <ul className="flex flex-col gap-1 text-xs text-blue-600">
            <li>👕 <b>外观</b>：球衣 + 裤子 + 袜子 + 鞋子颜色</li>
            <li>📍 <b>位置</b>：速度矢量预测下一帧出现位置</li>
            <li>⏱ <b>时间</b>：失踪越久，位置置信度越低</li>
            <li>🏀 <b>球场</b>：超出物理速度极限的跳变会被惩罚</li>
            <li>🖼 <b>帧提取</b>：由FFmpeg直接解码，兼容所有浏览器</li>
          </ul>
          <div className="mt-2 text-xs text-blue-500">提示：参考照片用全身照效果更好</div>
        </div>
      )}
    </div>
  );
}

