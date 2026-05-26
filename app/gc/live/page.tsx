"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import {
  DEFAULT_TEAMS,
  loadTeamsConfig,
  teamsFromConfig,
  type TeamId,
  type RuntimeTeam,
  type TeamsConfig,
} from "@/lib/gc-teams";

const ACTIONS = [
  { label: "2分命中",  pts: 2, cat: "2pt" },
  { label: "2分不中",  pts: 0, cat: "2pt_miss" },
  { label: "3分命中",  pts: 3, cat: "3pt" },
  { label: "3分不中",  pts: 0, cat: "3pt_miss" },
  { label: "罚球命中", pts: 1, cat: "ft" },
  { label: "罚球不中", pts: 0, cat: "ft_miss" },
  { label: "进攻篮板", pts: 0, cat: "oreb" },
  { label: "防守篮板", pts: 0, cat: "dreb" },
  { label: "助攻",     pts: 0, cat: "ast" },
  { label: "抢断",     pts: 0, cat: "stl" },
  { label: "盖帽",     pts: 0, cat: "blk" },
  { label: "失误",     pts: 0, cat: "tov" },
  { label: "被犯规",   pts: 0, cat: "foul_drawn" },
  { label: "犯规",     pts: 0, cat: "foul" },
  { label: "换人",     pts: 0, cat: "sub" },
] as const;

export interface GameEvent {
  id: string;
  videoTs: number;
  teamId: TeamId;
  playerId: string;
  playerName: string;
  playerNum: string;
  action: string;
  pts: number;
  cat: string;
}

// Unified contextual prompt — one at a time
type CtxPrompt =
  | { type: "rebound";  shootingTeam: TeamId }
  | { type: "assist";   scoringTeam: TeamId; scorerId: string }
  | { type: "ft_count" }
  | { type: "ft_seq";   total: number; current: number }
  | { type: "steal";    stealTeam: TeamId };

const TEAM_PLAYER_ID = (teamId: TeamId) => `${teamId}-team`;

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function actionColor(cat: string, pts: number): string {
  return pts > 0 ? "#F97316"
    : cat.endsWith("_miss") ? "#EF4444"
    : cat === "foul" ? "#FBBF24"
    : cat === "tov" ? "#EF4444"
    : "#9CA3AF";
}

export default function GcLivePage() {
  const [teams,         setTeams]         = useState<RuntimeTeam[]>(() => teamsFromConfig(DEFAULT_TEAMS));
  const [awayTrackMode, setAwayTrackMode] = useState<"player" | "team">("team");
  const [phase,         setPhase]         = useState<"live" | "postgame">("live");
  const [quarter,       setQuarter]       = useState(1);
  const [recSecs,       setRecSecs]       = useState(0);
  const [events,        setEvents]        = useState<GameEvent[]>([]);
  const [selTeam,       setSelTeam]       = useState<TeamId>("home");
  const [selPlayer,     setSelPlayer]     = useState<string | null>(null);
  const [ctxPrompt,     setCtxPrompt]     = useState<CtxPrompt | null>(null);
  const [detailPlayer,  setDetailPlayer]  = useState<string | null>(null); // postgame detail modal
  const [lastFlash,     setLastFlash]     = useState<string | null>(null);
  const [timeouts,      setTimeouts]      = useState<{ home: number; away: number }>({ home: 5, away: 5 });

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxTimerRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const flashRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);

  useEffect(() => {
    try {
      const cfg: TeamsConfig = loadTeamsConfig();
      setTeams(teamsFromConfig(cfg));
      setAwayTrackMode(cfg.awayTrackMode ?? "team");
    } catch {}
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => {
      if (timerRef.current)    clearInterval(timerRef.current);
      if (ctxTimerRef.current) clearTimeout(ctxTimerRef.current);
      if (flashRef.current)    clearTimeout(flashRef.current);
    };
  }, []);

  // Auto-select "全队" when switching to away team in team mode
  useEffect(() => {
    if (selTeam === "away" && awayTrackMode === "team") {
      setSelPlayer(TEAM_PLAYER_ID("away"));
    }
  }, [selTeam, awayTrackMode]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function switchToTeam(teamId: TeamId) {
    setSelTeam(teamId);
    if (!(teamId === "away" && awayTrackMode === "team")) setSelPlayer(null);
  }

  function clearCtx() {
    if (ctxTimerRef.current) { clearTimeout(ctxTimerRef.current); ctxTimerRef.current = null; }
    setCtxPrompt(null);
  }

  function setCtxTimed(ctx: CtxPrompt, ms: number) {
    if (ctxTimerRef.current) clearTimeout(ctxTimerRef.current);
    setCtxPrompt(ctx);
    ctxTimerRef.current = setTimeout(() => setCtxPrompt(null), ms);
  }

  function makeEvent(
    teamId: TeamId, playerId: string, playerName: string, playerNum: string,
    action: typeof ACTIONS[number]
  ): GameEvent {
    return {
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      videoTs: recSecs,
      teamId, playerId, playerName, playerNum,
      action: action.label, pts: action.pts, cat: action.cat,
    };
  }

  function resolvePlayer(teamId: TeamId, playerId?: string | null) {
    const isTeamMode = teamId === "away" && awayTrackMode === "team";
    if (isTeamMode) return { id: TEAM_PLAYER_ID(teamId), name: "全队", num: "-" };
    const team = teams.find(t => t.id === teamId);
    const p    = team?.players.find(p => p.id === playerId);
    return p ? { id: p.id, name: p.name, num: p.num } : null;
  }

  // ── Event logging ────────────────────────────────────────────────────────────

  function logEvent(action: typeof ACTIONS[number]) {
    if (!selPlayer) return;
    const player = resolvePlayer(selTeam, selPlayer);
    if (!player) return;

    setEvents(prev => [makeEvent(selTeam, player.id, player.name, player.num, action), ...prev]);

    // Flash chip
    if (flashRef.current) clearTimeout(flashRef.current);
    setLastFlash(action.pts > 0 ? `+${action.pts} ${action.label}` : action.label);
    flashRef.current = setTimeout(() => setLastFlash(null), 1800);

    clearCtx();

    if (action.pts > 0) {
      setCtxTimed({ type: "assist", scoringTeam: selTeam, scorerId: player.id }, 5000);
    } else if (["2pt_miss", "3pt_miss", "ft_miss"].includes(action.cat)) {
      setCtxTimed({ type: "rebound", shootingTeam: selTeam }, 6000);
    } else if (action.cat === "foul_drawn") {
      setCtxTimed({ type: "ft_count" }, 10000);
    } else if (action.cat === "tov") {
      const otherTeam: TeamId = selTeam === "home" ? "away" : "home";
      setCtxTimed({ type: "steal", stealTeam: otherTeam }, 6000);
    }
  }

  function logRebound(type: "oreb" | "dreb") {
    if (!ctxPrompt || ctxPrompt.type !== "rebound") return;
    const shootingTeam = ctxPrompt.shootingTeam;
    clearCtx();
    const rebTeamId: TeamId = type === "oreb" ? shootingTeam : (shootingTeam === "home" ? "away" : "home");
    const orebPlayer = type === "oreb"
      ? resolvePlayer(shootingTeam, selPlayer)
      : null;
    const player = orebPlayer ?? resolvePlayer(rebTeamId) ?? { id: TEAM_PLAYER_ID(rebTeamId), name: "全队", num: "-" };
    const action = ACTIONS.find(a => a.cat === type)!;
    setEvents(prev => [makeEvent(rebTeamId, player.id, player.name, player.num, action), ...prev]);
    // Defensive rebound = possession change
    if (type === "dreb") switchToTeam(rebTeamId);
  }

  function logAssist(assistPlayerId: string) {
    if (!ctxPrompt || ctxPrompt.type !== "assist") return;
    const { scoringTeam } = ctxPrompt;
    const otherTeam: TeamId = scoringTeam === "home" ? "away" : "home";
    clearCtx();
    const player = resolvePlayer(scoringTeam, assistPlayerId);
    if (!player) return;
    const action = ACTIONS.find(a => a.cat === "ast")!;
    setEvents(prev => [makeEvent(scoringTeam, player.id, player.name, player.num, action), ...prev]);
    // After made basket → opponent takes possession
    switchToTeam(otherTeam);
  }

  function selectFTCount(count: 1 | 2 | 3) {
    clearCtx();
    setCtxPrompt({ type: "ft_seq", total: count, current: 1 });
  }

  function logFT(made: boolean) {
    if (!ctxPrompt || ctxPrompt.type !== "ft_seq") return;
    const { total, current } = ctxPrompt;
    const player = resolvePlayer(selTeam, selPlayer) ?? { id: TEAM_PLAYER_ID(selTeam), name: "全队", num: "-" };
    const action = ACTIONS.find(a => a.cat === (made ? "ft" : "ft_miss"))!;
    setEvents(prev => [makeEvent(selTeam, player.id, player.name, player.num, action), ...prev]);
    if (current >= total) {
      if (made) {
        // Made last FT → opponent takes possession
        clearCtx();
        const otherTeam: TeamId = selTeam === "home" ? "away" : "home";
        switchToTeam(otherTeam);
      } else {
        // Missed last FT → rebound expected
        setCtxTimed({ type: "rebound", shootingTeam: selTeam }, 6000);
      }
    } else {
      setCtxPrompt({ type: "ft_seq", total, current: current + 1 });
    }
  }

  function logSteal(playerId?: string) {
    if (!ctxPrompt || ctxPrompt.type !== "steal") return;
    const { stealTeam } = ctxPrompt;
    clearCtx();
    const p = playerId
      ? resolvePlayer(stealTeam, playerId)
      : resolvePlayer(stealTeam) ?? { id: TEAM_PLAYER_ID(stealTeam), name: "全队", num: "-" };
    if (!p) return;
    const action = ACTIONS.find(a => a.cat === "stl")!;
    setEvents(prev => [makeEvent(stealTeam, p.id, p.name, p.num, action), ...prev]);
    // Steal = possession change to stealing team
    switchToTeam(stealTeam);
  }

  function useTimeout(side: TeamId) {
    setTimeouts(prev => ({ ...prev, [side]: Math.max(0, prev[side] - 1) }));
  }

  function endGame() {
    if (timerRef.current)    { clearInterval(timerRef.current);  timerRef.current = null; }
    if (ctxTimerRef.current) { clearTimeout(ctxTimerRef.current); ctxTimerRef.current = null; }
    setCtxPrompt(null);

    // Save session for /gc/review to auto-import
    try {
      const sc = {
        home: events.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0),
        away: events.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0),
      };
      localStorage.setItem("gc_last_session", JSON.stringify({
        ts: new Date().toISOString(),
        teams: teams.reduce((acc, t) => ({ ...acc, [t.id]: { name: t.name, color: t.color } }), {} as Record<string, { name: string; color: string }>),
        score: sc,
        duration: recSecs,
        events,
      }));
    } catch {}

    setPhase("postgame");
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const score = {
    home: events.filter(e => e.teamId === "home").reduce((s, e) => s + e.pts, 0),
    away: events.filter(e => e.teamId === "away").reduce((s, e) => s + e.pts, 0),
  };
  const currentTeam = teams.find(t => t.id === selTeam)!;

  // ── POST-GAME SUMMARY ────────────────────────────────────────────────────────

  if (phase === "postgame") {
    const winner: TeamId | null =
      score.home > score.away ? "home" : score.away > score.home ? "away" : null;
    const winnerTeam = teams.find(t => t.id === winner);

    // Build all players that appeared, including synthetic "全队" player
    const allPlayers: { id: string; name: string; num: string; teamId: TeamId; teamColor: string }[] = [];
    teams.forEach(t => {
      t.players.forEach(p => allPlayers.push({ id: p.id, name: p.name, num: p.num, teamId: t.id, teamColor: t.color }));
      // synthetic team-level player for away in team mode
      if (t.id === "away" && awayTrackMode === "team") {
        allPlayers.push({ id: TEAM_PLAYER_ID("away"), name: "全队", num: "-", teamId: "away", teamColor: t.color });
      }
    });

    const playerStats = allPlayers
      .map(p => {
        const pe = events.filter(e => e.playerId === p.id);
        return {
          ...p,
          pts:  pe.reduce((s, e) => s + e.pts, 0),
          reb:  pe.filter(e => e.cat === "oreb" || e.cat === "dreb").length,
          ast:  pe.filter(e => e.cat === "ast").length,
          stl:  pe.filter(e => e.cat === "stl").length,
          blk:  pe.filter(e => e.cat === "blk").length,
          tov:  pe.filter(e => e.cat === "tov").length,
          fts:  pe.filter(e => e.cat === "ft").length,
          pf:   pe.filter(e => e.cat === "foul").length,
          all:  pe,
        };
      })
      .filter(p => p.all.length > 0);

    const clips = events
      .filter(e => e.pts > 0)
      .map(e => ({
        id: e.id,
        title: `${e.playerName} ${e.action}`,
        startTs: Math.max(0, e.videoTs - 2),
        endTs: e.videoTs + 6,
        videoTs: e.videoTs,
      }));

    // Player detail modal
    const detailStats = detailPlayer ? playerStats.find(p => p.id === detailPlayer) : null;

    return (
      <div className="pb-10">
        {/* Player detail modal */}
        {detailStats && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}>
            <div className="w-full rounded-t-2xl px-4 pt-5 pb-10 max-h-[80vh] overflow-y-auto" style={{ background: "#1a1d27" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: detailStats.teamColor }} />
                  <span className="font-black text-white">
                    {detailStats.num !== "-" ? `#${detailStats.num} ` : ""}{detailStats.name}
                  </span>
                </div>
                <button onClick={() => setDetailPlayer(null)} className="text-gray-500 text-lg px-2">✕</button>
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-7 gap-1 mb-5">
                {[["分", detailStats.pts], ["板", detailStats.reb], ["助", detailStats.ast],
                  ["断", detailStats.stl], ["帽", detailStats.blk], ["误", detailStats.tov], ["犯", detailStats.pf]].map(([label, val]) => (
                  <div key={label as string} className="bg-white/5 rounded-lg py-2 text-center">
                    <div className="text-sm font-black text-orange-400">{val}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>

              {/* Event timeline */}
              <div className="text-xs text-gray-500 mb-2">全场事件时间线</div>
              <div className="flex flex-col gap-0">
                {[...detailStats.all].sort((a, b) => a.videoTs - b.videoTs).map(e => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <span className="text-xs font-mono text-gray-600 shrink-0 w-10">{fmt(e.videoTs)}</span>
                    <span className="flex-1 text-xs text-gray-300">{e.action}</span>
                    {e.pts > 0 && <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Final score */}
        <div className="bg-[#1a1d27] border-b border-white/10 px-4 py-5">
          <div className="text-xs text-gray-500 text-center uppercase tracking-wider mb-3">最终比分</div>
          <div className="flex items-center justify-between max-w-xs mx-auto">
            <div className="text-center">
              <div className="text-xs font-bold text-orange-400 mb-1">
                {teams.find(t => t.id === "home")?.name ?? "主场"}
              </div>
              <div className={`text-5xl font-black ${score.home >= score.away ? "text-orange-400" : "text-gray-500"}`}>
                {score.home}
              </div>
            </div>
            <div className="text-gray-600 text-2xl font-bold">—</div>
            <div className="text-center">
              <div className="text-xs font-bold text-blue-400 mb-1">
                {teams.find(t => t.id === "away")?.name ?? "客场"}
              </div>
              <div className={`text-5xl font-black ${score.away >= score.home ? "text-blue-400" : "text-gray-500"}`}>
                {score.away}
              </div>
            </div>
          </div>
          {winnerTeam && (
            <div className="text-center text-xs mt-3 text-yellow-400 font-medium">🏆 {winnerTeam.name} 获胜</div>
          )}
          <div className="text-center text-xs text-gray-600 mt-1">
            录制时长 {fmt(recSecs)} · {events.length} 个事件
          </div>
        </div>

        {/* Auto-generated clips */}
        {clips.length > 0 && (
          <div className="px-4 pt-5 pb-3">
            <div className="text-sm font-bold mb-3">🎬 得分片段 ({clips.length})</div>
            <div className="flex flex-col gap-2">
              {clips.map(c => (
                <div key={c.id} className="rounded-xl bg-[#1a1d27] border border-white/10 p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                    <span className="text-orange-400 text-xl">▶</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{fmt(c.startTs)} — {fmt(c.endTs)}</div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono shrink-0">{fmt(c.videoTs)}</div>
                </div>
              ))}
            </div>
            <Link href="/gc/review" className="block mt-3">
              <div className="rounded-xl border p-3 flex items-center gap-3 active:opacity-80"
                style={{ borderColor: "rgba(249,115,22,0.35)", background: "rgba(249,115,22,0.08)" }}>
                <span className="text-xl shrink-0">🎬</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-orange-400">上传视频 · 自动生成集锦</div>
                  <div className="text-xs text-gray-500 mt-0.5">打点数据已保存，上传比赛视频后自动导入</div>
                </div>
                <span className="text-orange-400 text-lg shrink-0">›</span>
              </div>
            </Link>
          </div>
        )}

        {/* Player stats table — tap row to see detail */}
        {playerStats.length > 0 && (
          <div className="px-4 pb-4">
            <div className="text-sm font-bold mb-3">📊 球员数据 <span className="text-xs text-gray-600 font-normal">（点击查看详情）</span></div>
            <div className="rounded-xl overflow-hidden border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    {["球员", "分", "板", "助", "断", "帽", "误", "犯"].map((h, i) => (
                      <th key={h} className={`py-2 font-medium text-gray-400 ${i === 0 ? "text-left px-3" : "text-center px-1.5"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map(p => (
                    <tr
                      key={p.id}
                      className="border-b border-white/5 last:border-0 active:bg-white/5 cursor-pointer"
                      onClick={() => setDetailPlayer(p.id)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.teamColor }} />
                          <span className="font-medium">{p.num !== "-" ? `#${p.num} ` : ""}{p.name}</span>
                        </div>
                      </td>
                      <td className="px-1.5 py-2.5 text-center font-bold text-orange-400">{p.pts}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.reb}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.ast}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.stl}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.blk}</td>
                      <td className="px-1.5 py-2.5 text-center text-gray-300">{p.tov}</td>
                      <td className={`px-1.5 py-2.5 text-center font-bold ${p.pf >= 5 ? "text-gray-500" : p.pf >= 3 ? "text-red-400" : "text-gray-300"}`}>{p.pf}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {events.length === 0 && (
          <div className="text-center text-gray-600 text-sm py-16">本场比赛没有记录任何事件</div>
        )}

        <div className="flex flex-col gap-3 px-4 pt-2 pb-8">
          <Link href="/coach/reports/generate" className="block">
            <div className="bg-orange-500 text-white text-center font-bold text-sm rounded-xl py-3 active:opacity-80">
              📋 生成本场报告 →
            </div>
          </Link>
          <div className="flex gap-3">
            <Link href="/coach" className="flex-1">
              <div className="border border-white/20 text-white text-center font-bold text-sm rounded-xl py-3 active:opacity-80">返回教练台</div>
            </Link>
            <Link href="/gc" className="flex-1">
              <div className="border border-white/20 text-white text-center font-bold text-sm rounded-xl py-3 active:opacity-80">再来一场</div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── LIVE SCOREKEEPING ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen">
      {/* Quarter + end button */}
      <div className="bg-[#1a1d27] border-b border-white/10 px-3 py-2 flex items-center gap-1.5 shrink-0">
        {[1, 2, 3, 4].map(q => (
          <button key={q} onClick={() => setQuarter(q)}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${quarter === q ? "bg-orange-500 text-white" : "text-gray-500"}`}
          >Q{q}</button>
        ))}
        <div className="flex-1" />
        <button onClick={endGame} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white">
          结束比赛
        </button>
      </div>

      {/* Scoreboard */}
      <div className="bg-[#1a1d27] border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0 relative">
        <div className="flex-1 text-center">
          <div className="text-xs font-bold text-orange-400 mb-1">
            {teams.find(t => t.id === "home")?.name ?? "主场"}
          </div>
          <div className={`text-4xl font-black transition-all ${score.home >= score.away ? "text-orange-400" : "text-gray-500"}`}>
            {score.home}
          </div>
          {/* Timeout dots — tap to use */}
          <div className="flex justify-center gap-1 mt-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <button key={i} onClick={() => useTimeout("home")}
                className="w-2 h-2 rounded-full transition-colors"
                style={{ background: i < timeouts.home ? "#F97316" : "rgba(249,115,22,0.2)" }} />
            ))}
          </div>
        </div>
        <div className="px-4 text-center shrink-0">
          <div className="text-xs text-gray-600 mb-0.5">Q{quarter}</div>
          <div className="text-xl font-mono font-bold">{fmt(recSecs)}</div>
          <div className="w-2 h-2 rounded-full bg-red-500 mx-auto mt-1 animate-pulse" />
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs font-bold text-blue-400 mb-1">
            {teams.find(t => t.id === "away")?.name ?? "客场"}
          </div>
          <div className={`text-4xl font-black transition-all ${score.away > score.home ? "text-blue-400" : "text-gray-500"}`}>
            {score.away}
          </div>
          {/* Timeout dots — tap to use */}
          <div className="flex justify-center gap-1 mt-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <button key={i} onClick={() => useTimeout("away")}
                className="w-2 h-2 rounded-full transition-colors"
                style={{ background: i < timeouts.away ? "#3B82F6" : "rgba(59,130,246,0.2)" }} />
            ))}
          </div>
        </div>
        {/* Last-action flash */}
        {lastFlash && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 whitespace-nowrap">
              {lastFlash}
            </div>
          </div>
        )}
      </div>

      {/* Team toggle */}
      <div className="flex gap-2 px-3 pt-3 shrink-0">
        {teams.map(t => (
          <button key={t.id}
            onClick={() => { setSelTeam(t.id); if (!(t.id === "away" && awayTrackMode === "team")) setSelPlayer(null); }}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={selTeam === t.id ? { background: t.color, color: "#fff" } : { background: "rgba(255,255,255,0.06)", color: "#6B7280" }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Player chips */}
      <div className="flex flex-wrap gap-2 px-3 pt-2 pb-0.5 shrink-0">
        {selTeam === "away" && awayTrackMode === "team" ? (
          <button className="px-3 py-1.5 rounded-lg text-xs font-bold border"
            style={{ background: currentTeam.color, borderColor: currentTeam.color, color: "#fff" }}>
            全队（整队记录）
          </button>
        ) : (
          currentTeam.players.map(p => {
            const active = selPlayer === p.id;
            const fouls = events.filter(e => e.playerId === p.id && e.cat === "foul").length;
            const inTrouble = fouls >= 3;
            const fouledOut = fouls >= 5;
            return (
              <button key={p.id} onClick={() => setSelPlayer(active ? null : p.id)}
                className="relative px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                style={active
                  ? { background: currentTeam.color, borderColor: currentTeam.color, color: "#fff" }
                  : fouledOut
                    ? { background: "rgba(107,114,128,0.1)", borderColor: "rgba(107,114,128,0.3)", color: "#4B5563" }
                    : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "#6B7280" }}
              >
                #{p.num} {p.name}
                {fouls > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                    style={{ background: fouledOut ? "#4B5563" : inTrouble ? "#EF4444" : "#F97316", color: "#fff" }}>
                    {fouls}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Selected player running stats */}
      {selPlayer && (() => {
        const pe = events.filter(e => e.playerId === selPlayer);
        if (pe.length === 0) return null;
        const pts = pe.reduce((s, e) => s + e.pts, 0);
        const reb = pe.filter(e => e.cat === "oreb" || e.cat === "dreb").length;
        const ast = pe.filter(e => e.cat === "ast").length;
        return (
          <div className="flex items-center gap-3 px-4 py-1 shrink-0">
            <span className="text-xs text-gray-600">本场：</span>
            <span className="text-xs text-orange-400 font-bold">{pts}分</span>
            <span className="text-xs text-gray-400">{reb}板</span>
            <span className="text-xs text-gray-400">{ast}助</span>
          </div>
        );
      })()}

      {/* Action buttons — 3-tier hierarchy */}
      {(() => {
        const disabled = !selPlayer;
        const btn = (a: typeof ACTIONS[number], py: string, fontSize: string, activeBg: string, activeColor: string) => (
          <button key={a.cat} onClick={() => logEvent(a)} disabled={disabled}
            className={`${py} rounded-xl font-bold leading-tight transition-colors ${fontSize}`}
            style={disabled ? { background: "rgba(255,255,255,0.03)", color: "#374151" } : { background: activeBg, color: activeColor }}
          >
            {a.label}
          </button>
        );
        const scoring = ACTIONS.filter(a => a.pts > 0);
        const misses  = ACTIONS.filter(a => a.pts === 0 && a.cat.endsWith("_miss"));
        const stats   = ACTIONS.filter(a => a.pts === 0 && !a.cat.endsWith("_miss"));
        return (
          <>
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-2 shrink-0">
              {scoring.map(a => btn(a, "py-5", "text-sm", "rgba(249,115,22,0.90)", "#fff"))}
            </div>
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-1.5 shrink-0">
              {misses.map(a => btn(a, "py-3", "text-xs", "rgba(239,68,68,0.18)", "#F87171"))}
            </div>
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-1.5 shrink-0">
              {stats.map(a => btn(a, "py-2.5", "text-xs", "rgba(255,255,255,0.10)", "#D1D5DB"))}
            </div>
          </>
        );
      })()}

      {/* Contextual prompt overlay */}
      {ctxPrompt !== null && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className="w-full rounded-t-2xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>

            {/* REBOUND */}
            {ctxPrompt.type === "rebound" && (<>
              <div className="text-xs text-gray-400 text-center mb-4 font-medium">谁抢到篮板？</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button onClick={() => logRebound("oreb")}
                  className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(249,115,22,0.20)" }}>
                  <span className="text-2xl">🔄</span>
                  <span className="text-sm font-bold text-orange-400">进攻篮板</span>
                  <span className="text-xs text-orange-500/70">己方抢到</span>
                </button>
                <button onClick={() => logRebound("dreb")}
                  className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(59,130,246,0.20)" }}>
                  <span className="text-2xl">🛡️</span>
                  <span className="text-sm font-bold text-blue-400">防守篮板</span>
                  <span className="text-xs text-blue-500/70">对方抢到</span>
                </button>
              </div>
              <button onClick={clearCtx} className="w-full text-xs text-gray-600 py-2 text-center">跳过</button>
            </>)}

            {/* ASSIST */}
            {ctxPrompt.type === "assist" && (<>
              <div className="text-xs text-gray-400 text-center mb-3 font-medium">有助攻？</div>
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                {(() => {
                  const team = teams.find(t => t.id === ctxPrompt.scoringTeam);
                  return team?.players
                    .filter(p => p.id !== ctxPrompt.scorerId)
                    .map(p => (
                      <button key={p.id} onClick={() => logAssist(p.id)}
                        className="px-3 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                        style={{ background: `${team.color}33`, color: team.color }}>
                        #{p.num} {p.name}
                      </button>
                    ));
                })()}
              </div>
              <button onClick={() => {
                const other: TeamId = ctxPrompt.scoringTeam === "home" ? "away" : "home";
                clearCtx();
                switchToTeam(other);
              }} className="w-full text-xs text-gray-600 py-2 text-center">无助攻</button>
            </>)}

            {/* FT COUNT */}
            {ctxPrompt.type === "ft_count" && (<>
              <div className="text-xs text-gray-400 text-center mb-4 font-medium">罚球几次？</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                {([1, 2, 3] as const).map(n => (
                  <button key={n} onClick={() => selectFTCount(n)}
                    className="py-4 rounded-xl text-lg font-black active:scale-95 transition-transform"
                    style={{ background: "rgba(249,115,22,0.18)", color: "#F97316" }}>
                    {n}次
                  </button>
                ))}
              </div>
              <button onClick={clearCtx} className="w-full text-xs text-gray-600 py-2 text-center">跳过</button>
            </>)}

            {/* FT SEQUENCE */}
            {ctxPrompt.type === "ft_seq" && (<>
              <div className="text-xs text-gray-400 text-center mb-1 font-medium">
                第 {ctxPrompt.current}/{ctxPrompt.total} 次罚球
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mb-4">
                <div className="h-1 bg-orange-500 rounded-full transition-all"
                  style={{ width: `${((ctxPrompt.current - 1) / ctxPrompt.total) * 100}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button onClick={() => logFT(true)}
                  className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(34,197,94,0.20)" }}>
                  <span className="text-2xl">✅</span>
                  <span className="text-sm font-bold text-green-400">命中</span>
                </button>
                <button onClick={() => logFT(false)}
                  className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(239,68,68,0.18)" }}>
                  <span className="text-2xl">❌</span>
                  <span className="text-sm font-bold text-red-400">不中</span>
                </button>
              </div>
              <button onClick={clearCtx} className="w-full text-xs text-gray-600 py-2 text-center">中止记录</button>
            </>)}

            {/* STEAL */}
            {ctxPrompt.type === "steal" && (() => {
              const stealTeam = teams.find(t => t.id === ctxPrompt.stealTeam);
              const isTeamMode = ctxPrompt.stealTeam === "away" && awayTrackMode === "team";
              return (<>
                <div className="text-xs text-gray-400 text-center mb-3 font-medium">
                  {stealTeam?.name ?? "对方"} 谁抢断了？
                </div>
                <div className="flex flex-wrap gap-2 justify-center mb-3">
                  {isTeamMode ? (
                    <button onClick={() => logSteal()}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                      style={{ background: `${stealTeam?.color ?? "#3B82F6"}33`, color: stealTeam?.color ?? "#60A5FA" }}>
                      全队
                    </button>
                  ) : (
                    stealTeam?.players.map(p => (
                      <button key={p.id} onClick={() => logSteal(p.id)}
                        className="px-3 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                        style={{ background: `${stealTeam.color}33`, color: stealTeam.color }}>
                        #{p.num} {p.name}
                      </button>
                    ))
                  )}
                </div>
                <button onClick={clearCtx} className="w-full text-xs text-gray-600 py-2 text-center">无抢断</button>
              </>);
            })()}

          </div>
        </div>
      )}

      {/* Event feed */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-600">
            事件记录 ({events.length})
            {!selPlayer && events.length === 0 && <span className="ml-1.5 text-gray-700">← 先选择球员</span>}
          </span>
          <button
            onClick={() => setEvents(prev => prev.slice(1))}
            disabled={events.length === 0}
            className="text-xs font-bold flex items-center gap-0.5 max-w-[58%]"
            style={{ opacity: events.length === 0 ? 0.35 : 1 }}
          >
            {events.length === 0 ? (
              <span className="text-gray-600">↩ 撤销</span>
            ) : (
              <>
                <span className="text-gray-600 shrink-0">↩ </span>
                <span className="text-gray-400 shrink-0">
                  {events[0].playerNum !== "-" ? `#${events[0].playerNum} ` : "全队 "}
                </span>
                <span className="truncate" style={{ color: actionColor(events[0].cat, events[0].pts) }}>
                  {events[0].action}
                </span>
              </>
            )}
          </button>
        </div>
        {events.map(e => {
          const team = teams.find(t => t.id === e.teamId);
          const evtColor = actionColor(e.cat, e.pts);
          return (
            <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
              <div className="w-1 h-4 rounded-full shrink-0" style={{ background: team?.color ?? "#6B7280" }} />
              <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{fmt(e.videoTs)}</span>
              <span className="flex-1 text-xs truncate">
                <span className="text-gray-400">{e.playerNum !== "-" ? `#${e.playerNum} ` : ""}{e.playerName} </span>
                <span style={{ color: evtColor }}>{e.action}</span>
              </span>
              {e.pts > 0 && <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>}
              <button
                onClick={() => setEvents(prev => prev.filter(x => x.id !== e.id))}
                className="text-gray-700 hover:text-red-400 active:text-red-400 text-xs shrink-0 w-5 text-center"
              >✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
