"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { mockPendingReports, mockReports, mockStudents } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { apiLoadGames, apiLoadClips } from "@/lib/gc-api";
import type { GameRecord } from "@/lib/gc-teams";

const statusMap: Record<string, { label: string; color: string }> = {
  awaiting_review: { label: "待确认", color: "bg-orange-100 text-orange-700" },
  in_review: { label: "确认中", color: "bg-blue-100 text-blue-700" },
  draft: { label: "草稿", color: "bg-slate-100 text-slate-600" },
};

const planCount = {
  basic: mockStudents.filter((s) => s.plan === "basic").length,
  vip: mockStudents.filter((s) => s.plan === "vip").length,
  supervip: mockStudents.filter((s) => s.plan === "supervip").length,
};

const pendingCount = mockReports.filter((r) => r.status === "draft" || r.status === "generated").length;
const sentCount = mockReports.filter((r) => r.status === "sent").length;

function fmtGameDate(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const hhmm = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  const diff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (diff === 0) return `今天 ${hhmm}`;
  if (diff === 1) return `昨天 ${hhmm}`;
  if (diff <= 7) return `${diff}天前 ${hhmm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
}

export default function CoachPage() {
  const pending = mockPendingReports.filter((r) => r.status === "awaiting_review");
  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);
  const [clipCounts, setClipCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    apiLoadGames().then((games) => {
      const slice = games.slice(0, 10);
      setRecentGames(slice);
      Promise.all(
        slice.map((g) => apiLoadClips(g.id).then((clips) => [g.id, clips.length] as [string, number]).catch(() => [g.id, 0] as [string, number]))
      ).then((entries) => setClipCounts(Object.fromEntries(entries))).catch(() => {});
    }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-5 min-h-screen" style={{ background: "#0b0f1a", padding: "0 1px" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">把每场比赛，变成成长证据</h1>
          <p className="text-sm text-gray-500 mt-0.5">{`PAB篮球馆 · 王教练工作台 · ${new Date().getFullYear()}年${new Date().getMonth() + 1}月`}</p>
        </div>
        <div className="bg-orange-500/20 text-orange-400 text-sm font-bold px-3 py-1.5 rounded-xl">
          {pending.length} 待确认
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {(() => {
          const totalEvents = recentGames.reduce((s, g) => s + g.eventCount, 0);
          const perGame = recentGames.length > 0 ? (totalEvents / recentGames.length).toFixed(1) : null;
          return [
            { label: "学员总数", value: mockStudents.length, sub: null, color: "text-white" },
            { label: "场次记录", value: recentGames.length, sub: recentGames.length > 0 ? `${recentGames.filter(g => g.eventCount > 0).length}场有打点` : null, color: "text-orange-400" },
            { label: "打点总数", value: totalEvents, sub: perGame ? `场均 ${perGame}` : null, color: "text-blue-400" },
            { label: "切片总数", value: Object.values(clipCounts).reduce((s, n) => s + n, 0), sub: recentGames.length > 0 && Object.keys(clipCounts).length > 0 ? `${(Object.values(clipCounts).reduce((s,n)=>s+n,0)/recentGames.length).toFixed(1)}个/场` : null, color: "text-green-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              {s.sub && <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>}
            </div>
          ));
        })()}
      </div>

      {/* Plan breakdown */}
      <div className="rounded-2xl p-4" style={{ background: "#141824", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h2 className="text-sm font-semibold text-white mb-3">学员套餐分布</h2>
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="text-lg font-bold text-gray-300">{planCount.basic}</div>
            <div className="text-xs text-gray-500">基础版</div>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "rgba(59,130,246,0.15)" }}>
            <div className="text-lg font-bold text-blue-400">{planCount.vip}</div>
            <div className="text-xs text-gray-500">专业版</div>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "rgba(245,158,11,0.15)" }}>
            <div className="text-lg font-bold text-amber-400">{planCount.supervip}</div>
            <div className="text-xs text-gray-500">高阶版</div>
          </div>
        </div>
        {planCount.basic > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "rgba(249,115,22,0.12)" }}>
            <div className="text-xs text-orange-400">
              💡 <span className="font-bold">{planCount.basic} 名基础版</span>学员可考虑升专业版
            </div>
            <Link href="/org/leads">
              <span className="text-xs font-bold text-orange-400 active:opacity-70">提醒家长 →</span>
            </Link>
          </div>
        )}
      </div>

      {/* Live scorekeeping CTA */}
      <Link href="/gc">
        <div
          className="rounded-3xl p-5 relative overflow-hidden active:scale-98 transition-transform"
          style={{ background: "linear-gradient(135deg, #1a1d27 0%, #0f1117 100%)", border: "1px solid rgba(249,115,22,0.3)" }}
        >
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-6xl opacity-15 select-none">🏀</div>
          <div className="relative">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-bold bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">现场记录</span>
            </div>
            <div className="text-lg font-black text-white leading-tight">场边实时打点</div>
            <div className="text-sm mt-1" style={{ color: "rgba(249,115,22,0.7)" }}>记录得分 · 同步时间戳 · 赛后自动生成集锦</div>
            <div className="mt-3 inline-flex items-center gap-1 bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">
              开始记录 →
            </div>
          </div>
        </div>
      </Link>

      {/* Recent game records — real data from Supabase */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">近期打点记录</h2>
          {recentGames.length > 0 && (() => {
            const w = recentGames.filter(g => g.homeScore > g.awayScore).length;
            const l = recentGames.filter(g => g.homeScore < g.awayScore).length;
            const d = recentGames.filter(g => g.homeScore === g.awayScore).length;
            return (
              <div className="text-xs text-gray-500">
                <span className="text-green-400 font-bold">{w}胜</span>
                {l > 0 && <span className="text-red-500 font-bold ml-1">{l}负</span>}
                {d > 0 && <span className="text-gray-400 ml-1">{d}平</span>}
              </div>
            );
          })()}
        </div>
        {recentGames.length > 0 ? (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#141824", border: "1px solid rgba(255,255,255,0.08)" }}>
            {recentGames.map((game, i) => {
              const won  = game.homeScore > game.awayScore;
              const lost = game.homeScore < game.awayScore;
              return (
              <Link key={game.id} href={`/gc/review?gameId=${game.id}`}>
                <div
                  className="flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors"
                  style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">
                      {game.homeTeam}{" "}
                      <span style={{ color: won ? "#16A34A" : lost ? "#9CA3AF" : "#F97316" }}>{game.homeScore}</span>
                      <span className="text-gray-300 mx-1">—</span>
                      <span style={{ color: lost ? "#16A34A" : won ? "#9CA3AF" : "#F97316" }}>{game.awayScore}</span>{" "}
                      {game.awayTeam}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{fmtGameDate(game.ts)}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {game.eventCount > 0
                      ? <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full font-medium">{game.eventCount}个打点</span>
                      : <span className="text-xs text-gray-500">无记录</span>
                    }
                    {(clipCounts[game.id] ?? 0) > 0 ? (
                      <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-medium">{clipCounts[game.id]}个切片</span>
                    ) : game.eventCount > 0 ? (
                      <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-medium">🎬 待剪辑</span>
                    ) : null}
                    <span className="text-orange-300 text-sm">›</span>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        ) : (
          <Link href="/gc">
            <div className="rounded-2xl border border-dashed border-orange-500/30 bg-orange-500/5 px-4 py-5 text-center active:bg-white/5 transition-colors">
              <div className="text-2xl mb-1">🏀</div>
              <div className="text-sm font-medium text-gray-400">还没有打点记录</div>
              <div className="text-xs text-orange-500 mt-1">开始第一场 →</div>
            </div>
          </Link>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">快捷操作</h2>
        <div className="grid grid-cols-3 gap-3">
          <Link href="/coach/videos">
            <div className="rounded-2xl p-4 text-center active:opacity-80 transition-opacity cursor-pointer" style={{ background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" }}>
              <div className="text-2xl mb-1">📊</div>
              <div className="text-xs font-bold text-white">视频分析</div>
            </div>
          </Link>
          <Link href="/coach/reports/generate">
            <div className="rounded-2xl p-4 text-center active:opacity-80 transition-opacity cursor-pointer" style={{ background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)" }}>
              <div className="text-2xl mb-1">✨</div>
              <div className="text-xs font-bold text-white">生成报告</div>
            </div>
          </Link>
          <Link href="/coach/students">
            <div className="rounded-2xl p-4 text-center active:opacity-80 transition-opacity cursor-pointer" style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
              <div className="text-2xl mb-1">👥</div>
              <div className="text-xs font-bold text-white">查看学员</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Training rankings */}
      {(() => {
        const dims = [
          { label: "专注力", emoji: "🎯", ranks: ["蒋皓博", "季禹澄", "小杰", "陈梓轩", "小然", "李晨阳"] },
          { label: "完成度", emoji: "✅", ranks: ["小杰", "蒋皓博", "陈梓轩", "季禹澄", "李晨阳", "小然"] },
          { label: "积极性", emoji: "🔥", ranks: ["季禹澄", "蒋皓博", "小然", "小杰", "陈梓轩", "李晨阳"] },
        ];
        const medals = ["🥇", "🥈", "🥉"];
        return (
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">本期训练表现排名</h2>
            <div className="flex flex-col gap-3">
              {dims.map(dim => (
                <div key={dim.label} className="rounded-2xl p-4" style={{ background: "#141824", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-xs font-bold text-gray-300 mb-2">{dim.emoji} {dim.label}排名</div>
                  <div className="flex flex-col gap-1">
                    {dim.ranks.map((name, i) => (
                      <div key={name} className="flex items-center gap-2 py-1" style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                        <span className="text-sm w-6 text-center shrink-0">{i < 3 ? medals[i] : <span className="text-xs text-gray-400 font-medium">{i + 1}</span>}</span>
                        <span className={`text-sm flex-1 ${i < 3 ? "font-semibold text-white" : "text-gray-500"}`}>{name}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <div key={j} className="w-2.5 h-2.5 rounded-sm" style={{ background: j < Math.max(1, 5 - i) ? (i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#d97706" : "#e5e7eb") : "#f3f4f6" }} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Pending list */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">需要你确认的报告</h2>
        <div className="flex flex-col gap-3">
          {pending.map((r) => {
            const s = statusMap[r.status] || statusMap.draft;
            return (
              <Link key={r.id} href={`/coach/annotate/${r.id}`}>
                <div className="rounded-2xl p-4 active:opacity-80 transition-opacity cursor-pointer" style={{ background: "#141824", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{r.student}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{r.date}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{r.type}</Badge>
                        <span className="text-xs text-gray-500">{r.clipCount}个片段</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 leading-snug">{r.aiSummary}</p>
                    </div>
                    <span className="text-xl text-gray-500 shrink-0 mt-1">›</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
