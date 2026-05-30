"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { PlayCircle, Heart, BookOpen, Share2 } from "lucide-react";
import { mockReport, mockBadges, mockStudentCards, mockAssessment } from "@/lib/mock-data";
import BasketballCard from "@/components/BasketballCard";
import { apiLoadGames, apiLoadEvents, apiLoadClips, type StoredEvent, type ClipRecord } from "@/lib/gc-api";
import type { GameRecord } from "@/lib/gc-teams";

function fmtMatchDate(ts: string): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function fmtRelDate(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const hhmm = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysDiff = Math.floor((todayStart.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (daysDiff === 0) return `今天 ${hhmm}`;
  if (daysDiff === 1) return `昨天 ${hhmm}`;
  if (daysDiff <= 7) return `${daysDiff}天前 ${hhmm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
}

interface PlayerStat {
  name: string; num: string; team: "home" | "away";
  pts: number; reb: number; ast: number; stl: number;
}

interface HighlightRecord { date: string; name: string; dur: number; }

function formatClipLabel(label: string): string {
  if (!label) return "集锦片段";
  const parts = label.split(",").map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" · ") + "的集锦" : label;
}

function computeStats(events: StoredEvent[]): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const e of events) {
    if (!map.has(e.playerId)) {
      map.set(e.playerId, { name: e.playerName, num: e.playerNum, team: e.team, pts: 0, reb: 0, ast: 0, stl: 0 });
    }
    const s = map.get(e.playerId)!;
    s.pts += e.pts;
    if (e.cat === "oreb" || e.cat === "dreb") s.reb++;
    if (e.cat === "ast") s.ast++;
    if (e.cat === "stl") s.stl++;
  }
  return [...map.values()].sort((a, b) => b.pts - a.pts || b.reb - a.reb);
}

export default function ParentHome() {
  const badge = mockBadges[0];
  const card = mockStudentCards.find((c) => c.id === "stu-001")!;
  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
  const [gameDetail, setGameDetail] = useState<{
    loading: boolean;
    stats: PlayerStat[];
    clips: ClipRecord[];
  } | null>(null);
  const [linkToast, setLinkToast] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [homeExpandedClipId, setHomeExpandedClipId] = useState<string | null>(null);
  const [statsCopied, setStatsCopied] = useState(false);
  const [childName, setChildName] = useState("");
  const [coachName, setCoachName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [myLastHighlight, setMyLastHighlight] = useState<HighlightRecord | null>(null);
  const [heroChildStat, setHeroChildStat] = useState<{ pts: number; reb: number; ast: number; stl: number } | null>(null);
  const [heroGame, setHeroGame] = useState<GameRecord | null>(null);
  const [latestClips, setLatestClips] = useState<ClipRecord[] | null>(null);

  useEffect(() => {
    apiLoadGames().then((games) => { if (games.length > 0) setRecentGames(games.slice(0, 10)); }).catch(() => {}).finally(() => setGamesLoading(false));
    try { const n = localStorage.getItem("child_name"); if (n) setChildName(n); } catch {}
    try { const cn = localStorage.getItem("coach_name"); if (cn) setCoachName(cn); } catch {}
    try { const hl = JSON.parse(localStorage.getItem("my_highlights") || "[]"); if (hl.length > 0) setMyLastHighlight(hl[0]); } catch {}
  }, []);

  useEffect(() => {
    if (recentGames.length === 0) { setLatestClips(null); return; }
    Promise.all(
      recentGames.slice(0, 5).map(g => apiLoadClips(g.id).catch(() => [] as ClipRecord[]))
    ).then(arrays => {
      // Sort by game timestamp desc (most recent game first), then by clip upload time within same game
      const gameOrder = Object.fromEntries(recentGames.slice(0, 5).map((g, i) => [g.id, i]));
      const merged = arrays.flat().sort((a, b) => {
        const oa = gameOrder[a.game_id ?? ""] ?? 99;
        const ob = gameOrder[b.game_id ?? ""] ?? 99;
        return oa !== ob ? oa - ob : a.created_at.localeCompare(b.created_at);
      });
      setLatestClips(merged);
    }).catch(() => setLatestClips([]));
    if (!childName) { setHeroChildStat(null); setHeroGame(null); return; }
    // Parallel-fetch up to 3 recent games to find the most recent one with child's data
    const candidates = recentGames.slice(0, 3).filter(g => g.eventCount > 0);
    if (candidates.length === 0) { setHeroChildStat(null); setHeroGame(null); return; }
    Promise.all(
      candidates.map(async game => {
        const evts = await apiLoadEvents(game.id).catch(() => []);
        const s = computeStats(evts).find(p => p.name === childName);
        return s ? { game, stat: { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl } } : null;
      })
    ).then(results => {
      const found = results.find(r => r !== null);
      if (found) { setHeroChildStat(found.stat); setHeroGame(found.game); }
      else { setHeroChildStat(null); setHeroGame(null); }
    }).catch(() => { setHeroChildStat(null); setHeroGame(null); });
  }, [childName, recentGames]);

  function saveName() {
    const trimmed = nameInput.trim();
    if (trimmed) { setChildName(trimmed); try { localStorage.setItem("child_name", trimmed); } catch {} }
    setEditingName(false);
  }

  async function openGameDetail(game: GameRecord) {
    setSelectedGame(game);
    setGameDetail({ loading: true, stats: [], clips: [] });
    setStatsCopied(false);
    const [events, clips] = await Promise.all([
      apiLoadEvents(game.id).catch(() => [] as StoredEvent[]),
      apiLoadClips(game.id).catch(() => [] as ClipRecord[]),
    ]);
    const sortedClips = [...clips].sort((a, b) => a.created_at.localeCompare(b.created_at));
    setGameDetail({ loading: false, stats: computeStats(events), clips: sortedClips });
    if (sortedClips.length > 0) setExpandedClipId(sortedClips[0].id);
  }

  async function copyClipLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setLinkToast(url);
      setTimeout(() => setLinkToast(null), 2000);
    } catch {
      setShareLink(url);
    }
  }

  return (
    <div className="-mx-4 -mt-6 pb-10" style={{ background: "radial-gradient(circle at 15% 0%, rgba(255,132,39,0.28), transparent 30%), radial-gradient(circle at 85% 12%, rgba(255,212,71,0.14), transparent 34%), linear-gradient(180deg, #101B2D 0%, #07111F 58%, #05070D 100%)" }}>

      {/* ── CINEMATIC HERO ─────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ minHeight: 400 }}>
        {/* Background photo */}
        <img
          src={card.photo || "/students/jiang-haob0.jpg"}
          alt={childName || card.name}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 10%" }}
        />
        {/* Cinematic dark overlay — gradient fades photo into content */}
        <div className="absolute inset-0" style={{
          background: "linear-gradient(180deg, rgba(6,10,18,0.02) 0%, rgba(6,10,18,0.18) 45%, rgba(6,10,18,0.96) 100%)"
        }} />

        {/* ── Floating star card top-right ── */}
        <div className="absolute top-5 right-4 z-20">
          <div className="rounded-[22px] px-3 py-2.5 text-center"
            style={{ background: "rgba(6,10,18,0.42)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(12px)", minWidth: 90 }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-0.5">
              #{card.number} · {card.position}
            </div>
            <div className="text-sm font-black text-white">{childName || card.name}</div>
            <div className="text-[10px] text-slate-300 mt-0.5">PAB U10提高班</div>
            {recentGames.length > 0 && (() => {
              const w = recentGames.filter(g => g.homeScore > g.awayScore).length;
              return <div className="text-xs font-bold text-brand mt-1">{recentGames.length}场 {w}胜</div>;
            })()}
          </div>
        </div>

        {/* Content layer */}
        <div className="relative z-10 flex flex-col justify-end px-5 pt-12 pb-6" style={{ minHeight: 400 }}>
          {/* WOYAO MOMENT label */}
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-brand mb-2.5">WOYAO MOMENT</div>

          {/* Narrative headline — tap to edit name */}
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              placeholder="输入孩子的名字"
              className="text-2xl font-black rounded-xl px-3 py-1 border-2 border-orange-400 outline-none bg-white/10 text-white mb-2"
              style={{ width: 220 }}
            />
          ) : (
            <button className="text-left mb-2.5" onClick={() => { setNameInput(childName); setEditingName(true); }}>
              <h1 className="text-2xl font-black text-white leading-snug">
                {childName && recentGames.length > 0 ? (() => {
                  const w = recentGames.filter(g => g.homeScore > g.awayScore).length;
                  const rate = Math.round(w / recentGames.length * 100);
                  const suffix = rate >= 80 ? "，越打越稳了" : rate >= 60 ? "，越来越好了" : "，每场都在成长";
                  return `${childName}${suffix}`;
                })() : childName ? `${childName}的篮球成长` : <span className="text-orange-300 text-lg">点击设置孩子名字 ✏️</span>}
              </h1>
            </button>
          )}

          {/* Emotional subtext */}
          <p className="text-sm text-gray-300 leading-relaxed mb-4 max-w-xs">
            {heroChildStat
              ? `最近高光：${heroChildStat.pts}分${heroChildStat.reb > 0 ? ` · ${heroChildStat.reb}板` : ""}。不只是数字，是每一次认真上场的证据。`
              : recentGames.length > 0
                ? `这个赛季已有 ${recentGames.length} 场比赛被完整记录下来。`
                : "让教练开始现场打点，我们帮你记录孩子每一次上场的时刻。"}
          </p>

          {/* CTA + stats row */}
          <div className="flex items-center gap-3 flex-wrap">
            {(recentGames.length > 0 || heroGame) && (
              <button
                onClick={() => heroGame ? openGameDetail(heroGame) : null}
                className="flex items-center gap-2 bg-orange-500 text-white text-sm font-bold px-5 py-2.5 rounded-full active:scale-95 transition-transform shadow-lg"
              >
                <PlayCircle className="size-4" /> 播放最新高光
              </button>
            )}
            {recentGames.length > 0 && (() => {
              const w = recentGames.filter(g => g.homeScore > g.awayScore).length;
              const rate = Math.round(w / recentGames.length * 100);
              return (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <span className="text-xs text-white/70">{recentGames.length}场</span>
                  <span className="text-xs font-bold text-brand">{w}胜</span>
                  <span className="text-xs font-bold text-orange-400">{rate}%</span>
                  {coachName && <><span className="text-white/20 text-xs">·</span><span className="text-xs text-white/50">教练{coachName}</span></>}
                </div>
              );
            })()}
            {!childName && (
              <div className="text-xs text-white/50">↑ 点标题设置名字</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4">
        {/* Volunteer annotation entry — same person who watches is often the volunteer scorer */}
        <Link href="/gc/live">
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between active:opacity-70 transition-opacity">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(249,115,22,0.10)" }}>
                <span className="text-xl">📋</span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">比赛现场记录</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {childName ? `${childName} · ${mockAssessment.level}稳定阶段 · 现场参与记录精彩时刻` : "现场参与 · 记录孩子的精彩时刻"}
                </div>
              </div>
            </div>
            <div className="text-orange-300 shrink-0 text-xl">›</div>
          </div>
        </Link>

        {/* Loading skeleton — reserves space so content load doesn't shift layout (CLS) */}
        {gamesLoading && (
          <div className="flex flex-col gap-4" aria-hidden>
            <div className="rounded-2xl animate-pulse" style={{ height: 76, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <div className="rounded-3xl animate-pulse" style={{ height: 132, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <div className="rounded-3xl animate-pulse" style={{ height: 220, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>
        )}

        {/* Growth narrative — appears when we have enough real data */}
        {!gamesLoading && recentGames.length >= 3 && childName && (() => {
          const w = recentGames.filter(g => g.homeScore > g.awayScore).length;
          const winDesc = w >= recentGames.length * 0.8
            ? `赢下了其中 ${w} 场，表现出色`
            : w >= recentGames.length * 0.5
              ? `赢下了其中 ${w} 场，稳步成长`
              : `每一场都全力以赴`;
          return (
            <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)" }}>
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-300 mb-1"><BookOpen className="size-3.5" /> 成长记录</div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {childName}这个赛季，我们一起记录了 <span className="font-bold text-orange-600">{recentGames.length} 场</span> 比赛，{winDesc}。不只是比分，是每一次在球场上认真努力的证据。
              </p>
            </div>
          );
        })()}

        {/* 给妈妈的话 — 情绪承接区 */}
        {!gamesLoading && recentGames.length >= 3 && childName && (
          <div className="rounded-[28px] px-4 py-4 backdrop-blur"
            style={{ background: "linear-gradient(135deg, rgba(255,132,39,0.16), rgba(255,255,255,0.08))", border: "1px solid rgba(254,215,170,0.3)" }}>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-2xl bg-white/10 text-orange-200"><Heart className="size-4 fill-orange-200/20" /></span>
              <span className="inline-flex items-center rounded-full bg-orange-500 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-white">给妈妈的话</span>
            </div>
            <p className="mt-3 text-xl font-black text-white leading-snug">
              你看到的不只是一段视频，是孩子一点点变勇敢的样子。
            </p>
            <p className="mt-2 text-sm text-orange-50 leading-7">
              {childName}在球场上每一次抬头、奔跑和再尝试，当时可能很快就过去了。但这些小小的瞬间拼在一起，就是孩子认真长大的证据。妈妈不用懂所有数据，我们会替你好好保存下来。
            </p>
          </div>
        )}

        {/* 分享给家人 — 成长档案分享卡(驱动口碑/转介绍) */}
        {!gamesLoading && recentGames.length > 0 && childName && (
          <div className="rounded-[28px] p-4 backdrop-blur"
            style={{ background: "linear-gradient(135deg, rgba(255,132,39,0.22), rgba(255,212,71,0.1))", border: "1px solid rgba(253,186,116,0.3)" }}>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white"><Share2 className="size-5" /></span>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white">想给家人看，就点这里</h2>
                <p className="mt-1 text-sm leading-6 text-orange-50">把{childName}的成长整理成一张可保存、可转发的成长档案，发给爸爸/爷爷奶奶一起见证。</p>
              </div>
            </div>
            <button
              onClick={async () => {
                const url = `${window.location.origin}/parent/profile/stu-001`;
                const title = `${childName}的篮球成长档案`;
                if ("share" in navigator) {
                  try { await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ url, title, text: `来看看${childName}在 PAB 的篮球成长记录 🏀` }); return; } catch {}
                }
                copyClipLink(url);
              }}
              className="mt-4 w-full flex items-center justify-center gap-2 h-11 rounded-full bg-orange-500 text-white text-sm font-bold active:scale-95 transition-transform"
            >
              <Share2 className="size-4" />
              {linkToast === `${typeof window !== "undefined" ? window.location.origin : ""}/parent/profile/stu-001` ? "✅ 链接已复制" : "分享给家人"}
            </button>
          </div>
        )}

        {/* Recent games list — each row clickable, opens detail sheet */}
        {!gamesLoading && recentGames.length > 0 && (
          <div className="rounded-3xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(12px)" }}>
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <div className="text-sm font-bold text-white">🏀 比赛记录</div>
              {recentGames.length >= 2 && (() => {
                const w = recentGames.filter(g => g.homeScore > g.awayScore).length;
                const l = recentGames.filter(g => g.homeScore < g.awayScore).length;
                const d = recentGames.filter(g => g.homeScore === g.awayScore).length;
                return (
                  <div className="text-xs text-gray-400">
                    <span className="text-green-400 font-bold">{w}胜</span>
                    {l > 0 && <span className="text-red-400 font-bold ml-1">{l}负</span>}
                    {d > 0 && <span className="text-gray-400 ml-1">{d}平</span>}
                  </div>
                );
              })()}
            </div>
            {(() => {
              // Build clip count per game from latestClips (covers the last 5 games)
              const clipCountMap: Record<string, number> = {};
              if (latestClips) {
                for (const c of latestClips) {
                  if (c.game_id) clipCountMap[c.game_id] = (clipCountMap[c.game_id] || 0) + 1;
                }
              }
              return recentGames.map((game, i) => {
              const won  = game.homeScore > game.awayScore;
              const lost = game.homeScore < game.awayScore;
              const clipCount = clipCountMap[game.id];
              return (
              <button
                key={game.id}
                onClick={() => openGameDetail(game)}
                className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors text-left"
                style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white text-sm">
                    {game.homeTeam} <span style={{ color: won ? "#16A34A" : lost ? "#9CA3AF" : "#F97316" }}>{game.homeScore}</span>
                    <span className="text-gray-300 mx-1">—</span>
                    <span style={{ color: lost ? "#16A34A" : won ? "#9CA3AF" : "#F97316" }}>{game.awayScore}</span> {game.awayTeam}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{fmtRelDate(game.ts)}</div>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${won ? "bg-green-500/20 text-green-400" : lost ? "bg-white/10 text-gray-400" : "bg-orange-500/20 text-orange-400"}`}>
                    {won ? "胜" : lost ? "负" : "平"}
                  </span>
                  {game.eventCount > 0
                    ? <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full font-medium">
                        {clipCount ? `📹 ${clipCount}个集锦` : "📹 有集锦素材"}
                      </span>
                    : null
                  }
                  <span className="text-orange-300">›</span>
                </div>
              </button>
              );
            });
            })()}
          </div>
        )}

        {/* Highlight reel CTA — placed after game list so games are the first thing parents see */}
        <Link href="/parent/highlights">
          <div
            className="rounded-3xl p-5 active:scale-98 transition-transform shadow-md relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #F97316 0%, #FB923C 50%, #FBBF24 100%)" }}
          >
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-6xl opacity-20 select-none">🎬</div>
            <div className="relative">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold text-orange-100 bg-white/20 px-2 py-0.5 rounded-full">AI 自动剪辑</span>
              </div>
              <div className="text-lg font-black text-white leading-tight">{childName ? `生成${childName}的精彩集锦` : "生成孩子的精彩集锦"}</div>
              <div className="text-sm text-orange-100 mt-1">上传比赛视频 · AI识别有球片段 · 一键生成</div>
              <div className="mt-3 inline-flex items-center gap-1 bg-white text-orange-600 text-xs font-bold px-3 py-1.5 rounded-full">
                立即体验 →
              </div>
            </div>
          </div>
        </Link>

        {myLastHighlight && (
          <Link href="/parent/highlights">
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between active:bg-white/5 transition-colors" style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(12px)" }}>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-orange-500 font-medium mb-0.5">✨ 最近集锦</div>
                <div className="text-sm font-semibold text-white truncate">{myLastHighlight.name.replace(/\.mp4$/i, "") || (childName ? `${childName}的精彩集锦` : "精彩集锦")}</div>
                <div className="text-xs text-gray-400 mt-0.5">{fmtRelDate(myLastHighlight.date)} · {myLastHighlight.dur}秒</div>
              </div>
              <div className="text-orange-300 ml-3 shrink-0 text-xl">›</div>
            </div>
          </Link>
        )}

        {/* Latest report — shown only when no real games exist (demo state) */}
        {!gamesLoading && recentGames.length === 0 && (
          <Link href={`/parent/reports/${mockReport.id}`}>
            <div className="rounded-3xl p-4 flex items-center justify-between active:scale-98 transition-transform">
              <div>
                <div className="text-xs text-orange-500 mb-1 font-medium">📋 最新成长报告</div>
                <div className="font-bold text-white">{mockReport.title}</div>
                <div className="text-xs text-gray-400 mt-1">{mockReport.clips.length}个成长证据 · 教练已确认 ✓</div>
              </div>
              <div className="text-2xl text-orange-300 ml-2">›</div>
            </div>
          </Link>
        )}

        {/* Clips — real when available, mock demo when no games, generate CTA when no clips */}
        {(!gamesLoading && recentGames.length === 0) ? (
          <div className="rounded-3xl p-4">
            <div className="text-sm font-bold text-white mb-3">🎞️ 教练标注片段</div>
            <div className="grid grid-cols-3 gap-2">
              {mockReport.clips.map((clip) => (
                <Link key={clip.id} href={`/parent/reports/${mockReport.id}`}>
                  <div className="aspect-video rounded-2xl overflow-hidden relative cursor-pointer bg-slate-900">
                    {clip.thumbnail && (
                      <img src={clip.thumbnail} alt={clip.title} className="w-full h-full object-cover opacity-80" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full bg-white/40 flex items-center justify-center">
                        <span className="text-white text-xs">▶</span>
                      </div>
                    </div>
                    <div className="absolute bottom-1 left-0 right-0 text-xs text-white/90 text-center leading-tight px-1 truncate drop-shadow">{clip.title}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : latestClips === null ? (
          <div className="rounded-3xl p-4">
            <div className="text-sm font-bold text-white mb-3">🎞️ 集锦切片</div>
            <div className="flex flex-col gap-2">
              {[0, 1].map(i => (
                <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          </div>
        ) : latestClips && latestClips.length > 0 ? (() => {
          const visibleClips = childName
            ? latestClips.filter(c => !c.label || c.label.split(",").map((s: string) => s.trim()).includes(childName))
            : latestClips;
          return (
          <div className="rounded-3xl p-4">
            <div className="text-sm font-bold text-white mb-3">{childName ? `🎞️ ${childName}的集锦切片` : "🎞️ 最新集锦切片"}</div>
            <div className="flex flex-col gap-2">
              {visibleClips.length === 0 ? (
                <Link href="/parent/highlights" className="block">
                  <div className="text-center py-3 text-sm text-gray-400">最近比赛暂无{childName}的切片 · <span className="text-orange-500 font-medium">去生成 ›</span></div>
                </Link>
              ) : visibleClips.slice(0, 3).map((clip) => {
                const isExpanded = homeExpandedClipId === clip.id;
                return (
                  <div key={clip.id} className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
                    <button
                      className="flex items-center justify-between w-full px-3 py-2.5 text-left active:bg-white/5 transition-colors"
                      onClick={() => setHomeExpandedClipId(isExpanded ? null : clip.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">{formatClipLabel(clip.label)}</div>
                        <div className="text-xs text-gray-400">{fmtRelDate(clip.created_at)}{(() => { const g = recentGames.find(x => x.id === clip.game_id); return g ? ` · ${g.homeScore}-${g.awayScore} ${g.awayTeam}` : ""; })()}</div>
                      </div>
                      <span className="shrink-0 ml-3 text-orange-400 text-sm" style={{ display: "inline-block", transform: isExpanded ? "rotate(180deg)" : "none" }}>▾</span>
                    </button>
                    {isExpanded && (
                      <div className="px-2 pb-2 flex flex-col gap-2">
                        <video src={clip.public_url} controls playsInline className="w-full rounded-xl bg-black" style={{ maxHeight: 220 }} />
                        <button
                          onClick={async () => {
                            if ("share" in navigator) {
                              try { await (navigator as Navigator & {share:(d:ShareData)=>Promise<void>}).share({ url: clip.public_url, title: childName ? `${childName}的精彩集锦` : "精彩集锦" }); return; } catch {}
                            }
                            copyClipLink(clip.public_url);
                          }}
                          className="w-full py-1.5 rounded-lg text-xs font-bold border active:opacity-70 transition-colors"
                          style={{ borderColor: linkToast === clip.public_url ? "rgba(34,197,94,0.4)" : "rgba(249,115,22,0.4)", color: linkToast === clip.public_url ? "#4ade80" : "#F97316", background: linkToast === clip.public_url ? "rgba(34,197,94,0.08)" : "rgba(249,115,22,0.08)" }}
                        >
                          {linkToast === clip.public_url ? "✅ 已复制" : "📤 分享集锦"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleClips.length > 3 && (
                <Link href="/parent/highlights?tab=clips" className="block">
                  <div className="text-center py-1.5 text-xs font-medium text-orange-500 active:opacity-70">查看{childName}全部切片 →</div>
                </Link>
              )}
            </div>
          </div>
          );
        })() : latestClips !== null ? (
          <Link href="/parent/highlights">
            <div className="rounded-3xl p-4 flex items-center justify-between active:scale-98 transition-transform">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-orange-500 mb-1 font-medium">🎞️ 集锦切片</div>
                {myLastHighlight ? (
                  <>
                    <div className="font-bold text-white truncate">{myLastHighlight.name.replace(/\.mp4$/i, "")}</div>
                    <div className="text-xs text-gray-400 mt-1">{myLastHighlight.dur}秒 · 已生成 → 去查看</div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-white">暂无集锦</div>
                    <div className="text-xs text-gray-400 mt-1">上传比赛视频，AI帮你剪精彩片段</div>
                  </>
                )}
              </div>
              <div className="text-sm font-bold text-orange-500 ml-2 shrink-0">🎬 {myLastHighlight ? "查看 ›" : "生成 ›"}</div>
            </div>
          </Link>
        ) : null}

        {/* Next steps — shown only in demo state (no real games) */}
        {!gamesLoading && recentGames.length === 0 && (
          <div className="rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(12px)" }}>
            <div className="text-sm font-bold text-white mb-3">📌 下阶段建议</div>
            <ul className="flex flex-col gap-2">
              {mockReport.nextSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-300">
                  <span className="text-orange-400 font-bold shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cards showcase — shown only in demo state (no real games) */}
        {!gamesLoading && recentGames.length === 0 && (
          <div className="rounded-3xl p-4">
            <div className="text-sm font-bold text-white mb-3">🃏 球星卡</div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {mockStudentCards.map((c) => (
                <div key={c.id} className="shrink-0 flex flex-col items-center gap-1">
                  <BasketballCard
                    name={c.name}
                    namePinyin={c.namePinyin}
                    number={c.number}
                    position={c.position}
                    photo={c.photo}
                    prebuiltCard={c.prebuiltCard}
                    size="mini"
                  />
                  <div className="text-xs text-gray-500">{c.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile link */}
        <Link href="/parent/profile/stu-001">
          <div className="rounded-3xl p-4 flex items-center justify-between active:scale-98 transition-transform">
            <div>
              <div className="font-bold text-sm text-white">{childName ? `${childName}的成长档案` : "查看完整成长档案"}</div>
              <div className="text-xs text-gray-400 mt-0.5">技术分析 · 成长曲线 · 历史比赛</div>
            </div>
            <div className="text-2xl text-orange-300">›</div>
          </div>
        </Link>
      </div>

      {/* Game detail bottom sheet */}
      {gameDetail !== null && selectedGame !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => { setGameDetail(null); setSelectedGame(null); }}
        >
          <div
            className="relative w-full max-h-[80vh] overflow-y-auto rounded-t-3xl px-4 pt-4 pb-10 bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
              <button
                onClick={() => { setGameDetail(null); setSelectedGame(null); }}
                className="absolute right-4 top-5 text-gray-400 text-lg leading-none active:opacity-60 transition-opacity"
                style={{ lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Score header */}
            <div className="text-center mb-4">
              <div className="text-xs text-orange-500 mb-1 font-medium">🏀 比赛详情</div>
              <div className="font-black text-lg text-gray-800">
                {selectedGame.homeTeam}{" "}
                <span style={{ color: selectedGame.homeScore > selectedGame.awayScore ? "#16A34A" : selectedGame.homeScore < selectedGame.awayScore ? "#9CA3AF" : "#F97316" }}>{selectedGame.homeScore}</span>
                <span className="text-gray-300 mx-2">—</span>
                <span style={{ color: selectedGame.awayScore > selectedGame.homeScore ? "#16A34A" : selectedGame.awayScore < selectedGame.homeScore ? "#9CA3AF" : "#F97316" }}>{selectedGame.awayScore}</span>{" "}
                {selectedGame.awayTeam}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{fmtRelDate(selectedGame.ts)}</div>
              {selectedGame.quarterScores.length > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                  {selectedGame.quarterScores.map(({ q, home, away }) => (
                    <span key={q} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">
                      Q{q}{" "}
                      <span style={{ color: home > away ? "#16A34A" : home < away ? "#9CA3AF" : "#F97316" }}>{home}</span>
                      <span className="text-gray-300 mx-0.5">-</span>
                      <span style={{ color: away > home ? "#16A34A" : away < home ? "#9CA3AF" : "#F97316" }}>{away}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {gameDetail.loading ? (
              <div className="text-center text-gray-400 text-sm py-10">加载中…</div>
            ) : (
              <>
                {/* Clips — shown first so parents see them immediately */}
                {gameDetail.clips.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-bold text-gray-500 mb-2 px-1">🎬 集锦切片（{gameDetail.clips.length}个精彩时刻）</div>
                    <div className="flex flex-col gap-2">
                      {gameDetail.clips.map((clip) => {
                        const expanded = expandedClipId === clip.id;
                        return (
                          <div
                            key={clip.id}
                            className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
                          >
                            <button
                              className="flex items-center justify-between w-full px-3 py-2.5 text-left active:bg-white/5 transition-colors"
                              onClick={() => setExpandedClipId(expanded ? null : clip.id)}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-white truncate">
                                  {formatClipLabel(clip.label)}
                                </div>
                                <div className="text-xs text-gray-400">{fmtRelDate(clip.created_at)}</div>
                              </div>
                              <span className="shrink-0 ml-3 text-orange-400 text-sm transition-transform" style={{ display: "inline-block", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
                            </button>
                            {expanded && (
                              <div className="px-2 pb-2 flex flex-col gap-2">
                                <video
                                  src={clip.public_url}
                                  controls
                                  playsInline
                                  className="w-full rounded-xl bg-black"
                                  style={{ maxHeight: 240 }}
                                />
                                <button
                                  onClick={async () => {
                                    if ("share" in navigator) {
                                      try { await (navigator as Navigator & {share:(d:ShareData)=>Promise<void>}).share({ url: clip.public_url, title: childName ? `${childName}的精彩集锦` : "精彩集锦" }); return; } catch {}
                                    }
                                    copyClipLink(clip.public_url);
                                  }}
                                  className="w-full py-1.5 rounded-lg text-xs font-bold border active:opacity-70 transition-colors"
                                  style={{
                                    borderColor: linkToast === clip.public_url ? "rgba(34,197,94,0.4)" : "rgba(249,115,22,0.4)",
                                    color: linkToast === clip.public_url ? "#4ade80" : "#F97316",
                                    background: linkToast === clip.public_url ? "rgba(34,197,94,0.08)" : "rgba(249,115,22,0.08)",
                                  }}
                                >
                                  {linkToast === clip.public_url ? "✅ 已复制" : "📤 分享集锦"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Player stats — shown below clips, grouped by team */}
                {gameDetail.stats.length > 0 && (() => {
                  const sortGroup = (arr: PlayerStat[]) => [...arr].sort((a, b) => {
                    if (childName) {
                      if (a.name === childName) return -1;
                      if (b.name === childName) return 1;
                    }
                    return b.pts - a.pts || b.reb - a.reb;
                  });
                  const homeStats = sortGroup(gameDetail.stats.filter(p => p.team === "home"));
                  const awayStats = sortGroup(gameDetail.stats.filter(p => p.team === "away"));
                  const childTeam = childName ? gameDetail.stats.find(p => p.name === childName)?.team : undefined;
                  const groups: { label: string; color: string; stats: PlayerStat[] }[] =
                    childTeam === "away"
                      ? [{ label: selectedGame.awayTeam, color: "#3B82F6", stats: awayStats }, { label: selectedGame.homeTeam, color: "#F97316", stats: homeStats }]
                      : [{ label: selectedGame.homeTeam, color: "#F97316", stats: homeStats }, { label: selectedGame.awayTeam, color: "#3B82F6", stats: awayStats }];
                  const topScorer = [...gameDetail.stats].sort((a, b) => b.pts - a.pts)[0];
                  return (
                  <div className="mb-4">
                    {topScorer && topScorer.pts > 0 && (
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">🌟 本场最佳</span>
                        <span className="text-xs text-gray-600 font-medium">{topScorer.name} · {topScorer.pts}分{topScorer.reb > 0 ? ` ${topScorer.reb}板` : ""}</span>
                      </div>
                    )}
                    <div className="text-xs font-bold text-gray-500 mb-2 px-1">球员数据</div>
                    <div className="rounded-xl overflow-hidden border border-gray-100">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left px-3 py-2 text-gray-400 font-medium">球员</th>
                            <th className="text-center px-2 py-2 text-gray-400 font-medium">分</th>
                            <th className="text-center px-2 py-2 text-gray-400 font-medium">板</th>
                            <th className="text-center px-2 py-2 text-gray-400 font-medium">助</th>
                            <th className="text-center px-2 py-2 text-gray-400 font-medium">断</th>
                          </tr>
                        </thead>
                        {groups.map(({ label, color, stats }) => stats.length > 0 && (
                          <tbody key={label}>
                            <tr>
                              <td colSpan={5} className="px-3 py-1.5 text-xs font-bold" style={{ background: `${color}12`, color }}>
                                {label}
                              </td>
                            </tr>
                            {stats.map((p, i) => {
                              const isMyChild = childName && p.name === childName;
                              return (
                              <tr
                                key={`${p.team}-${p.name}-${i}`}
                                className={`border-t ${isMyChild ? "border-l-2 border-amber-400 bg-amber-50" : "border-gray-50"}`}
                                style={isMyChild ? undefined : { background: i % 2 === 0 ? "white" : "#FFFBF5" }}
                              >
                                <td className="px-3 py-2.5">
                                  <span className={`font-medium ${isMyChild ? "text-amber-700 font-bold" : "text-gray-800"}`}>
                                    {p.num && p.num !== "-" ? `#${p.num} ` : ""}{p.name}{isMyChild ? " ⭐" : ""}
                                  </span>
                                </td>
                                <td className="px-2 py-2.5 text-center font-bold text-orange-500">{p.pts}</td>
                                <td className="px-2 py-2.5 text-center text-gray-500">{p.reb}</td>
                                <td className="px-2 py-2.5 text-center text-gray-500">{p.ast}</td>
                                <td className="px-2 py-2.5 text-center text-gray-500">{p.stl}</td>
                              </tr>
                              );
                            })}
                          </tbody>
                        ))}
                      </table>
                    </div>
                  </div>
                  );
                })()}

                {gameDetail.stats.length === 0 && gameDetail.clips.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-4">暂无数据</div>
                )}

                {gameDetail.clips.length === 0 && (
                  <Link
                    href="/parent/highlights"
                    onClick={() => { setGameDetail(null); setSelectedGame(null); setExpandedClipId(null); setStatsCopied(false); }}
                    className="block mx-1 mb-3"
                  >
                    <div
                      className="rounded-xl px-4 py-3 flex items-center justify-between border active:opacity-70 transition-opacity"
                      style={{ background: "rgba(249,115,22,0.06)", borderColor: "rgba(249,115,22,0.2)" }}
                    >
                      <div>
                        <div className="text-xs font-bold text-orange-600 mb-0.5">暂无集锦</div>
                        <div className="text-xs text-gray-500">上传比赛视频，AI帮你剪精彩片段</div>
                      </div>
                      <div className="text-sm font-bold text-orange-500 shrink-0 ml-3">🎬 生成 ›</div>
                    </div>
                  </Link>
                )}

                {selectedGame && gameDetail.stats.length > 0 && (
                  <button
                    onClick={async () => {
                      const childStat = childName ? gameDetail.stats.find(p => p.name === childName) : null;
                      let msg: string;
                      if (childStat) {
                        const gd = new Date(selectedGame.ts);
                        const nd = new Date();
                        const daysDiff = Math.floor((new Date(nd.getFullYear(),nd.getMonth(),nd.getDate()).getTime() - new Date(gd.getFullYear(),gd.getMonth(),gd.getDate()).getTime()) / 86400000);
                        const praise = daysDiff === 0 ? "今天打得棒！" : daysDiff === 1 ? "昨天打得棒！" : "那场打得棒！";
                        const clipHint = gameDetail.clips.length > 0 ? `\n📹 ${gameDetail.clips.length}个精彩集锦 · 打开「我耀」首页查看` : "";
                        msg = `🏀 ${childName}${praise}\n${fmtMatchDate(selectedGame.ts)} · ${selectedGame.homeTeam} ${selectedGame.homeScore}—${selectedGame.awayScore} ${selectedGame.awayTeam}\n个人数据：${childStat.pts}分 ${childStat.reb}板 ${childStat.ast}助 ${childStat.stl}断${clipHint}\n来自「我耀成长」`;
                      } else {
                        const top = gameDetail.stats.slice(0, 5);
                        const lines = top.map(p => `  #${p.num || "-"} ${p.name}：${p.pts}分 ${p.reb}板 ${p.ast}助 ${p.stl}断`).join("\n");
                        msg = `🏀 ${fmtMatchDate(selectedGame.ts)} 比赛战报\n${selectedGame.homeTeam} ${selectedGame.homeScore} — ${selectedGame.awayScore} ${selectedGame.awayTeam}\n\n球员数据：\n${lines}\n\n来自「我耀成长」`;
                      }
                      try {
                        await navigator.clipboard.writeText(msg);
                        setStatsCopied(true);
                        setTimeout(() => setStatsCopied(false), 2000);
                      } catch {
                        setShareLink(msg);
                      }
                    }}
                    className="w-full mt-1 mb-3 py-2.5 rounded-xl text-sm font-bold border active:opacity-80 transition-colors"
                    style={{
                      borderColor: statsCopied ? "rgba(34,197,94,0.4)" : "rgba(249,115,22,0.3)",
                      color: statsCopied ? "#16a34a" : "#F97316",
                      background: statsCopied ? "rgba(34,197,94,0.06)" : "rgba(249,115,22,0.06)",
                    }}
                  >
                    {statsCopied ? "✅ 战报已复制！" : childName && gameDetail.stats.some(p => p.name === childName) ? `📤 分享${childName}的战报` : "📤 复制战报 · 发给家人"}
                  </button>
                )}
              </>
            )}

            {childName && (
              <Link
                href="/parent/profile/stu-001"
                onClick={() => { setGameDetail(null); setSelectedGame(null); setExpandedClipId(null); setStatsCopied(false); }}
                className="block w-full mt-2 py-2.5 rounded-xl text-sm font-bold text-center text-orange-500 active:opacity-70 transition-opacity"
                style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)" }}
              >
                查看 {childName} 的成长档案 →
              </Link>
            )}
            <button
              onClick={() => { setGameDetail(null); setSelectedGame(null); setExpandedClipId(null); setStatsCopied(false); }}
              className="w-full mt-2 py-3 rounded-xl border border-gray-200 text-sm text-gray-400 active:bg-gray-50"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Clipboard fallback sheet for WeChat / restricted environments */}
      {shareLink !== null && (() => {
        const isUrl = shareLink.startsWith("http");
        return (
        <div className="fixed inset-0 z-[60] flex items-end" style={{ background: "rgba(0,0,0,0.72)" }}>
          <div className="w-full rounded-t-3xl px-4 pt-4 pb-10" style={{ background: "#1a1d27" }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
            <div className="text-sm font-bold text-white mb-1">{isUrl ? "🔗 集锦链接" : "📤 战报文字"}</div>
            <div className="text-xs text-gray-500 mb-3">{isUrl ? "长按下方链接 → 全选 → 复制，在浏览器打开观看" : "长按下方文字 → 全选 → 复制，粘贴到微信群"}</div>
            <textarea
              readOnly
              value={shareLink}
              className="w-full rounded-xl text-xs text-gray-300 p-3 resize-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", height: isUrl ? 60 : 100, fontFamily: isUrl ? "monospace" : "inherit" }}
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => setShareLink(null)}
              className="w-full mt-3 py-3 rounded-xl border border-white/15 text-sm text-gray-400"
            >
              关闭
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
