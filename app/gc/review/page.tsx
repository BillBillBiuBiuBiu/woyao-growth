"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import {
  DEFAULT_TEAMS,
  loadTeamsConfig,
  teamsFromConfig,
  type TeamId,
  type RuntimeTeam,
} from "@/lib/gc-teams";
import { apiSaveGame, apiSaveEvents, apiUploadClip, apiLoadGames, type StoredEvent } from "@/lib/gc-api";
import type { GameRecord } from "@/lib/gc-teams";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_PLAYER_ID = (teamId: TeamId) => `${teamId}-team`;

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
type PlayerRef = { id: string; name: string; num: string };

type ReviewCtx =
  | { type: "assist";  scoringTeam: TeamId; scorerId: string; videoTs: number }
  | { type: "rebound"; shootingTeam: TeamId; videoTs: number }
  | { type: "steal";   stealTeam: TeamId;   videoTs: number };

// Clip buffer: 3s before the event, 5s after
const PRE_S  = 5;
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

interface LiveSession {
  ts: string;
  teams: Record<string, { name: string; color: string }>;
  score: { home: number; away: number };
  duration: number;
  events: GameEvent[];
}

export default function GcReviewPage() {
  const [teams,         setTeams]         = useState<RuntimeTeam[]>(() => teamsFromConfig(DEFAULT_TEAMS));
  const [phase,         setPhase]         = useState<Phase>("setup");
  const [videoFile,     setVideoFile]     = useState<File | null>(null);
  const [videoUrl,      setVideoUrl]      = useState<string | null>(null);
  const [events,        setEvents]        = useState<GameEvent[]>([]);
  const [selTeam,       setSelTeam]       = useState<TeamId>("home");
  const [pendingAction, setPendingAction] = useState<typeof ACTIONS[number] | null>(null);
  const [pendingTeam,   setPendingTeam]   = useState<TeamId>("home");
  const [reviewCtx,     setReviewCtx]     = useState<ReviewCtx | null>(null);
  const [progress,      setProgress]      = useState(0);
  const [statusMsg,     setStatusMsg]     = useState("");
  const [resultUrl,     setResultUrl]     = useState<string | null>(null);
  const [resultBlob,    setResultBlob]    = useState<Blob | null>(null);
  const [resultName,    setResultName]    = useState("highlight.mp4");
  const [error,         setError]         = useState<string | null>(null);
  const [awayTrackMode, setAwayTrackMode] = useState<"player" | "team">("team");
  const [liveSession,   setLiveSession]   = useState<LiveSession | null>(null);
  const [filterPlayer,  setFilterPlayer]  = useState<string | null>(null);
  const [savedDraft,    setSavedDraft]    = useState<GameEvent[] | null>(null);
  const [tsToast,       setTsToast]       = useState(false);
  const [tsText,        setTsText]        = useState<string | null>(null);
  const [fileWarn,      setFileWarn]      = useState<string | null>(null);
  const [clipView,      setClipView]      = useState<{ title: string; clips: GameEvent[]; idx: number } | null>(null);
  const [cloudSaved,    setCloudSaved]    = useState(false);
  const [clipUrl,       setClipUrl]       = useState<string | null>(null);
  const [linkToast,     setLinkToast]     = useState(false);
  const [linkedGame,    setLinkedGame]    = useState<GameRecord | null>(null);
  const [gameOptions,   setGameOptions]   = useState<GameRecord[]>([]);

  const isWeChat = typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);

  function fmtGameDate(ts: string): string {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }

  function selectLinkedGame(game: GameRecord | null) {
    setLinkedGame(game);
    gameIdRef.current = game?.id ?? `g-${Date.now()}`;
  }

  const videoRef      = useRef<HTMLVideoElement | null>(null);
  const replayRef     = useRef<HTMLVideoElement | null>(null);
  const clipVideoRef  = useRef<HTMLVideoElement | null>(null);
  const ffmpegRef     = useRef<FFmpeg | null>(null);
  const ffmpegInitRef = useRef<Promise<void> | null>(null);
  const gameIdRef     = useRef<string>(`g-${Date.now()}`);

  function seekTo(videoTs: number) {
    const v = replayRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, videoTs - PRE_S);
    v.play().catch(() => {});
  }

  useEffect(() => {
    try {
      const cfg = loadTeamsConfig();
      setTeams(teamsFromConfig(cfg));
      setAwayTrackMode(cfg.awayTrackMode ?? "team");
    } catch {}
    try {
      const raw = localStorage.getItem("gc_last_session");
      if (raw) setLiveSession(JSON.parse(raw) as LiveSession);
    } catch {}
    try {
      const draftRaw = localStorage.getItem("gc_review_events_draft");
      if (draftRaw) {
        const draft = JSON.parse(draftRaw) as GameEvent[];
        if (Array.isArray(draft) && draft.length > 0) setSavedDraft(draft);
      }
    } catch {}
    try {
      const hash = window.location.hash;
      const match = hash.match(/[#&]ev=([^&]*)/);
      if (match) {
        const parsed = JSON.parse(decodeURIComponent(match[1])) as GameEvent[];
        if (Array.isArray(parsed) && parsed.length > 0) setSavedDraft(parsed);
        history.replaceState(null, "", window.location.pathname);
      }
    } catch {}
    apiLoadGames().then((games) => {
      const opts = games.slice(0, 5);
      setGameOptions(opts);
      // Prefer explicit ?gameId param (set by gc/live postgame links)
      let paramGameId: string | null = null;
      try { paramGameId = new URLSearchParams(window.location.search).get("gameId"); } catch {}
      if (paramGameId) {
        const matched = games.find(g => g.id === paramGameId) ?? null;
        if (matched) {
          setLinkedGame(matched);
          gameIdRef.current = matched.id;
          if (!opts.find(g => g.id === matched.id)) {
            setGameOptions([matched, ...opts].slice(0, 5));
          }
          return;
        }
      }
      // Fallback: auto-select most recent within 24h
      if (opts.length > 0) {
        const recent = opts[0];
        if (Date.now() - new Date(recent.ts).getTime() < 24 * 60 * 60 * 1000) {
          setLinkedGame(recent);
          gameIdRef.current = recent.id;
        }
      }
    }).catch(() => {});
  }, []);

  // Auto-save events to localStorage during tagging/review so crashes don't lose data
  useEffect(() => {
    if (events.length > 0 && (phase === "tagging" || phase === "review" || phase === "cutting")) {
      try { localStorage.setItem("gc_review_events_draft", JSON.stringify(events)); } catch {}
    }
  }, [events, phase]);

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);
  useEffect(() => () => { if (videoUrl)  URL.revokeObjectURL(videoUrl);  }, [videoUrl]);

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

  useEffect(() => {
    ensureFFmpegLoaded().catch(() => { ffmpegInitRef.current = null; });
  }, [ensureFFmpegLoaded]);

  useEffect(() => {
    if (!clipView || !clipVideoRef.current) return;
    const evt = clipView.clips[clipView.idx];
    if (!evt) return;
    clipVideoRef.current.currentTime = Math.max(0, evt.videoTs - PRE_S);
    clipVideoRef.current.play().catch(() => {});
  }, [clipView]);

  // ── Event logging ────────────────────────────────────────────────────────────

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const mb = file.size / 1024 / 1024;
    if (mb > 400) {
      setFileWarn(`文件 ${mb.toFixed(0)} MB 超出上限（400 MB），请压缩后重试`);
      e.target.value = "";
      return;
    }
    setFileWarn(mb > 150 ? `文件较大（${mb.toFixed(0)} MB），建议使用较短片段以避免卡顿` : null);
    setVideoFile(file);
    setVideoUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
  }

  function makeEvent(teamId: TeamId, p: PlayerRef, action: typeof ACTIONS[number]): GameEvent {
    return {
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      videoTs: videoRef.current?.currentTime ?? 0,
      teamId,
      playerId: p.id,
      playerName: p.name,
      playerNum: p.num,
      action: action.label,
      pts: action.pts,
      cat: action.cat,
    };
  }

  function startAction(action: typeof ACTIONS[number]) {
    const inferred: TeamId =
      action.cat === "stl" || action.cat === "blk" || action.cat === "dreb"
        ? selTeam === "home" ? "away" : "home"
        : selTeam;
    setReviewCtx(null);
    setPendingTeam(inferred);
    setPendingAction(action);
  }

  function commitAction(player: PlayerRef | null) {
    if (!pendingAction) return;
    const action = pendingAction;
    const teamId = pendingTeam;
    const isTeamMode = teamId === "away" && awayTrackMode === "team";
    const p: PlayerRef = isTeamMode
      ? { id: TEAM_PLAYER_ID(teamId), name: "全队", num: "-" }
      : (player ?? { id: `${teamId}-tbd`, name: "未指定", num: "-" });

    const videoTs = videoRef.current?.currentTime ?? 0;
    setPendingAction(null);
    setEvents(prev => [makeEvent(teamId, p, action), ...prev]);

    if (action.pts > 0 && action.cat !== "ft") {
      setReviewCtx({ type: "assist", scoringTeam: teamId, scorerId: p.id, videoTs });
    } else if (action.cat === "2pt_miss" || action.cat === "3pt_miss" || action.cat === "ft_miss") {
      setReviewCtx({ type: "rebound", shootingTeam: teamId, videoTs });
    } else if (action.cat === "tov") {
      const stealTeam: TeamId = teamId === "home" ? "away" : "home";
      setReviewCtx({ type: "steal", stealTeam, videoTs });
    }
  }

  function commitAssist(player: PlayerRef | null) {
    if (!reviewCtx || reviewCtx.type !== "assist") return;
    if (player) {
      const astAction = ACTIONS.find(a => a.cat === "ast")!;
      setEvents(prev => [{
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        videoTs: reviewCtx.videoTs,
        teamId: reviewCtx.scoringTeam,
        playerId: player.id,
        playerName: player.name,
        playerNum: player.num,
        action: astAction.label,
        pts: 0,
        cat: astAction.cat,
      }, ...prev]);
    }
    setReviewCtx(null);
  }

  function commitRebound(type: "oreb" | "dreb") {
    if (!reviewCtx || reviewCtx.type !== "rebound") return;
    const shootingTeam = reviewCtx.shootingTeam;
    const rebTeamId: TeamId = type === "oreb" ? shootingTeam : (shootingTeam === "home" ? "away" : "home");
    const action = ACTIONS.find(a => a.cat === type)!;
    setEvents(prev => [{
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      videoTs: reviewCtx.videoTs,
      teamId: rebTeamId,
      playerId: TEAM_PLAYER_ID(rebTeamId),
      playerName: "全队",
      playerNum: "-",
      action: action.label,
      pts: 0,
      cat: action.cat,
    }, ...prev]);
    setReviewCtx(null);
  }

  function commitSteal(player: PlayerRef | null) {
    if (!reviewCtx || reviewCtx.type !== "steal") return;
    const { stealTeam, videoTs } = reviewCtx;
    setReviewCtx(null);
    if (!player) return;
    const action = ACTIONS.find(a => a.cat === "stl")!;
    setEvents(prev => [{
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      videoTs,
      teamId: stealTeam,
      playerId: player.id,
      playerName: player.name,
      playerNum: player.num,
      action: action.label,
      pts: 0,
      cat: action.cat,
    }, ...prev]);
  }

  // ── WeChat fallback: export timestamps ──────────────────────────────────────

  function handleCopyTimestamps() {
    const lines = [...events]
      .sort((a, b) => a.videoTs - b.videoTs)
      .map(e => `${fmt(e.videoTs)}  ${e.playerNum !== "-" ? `#${e.playerNum} ` : ""}${e.playerName}  ${e.action}`)
      .join("\n");
    const text = `打点记录（共 ${events.length} 个）\n${"─".repeat(28)}\n${lines}\n\n用剪辑软件按时间戳裁切视频`;
    try {
      navigator.clipboard.writeText(text);
      setTsToast(true);
      setTimeout(() => setTsToast(false), 2500);
    } catch {
      setTsText(text);
    }
  }

  // ── Generate highlight ───────────────────────────────────────────────────────

  const generateHighlight = useCallback(async () => {
    if (!videoFile || events.length === 0) return;
    setPhase("cutting");
    setProgress(0);
    setError(null);

    try {
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

      setStatusMsg("正在写入视频数据…");
      await ff.writeFile("input.mp4", await fetchFile(videoFile));
      setProgress(40);

      const rawSegs: [number, number][] = events.map((e) => [
        Math.max(0, e.videoTs - PRE_S),
        e.videoTs + POST_S,
      ]);
      const segs = mergeSegs(rawSegs);
      const totalDur = segs.reduce((sum, [s, e]) => sum + (e - s), 0);
      setStatusMsg(`找到 ${segs.length} 个片段（共 ${totalDur.toFixed(0)}s），正在剪辑…`);

      // Single -i: one decode stream for all segments → avoids n×decode-buffer OOM on mobile
      const n = segs.length;
      let filterComplex: string;
      let mapArgs: string[];
      if (n === 1) {
        const [segS, segE] = segs[0];
        const dur = segE - segS;
        filterComplex = `[0:v]trim=start=${segS.toFixed(3)}:duration=${dur.toFixed(3)},setpts=PTS-STARTPTS,scale=480:-2[cv];[0:a]atrim=start=${segS.toFixed(3)}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS[ca]`;
        mapArgs = ["-map", "[cv]", "-map", "[ca]"];
      } else {
        const vSplitOuts = segs.map((_, i) => `[vs${i}]`).join("");
        const aSplitOuts = segs.map((_, i) => `[as${i}]`).join("");
        const trimParts  = segs.map(([segS, segE], i) => {
          const dur = segE - segS;
          return `[vs${i}]trim=start=${segS.toFixed(3)}:duration=${dur.toFixed(3)},setpts=PTS-STARTPTS[v${i}];[as${i}]atrim=start=${segS.toFixed(3)}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`;
        }).join(";");
        const concatIn = segs.map((_, i) => `[v${i}][a${i}]`).join("");
        filterComplex = `[0:v]split=${n}${vSplitOuts};[0:a]asplit=${n}${aSplitOuts};${trimParts};${concatIn}concat=n=${n}:v=1:a=1[rawv][rawa];[rawv]scale=480:-2[cv]`;
        mapArgs = ["-map", "[cv]", "-map", "[rawa]"];
      }
      const args = [
        "-i", "input.mp4",
        "-filter_complex", filterComplex,
        ...mapArgs,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        "-y", "highlight.mp4",
      ];

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

      const data = await ff.readFile("highlight.mp4");
      const raw  = data as Uint8Array;
      const copy = new Uint8Array(raw.length);
      copy.set(raw);
      const blob = new Blob([copy.buffer], { type: "video/mp4" });
      try { await ff.deleteFile("input.mp4");     } catch {}
      try { await ff.deleteFile("highlight.mp4"); } catch {}

      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
      const clipName = (videoFile.name.replace(/\.[^.]+$/, "") || "game") + "_highlight.mp4";
      setResultName(clipName);
      setStatusMsg(`${events.length} 个打点 · ${segs.length} 个片段 · 共 ${totalDur.toFixed(0)}s`);
      setProgress(100);
      setPhase("done");
      try { localStorage.removeItem("gc_review_events_draft"); } catch {}
      setSavedDraft(null);

      // Save to backend (fire-and-forget)
      const gameId = gameIdRef.current;
      const homeTeam = teams.find(t => t.id === "home");
      const awayTeam = teams.find(t => t.id === "away");
      const homeScore = events.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0);
      const awayScore = events.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0);
      void apiSaveGame({
        id: gameId,
        ts: new Date().toISOString(),
        homeTeam: homeTeam?.name ?? "主场",
        awayTeam: awayTeam?.name ?? "客场",
        homeScore,
        awayScore,
        quarterScores: [],
        eventCount: events.length,
        duration: Math.round(totalDur),
        source: "review",
      });
      void apiSaveEvents(
        gameId,
        events.map((e, i): StoredEvent => ({
          id: e.id,
          seq: i,
          playerId: e.playerId,
          playerName: e.playerName,
          playerNum: e.playerNum,
          team: e.teamId,
          cat: e.cat,
          pts: e.pts,
          quarter: 1,
          gameClock: 0,
          videoTs: e.videoTs,
          note: e.action,
        }))
      );
      apiUploadClip(gameId, blob, `${events.length}个打点集锦`, clipName)
        .then((url) => { if (url) { setCloudSaved(true); setClipUrl(url); } })
        .catch(() => {});

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

  const pickerTeam = teams.find(t => t.id === pendingTeam);

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
            {fileWarn && (
              <div className="mt-2 text-xs rounded-lg px-3 py-2" style={{ background: "rgba(245,158,11,0.12)", color: "#FCD34D" }}>
                ⚠️ {fileWarn}
              </div>
            )}
          </div>
        </div>

        {gameOptions.length > 0 && (
          <div className="px-4">
            <div className="rounded-2xl bg-[#1a1d27] border border-white/10 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-bold text-gray-300">关联比赛（可选）</div>
                {linkedGame && (
                  <button onClick={() => selectLinkedGame(null)} className="text-xs text-gray-600 active:text-gray-400">
                    取消关联
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-600 mb-3">
                选中后，生成的集锦会保存到对应比赛记录，家长可在比赛详情里查看
              </div>
              <div className="flex flex-col gap-1.5">
                {gameOptions.map((game) => {
                  const selected = linkedGame?.id === game.id;
                  return (
                    <button
                      key={game.id}
                      onClick={() => selectLinkedGame(selected ? null : game)}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left border transition-colors active:scale-98"
                      style={{
                        borderColor: selected ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.08)",
                        background:  selected ? "rgba(249,115,22,0.10)" : "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div>
                        <div className="text-xs font-medium text-gray-200">
                          {game.homeTeam} <span style={{ color: "#F97316" }}>{game.homeScore}</span>
                          <span className="text-gray-600 mx-1">—</span>
                          <span style={{ color: "#F97316" }}>{game.awayScore}</span> {game.awayTeam}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{fmtGameDate(game.ts)}</div>
                      </div>
                      {selected && <span className="text-orange-400 text-xs font-bold shrink-0 ml-2">✓ 已选</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {savedDraft && (
          <div className="px-4">
            <div className="rounded-2xl border border-red-500/40 p-4" style={{ background: "rgba(239,68,68,0.08)" }}>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">⚠️</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-red-400 mb-0.5">检测到未完成的打点记录</div>
                  <div className="text-xs text-gray-400 mb-3">
                    共 {savedDraft.length} 个打点未完成生成
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEvents(savedDraft);
                        setSavedDraft(null);
                        if (videoFile) setPhase("review");
                      }}
                      disabled={!videoFile}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold text-center transition-colors ${
                        videoFile
                          ? "bg-red-500 text-white active:scale-95"
                          : "bg-white/5 text-gray-600"
                      }`}
                    >
                      {videoFile ? "恢复打点 → 重新生成" : "请先上传视频再恢复"}
                    </button>
                    <button
                      onClick={() => {
                        setSavedDraft(null);
                        try { localStorage.removeItem("gc_review_events_draft"); } catch {}
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-gray-500 border border-white/10"
                    >
                      丢弃
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {liveSession && (
          <div className="px-4">
            <div className="rounded-2xl border border-blue-500/30 p-4" style={{ background: "rgba(59,130,246,0.08)" }}>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">📋</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-blue-400 mb-0.5">检测到现场打点记录</div>
                  <div className="text-xs text-gray-400 mb-1">
                    {liveSession.events.length} 个事件 · {new Date(liveSession.ts).toLocaleDateString("zh-CN")}
                    {" · "}{liveSession.teams["home"]?.name} vs {liveSession.teams["away"]?.name}
                  </div>
                  <div className="text-[10px] text-yellow-600 mb-3">⚠️ 时间戳为现场计时，需在视频上重新确认各事件位置</div>
                  <button
                    onClick={() => {
                      setEvents(liveSession.events);
                      if (videoFile) setPhase("tagging");
                    }}
                    disabled={!videoFile}
                    className={`w-full py-2 rounded-xl text-xs font-bold text-center transition-colors ${
                      videoFile
                        ? "bg-blue-500 text-white active:scale-95"
                        : "bg-white/5 text-gray-600"
                    }`}
                  >
                    {videoFile ? "导入参考数据，开始视频打点" : "请先上传视频再导入"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 rounded-2xl">
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-4 text-xs text-gray-500 leading-relaxed">
            <div className="font-bold text-gray-400 mb-2">📖 使用方式</div>
            <div className="flex flex-col gap-1.5">
              <div>① 上传视频后进入打点界面，视频在顶部播放</div>
              <div>② 在事件发生时点击动作按钮（如「2分命中」），再选球员</div>
              <div>③ 进球后自动询问助攻；出手不中后自动询问篮板</div>
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
            {events.length > 0 ? `${events.length} 个打点` : "点击动作按钮开始打点"}
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
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelTeam(t.id)}
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
        <div className="px-3 pt-1 shrink-0">
          <div className="text-[10px] text-gray-600 text-center">点击动作，再选球员 → 快速打点</div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-1.5 px-3 pt-2 shrink-0">
          {scoring.map((a) => (
            <button
              key={a.cat}
              onClick={() => startAction(a)}
              className="py-4 rounded-xl font-bold text-sm"
              style={{ background: "rgba(249,115,22,0.90)", color: "#fff" }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5 px-3 pt-1 shrink-0">
          {misses.map((a) => (
            <button
              key={a.cat}
              onClick={() => startAction(a)}
              className="py-2.5 rounded-xl font-bold text-xs"
              style={{ background: "rgba(239,68,68,0.20)", color: "#F87171" }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5 px-3 pt-1 shrink-0">
          {statActs.map((a) => (
            <button
              key={a.cat}
              onClick={() => startAction(a)}
              className="py-2 rounded-xl font-bold text-xs"
              style={{ background: "rgba(255,255,255,0.10)", color: "#D1D5DB" }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Recent events feed */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
          {events.slice(0, 10).map((e) => {
            const team = teams.find((t) => t.id === e.teamId);
            return (
              <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
                <div className="w-1 h-4 rounded-full shrink-0" style={{ background: team?.color ?? "#6B7280" }} />
                <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{fmt(e.videoTs)}</span>
                <span className="flex-1 text-xs text-gray-300 truncate">
                  {e.playerNum !== "-" ? `#${e.playerNum} ` : ""}{e.playerName}
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

        {/* ── Contextual prompt: assist ──────────────────────────────────────── */}
        {reviewCtx?.type === "assist" && pendingAction === null && (() => {
          const scoringTeam = teams.find(t => t.id === reviewCtx.scoringTeam)!;
          const assistCandidates = scoringTeam.players.filter(p => p.id !== reviewCtx.scorerId);
          return (
            <div className="fixed inset-0 z-40 flex items-end" style={{ background: "rgba(0,0,0,0.60)" }}>
              <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
                <div className="text-center mb-4">
                  <div className="text-base font-black text-white">有助攻？</div>
                  <div className="text-xs text-gray-500 mt-0.5">{scoringTeam.name}</div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4 justify-center">
                  {assistCandidates.map(p => (
                    <button
                      key={p.id}
                      onClick={() => commitAssist(p)}
                      className="px-4 py-2.5 rounded-xl font-bold text-sm"
                      style={{ background: `${scoringTeam.color}25`, border: `1px solid ${scoringTeam.color}60`, color: scoringTeam.color }}
                    >
                      #{p.num} {p.name}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => commitAssist(null)}
                  className="w-full py-3 rounded-xl text-sm text-gray-400 border border-white/10"
                >
                  无助攻
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Contextual prompt: rebound ─────────────────────────────────────── */}
        {reviewCtx?.type === "rebound" && pendingAction === null && (() => {
          const shootTeam  = teams.find(t => t.id === reviewCtx.shootingTeam)!;
          const otherTeam  = teams.find(t => t.id !== reviewCtx.shootingTeam)!;
          return (
            <div className="fixed inset-0 z-40 flex items-end" style={{ background: "rgba(0,0,0,0.60)" }}>
              <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
                <div className="text-center mb-4">
                  <div className="text-base font-black text-white">篮板归属？</div>
                </div>
                <div className="flex gap-3 mb-3">
                  <button
                    onClick={() => commitRebound("oreb")}
                    className="flex-1 py-3.5 rounded-xl font-bold text-sm"
                    style={{ background: `${shootTeam.color}25`, border: `1px solid ${shootTeam.color}60`, color: shootTeam.color }}
                  >
                    进攻篮板
                    <div className="text-xs font-normal mt-0.5 opacity-70">{shootTeam.name}</div>
                  </button>
                  <button
                    onClick={() => commitRebound("dreb")}
                    className="flex-1 py-3.5 rounded-xl font-bold text-sm"
                    style={{ background: `${otherTeam.color}25`, border: `1px solid ${otherTeam.color}60`, color: otherTeam.color }}
                  >
                    防守篮板
                    <div className="text-xs font-normal mt-0.5 opacity-70">{otherTeam.name}</div>
                  </button>
                </div>
                <button
                  onClick={() => setReviewCtx(null)}
                  className="w-full py-2.5 rounded-xl text-sm text-gray-500"
                >
                  跳过
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Contextual prompt: steal ───────────────────────────────────────── */}
        {reviewCtx?.type === "steal" && pendingAction === null && (() => {
          const stealTeam = teams.find(t => t.id === reviewCtx.stealTeam)!;
          const isTeamMode = reviewCtx.stealTeam === "away" && awayTrackMode === "team";
          return (
            <div className="fixed inset-0 z-40 flex items-end" style={{ background: "rgba(0,0,0,0.60)" }}>
              <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
                <div className="text-center mb-4">
                  <div className="text-base font-black text-white">谁抢断了？</div>
                  <div className="text-xs text-gray-500 mt-0.5">{stealTeam.name}</div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4 justify-center">
                  {isTeamMode ? (
                    <button
                      onClick={() => commitSteal({ id: TEAM_PLAYER_ID(reviewCtx.stealTeam), name: "全队", num: "-" })}
                      className="px-4 py-2.5 rounded-xl font-bold text-sm"
                      style={{ background: `${stealTeam.color}25`, border: `1px solid ${stealTeam.color}60`, color: stealTeam.color }}
                    >
                      全队
                    </button>
                  ) : (
                    stealTeam.players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => commitSteal(p)}
                        className="px-4 py-2.5 rounded-xl font-bold text-sm"
                        style={{ background: `${stealTeam.color}25`, border: `1px solid ${stealTeam.color}60`, color: stealTeam.color }}
                      >
                        #{p.num} {p.name}
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => commitSteal(null)}
                  className="w-full py-3 rounded-xl text-sm text-gray-400 border border-white/10"
                >
                  无抢断
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Player picker bottom sheet ─────────────────────────────────────── */}
        {pendingAction !== null && (
          <div
            className="fixed inset-0 z-50 flex items-end"
            style={{ background: "rgba(0,0,0,0.72)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setPendingAction(null); }}
          >
            <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
              <div className="text-center mb-4">
                <div className="text-base font-black text-white">{pendingAction.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">谁做了这个动作？</div>
              </div>

              {/* Team toggle inside picker */}
              <div className="flex gap-2 mb-4">
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setPendingTeam(t.id)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                    style={
                      pendingTeam === t.id
                        ? { background: t.color, color: "#fff" }
                        : { background: "rgba(255,255,255,0.06)", color: "#6B7280" }
                    }
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              {/* Player grid */}
              {pendingTeam === "away" && awayTrackMode === "team" ? (
                <button
                  onClick={() => commitAction({ id: TEAM_PLAYER_ID("away"), name: "全队", num: "-" })}
                  className="w-full py-4 rounded-xl font-bold text-base mb-4"
                  style={{ background: "rgba(59,130,246,0.20)", border: "1px solid rgba(59,130,246,0.4)", color: "#60A5FA" }}
                >
                  全队（整队记录）
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 mb-4">
                  {pickerTeam?.players.map(p => (
                    <button
                      key={p.id}
                      onClick={() => commitAction(p)}
                      className="flex flex-col items-center py-3 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
                    >
                      <span className="text-2xl font-black text-white">{p.num}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => commitAction(null)}
                className="w-full py-3 rounded-xl text-sm text-gray-400 border border-white/10 mb-2"
              >
                稍后指定
              </button>
              <button
                onClick={() => setPendingAction(null)}
                className="w-full py-2 rounded-xl text-sm text-gray-600"
              >
                取消
              </button>
            </div>
          </div>
        )}
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
            const team = teams.find((t) => t.id === e.teamId);
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1a1d27] border border-white/10"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: team?.color ?? "#6B7280" }} />
                <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{fmt(e.videoTs)}</span>
                <span className="flex-1 text-sm text-gray-300 truncate">
                  {e.playerNum !== "-" ? `#${e.playerNum} ` : ""}{e.playerName}
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

        {isWeChat ? (
          <div className="flex flex-col gap-3 pt-2">
            <div className="rounded-xl p-4" style={{ background: "rgba(249,115,22,0.10)", border: "1px solid rgba(249,115,22,0.35)" }}>
              <div className="text-xs font-bold text-orange-400 mb-1.5">⚠️ 微信内无法处理视频</div>
              <div className="text-xs text-gray-400 leading-relaxed mb-3">
                视频生成需要大量内存，微信浏览器不支持。<br />
                <span className="text-gray-300 font-medium">① 复制外部链接 → 粘贴到 Safari/Chrome → 上传视频 → 生成集锦</span><br />
                <span className="text-gray-500">② 或复制时间戳，用剪辑软件手动裁切</span>
              </div>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/gc/review#ev=${encodeURIComponent(JSON.stringify(events))}`;
                  try { navigator.clipboard.writeText(url); setTsToast(true); setTimeout(() => setTsToast(false), 2500); }
                  catch { setTsText(url); }
                }}
                disabled={events.length === 0}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white active:scale-95 transition-transform mb-2"
              >
                {tsToast ? "✅ 已复制链接" : `🔗 复制外部链接（含 ${events.length} 个打点）`}
              </button>
              <button
                onClick={handleCopyTimestamps}
                disabled={events.length === 0}
                className="w-full py-2 rounded-xl text-xs font-medium text-gray-400 border border-white/10"
              >
                📋 仅复制时间戳
              </button>
            </div>
            <button
              onClick={() => setPhase("tagging")}
              className="w-full py-3 rounded-xl border border-white/20 text-sm font-bold text-gray-300"
            >
              ← 继续打点
            </button>
          </div>
        ) : (
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
        )}

        {tsText && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setTsText(null); }}>
            <div className="w-full rounded-t-2xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
              <div className="text-sm font-bold text-white mb-2">📋 打点时间戳</div>
              <div className="text-xs text-gray-500 mb-3">长按全选后复制</div>
              <textarea
                readOnly
                value={tsText}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-xl p-3 text-xs text-gray-300 bg-white/5 border border-white/10 resize-none font-mono"
                style={{ height: 220 }}
              />
              <button onClick={() => setTsText(null)}
                className="w-full mt-3 py-2 text-xs text-gray-600">
                关闭
              </button>
            </div>
          </div>
        )}
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
        <div className="text-xs text-gray-600 text-center">全程本地生成 · 完成后保存到云端</div>
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
        {cloudSaved && (
          <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium"
            style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
            ✅ 已保存到云端 · 可在主页历史记录查看
          </div>
        )}
        {clipUrl && (
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(clipUrl);
                setLinkToast(true);
                setTimeout(() => setLinkToast(false), 2000);
              } catch {
                setTsText(clipUrl);
              }
            }}
            className="mt-2 px-4 py-1.5 rounded-full text-xs font-bold border active:opacity-80"
            style={{ borderColor: "rgba(34,197,94,0.4)", color: linkToast ? "#4ade80" : "#86efac", background: "rgba(34,197,94,0.08)" }}
          >
            {linkToast ? "✅ 链接已复制！" : "🔗 复制集锦链接 · 发给家长"}
          </button>
        )}
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

      {resultUrl && resultBlob && !isWeChat && "share" in navigator && (
        <button
          onClick={async () => {
            try {
              const file = new File([resultBlob], resultName, { type: "video/mp4" });
              if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: "精彩集锦" });
              }
            } catch (e) {
              if (e instanceof Error && e.name !== "AbortError") {
                // user cancelled — silent; other errors fall through to download
              }
            }
          }}
          className="w-full py-3.5 rounded-2xl bg-orange-500 text-white font-bold text-sm text-center active:scale-95 transition-transform"
        >
          📤 分享集锦视频
        </button>
      )}

      {resultUrl && (
        <a
          href={resultUrl}
          download={resultName}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm text-center block active:scale-95 transition-transform ${
            resultBlob && !isWeChat && "share" in navigator
              ? "border border-white/20 text-gray-300"
              : "bg-orange-500 text-white"
          }`}
        >
          ⬇️ 下载集锦视频
        </a>
      )}

      {events.length > 0 && (() => {
        const playerIds = [...new Set(events.map(e => e.playerId))];
        const stats = playerIds.map(pid => {
          const pe   = events.filter(e => e.playerId === pid);
          const team = teams.find(t => t.id === pe[0]?.teamId);
          return {
            id:   pid,
            name: pe[0]?.playerName ?? "?",
            num:  pe[0]?.playerNum  ?? "-",
            color: team?.color ?? "#6B7280",
            pts:  pe.reduce((s, e) => s + e.pts, 0),
            reb:  pe.filter(e => e.cat === "oreb" || e.cat === "dreb").length,
            ast:  pe.filter(e => e.cat === "ast").length,
            stl:  pe.filter(e => e.cat === "stl").length,
            blk:  pe.filter(e => e.cat === "blk").length,
            tov:  pe.filter(e => e.cat === "tov").length,
          };
        }).filter(p => p.pts + p.reb + p.ast + p.stl + p.blk + p.tov > 0);

        if (stats.length === 0) return null;
        return (
          <div className="rounded-2xl bg-[#1a1d27] border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10">
              <span className="text-sm font-bold text-white">📊 球员数据</span>
              <span className="text-xs text-gray-500 ml-2">{videoUrl ? "点击数据格查看片段" : "点击球员筛选回放"}</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  {["球员","分","板","助","断","帽","误"].map((h, i) => (
                    <th key={h} className={`py-2 font-medium text-gray-400 ${i === 0 ? "text-left px-3" : "text-center px-1"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map(p => {
                  const label = `${p.num !== "-" ? "#"+p.num+" " : ""}${p.name}`;
                  const openClip = (title: string, filter: (e: GameEvent) => boolean) => {
                    if (!videoUrl) return;
                    const clips = events.filter(ev => ev.playerId === p.id && filter(ev)).sort((a, b) => a.videoTs - b.videoTs);
                    if (clips.length) setClipView({ title: `${label} · ${title}`, clips, idx: 0 });
                  };
                  return (
                    <tr key={p.id} className={`border-b border-white/5 last:border-0 ${filterPlayer === p.id ? "bg-white/10" : ""}`}>
                      <td className="px-3 py-2 cursor-pointer active:bg-white/5"
                        onClick={() => setFilterPlayer(filterPlayer === p.id ? null : p.id)}>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
                          <span className="font-medium">{p.num !== "-" ? `#${p.num} ` : ""}{p.name}</span>
                          {filterPlayer === p.id && <span className="text-orange-400 text-xs">▶</span>}
                        </div>
                      </td>
                      {[
                        { val: p.pts, title: "得分",  filter: (e: GameEvent) => e.pts > 0,                              cls: "font-bold text-orange-400" },
                        { val: p.reb, title: "篮板",  filter: (e: GameEvent) => e.cat === "oreb" || e.cat === "dreb",    cls: "text-gray-300" },
                        { val: p.ast, title: "助攻",  filter: (e: GameEvent) => e.cat === "ast",                         cls: "text-gray-300" },
                        { val: p.stl, title: "抢断",  filter: (e: GameEvent) => e.cat === "stl",                         cls: "text-gray-300" },
                        { val: p.blk, title: "盖帽",  filter: (e: GameEvent) => e.cat === "blk",                         cls: "text-gray-300" },
                        { val: p.tov, title: "失误",  filter: (e: GameEvent) => e.cat === "tov",                         cls: "text-gray-300" },
                      ].map(({ val, title, filter, cls }) => (
                        <td key={title}
                          className={`px-1 py-2 text-center ${cls} ${val > 0 && videoUrl ? "cursor-pointer active:bg-white/10 rounded" : ""}`}
                          onClick={() => val > 0 && openClip(title, filter)}>
                          {val > 0 ? <span className={val > 0 && videoUrl ? "underline decoration-dotted underline-offset-2" : ""}>{val}</span> : <span className="text-gray-700">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {videoUrl && events.length > 0 && (
        <div className="rounded-2xl bg-[#1a1d27] border border-white/10 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">🎯 打点回放</span>
              {filterPlayer && (
                <span className="text-xs text-orange-400">
                  已筛选 · <button onClick={() => setFilterPlayer(null)} className="underline">清除</button>
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500">点击跳到对应时间点</span>
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
              .filter(e => !filterPlayer || e.playerId === filterPlayer)
              .sort((a, b) => a.videoTs - b.videoTs)
              .map((e) => {
                const team = teams.find((t) => t.id === e.teamId);
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
                      {e.playerNum !== "-" ? `#${e.playerNum} ` : ""}{e.playerName}
                      <span className="text-gray-500 ml-1">· {e.action}</span>
                    </span>
                    {e.pts > 0 && <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setPhase("tagging"); setEvents([]); setProgress(0);
          setResultUrl(null); setResultBlob(null); setCloudSaved(false); setClipUrl(null);
          const autoGame = gameOptions[0] ?? null;
          setLinkedGame(autoGame);
          gameIdRef.current = autoGame?.id ?? `g-${Date.now()}`;
        }}
        className="text-sm text-gray-500 text-center py-1"
      >
        重新打点
      </button>

      {events.length > 0 && (() => {
        const homeScore = events.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0);
        const awayScore = events.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0);
        const homeName  = teams.find(t => t.id === "home")?.name ?? "主场";
        const awayName  = teams.find(t => t.id === "away")?.name ?? "客场";
        const winner    = homeScore > awayScore ? homeName : awayScore > homeScore ? awayName : null;
        const playerIds = [...new Set(events.map(e => e.playerId))];
        const stats = playerIds.map(pid => {
          const pe = events.filter(e => e.playerId === pid);
          return { teamId: pe[0]?.teamId ?? "home", name: pe[0]?.playerName ?? "?", num: pe[0]?.playerNum ?? "-",
            pts: pe.reduce((s, e) => s + e.pts, 0), reb: pe.filter(e => e.cat === "oreb" || e.cat === "dreb").length,
            ast: pe.filter(e => e.cat === "ast").length, stl: pe.filter(e => e.cat === "stl").length };
        });
        const fmt2 = (p: typeof stats[0]) =>
          `  ${p.num !== "-" ? `#${p.num} ` : ""}${p.name}  ${p.pts}分${p.reb > 0 ? ` ${p.reb}板` : ""}${p.ast > 0 ? ` ${p.ast}助` : ""}${p.stl > 0 ? ` ${p.stl}断` : ""}`;
        const homePlayers = stats.filter(p => p.teamId === "home").sort((a, b) => b.pts - a.pts).map(fmt2).join("\n");
        const awayPlayers = stats.filter(p => p.teamId === "away").sort((a, b) => b.pts - a.pts).map(fmt2).join("\n");
        const today = new Date().toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
        const text = [
          `🏀 ${homeName} ${homeScore} — ${awayScore} ${awayName}`,
          winner ? `🏆 ${winner} 获胜` : "平局", "",
          `【${homeName}】`, homePlayers || "  暂无数据", "",
          `【${awayName}】`, awayPlayers || "  暂无数据", "",
          `${today} 我耀成长证据系统`,
        ].join("\n");
        function handleShare() {
          try { navigator.clipboard.writeText(text); setTsToast(true); setTimeout(() => setTsToast(false), 2500); }
          catch { setTsText(text); }
        }
        return (
          <button onClick={handleShare}
            className="w-full py-3 rounded-xl text-sm font-bold border active:opacity-80"
            style={{ borderColor: "rgba(249,115,22,0.4)", color: "#F97316", background: "rgba(249,115,22,0.08)" }}>
            {tsToast ? "✅ 战报已复制！" : "📤 复制战报"}
          </button>
        );
      })()}

      <Link href="/gc" className="block">
        <div className="border border-white/20 text-white text-center font-bold text-sm rounded-xl py-3">
          再来一场
        </div>
      </Link>

      {/* Clip viewer bottom sheet */}
      {clipView && videoUrl && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.80)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setClipView(null); }}>
          <div className="w-full rounded-t-3xl" style={{ background: "#1a1d27" }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-base font-black text-white">{clipView.title}</span>
                <span className="text-xs text-gray-500 ml-2">共 {clipView.clips.length} 个片段</span>
              </div>
              <button onClick={() => setClipView(null)} className="text-gray-500 text-xl px-1">✕</button>
            </div>
            <video
              ref={clipVideoRef}
              src={videoUrl}
              playsInline
              className="w-full bg-black"
              style={{ maxHeight: 230 }}
              onTimeUpdate={() => {
                if (!clipVideoRef.current) return;
                const evt = clipView.clips[clipView.idx];
                if (evt && clipVideoRef.current.currentTime >= evt.videoTs + POST_S) {
                  clipVideoRef.current.pause();
                }
              }}
            />
            {(() => {
              const evt = clipView.clips[clipView.idx];
              const team = evt ? teams.find(t => t.id === evt.teamId) : null;
              return (
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs font-bold text-gray-400">{clipView.idx + 1} / {clipView.clips.length}</span>
                  <span className="text-xs font-mono text-orange-400">{evt ? fmt(evt.videoTs) : ""}</span>
                  <span className="text-xs font-medium" style={{ color: team?.color ?? "#9CA3AF" }}>{evt?.action ?? ""}</span>
                </div>
              );
            })()}
            <div className="flex gap-1.5 justify-center px-4 pb-2 flex-wrap">
              {clipView.clips.map((_, i) => (
                <button key={i}
                  onClick={() => setClipView(prev => prev ? { ...prev, idx: i } : null)}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === clipView.idx ? 20 : 6, background: i === clipView.idx ? "#F97316" : "rgba(255,255,255,0.2)" }}
                />
              ))}
            </div>
            <div className="flex gap-3 px-4 pb-8 pt-1">
              <button
                onClick={() => setClipView(prev => prev && prev.idx > 0 ? { ...prev, idx: prev.idx - 1 } : prev)}
                disabled={clipView.idx === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/15 text-gray-400 disabled:opacity-30"
              >← 上一个</button>
              <button
                onClick={() => setClipView(prev => prev && prev.idx < prev.clips.length - 1 ? { ...prev, idx: prev.idx + 1 } : prev)}
                disabled={clipView.idx >= clipView.clips.length - 1}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/15 text-gray-400 disabled:opacity-30"
              >下一个 →</button>
            </div>
          </div>
        </div>
      )}

      {/* Timestamp fallback sheet (clipboard blocked in WeChat) */}
      {tsText && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setTsText(null); }}>
          <div className="w-full rounded-t-2xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
            <div className="text-sm font-bold text-white mb-2">📋 打点时间戳</div>
            <div className="text-xs text-gray-500 mb-3">长按全选后复制</div>
            <textarea
              readOnly
              value={tsText}
              onFocus={(e) => e.target.select()}
              className="w-full rounded-xl p-3 text-xs text-gray-300 bg-white/5 border border-white/10 resize-none font-mono"
              style={{ height: 220 }}
            />
            <button onClick={() => setTsText(null)}
              className="w-full mt-3 py-2 text-xs text-gray-600">
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
