"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { mockPendingReports, mockReports, mockStudents } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { apiLoadGames } from "@/lib/gc-api";
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
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function CoachPage() {
  const pending = mockPendingReports.filter((r) => r.status === "awaiting_review");
  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);

  useEffect(() => {
    apiLoadGames().then((games) => setRecentGames(games.slice(0, 10))).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">教练工作台</h1>
          <p className="text-sm text-muted-foreground mt-0.5">PAB篮球馆 · 2026年5月</p>
        </div>
        <div className="bg-orange-100 text-orange-700 text-sm font-bold px-3 py-1.5 rounded-xl">
          {pending.length} 待确认
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "学员总数", value: mockStudents.length, color: "text-gray-700" },
          { label: "场次记录", value: recentGames.length, color: "text-orange-600" },
          { label: "打点总数", value: recentGames.reduce((s, g) => s + g.eventCount, 0), color: "text-green-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-white p-3 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Plan breakdown */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <h2 className="text-sm font-semibold mb-3">学员套餐分布</h2>
        <div className="flex gap-3">
          <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-slate-600">{planCount.basic}</div>
            <div className="text-xs text-muted-foreground">基础版</div>
          </div>
          <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{planCount.vip}</div>
            <div className="text-xs text-muted-foreground">专业版</div>
          </div>
          <div className="flex-1 bg-amber-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-amber-600">{planCount.supervip}</div>
            <div className="text-xs text-muted-foreground">高阶版</div>
          </div>
        </div>
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
          <h2 className="text-sm font-semibold">近期打点记录</h2>
          {recentGames.length > 0 && (
            <span className="text-xs text-gray-400">{recentGames.length} 场</span>
          )}
        </div>
        {recentGames.length > 0 ? (
          <div className="rounded-2xl border border-border bg-white overflow-hidden">
            {recentGames.map((game, i) => {
              const won  = game.homeScore > game.awayScore;
              const lost = game.homeScore < game.awayScore;
              return (
              <Link key={game.id} href={`/gc/review?gameId=${game.id}`}>
                <div
                  className="flex items-center justify-between px-4 py-3 active:bg-orange-50 transition-colors"
                  style={{ borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.05)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800">
                      {game.homeTeam}{" "}
                      <span style={{ color: won ? "#16A34A" : lost ? "#9CA3AF" : "#F97316" }}>{game.homeScore}</span>
                      <span className="text-gray-300 mx-1">—</span>
                      <span style={{ color: lost ? "#16A34A" : won ? "#9CA3AF" : "#F97316" }}>{game.awayScore}</span>{" "}
                      {game.awayTeam}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{fmtGameDate(game.ts)}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {game.eventCount > 0
                      ? <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">{game.eventCount}个打点</span>
                      : <span className="text-xs text-gray-400">无记录</span>
                    }
                    <span className="text-orange-300 text-sm">›</span>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        ) : (
          <Link href="/gc">
            <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-5 text-center active:bg-orange-50 transition-colors">
              <div className="text-2xl mb-1">🏀</div>
              <div className="text-sm font-medium text-gray-600">还没有打点记录</div>
              <div className="text-xs text-orange-500 mt-1">开始第一场 →</div>
            </div>
          </Link>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold mb-3">快捷操作</h2>
        <div className="grid grid-cols-3 gap-3">
          <Link href="/coach/videos">
            <div className="rounded-2xl border border-border bg-white p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
              <div className="text-2xl mb-1">📹</div>
              <div className="text-xs font-medium text-gray-700">上传视频</div>
            </div>
          </Link>
          <Link href="/coach/reports/generate">
            <div className="rounded-2xl border border-border bg-white p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
              <div className="text-2xl mb-1">✨</div>
              <div className="text-xs font-medium text-gray-700">生成报告</div>
            </div>
          </Link>
          <Link href="/coach/students">
            <div className="rounded-2xl border border-border bg-white p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
              <div className="text-2xl mb-1">👥</div>
              <div className="text-xs font-medium text-gray-700">查看学员</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Pending list */}
      <div>
        <h2 className="text-sm font-semibold mb-3">需要你确认的报告</h2>
        <div className="flex flex-col gap-3">
          {pending.map((r) => {
            const s = statusMap[r.status] || statusMap.draft;
            return (
              <Link key={r.id} href={`/coach/annotate/${r.id}`}>
                <div className="rounded-2xl border border-border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{r.student}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{r.date}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{r.type}</Badge>
                        <span className="text-xs text-muted-foreground">{r.clipCount}个片段</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 leading-snug">{r.aiSummary}</p>
                    </div>
                    <span className="text-xl text-muted-foreground shrink-0 mt-1">›</span>
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
