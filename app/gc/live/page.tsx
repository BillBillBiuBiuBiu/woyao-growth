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

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Synthetic player ID for team-level events (opponent in team mode)
const TEAM_PLAYER_ID = (teamId: TeamId) => `${teamId}-team`;

export default function GcLivePage() {
  const [teams, setTeams] = useState<RuntimeTeam[]>(() => teamsFromConfig(DEFAULT_TEAMS));
  const [awayTrackMode, setAwayTrackMode] = useState<"player" | "team">("team");
  const [phase, setPhase] = useState<"live" | "postgame">("live");
  const [quarter, setQuarter] = useState(1);
  const [recSecs, setRecSecs] = useState(0);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [selTeam, setSelTeam] = useState<TeamId>("home");
  const [selPlayer, setSelPlayer] = useState<string | null>(null);
  // null = no pending rebound; TeamId = the shooting team that just missed
  const [pendingRebound, setPendingRebound] = useState<TeamId | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reboundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const cfg: TeamsConfig = loadTeamsConfig();
      setTeams(teamsFromConfig(cfg));
      setAwayTrackMode(cfg.awayTrackMode ?? "team");
    } catch {}
  }, []);

  // Auto-select "全队" player when switching to away team in team mode
  useEffect(() => {
    if (selTeam === "away" && awayTrackMode === "team") {
      setSelPlayer(TEAM_PLAYER_ID("away"));
    }
  }, [selTeam, awayTrackMode]);

  useEffect(() => {
    timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (reboundTimerRef.current) clearTimeout(reboundTimerRef.current);
    };
  }, []);

  function buildEvent(
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

  function logEvent(action: typeof ACTIONS[number]) {
    if (!selPlayer) return;
    const team = teams.find((t) => t.id === selTeam);
    // In team mode, synthetic player is always valid; otherwise look up real player
    const isTeamMode = selTeam === "away" && awayTrackMode === "team";
    const player = isTeamMode
      ? { name: "全队", num: "-" }
      : team?.players.find((p) => p.id === selPlayer);
    if (!team || !player) return;

    setEvents((prev) => [
      buildEvent(selTeam, selPlayer, player.name, player.num, action),
      ...prev,
    ]);

    // After any miss: trigger rebound prompt (auto-dismiss in 6s)
    if (action.cat === "2pt_miss" || action.cat === "3pt_miss" || action.cat === "ft_miss") {
      if (reboundTimerRef.current) clearTimeout(reboundTimerRef.current);
      setPendingRebound(selTeam);
      reboundTimerRef.current = setTimeout(() => setPendingRebound(null), 6000);
    }
  }

  function logRebound(type: "oreb" | "dreb") {
    if (reboundTimerRef.current) clearTimeout(reboundTimerRef.current);
    const shootingTeam = pendingRebound!;
    setPendingRebound(null);

    const rebTeamId: TeamId = type === "oreb" ? shootingTeam : (shootingTeam === "home" ? "away" : "home");
    const isTeamMode = rebTeamId === "away" && awayTrackMode === "team";

    // For oreb: same player as shooter (fast path). For dreb: opponent team ("全队" since context switched)
    const orebPlayer = type === "oreb"
      ? teams.find(t => t.id === shootingTeam)?.players.find(p => p.id === selPlayer)
      : undefined;

    const playerId   = isTeamMode ? TEAM_PLAYER_ID(rebTeamId) : (orebPlayer?.id   ?? TEAM_PLAYER_ID(rebTeamId));
    const playerName = isTeamMode ? "全队"                     : (orebPlayer?.name ?? "全队");
    const playerNum  = isTeamMode ? "-"                        : (orebPlayer?.num  ?? "-");

    const rebAction = ACTIONS.find(a => a.cat === type)!;
    setEvents(prev => [buildEvent(rebTeamId, playerId, playerName, playerNum, rebAction), ...prev]);
  }

  function endGame() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (reboundTimerRef.current) { clearTimeout(reboundTimerRef.current); reboundTimerRef.current = null; }
    setPendingRebound(null);
    setPhase("postgame");
  }

  const score = {
    home: events.filter((e) => e.teamId === "home").reduce((s, e) => s + e.pts, 0),
    away: events.filter((e) => e.teamId === "away").reduce((s, e) => s + e.pts, 0),
  };

  const currentTeam = teams.find((t) => t.id === selTeam)!;

  // ── POST-GAME SUMMARY ──────────────────────────────────────
  if (phase === "postgame") {
    const winner: TeamId | null =
      score.home > score.away ? "home" : score.away > score.home ? "away" : null;
    const winnerTeam = teams.find((t) => t.id === winner);

    const playerStats = teams.flatMap((t) =>
      t.players.map((p) => {
        const pe = events.filter((e) => e.playerId === p.id);
        return {
          ...p,
          teamId: t.id,
          teamColor: t.color,
          pts:  pe.reduce((s, e) => s + e.pts, 0),
          reb:  pe.filter((e) => e.cat === "oreb" || e.cat === "dreb").length,
          ast:  pe.filter((e) => e.cat === "ast").length,
          stl:  pe.filter((e) => e.cat === "stl").length,
          blk:  pe.filter((e) => e.cat === "blk").length,
          tov:  pe.filter((e) => e.cat === "tov").length,
        };
      })
    ).filter((p) => events.some((e) => e.playerId === p.id));

    // Scoring events → auto-generated clips (±2s buffer)
    const clips = events
      .filter((e) => e.pts > 0)
      .map((e) => ({
        id: e.id,
        title: `${e.playerName} ${e.action}`,
        startTs: Math.max(0, e.videoTs - 2),
        endTs: e.videoTs + 6,
        videoTs: e.videoTs,
      }));

    return (
      <div className="pb-10">
        {/* Final score */}
        <div className="bg-[#1a1d27] border-b border-white/10 px-4 py-5">
          <div className="text-xs text-gray-500 text-center uppercase tracking-wider mb-3">最终比分</div>
          <div className="flex items-center justify-between max-w-xs mx-auto">
            <div className="text-center">
              <div className="text-xs font-bold text-orange-400 mb-1">
                {teams.find((t) => t.id === "home")?.name ?? "主场"}
              </div>
              <div className={`text-5xl font-black ${score.home >= score.away ? "text-orange-400" : "text-gray-500"}`}>
                {score.home}
              </div>
            </div>
            <div className="text-gray-600 text-2xl font-bold">—</div>
            <div className="text-center">
              <div className="text-xs font-bold text-blue-400 mb-1">
                {teams.find((t) => t.id === "away")?.name ?? "客场"}
              </div>
              <div className={`text-5xl font-black ${score.away >= score.home ? "text-blue-400" : "text-gray-500"}`}>
                {score.away}
              </div>
            </div>
          </div>
          {winnerTeam && (
            <div className="text-center text-xs mt-3 text-yellow-400 font-medium">
              🏆 {winnerTeam.name} 获胜
            </div>
          )}
          <div className="text-center text-xs text-gray-600 mt-1">
            录制时长 {fmt(recSecs)} · {events.length} 个事件
          </div>
        </div>

        {/* Auto-generated clips */}
        {clips.length > 0 && (
          <div className="px-4 pt-5 pb-3">
            <div className="text-sm font-bold mb-3">🎬 自动生成集锦片段 ({clips.length})</div>
            <div className="flex flex-col gap-2">
              {clips.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl bg-[#1a1d27] border border-white/10 p-3 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                    <span className="text-orange-400 text-xl">▶</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {fmt(c.startTs)} — {fmt(c.endTs)} · 8秒
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono shrink-0">{fmt(c.videoTs)}</div>
                </div>
              ))}
            </div>
            <Link href="/gc/review" className="block mt-3">
              <div
                className="rounded-xl border p-3 flex items-center gap-3 active:opacity-80"
                style={{ borderColor: "rgba(249,115,22,0.35)", background: "rgba(249,115,22,0.08)" }}
              >
                <span className="text-xl shrink-0">🎬</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-orange-400">上传视频 · 生成真实集锦</div>
                  <div className="text-xs text-gray-500 mt-0.5">把今天的比赛视频上传，按时间戳切出每个片段</div>
                </div>
                <span className="text-orange-400 text-lg shrink-0">›</span>
              </div>
            </Link>
          </div>
        )}

        {/* Player stats table */}
        {playerStats.length > 0 && (
          <div className="px-4 pb-4">
            <div className="text-sm font-bold mb-3">📊 球员数据</div>
            <div className="rounded-xl overflow-hidden border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    {["球员", "分", "板", "助", "断", "帽", "误"].map((h, i) => (
                      <th
                        key={h}
                        className={`py-2 font-medium text-gray-400 ${i === 0 ? "text-left px-3" : "text-center px-1.5"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.teamColor }} />
                          <span className="font-medium">#{p.num} {p.name}</span>
                        </div>
                      </td>
                      <td className="px-1.5 py-2 text-center font-bold text-orange-400">{p.pts}</td>
                      <td className="px-1.5 py-2 text-center text-gray-300">{p.reb}</td>
                      <td className="px-1.5 py-2 text-center text-gray-300">{p.ast}</td>
                      <td className="px-1.5 py-2 text-center text-gray-300">{p.stl}</td>
                      <td className="px-1.5 py-2 text-center text-gray-300">{p.blk}</td>
                      <td className="px-1.5 py-2 text-center text-gray-300">{p.tov}</td>
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

        {/* Navigation footer */}
        <div className="flex flex-col gap-3 px-4 pt-2 pb-8">
          <Link href="/coach/reports/generate" className="block">
            <div className="bg-orange-500 text-white text-center font-bold text-sm rounded-xl py-3 active:opacity-80">
              📋 生成本场报告 →
            </div>
          </Link>
          <div className="flex gap-3">
            <Link href="/coach" className="flex-1">
              <div className="border border-white/20 text-white text-center font-bold text-sm rounded-xl py-3 active:opacity-80">
                返回教练台
              </div>
            </Link>
            <Link href="/gc" className="flex-1">
              <div className="border border-white/20 text-white text-center font-bold text-sm rounded-xl py-3 active:opacity-80">
                再来一场
              </div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── LIVE SCOREKEEPING ──────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen">
      {/* Quarter selector + end button */}
      <div className="bg-[#1a1d27] border-b border-white/10 px-3 py-2 flex items-center gap-1.5 shrink-0">
        {[1, 2, 3, 4].map((q) => (
          <button
            key={q}
            onClick={() => setQuarter(q)}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
              quarter === q ? "bg-orange-500 text-white" : "text-gray-500"
            }`}
          >
            Q{q}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={endGame}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white"
        >
          结束比赛
        </button>
      </div>

      {/* Scoreboard */}
      <div className="bg-[#1a1d27] border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex-1 text-center">
          <div className="text-xs font-bold text-orange-400 mb-1">
            {teams.find(t => t.id === "home")?.name ?? "主场"}
          </div>
          <div className={`text-4xl font-black ${score.home >= score.away ? "text-orange-400" : "text-gray-500"}`}>
            {score.home}
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
          <div className={`text-4xl font-black ${score.away > score.home ? "text-blue-400" : "text-gray-500"}`}>
            {score.away}
          </div>
        </div>
      </div>

      {/* Team toggle */}
      <div className="flex gap-2 px-3 pt-3 shrink-0">
        {teams.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSelTeam(t.id); setSelPlayer(null); }}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
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

      {/* Player chips — or "全队" single chip when away team in team mode */}
      <div className="flex flex-wrap gap-2 px-3 pt-2 shrink-0">
        {selTeam === "away" && awayTrackMode === "team" ? (
          <button
            className="px-3 py-1.5 rounded-lg text-xs font-bold border"
            style={{ background: currentTeam.color, borderColor: currentTeam.color, color: "#fff" }}
          >
            全队（整队记录）
          </button>
        ) : (
          currentTeam.players.map((p) => {
            const active = selPlayer === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelPlayer(active ? null : p.id)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                style={
                  active
                    ? { background: currentTeam.color, borderColor: currentTeam.color, color: "#fff" }
                    : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "#6B7280" }
                }
              >
                #{p.num} {p.name}
              </button>
            );
          })
        )}
      </div>

      {/* Action buttons — 3-tier hierarchy */}
      {(() => {
        const disabled = !selPlayer;
        const btn = (a: typeof ACTIONS[number], py: string, fontSize: string, activeBg: string, activeColor: string) => (
          <button
            key={a.cat}
            onClick={() => logEvent(a)}
            disabled={disabled}
            className={`${py} rounded-xl font-bold leading-tight transition-colors ${fontSize}`}
            style={disabled ? { background: "rgba(255,255,255,0.03)", color: "#374151" } : { background: activeBg, color: activeColor }}
          >
            {a.label}
          </button>
        );
        const scoring = ACTIONS.filter((a) => a.pts > 0);
        const misses  = ACTIONS.filter((a) => a.pts === 0 && a.cat.endsWith("_miss"));
        const stats   = ACTIONS.filter((a) => a.pts === 0 && !a.cat.endsWith("_miss"));
        return (
          <>
            {/* Row 1 — scoring: large orange */}
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-3 shrink-0">
              {scoring.map((a) => btn(a, "py-5", "text-sm", "rgba(249,115,22,0.90)", "#fff"))}
            </div>
            {/* Row 2 — misses: medium red-tinted */}
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-1.5 shrink-0">
              {misses.map((a) => btn(a, "py-3", "text-xs", "rgba(239,68,68,0.18)", "#F87171"))}
            </div>
            {/* Row 3 — stats: small neutral */}
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-1.5 shrink-0">
              {stats.map((a) => btn(a, "py-2.5", "text-xs", "rgba(255,255,255,0.10)", "#D1D5DB"))}
            </div>
          </>
        );
      })()}

      {/* Rebound prompt overlay — appears after any miss */}
      {pendingRebound !== null && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className="w-full rounded-t-2xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
            <div className="text-xs text-gray-400 text-center mb-4 font-medium">谁抢到篮板？</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                onClick={() => logRebound("oreb")}
                className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                style={{ background: "rgba(249,115,22,0.20)" }}
              >
                <span className="text-2xl">🔄</span>
                <span className="text-sm font-bold text-orange-400">进攻篮板</span>
                <span className="text-xs text-orange-500/70">己方抢到</span>
              </button>
              <button
                onClick={() => logRebound("dreb")}
                className="py-5 rounded-xl flex flex-col items-center gap-1 active:scale-95 transition-transform"
                style={{ background: "rgba(59,130,246,0.20)" }}
              >
                <span className="text-2xl">🛡️</span>
                <span className="text-sm font-bold text-blue-400">防守篮板</span>
                <span className="text-xs text-blue-500/70">对方抢到</span>
              </button>
            </div>
            <button
              onClick={() => { if (reboundTimerRef.current) clearTimeout(reboundTimerRef.current); setPendingRebound(null); }}
              className="w-full text-xs text-gray-600 py-2 text-center"
            >
              跳过（无篮板记录）
            </button>
          </div>
        </div>
      )}

      {/* Event feed */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-600">
            事件记录 ({events.length})
            {!selPlayer && events.length === 0 && (
              <span className="ml-1.5 text-gray-700">← 先选择球员</span>
            )}
          </span>
          <button
            onClick={() => setEvents((prev) => prev.slice(1))}
            disabled={events.length === 0}
            className={`text-xs font-bold ${events.length === 0 ? "text-gray-700" : "text-orange-400"}`}
          >
            撤销
          </button>
        </div>
        {events.map((e) => {
          const team = teams.find((t) => t.id === e.teamId);
          return (
            <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
              <div className="w-1 h-4 rounded-full shrink-0" style={{ background: team?.color ?? "#6B7280" }} />
              <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{fmt(e.videoTs)}</span>
              <span className="flex-1 text-xs text-gray-300 truncate">
                #{e.playerNum} {e.playerName}
                <span className="text-gray-500 ml-1">{e.action}</span>
              </span>
              {e.pts > 0 && (
                <span className="text-xs font-bold text-orange-400 shrink-0">+{e.pts}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
