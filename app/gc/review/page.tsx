"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIONS = [
  { label: "2分命中", pts: 2, cat: "2pt" },
  { label: "2分不中", pts: 0, cat: "2pt_miss" },
  { label: "3分命中", pts: 3, cat: "3pt" },
  { label: "3分不中", pts: 0, cat: "3pt_miss" },
  { label: "罚球命中", pts: 1, cat: "ft" },
  { label: "罚球不中", pts: 0, cat: "ft_miss" },
  { label: "进攻篮板", pts: 0, cat: "oreb" },
  { label: "防守篮板", pts: 0, cat: "dreb" },
  { label: "助攻",     pts: 0, cat: "ast" },
  { label: "抢断",     pts: 0, cat: "stl" },
  { label: "盖帽",     pts: 0, cat: "blk" },
  { label: "失误",     pts: 0, cat: "tov" },
] as const;

type ActionCat = typeof ACTIONS[number]["cat"];
type TeamId = "home" | "away";

const TEAMS = [
  {
    id: "home" as TeamId,
    name: "PAB篮球",
    color: "#F97316",
    players: [
      { id: "p1", num: "3",  name: "蒋皓博" },
      { id: "p2", num: "10", name: "王弘涛" },
      { id: "p3", num: "7",  name: "李逸凡" },
      { id: "p4", num: "14", name: "张博宇" },
      { id: "p5", num: "25", name: "陈雨轩" },
    ],
  },
  {
    id: "away" as TeamId,
    name: "STB铁骑",
    color: "#3B82F6",
    players: [
      { id: "p6",  num: "25", name: "黄天翔" },
      { id: "p7",  num: "88", name: "汤艺豪" },
      { id: "p8",  num: "49", name: "杨光"   },
      { id: "p9",  num: "0",  name: "范品维" },
      { id: "p10", num: "97", name: "叶飞"   },
    ],
  },
];

// Clip buffer: 3s before the event, 5s after
const PRE_S  = 3;
const POST_S = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameEvent {
  id: string;
  videoTs: number;
  teamId: TeamId;
  playerId: string;
  playerName: string;
  playerNum: string;
  action: string;
  pts: number;
  cat: ActionCat;
}

type Phase = "setup" | "tagging" | "review" | "cutting" | "done" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Merge overlapping [start, end] segments
function mergeSegs(segs: [number, number][]): [number, number][] {
  if (segs.length === 0) return [];
  const sorted = [...segs].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      out.push([sorted[i][0], sorted[i][1]]);
    }
  }
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GcReviewPage() {
  const [phase,      setPhase]      = useState<Phase>("setup");
  const [videoFile,  setVideoFile]  = useState<File | null>(null);
  const [videoUrl,   setVideoUrl]   = useState<string | null>(null);
  const [events,     setEvents]     = useState<GameEvent[]>([]);
  const [selTeam,    setSelTeam]    = useState<TeamId>("home");
  const [selPlayer,  setSelPlayer]  = useState<string | null>(null);
  const [progress,   setProgress]   = useState(0);
  const [statusMsg,  setStatusMsg]  = useState("");
  const [resultUrl,  setResultUrl]  = useState<string | null>(null);
  const [resultName, setResultName] = useState("highlight.mp4");
  const [error,      setError]      = useState<string | null>(null);

  const videoRef      = useRef<HTMLVideoElement | null>(null);
  const replayRef     = useRef<HTMLVideoElement | null>(null);
  const ffmpegRef     = useRef<FFmpeg | null>(null);
  const ffmpegInitRef = useRef<Promise<void> | null>(null);

  function seekTo(videoTs: number) {
    const v = replayRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, videoTs - PRE_S);
    v.play().catch(() => {});
  }

  // Revoke blob URLs on unmount
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);
  useEffect(() => () => { if (videoUrl)  URL.revokeObjectURL(videoUrl);  }, [videoUrl]);

  // Deduplicated FFmpeg loader with CDN → local fallback and 90s timeout
  const ensureFFmpegLoaded = useCallback(async () => {
    if (ffmpegRef.current) return;
    if (!ffmpegInitRef.current) {
      ffmpegInitRef.current = (async () => {
        const CDN_JS   = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js";
        const CDN_WASM = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm";
        let coreURL = "/ffmpeg/ffmpeg-core.js";
        let wasmURL = "/ffmpeg/ffmpeg-core.wasm";
        try {
          const r = await Promise.race([
            fetch(CDN_JS, { method: "HEAD" }),
            new Promise<never>((_, rej) => setTimeout(() => rej(), 5000)),
          ]);
          if (r.ok) { coreURL = CDN_JS; wasmURL = CDN_WASM; }
        } catch {}
        const ff = new FFmpeg();
        await Promise.race([
          ff.load({ coreURL, wasmURL }),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("视频引擎加载超时，请在 WiFi 环境下重试")), 90_000)
          ),
        ]);
        ffmpegRef.current = ff;
      })();
    }
    await ffmpegInitRef.current;
  }, []);

  // Silently preload FFmpeg while user is on setup/tagging screens
  useEffect(() => {
    ensureFFmpegLoaded().catch(() => { ffmpegInitRef.current = null; });
  }, [ensureFFmpegLoaded]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
  }

  function logEvent(action: typeof ACTIONS[number]) {
    if (!selPlayer) return;
    const team   = TEAMS.find((t) => t.id === selTeam);
    const player = team?.players.find((p) => p.id === selPlayer);
    if (!team || !player) return;
    const videoTs = videoRef.current?.currentTime ?? 0;
    setEvents((prev) => [
      {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        videoTs,
        teamId: selTeam,
        playerId: selPlayer,
        playerName: player.name,
        playerNum: player.num,
        action: action.label,
        pts: action.pts,
        cat: action.cat,
      },
      ...prev,
    ]);
  }

  const generateHighlight = useCallback(async () => {
    if (!videoFile || events.length === 0) return;
    setPhase("cutting");
    setProgress(0);
    setError(null);

    try {
      // 1. Load FFmpeg
      setStatusMsg(ffmpegRef.current ? "视频引擎已就绪，开始处理…" : "加载视频处理引擎…（首次需30–60秒）");
      if (!ffmpegRef.current) {
        let fake = 0;
        const ticker = setInterval(() => {
          fake = Math.min(20, fake + 0.5);
          setProgress(Math.round(fake));
        }, 1000);
        try {
          await ensureFFmpegLoaded();
        } finally {
          clearInterval(ticker);
        }
      }
      const ff = ffmpegRef.current!;
      setProgress(20);

      // 2. Write video to WASM FS
      setStatusMsg("正在写入视频数据…");
      await ff.writeFile("input.mp4", await fetchFile(videoFile));
      setProgress(40);

      // 3. Build segments from events (sorted, merged)
      const rawSegs: [number, number][] = events.map((e) => [
        Math.max(0, e.videoTs - PRE_S),
        e.videoTs + POST_S,
      ]);
      const segs = mergeSegs(rawSegs);
      const totalDur = segs.reduce((sum, [s, e]) => sum + (e - s), 0);
      setStatusMsg(`找到 ${segs.length} 个片段（共 ${totalDur.toFixed(0)}s），正在剪辑…`);

      // 4. FFmpeg multi-input concat
      const args: string[] = [];
      for (const [s, e] of segs) {
        args.push("-ss", s.toFixed(3), "-t", (e - s).toFixed(3), "-i", "input.mp4");
      }

      const n = segs.length;
      if (n === 1) {
        args.push(
          "-vf", "scale=720:-2",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
          "-c:a", "aac", "-b:a", "96k",
          "-movflags", "+faststart",
          "-y", "highlight.mp4",
        );
      } else {
        const concatV = segs.map((_, i) => `[${i}:v]`).join("");
        const concatA = segs.map((_, i) => `[${i}:a]`).join("");
        args.push(
          "-filter_complex",
          `${concatV}concat=n=${n}:v=1[rawv];${concatA}concat=n=${n}:v=0:a=1[rawa];[rawv]scale=720:-2[cv]`,
          "-map", "[cv]", "-map", "[rawa]",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
          "-c:a", "aac", "-b:a", "96k",
          "-movflags", "+faststart",
          "-y", "highlight.mp4",
        );
      }

      const encodeLog: string[] = [];
      const onLog      = ({ message }: { message: string }) => {
        if (/error|invalid|failed/i.test(message)) encodeLog.push(message);
      };
      const onProgress = ({ progress: p }: { progress: number }) =>
        setProgress(40 + Math.round(p * 55));
      ff.on("log",      onLog);
      ff.on("progress", onProgress);
      let ret: number;
      try {
        ret = await ff.exec(args);
      } finally {
        ff.off("log",      onLog);
        ff.off("progress", onProgress);
      }
      if (ret !== 0) throw new Error(`FFmpeg 编码失败 (exit ${ret}) ${encodeLog.slice(-1).join("")}`);

      // 5. Read result, clean up WASM FS
      const data = await ff.readFile("highlight.mp4");
      const raw  = data as Uint8Array;
      const copy = new Uint8Array(raw.length);
      copy.set(raw);
      const blob = new Blob([copy.buffer], { type: "video/mp4" });
      try { await ff.deleteFile("input.mp4");     } catch {}
      try { await ff.deleteFile("highlight.mp4"); } catch {}

      setResultUrl(URL.createObjectURL(blob));
      setResultName((videoFile.name.replace(/\.[^.]+$/, "") || "game") + "_highlight.mp4");
      setStatusMsg(`${events.length} 个打点 · ${segs.length} 个片段 · 共 ${totalDur.toFixed(0)}s`);
      setProgress(100);
      setPhase("done");

    } catch (e) {
      if (ffmpegRef.current) {
        try { await ffmpegRef.current.deleteFile("input.mp4");     } catch {}
        try { await ffmpegRef.current.deleteFile("highlight.mp4"); } catch {}
      }
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [videoFile, events, ensureFFmpegLoaded]);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const currentTeam = TEAMS.find((t) => t.id === selTeam)!;

  const actionBtn = (
    a: typeof ACTIONS[number],
    py: string,
    fontSize: string,
    activeBg: string,
    activeColor: string,
    disabled: boolean,
  ) => (
    <button
      key={a.cat}
      onClick={() => logEvent(a)}
      disabled={disabled}
      className={`${py} rounded-xl font-bold leading-tight transition-colors ${fontSize}`}
      style={
        disabled
          ? { background: "rgba(255,255,255,0.04)", color: "#374151" }
          : { background: activeBg, color: activeColor }
      }
    >
      {a.label}
    </button>
  );

  // ── Phase: SETUP ─────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="flex flex-col gap-5 pb-10" style={{ background: "#0f1117", minHeight: "100vh" }}>
        <div className="text-center pt-8 px-4">
          <div className="text-2xl font-black text-white mb-1">🎬 视频打点集锦</div>
          <div className="text-sm text-gray-500 leading-relaxed">
            上传一节比赛视频 · 边看边记录事件 · 自动切片生成集锦
          </div>
        </div>

        <div className="px-4">
          <div className="rounded-2xl bg-[#1a1d27] border border-white/10 p-4">
            <div className="text-sm font-bold text-gray-300 mb-3">上传比赛视频</div>
            <label
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${
                videoFile ? "border-orange-500/50 bg-orange-500/5" : "border-white/10"
              }`}
            >
              <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} />
              {videoFile ? (
                <>
                  <span className="text-2xl">✅</span>
                  <span className="text-sm font-medium text-orange-400 text-center break-all">{videoFile.name}</span>
                  <span className="text-xs text-gray-500">{(videoFile.size / 1024 / 1024).toFixed(1)} MB · 点击更换</span>
                </>
              ) : (
                <>
                  <span className="text-4xl text-gray-600">🎥</span>
                  <span className="text-sm text-gray-400">点击选择视频文件</span>
                  <span className="text-xs text-gray-600">支持 MP4、MOV 等格式</span>
                </>
              )}
            </label>
          </div>
        </div>

        <div className="px-4 rounded-2xl">
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-4 text-xs text-gray-500 leading-relaxed">
            <div className="font-bold text-gray-400 mb-2">📖 使用方式</div>
            <div className="flex flex-col gap-1.5">
              <div>① 上传视频后进入打点界面，视频在顶部播放</div>
              <div>② 选择球员，在事件发生时点击对应按钮（如「2分命中」）</div>
              <div>③ 系统自动记录视频时间戳，每次打点生成前3秒/后5秒片段</div>
              <div>④ 打点完成后一键生成集锦，支持下载</div>
            </div>
          </div>
        </div>

        <div className="px-4 flex flex-col gap-3">
          <button
            onClick={() => setPhase("tagging")}
            disabled={!videoFile}
            className={`w-full py-4 rounded-2xl font-black text-base transition-all ${
              videoFile
                ? "bg-orange-500 text-white active:scale-95"
                : "bg-white/5 text-gray-600 cursor-not-allowed"
            }`}
          >
            开始打点 →
          </button>
          <Link href="/gc" className="text-center text-sm text-gray-600">
            ← 返回
          </Link>
        </div>
      </div>
    );
  }

  // ── Phase: TAGGING ───────────────────────────────────────────────────────────

  if (phase === "tagging") {
    const scoring  = ACTIONS.filter((a) => a.pts > 0);
    const misses   = ACTIONS.filter((a) => a.pts === 0 && a.cat.endsWith("_miss"));
    const statActs = ACTIONS.filter((a) => a.pts === 0 && !a.cat.endsWith("_miss"));
    const disabled = !selPlayer;

    return (
      <div className="flex flex-col min-h-screen" style={{ background: "#0f1117" }}>
        {/* Video player */}
        <div className="bg-black shrink-0">
          <video
            ref={videoRef}
            src={videoUrl ?? undefined}
            controls
            playsInline
            className="w-full"
            style={{ maxHeight: 200 }}
          />
        </div>

        {/* Status bar */}
        <div className="bg-[#1a1d27] border-b border-white/10 px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-500">
            {events.length > 0 ? `${events.length} 个打点` : "选择球员后点击事件按钮"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setEvents((p) => p.slice(1))}
              disabled={events.length === 0}
              className={`text-xs font-bold px-2 py-1 rounded ${
                events.length > 0 ? "text-orange-400" : "text-gray-700"
              }`}
            >
              撤销
            </button>
            <button
              onClick={() => setPhase("review")}
              className="px-3 py-1 rounded-lg text-xs font-black bg-green-600 text-white"
            >
              完成 →
            </button>
          </div>
        </div>

        {/* Team toggle */}
        <div className="flex gap-2 px-3 pt-2 shrink-0">
          {TEAMS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setSelTeam(t.id); setSelPlayer(null); }}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold"
              style={
                selTeam === t.id
                  ? { background: t.color, color: "#fff" }
                  : { background: "rgba(255,255,255,0.06)", color: "#6B7280" }
              }
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Player chips */}
        <div className="flex flex-wrap gap-1.5 px-3 pt-1.5 shrink-0">
          {currentTeam.players.map((p) => {
            const active = selPlayer === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelPlayer(active ? null : p.id)}
                className="px-2 py-1 rounded-lg text-xs font-bold border"
                style={
                  active
                    ? { background: currentTeam.color, borderColor: currentTeam.color, color: "#fff" }
                    : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "#6B7280" }
                }
              >
                #{p.num} {p.name}
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-1.5 px-3 pt-2 shrink-0">
          {scoring.map((a) => actionBtn(a, "py-4", "text-sm", "rgba(249,115,22,0.90)", "#fff", disabled))}
        </div>
        <div className="grid grid-cols-3 gap-1.5 px-3 pt-1 shrink-0">
          {misses.map((a) => actionBtn(a, "py-2.5", "text-xs", "rgba(239,68,68,0.20)", "#F87171", disabled))}
        </div>
        <div className="grid grid-cols-3 gap-1.5 px-3 pt-1 shrink-0">
          {statActs.map((a) => actionBtn(a, "py-2", "text-xs", "rgba(255,255,255,0.10)", "#D1D5DB", disabled))}
        </div>

        {/* Recent events feed */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
          {events.slice(0, 10).map((e) => {
            const team = TEAMS.find((t) => t.id === e.teamId);
            return (
              <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
                <div className="w-1 h-4 rounded-full shrink-0" style={{ background: team?.color ?? "#6B7280" }} />
                <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{fmt(e.videoTs)}</span>
                <span className="flex-1 text-xs text-gray-300 truncate">
                  #{e.playerNum} {e.playerName}
                  <span className="text-gray-500 ml-1">{e.action}</span>
                </span>
                {e.pts > 0 && <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>}
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="text-xs text-gray-700 text-center py-6">暂无打点记录</div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: REVIEW ────────────────────────────────────────────────────────────

  if (phase === "review") {
    const sorted = [...events].sort((a, b) => a.videoTs - b.videoTs);
    const rawSegs = events.map((e) => [Math.max(0, e.videoTs - PRE_S), e.videoTs + POST_S] as [number, number]);
    const merged  = mergeSegs(rawSegs);
    const totalDur = merged.reduce((sum, [s, e]) => sum + (e - s), 0);

    return (
      <div className="flex flex-col gap-3 pb-10 px-4" style={{ background: "#0f1117", minHeight: "100vh" }}>
        <div className="text-center pt-6">
          <div className="text-xl font-black text-white">确认打点列表</div>
          <div className="text-xs text-gray-500 mt-1">
            {events.length} 个打点 → {merged.length} 个片段 · 总时长约 {totalDur.toFixed(0)}s
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {sorted.map((e) => {
            const team = TEAMS.find((t) => t.id === e.teamId);
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1a1d27] border border-white/10"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: team?.color ?? "#6B7280" }} />
                <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{fmt(e.videoTs)}</span>
                <span className="flex-1 text-sm text-gray-300 truncate">
                  #{e.playerNum} {e.playerName}
                  <span className="text-gray-500 ml-1">· {e.action}</span>
                </span>
                {e.pts > 0 && <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>}
                <button
                  onClick={() => setEvents((prev) => prev.filter((x) => x.id !== e.id))}
                  className="text-gray-600 hover:text-red-400 text-sm shrink-0 w-6 text-center"
                >
                  ✕
                </button>
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="text-center text-gray-600 text-sm py-10">已删除所有打点</div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setPhase("tagging")}
            className="flex-1 py-3 rounded-xl border border-white/20 text-sm font-bold text-gray-300"
          >
            ← 继续打点
          </button>
          <button
            onClick={generateHighlight}
            disabled={events.length === 0}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              events.length > 0
                ? "bg-orange-500 text-white active:scale-95"
                : "bg-white/5 text-gray-600 cursor-not-allowed"
            }`}
          >
            ✨ 生成集锦 ({events.length})
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: CUTTING ───────────────────────────────────────────────────────────

  if (phase === "cutting") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-6 px-6"
        style={{ background: "#0f1117", minHeight: "100vh" }}
      >
        <div className="text-5xl animate-pulse">⚙️</div>
        <div className="text-lg font-bold text-white text-center">{statusMsg || "正在生成集锦…"}</div>
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>处理进度</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-yellow-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="text-xs text-gray-600 text-center">全程本地处理 · 视频不会上传服务器</div>
      </div>
    );
  }

  // ── Phase: ERROR ─────────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-5 px-6"
        style={{ background: "#0f1117", minHeight: "100vh" }}
      >
        <div className="text-5xl">❌</div>
        <div className="text-lg font-bold text-red-400">生成失败</div>
        <div className="text-xs text-red-700 text-center break-all max-w-sm bg-red-950/30 rounded-xl p-3">
          {error}
        </div>
        <button
          onClick={() => { setPhase("review"); setError(null); setProgress(0); }}
          className="px-6 py-3 rounded-xl bg-orange-500 text-white font-bold text-sm"
        >
          返回重试
        </button>
      </div>
    );
  }

  // ── Phase: DONE ──────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col gap-4 pb-10 px-4"
      style={{ background: "#0f1117", minHeight: "100vh" }}
    >
      <div className="text-center pt-8">
        <div className="text-4xl mb-2">🎉</div>
        <div className="text-2xl font-black text-white">集锦已生成！</div>
        {statusMsg && <div className="text-sm text-orange-400 mt-1">{statusMsg}</div>}
      </div>

      {resultUrl && (
        <div className="rounded-2xl overflow-hidden bg-black border border-white/10">
          <video
            src={resultUrl}
            controls
            playsInline
            className="w-full"
            style={{ maxHeight: 320 }}
          />
        </div>
      )}

      {resultUrl && (
        <a
          href={resultUrl}
          download={resultName}
          className="w-full py-3.5 rounded-2xl bg-orange-500 text-white font-bold text-sm text-center block active:scale-95 transition-transform"
        >
          ⬇️ 下载集锦视频
        </a>
      )}

      {/* Per-event replay using original video */}
      {videoUrl && events.length > 0 && (
        <div className="rounded-2xl bg-[#1a1d27] border border-white/10 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2">
            <span className="text-sm font-bold text-white">🎯 打点回放</span>
            <span className="text-xs text-gray-500">点击事件跳到对应时间点</span>
          </div>
          <video
            ref={replayRef}
            src={videoUrl}
            controls
            playsInline
            className="w-full bg-black"
            style={{ maxHeight: 200 }}
          />
          <div className="flex flex-col divide-y divide-white/5">
            {[...events]
              .sort((a, b) => a.videoTs - b.videoTs)
              .map((e) => {
                const team = TEAMS.find((t) => t.id === e.teamId);
                return (
                  <button
                    key={e.id}
                    onClick={() => seekTo(e.videoTs)}
                    className="flex items-center gap-3 px-4 py-2.5 text-left w-full hover:bg-white/5 active:bg-white/10"
                  >
                    <span className="text-orange-400 shrink-0">▶</span>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: team?.color ?? "#6B7280" }} />
                    <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{fmt(e.videoTs)}</span>
                    <span className="flex-1 text-sm text-gray-300 truncate">
                      #{e.playerNum} {e.playerName}
                      <span className="text-gray-500 ml-1">· {e.action}</span>
                    </span>
                    {e.pts > 0 && (
                      <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      <button
        onClick={() => { setPhase("tagging"); setEvents([]); setProgress(0); setResultUrl(null); }}
        className="text-sm text-gray-500 text-center py-1"
      >
        重新打点
      </button>

      <div className="flex gap-3 pt-1">
        <Link href="/coach/reports/generate" className="flex-1">
          <div className="border border-white/20 text-white text-center font-bold text-sm rounded-xl py-3">
            📋 生成报告
          </div>
        </Link>
        <Link href="/gc" className="flex-1">
          <div className="border border-white/20 text-white text-center font-bold text-sm rounded-xl py-3">
            再来一场
          </div>
        </Link>
      </div>
    </div>
  );
}
