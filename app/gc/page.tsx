"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  DEFAULT_TEAMS,
  loadTeamsConfig,
  saveTeamsConfig,
  loadGameHistory,
  type TeamsConfig,
  type TeamId,
  type GameRecord,
} from "@/lib/gc-teams";
import { apiLoadGames } from "@/lib/gc-api";

function fmtGameDate(ts: string): string {
  const d = new Date(ts);
  const mo = d.getMonth() + 1;
  const dy = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${mo}/${dy} ${hh}:${mm}`;
}

function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}分${s > 0 ? s + "秒" : ""}`;
}

export default function GcSetupPage() {
  const [cfg, setCfg] = useState<TeamsConfig>(DEFAULT_TEAMS);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<GameRecord[]>([]);

  useEffect(() => {
    setCfg(loadTeamsConfig());
    // Show localStorage records instantly, then replace with backend data
    setHistory(loadGameHistory().slice(0, 5));
    apiLoadGames().then((games) => {
      if (games.length > 0) setHistory(games.slice(0, 10));
    }).catch(() => {});
  }, []);

  function updateTeamName(side: TeamId, name: string) {
    setCfg((prev) => ({ ...prev, [side]: { ...prev[side], name } }));
  }

  function updatePlayer(side: TeamId, i: number, field: "num" | "name", val: string) {
    setCfg((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        players: prev[side].players.map((p, idx) =>
          idx === i ? { ...p, [field]: val } : p
        ),
      },
    }));
  }

  function addPlayer(side: TeamId) {
    setCfg((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        players: [...prev[side].players, { num: "", name: "" }],
      },
    }));
  }

  function removePlayer(side: TeamId, i: number) {
    setCfg((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        players: prev[side].players.filter((_, idx) => idx !== i),
      },
    }));
  }

  function toggleAwayTrackMode() {
    setCfg((prev) => ({
      ...prev,
      awayTrackMode: (prev.awayTrackMode ?? "team") === "team" ? "player" : "team",
    }));
  }

  function handleSave() {
    saveTeamsConfig(cfg);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleCancel() {
    setCfg(loadTeamsConfig());
    setEditing(false);
  }

  // ── EDITING MODE ────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="min-h-screen px-4 pb-10" style={{ background: "#0f1117" }}>
        <div className="pt-6 pb-4 text-center">
          <div className="text-lg font-black text-white">✏️ 编辑阵容</div>
          <div className="text-xs text-gray-500 mt-1">修改队名、球员号码和姓名</div>
        </div>

        {(["home", "away"] as TeamId[]).map((side) => {
          const team = cfg[side];
          const borderColor = side === "home" ? "border-orange-500/30" : "border-blue-500/30";
          const labelColor  = side === "home" ? "text-orange-400"       : "text-blue-400";
          const accentBg    = side === "home" ? "rgba(249,115,22,0.15)" : "rgba(59,130,246,0.15)";

          return (
            <div
              key={side}
              className={`rounded-2xl border p-4 mb-4 ${borderColor}`}
              style={{ background: "#1a1d27" }}
            >
              {/* Team name */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-bold ${labelColor} shrink-0`}>
                  {side === "home" ? "主场" : "客场"}
                </span>
                <input
                  value={team.name}
                  onChange={(e) => updateTeamName(side, e.target.value)}
                  placeholder="队伍名称"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-bold text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
                />
              </div>

              {/* Players */}
              <div className="flex flex-col gap-2">
                {team.players.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-gray-600 text-xs shrink-0 w-3">#</span>
                    <input
                      value={p.num}
                      onChange={(e) => updatePlayer(side, i, "num", e.target.value)}
                      placeholder="号"
                      maxLength={3}
                      className="w-12 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-center text-white placeholder-gray-700 focus:outline-none focus:border-white/30"
                    />
                    <input
                      value={p.name}
                      onChange={(e) => updatePlayer(side, i, "name", e.target.value)}
                      placeholder="球员姓名"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
                    />
                    <button
                      onClick={() => removePlayer(side, i)}
                      className="text-gray-600 hover:text-red-400 text-sm shrink-0 w-6 text-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {team.players.length < 12 && (
                  <button
                    onClick={() => addPlayer(side)}
                    className="flex items-center gap-1.5 text-xs font-medium mt-1 self-start px-3 py-1.5 rounded-lg"
                    style={{ background: accentBg, color: side === "home" ? "#F97316" : "#60A5FA" }}
                  >
                    + 添加球员
                  </button>
                )}
              </div>

              {/* Away-only: track mode toggle */}
              {side === "away" && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-gray-400">对手记录方式</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {(cfg.awayTrackMode ?? "team") === "team"
                          ? "整队：只记录总得分和总数据"
                          : "个人：记录每位球员的详细数据"}
                      </div>
                    </div>
                    <button
                      onClick={toggleAwayTrackMode}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border"
                      style={
                        (cfg.awayTrackMode ?? "team") === "team"
                          ? { background: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.4)", color: "#60A5FA" }
                          : { background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)", color: "#9CA3AF" }
                      }
                    >
                      {(cfg.awayTrackMode ?? "team") === "team" ? "整队" : "个人"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Save / Cancel */}
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 py-3 rounded-xl border border-white/15 text-sm font-bold text-gray-400"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold active:scale-95 transition-transform"
          >
            保存阵容
          </button>
        </div>
      </div>
    );
  }

  // ── SETUP MODE ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center mb-6">
        <div className="text-3xl font-black mb-1">🏀 现场记录</div>
        <div className="text-gray-400 text-sm">人工打点 · 时间戳同步 · 自动生成集锦</div>
      </div>

      {/* Matchup card */}
      <div className="w-full max-w-sm rounded-2xl bg-[#1a1d27] border border-white/10 p-5 mb-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-4">今日对阵</div>
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
              style={{ background: `${cfg.home.color}22` }}
            >
              <span className="text-2xl">🏀</span>
            </div>
            <div className="font-bold" style={{ color: cfg.home.color }}>{cfg.home.name}</div>
            <div className="text-xs text-gray-600 mt-0.5">主场</div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {cfg.home.players.slice(0, 3).map((p, i) => (
                <div key={i} className="text-xs text-gray-500">#{p.num} {p.name}</div>
              ))}
              {cfg.home.players.length > 3 && (
                <div className="text-xs text-gray-600">+{cfg.home.players.length - 3}人</div>
              )}
            </div>
          </div>

          <div className="text-2xl font-black text-gray-600 px-4">VS</div>

          <div className="text-center flex-1">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
              style={{ background: `${cfg.away.color}22` }}
            >
              <span className="text-2xl">🏀</span>
            </div>
            <div className="font-bold" style={{ color: cfg.away.color }}>{cfg.away.name}</div>
            <div className="text-xs text-gray-600 mt-0.5">客场</div>
            <div className="mt-1 inline-block px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ background: "rgba(59,130,246,0.15)", color: "#60A5FA" }}>
              {(cfg.awayTrackMode ?? "team") === "team" ? "整队记录" : "个人记录"}
            </div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {(cfg.awayTrackMode ?? "team") === "player" && cfg.away.players.slice(0, 3).map((p, i) => (
                <div key={i} className="text-xs text-gray-500">#{p.num} {p.name}</div>
              ))}
              {(cfg.awayTrackMode ?? "team") === "player" && cfg.away.players.length > 3 && (
                <div className="text-xs text-gray-600">+{cfg.away.players.length - 3}人</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit roster button */}
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-gray-500 hover:text-gray-300 mb-6 flex items-center gap-1"
      >
        ✏️ 编辑阵容
      </button>

      {saved && (
        <div className="text-xs text-green-400 mb-4">✅ 阵容已保存</div>
      )}

      {/* Mode buttons */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <Link href="/gc/live">
          <div className="bg-orange-500 text-white text-center font-black text-lg rounded-2xl py-4 active:scale-98 transition-transform">
            🏀 现场实时记录 →
          </div>
        </Link>
        <Link href="/gc/review">
          <div
            className="text-white text-center font-bold text-base rounded-2xl py-3.5 active:scale-98 transition-transform border"
            style={{ background: "rgba(249,115,22,0.12)", borderColor: "rgba(249,115,22,0.35)" }}
          >
            🎬 赛后视频打点 →
          </div>
        </Link>
      </div>

      <div className="mt-5 w-full max-w-sm">
        <div className="text-xs text-gray-700 text-center leading-relaxed">
          <span className="text-orange-500">现场记录</span>：场边实时打点，不需要视频<br />
          <span className="text-orange-400">视频打点</span>：上传比赛视频，边看边标记，自动切片
        </div>
      </div>

      {/* Game history */}
      {history.length > 0 && (
        <div className="mt-8 w-full max-w-sm pb-8">
          <div className="text-xs text-gray-600 uppercase tracking-wider mb-3 px-1">最近比赛</div>
          <div className="flex flex-col gap-2">
            {history.map((g) => {
              const homeWon = g.homeScore > g.awayScore;
              const awayWon = g.awayScore > g.homeScore;
              return (
                <div key={g.id} className="rounded-xl border border-white/8 px-4 py-3" style={{ background: "#1a1d27" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-gray-600">{fmtGameDate(g.ts)}</span>
                    <span className="text-[10px] text-gray-700">{g.eventCount} 事件 · {fmtDur(g.duration)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-orange-400 truncate">{g.homeTeam}</div>
                    </div>
                    <div className="flex items-center gap-2 px-3 shrink-0">
                      <span className={`text-lg font-black ${homeWon ? "text-orange-400" : "text-gray-500"}`}>{g.homeScore}</span>
                      <span className="text-gray-700 text-sm">—</span>
                      <span className={`text-lg font-black ${awayWon ? "text-blue-400" : "text-gray-500"}`}>{g.awayScore}</span>
                    </div>
                    <div className="flex-1 text-right">
                      <div className="text-xs font-bold text-blue-400 truncate">{g.awayTeam}</div>
                    </div>
                  </div>
                  {g.quarterScores.length > 0 && (
                    <div className="flex gap-1.5 mt-2 pt-2 border-t border-white/5">
                      {g.quarterScores.map(({ q, home, away }) => (
                        <div key={q} className="text-[10px] text-gray-700">
                          Q{q} <span className={home > away ? "text-orange-400/70" : ""}>{home}</span>
                          <span className="text-gray-800">-</span>
                          <span className={away > home ? "text-blue-400/70" : ""}>{away}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
