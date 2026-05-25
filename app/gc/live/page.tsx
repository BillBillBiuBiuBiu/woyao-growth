"use client";
import { useState, useEffect, useRef } from "react";

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

export default function GcLivePage() {
  const [phase, setPhase] = useState<"live" | "postgame">("live");
  const [quarter, setQuarter] = useState(1);
  const [recSecs, setRecSecs] = useState(0);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [selTeam, setSelTeam] = useState<TeamId>("home");
  const [selPlayer, setSelPlayer] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function logEvent(action: typeof ACTIONS[number]) {
    if (!selPlayer) return;
    const team = TEAMS.find((t) => t.id === selTeam);
    const player = team?.players.find((p) => p.id === selPlayer);
    if (!team || !player) return;
    setEvents((prev) => [
      {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        videoTs: recSecs,
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

  function endGame() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase("postgame");
  }

  const score = {
    home: events.filter((e) => e.teamId === "home").reduce((s, e) => s + e.pts, 0),
    away: events.filter((e) => e.teamId === "away").reduce((s, e) => s + e.pts, 0),
  };

  const currentTeam = TEAMS.find((t) => t.id === selTeam)!;

  // ── POST-GAME SUMMARY ──────────────────────────────────────
  if (phase === "postgame") {
    const winner: TeamId | null =
      score.home > score.away ? "home" : score.away > score.home ? "away" : null;
    const winnerTeam = TEAMS.find((t) => t.id === winner);

    const playerStats = TEAMS.flatMap((t) =>
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
              <div className="text-xs font-bold text-orange-400 mb-1">PAB篮球</div>
              <div className={`text-5xl font-black ${score.home >= score.away ? "text-orange-400" : "text-gray-500"}`}>
                {score.home}
              </div>
            </div>
            <div className="text-gray-600 text-2xl font-bold">—</div>
            <div className="text-center">
              <div className="text-xs font-bold text-blue-400 mb-1">STB铁骑</div>
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
          <div className="text-xs font-bold text-orange-400 mb-1">PAB篮球</div>
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
          <div className="text-xs font-bold text-blue-400 mb-1">STB铁骑</div>
          <div className={`text-4xl font-black ${score.away > score.home ? "text-blue-400" : "text-gray-500"}`}>
            {score.away}
          </div>
        </div>
      </div>

      {/* Team toggle */}
      <div className="flex gap-2 px-3 pt-3 shrink-0">
        {TEAMS.map((t) => (
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

      {/* Player chips */}
      <div className="flex flex-wrap gap-2 px-3 pt-2 shrink-0">
        {currentTeam.players.map((p) => {
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
        })}
      </div>

      {/* 12 action buttons */}
      <div className="grid grid-cols-4 gap-1.5 px-3 pt-3 shrink-0">
        {ACTIONS.map((a) => {
          const disabled = !selPlayer;
          const isScore = a.pts > 0;
          return (
            <button
              key={a.cat}
              onClick={() => logEvent(a)}
              disabled={disabled}
              className="py-3 rounded-xl text-xs font-bold leading-tight transition-colors"
              style={
                disabled
                  ? { background: "rgba(255,255,255,0.03)", color: "#374151" }
                  : isScore
                  ? { background: "rgba(249,115,22,0.85)", color: "#fff" }
                  : { background: "rgba(255,255,255,0.1)", color: "#D1D5DB" }
              }
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Event feed */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4">
        <div className="text-xs text-gray-600 mb-2">
          事件记录 ({events.length})
          {!selPlayer && events.length === 0 && (
            <span className="ml-1.5 text-gray-700">← 先选择球员</span>
          )}
        </div>
        {events.map((e) => {
          const team = TEAMS.find((t) => t.id === e.teamId);
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
