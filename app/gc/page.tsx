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
import { apiLoadGames, apiLoadEvents, type StoredEvent } from "@/lib/gc-api";

interface PlayerStat {
  playerId: string;
  name: string;
  num: string;
  team: "home" | "away";
  pts: number;
  reb: number;
  ast: number;
  stl: number;
}

function computeStats(events: StoredEvent[]): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const e of events) {
    if (!map.has(e.playerId)) {
      map.set(e.playerId, { playerId: e.playerId, name: e.playerName, num: e.playerNum, team: e.team, pts: 0, reb: 0, ast: 0, stl: 0 });
    }
    const s = map.get(e.playerId)!;
    s.pts += e.pts;
    if (e.cat === "oreb" || e.cat === "dreb") s.reb++;
    if (e.cat === "ast") s.ast++;
    if (e.cat === "stl") s.stl++;
  }
  return [...map.values()].sort((a, b) => b.pts - a.pts || b.reb - a.reb);
}

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
  const [detailGame, setDetailGame] = useState<{
    record: GameRecord;
    loading: boolean;
    stats: PlayerStat[] | null;
  } | null>(null);
  const [shareText,  setShareText]  = useState<string | null>(null);
  const [copyToast,  setCopyToast]  = useState(false);

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

  function buildShareText(record: GameRecord, stats: PlayerStat[]): string {
    const { homeTeam, awayTeam, homeScore, awayScore, quarterScores } = record;
    const winner = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
    const qLine = quarterScores.map(({ q, home, away }) => `Q${q} ${home}-${away}`).join("  ");
    const fmt = (p: PlayerStat) =>
      `  ${p.num && p.num !== "-" ? `#${p.num} ` : ""}${p.name}  ${p.pts}分${p.reb > 0 ? ` ${p.reb}板` : ""}${p.ast > 0 ? ` ${p.ast}助` : ""}${p.stl > 0 ? ` ${p.stl}断` : ""}`;
    const homePlayers = stats.filter(p => p.team === "home").map(fmt).join("\n");
    const awayPlayers = stats.filter(p => p.team === "away").map(fmt).join("\n");
    return [
      `🏀 ${homeTeam} ${homeScore} — ${awayScore} ${awayTeam}`,
      winner ? `🏆 ${winner} 获胜` : "平局",
      "",
      qLine,
      "",
      `【${homeTeam}】`,
      homePlayers || "  暂无数据",
      "",
      `【${awayTeam}】`,
      awayPlayers || "  暂无数据",
      "",
      `${fmtGameDate(record.ts)} 我耀成长证据系统`,
    ].join("\n");
  }

  async function handleShare(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    } catch {
      setShareText(text);
    }
  }

  function openDetail(record: GameRecord) {
    setDetailGame({ record, loading: true, stats: null });
    apiLoadEvents(record.id).then((events) => {
      setDetailGame((prev) => prev ? { ...prev, loading: false, stats: computeStats(events) } : null);
    }).catch(() => {
      setDetailGame((prev) => prev ? { ...prev, loading: false, stats: [] } : null);
    });
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
                <div key={g.id} onClick={() => openDetail(g)} className="rounded-xl border border-white/8 px-4 py-3 cursor-pointer active:bg-white/5" style={{ background: "#1a1d27" }}>
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

      {/* Game detail bottom sheet */}
      {detailGame && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.78)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setDetailGame(null); }}
        >
          <div className="w-full rounded-t-3xl max-h-[80vh] overflow-y-auto" style={{ background: "#1a1d27" }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-orange-400">{detailGame.record.homeTeam}</span>
                  <span className="text-base font-black text-white">{detailGame.record.homeScore}</span>
                  <span className="text-gray-600 text-sm">—</span>
                  <span className="text-base font-black text-white">{detailGame.record.awayScore}</span>
                  <span className="text-sm font-black text-blue-400">{detailGame.record.awayTeam}</span>
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5">{fmtGameDate(detailGame.record.ts)} · {detailGame.record.eventCount} 事件</div>
              </div>
              <button onClick={() => setDetailGame(null)} className="text-gray-500 text-xl px-1">✕</button>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              {detailGame.loading && (
                <div className="text-center py-8 text-gray-500 text-sm">加载中…</div>
              )}
              {!detailGame.loading && detailGame.stats !== null && detailGame.stats.length === 0 && (
                <div className="text-center py-8 text-gray-600 text-sm">暂无球员数据</div>
              )}
              {!detailGame.loading && detailGame.stats !== null && detailGame.stats.length > 0 && (() => {
                const home = detailGame.stats.filter(p => p.team === "home");
                const away = detailGame.stats.filter(p => p.team === "away");
                const renderTeam = (players: PlayerStat[], color: string, label: string) => (
                  <div className="mb-4">
                    <div className="text-xs font-bold mb-2" style={{ color }}>{label}</div>
                    <div className="rounded-xl overflow-hidden border border-white/8">
                      <div className="grid text-[10px] text-gray-600 px-3 py-1.5 border-b border-white/5" style={{ gridTemplateColumns: "1fr 28px 28px 28px 28px" }}>
                        <span>球员</span><span className="text-center">分</span><span className="text-center">板</span><span className="text-center">助</span><span className="text-center">断</span>
                      </div>
                      {players.map((p) => (
                        <div key={p.playerId} className="grid items-center px-3 py-2 border-b border-white/5 last:border-0" style={{ gridTemplateColumns: "1fr 28px 28px 28px 28px" }}>
                          <span className="text-xs text-gray-300 truncate">{p.num !== "-" && p.num ? `#${p.num} ` : ""}{p.name}</span>
                          <span className="text-xs font-black text-center" style={{ color: p.pts > 0 ? color : "#4B5563" }}>{p.pts || "—"}</span>
                          <span className="text-xs text-center text-gray-400">{p.reb || "—"}</span>
                          <span className="text-xs text-center text-gray-400">{p.ast || "—"}</span>
                          <span className="text-xs text-center text-gray-400">{p.stl || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
                return (
                  <>
                    {home.length > 0 && renderTeam(home, "#F97316", detailGame.record.homeTeam + " 主场")}
                    {away.length > 0 && renderTeam(away, "#60A5FA", detailGame.record.awayTeam + " 客场")}
                  </>
                );
              })()}
              {!detailGame.loading && (
                <div className="flex gap-2 mt-2 mb-4">
                  <button
                    onClick={() => handleShare(buildShareText(detailGame.record, detailGame.stats ?? []))}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border active:opacity-80"
                    style={{ borderColor: "rgba(249,115,22,0.4)", color: copyToast ? "#4ade80" : "#F97316", background: copyToast ? "rgba(34,197,94,0.10)" : "rgba(249,115,22,0.08)" }}
                  >
                    {copyToast ? "✅ 已复制" : "📤 复制战报"}
                  </button>
                  <Link
                    href={`/gc/review?gameId=${detailGame.record.id}`}
                    onClick={() => setDetailGame(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center border border-white/15 text-gray-300 active:bg-white/10"
                  >
                    🎬 去打点
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share fallback sheet (clipboard unavailable) */}
      {shareText !== null && (
        <div className="fixed inset-0 z-[60] flex items-end" style={{ background: "rgba(0,0,0,0.72)" }}>
          <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
            <div className="text-sm font-bold text-white mb-1">📤 复制战报</div>
            <div className="text-xs text-gray-500 mb-3">长按下方文字 → 全选 → 复制，粘贴到微信群</div>
            <textarea
              readOnly
              value={shareText}
              className="w-full rounded-xl text-xs text-gray-300 p-3 resize-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", height: 200, fontFamily: "monospace" }}
              onFocus={e => e.target.select()}
            />
            <button
              onClick={() => setShareText(null)}
              className="w-full mt-3 py-3 rounded-xl border border-white/15 text-sm text-gray-400"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
