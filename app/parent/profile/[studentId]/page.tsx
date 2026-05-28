"use client";
import { mockStudent, mockGrowthHistory, mockBadges, mockAssessment, mockReports } from "@/lib/mock-data";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { apiLoadGames, apiLoadEvents } from "@/lib/gc-api";
import type { GameRecord } from "@/lib/gc-teams";

const GrowthRadarDual = dynamic(() => import("@/components/GrowthCharts").then((m) => m.GrowthRadarDual), { ssr: false });
const GrowthCurve = dynamic(() => import("@/components/GrowthCharts").then((m) => m.GrowthCurve), { ssr: false });

const dimensionEmoji: Record<string, string> = {
  "技术成长": "🏀", "战术认知": "🧠", "比赛状态": "⚡",
  "心理成长": "💪", "团队协作": "🤝", "训练习惯": "📅",
};

function ScoreBoxes({ score, max }: { score: number; max: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className="w-5 h-5 rounded-sm border border-orange-300"
          style={{ background: i < score ? "#F97316" : "white" }}
        />
      ))}
    </div>
  );
}

export default function StudentProfilePage() {
  const a = mockAssessment;
  const [hasTesterBadge, setHasTesterBadge] = useState(false);
  const [childName] = useState(() => { try { return localStorage.getItem("child_name") || ""; } catch { return ""; } });
  const [timelineFilter, setTimelineFilter] = useState<"all"|"match"|"training">("all");
  const [realStats, setRealStats] = useState<{ pts: number; reb: number; ast: number; stl: number; games: number } | null>(null);
  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);

  useEffect(() => {
    try {
      setHasTesterBadge(localStorage.getItem("tester_badge") === "true");
    } catch {}
    apiLoadGames().then(g => setRecentGames(g.slice(0, 8))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!childName) return;
    apiLoadGames().then(async (games) => {
      const recent = games.slice(0, 5);
      const allEvents = await Promise.all(recent.map(g => apiLoadEvents(g.id).catch(() => [])));
      let gamesWithHits = 0;
      const acc = { pts: 0, reb: 0, ast: 0, stl: 0, games: 0 };
      for (const evts of allEvents) {
        const mine = evts.filter(e => e.playerName === childName);
        if (mine.length === 0) continue;
        gamesWithHits++;
        for (const e of mine) {
          acc.pts += e.pts;
          if (e.cat === "oreb" || e.cat === "dreb") acc.reb++;
          if (e.cat === "ast") acc.ast++;
          if (e.cat === "stl") acc.stl++;
        }
      }
      if (gamesWithHits === 0) return;
      acc.games = gamesWithHits;
      setRealStats(acc);
    }).catch(() => {});
  }, [childName]);

  return (
    <div
      className="-mx-4 -mt-6 pb-10"
      style={{ background: "linear-gradient(160deg, #fff3e0 0%, #ffe9cc 40%, #fff8ec 100%)" }}
    >
      {/* ── REPORT HEADER ───────────────────────────── */}
      <div className="relative overflow-hidden px-4 pt-5 pb-5" style={{ background: "linear-gradient(135deg, #7C3810 0%, #B45309 60%, #D97706 100%)" }}>
        {/* BASKETBALL watermark */}
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none select-none"
          style={{
            writingMode: "vertical-rl",
            fontSize: 48,
            fontWeight: 900,
            letterSpacing: "0.05em",
            color: "rgba(255,255,255,0.07)",
            fontFamily: "Impact, Arial Black, sans-serif",
            paddingRight: 4,
          }}
        >
          BASKETBALL
        </div>

        {/* Yellow corner tag */}
        <div
          className="absolute top-0 left-0 px-3 py-2"
          style={{ background: "#FCD34D", clipPath: "polygon(0 0, 100% 0, 85% 100%, 0 100%)" }}
        >
          <div className="text-xs font-black leading-tight pr-3" style={{ color: "#7C3810" }}>
            <div>{childName || mockStudent.name}</div>
            <div className="opacity-70 text-xs">篮球学员</div>
          </div>
        </div>

        {/* Grade letter */}
        <div className="flex justify-end items-start mb-2 mr-8">
          <div className="text-right">
            <div className="text-amber-200 text-xs font-bold tracking-widest mb-0.5">PAB BASKETBALL</div>
            <div
              className="font-black leading-none"
              style={{ fontSize: 56, color: "#FCD34D", fontFamily: "Impact, Arial Black, sans-serif", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
            >
              {a.levelGrade}
            </div>
            <div className="text-amber-200 text-xs font-bold tracking-wider">{a.level} 稳定阶段</div>
          </div>
        </div>

        {/* Score + physicals */}
        <div className="flex items-end gap-4 mt-1 pl-20">
          <div>
            <div className="text-amber-200 text-xs mb-0.5">总评分</div>
            <div
              className="font-black leading-none text-white"
              style={{ fontSize: 48, fontFamily: "Impact, Arial Black, sans-serif" }}
            >
              {a.totalScore}
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1 pb-1">
            {[
              ["身高", a.physicals.height],
              ["体重", a.physicals.weight],
              ["臂展", a.physicals.armspan],
              ["手指跨度", a.physicals.fingerSpan],
            ].map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-1">
                <span className="text-amber-200 text-xs">{label}</span>
                <span className="text-white font-bold text-sm">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 text-center">
          <div className="inline-block border border-white/30 text-white/70 text-xs px-4 py-0.5 rounded-full tracking-widest">
            PAB篮球馆 · 专项技能测评报告 · {a.date}
          </div>
        </div>
      </div>

      {/* ── REAL GAME STATS ─────────────────────────── */}
      {realStats && (
        <div className="px-4 pt-3">
          <div className="rounded-2xl bg-white/90 border border-orange-100 p-4">
            <div className="text-xs font-bold text-orange-600 mb-3">📊 实战统计（最近{realStats.games}场）</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {([
                { label: "得分", value: realStats.pts, color: "text-orange-600" },
                { label: "篮板", value: realStats.reb, color: "text-blue-600" },
                { label: "助攻", value: realStats.ast, color: "text-green-600" },
                { label: "抢断", value: realStats.stl, color: "text-purple-600" },
              ] as const).map(s => (
                <div key={s.label} className="bg-gray-50 rounded-xl py-2.5">
                  <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                  {realStats.games > 1 && (
                    <div className="text-xs text-gray-300 mt-0.5">场均{(s.value / realStats.games).toFixed(1)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SKILL ITEMS TABLE ───────────────────────── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-white text-xs font-bold px-2.5 py-0.5 rounded" style={{ background: "#F97316" }}>
            {a.level} 项目单
          </div>
          <div className="text-xs text-orange-700 font-medium">测评项目得分（0–4分）</div>
        </div>
        <div className="rounded-2xl overflow-hidden border border-orange-100 bg-white/90">
          {a.skillItems.map((item, i) => (
            <div
              key={item.name}
              className="flex items-center justify-between px-4 py-2.5 border-b border-orange-50 last:border-none"
              style={{ background: i % 2 === 0 ? "white" : "#FFFBF5" }}
            >
              <span className="text-sm font-medium text-gray-800">{item.name}</span>
              <div className="flex items-center gap-3">
                <ScoreBoxes score={item.score} max={item.max} />
                <span className="text-sm font-black w-4 text-right" style={{ color: item.score > 0 ? "#F97316" : "#9ca3af" }}>
                  {item.score}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RADAR CHART ─────────────────────────────── */}
      <div className="mx-4 rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(to bottom, #FCD34D, #F97316)" }} />
          <span className="text-sm font-bold text-gray-800">个人能力分布</span>
        </div>
        <GrowthRadarDual />
      </div>

      {/* ── DIMENSION DETAIL CARDS ──────────────────── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(to bottom, #FCD34D, #F97316)" }} />
          <span className="text-sm font-bold text-gray-800">六维能力详情</span>
        </div>
        <div className="flex flex-col gap-3">
          {a.dimensionDetails.map((d) => (
            <div key={d.dimension} className="rounded-2xl overflow-hidden border border-orange-100 shadow-sm">
              {/* Header */}
              <div
                className="flex items-center gap-3 px-3 py-2.5"
                style={{ background: "linear-gradient(135deg, #EA580C, #F97316)" }}
              >
                <div className="text-2xl w-9 h-9 flex items-center justify-center bg-white/20 rounded-xl">{dimensionEmoji[d.dimension]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm">{d.dimension}</div>
                  <div className="text-orange-100 text-xs">成绩：{d.result}</div>
                </div>
                <div className="text-right">
                  <div className="text-yellow-200 text-xs">达标评分</div>
                  <div className="text-white font-black text-2xl leading-none" style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
                    {d.achieveScore}
                  </div>
                </div>
                <div className="text-right ml-3">
                  <div className="text-yellow-200 text-xs">当前评分</div>
                  <div className="text-white font-black text-2xl leading-none" style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
                    {d.score}
                  </div>
                </div>
              </div>
              {/* Body */}
              <div className="bg-white px-3 py-2.5">
                <p className="text-xs text-gray-700 leading-relaxed">{d.desc}</p>
                <div className="mt-1.5 flex items-start gap-1.5">
                  <span className="text-xs font-bold text-orange-500 shrink-0 mt-0.5">下阶段目标：</span>
                  <span className="text-xs text-gray-600">{d.next}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── GROWTH CURVE ────────────────────────────── */}
      <div className="mx-4 rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(to bottom, #FCD34D, #F97316)" }} />
          <span className="text-sm font-bold text-gray-800">近2个月成长趋势</span>
        </div>
        <GrowthCurve />
      </div>

      {/* ── BADGES ──────────────────────────────────── */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(to bottom, #FCD34D, #F97316)" }} />
          <span className="text-sm font-bold text-gray-800">成长勋章</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {mockBadges.map((b) => (
            <div key={b.id} className="flex items-center gap-2 p-3 rounded-2xl bg-white/90 border border-amber-100 shadow-sm">
              <span className="text-2xl">{b.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-800 truncate">{b.name}</div>
                <div className="text-xs text-amber-500">{b.awardedAt}</div>
              </div>
            </div>
          ))}
          {hasTesterBadge && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/90 border border-amber-100 shadow-sm">
              <span className="text-2xl">🏅</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-800 truncate">内测员</div>
                <div className="text-xs text-amber-500">集锦功能测试员</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TIMELINE ────────────────────────────────── */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(to bottom, #FCD34D, #F97316)" }} />
            <span className="text-sm font-bold text-gray-800">成长时间线</span>
          </div>
          <div className="flex gap-1">
            {(["all","match","training"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTimelineFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${timelineFilter === f ? "bg-orange-100 text-orange-600" : "text-gray-400"}`}
              >
                {f === "all" ? "全部" : f === "match" ? "比赛" : "训练"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {(() => {
            const realMatchItems = recentGames.map(g => {
              const d = new Date(g.ts);
              const won = g.homeScore > g.awayScore;
              const lost = g.homeScore < g.awayScore;
              return {
                id: `real-${g.id}`,
                date: `${d.getMonth() + 1}/${d.getDate()}`,
                type: "match" as const,
                title: `${g.homeTeam} ${g.homeScore} — ${g.awayScore} ${g.awayTeam}`,
                summary: won ? "⚡ 胜利！" : lost ? "继续加油，下场更强" : "平局，势均力敌",
                clipCount: g.eventCount,
                badge: won ? "胜利" : undefined as string | undefined,
                hasReport: false,
                reportHref: undefined as string | undefined,
              };
            });
            const mockTrainingItems = mockGrowthHistory
              .filter(h => h.type !== "match")
              .map(h => ({
                id: h.id, date: h.date, type: h.type as "match" | "training",
                title: h.title, summary: h.summary, clipCount: h.clipCount,
                badge: h.badge as string | undefined,
                hasReport: mockReports.some(r => r.id === h.id && r.studentId === "stu-001"),
                reportHref: `/parent/reports/${h.id}`,
              }));
            const fallbackMockMatches = recentGames.length === 0
              ? mockGrowthHistory.filter(h => h.type === "match").map(h => ({
                  id: h.id, date: h.date, type: "match" as const,
                  title: h.title, summary: h.summary, clipCount: h.clipCount,
                  badge: h.badge as string | undefined, hasReport: false,
                  reportHref: undefined as string | undefined,
                }))
              : [];
            const allItems = [
              ...(timelineFilter !== "training" ? [...realMatchItems, ...fallbackMockMatches] : []),
              ...(timelineFilter !== "match" ? mockTrainingItems : []),
            ];
            return allItems.map(h => {
              const inner = (
                <div className={`flex gap-3 p-3 rounded-2xl bg-white/90 border border-orange-100 shadow-sm ${h.hasReport ? "hover:bg-orange-50 transition-colors cursor-pointer" : ""}`}>
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${h.type === "match" ? "bg-orange-400" : "bg-amber-400"}`} />
                    <div className="flex-1 w-px bg-orange-100 mt-1" />
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{h.date}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${h.type === "match" ? "bg-orange-100 text-orange-600" : "bg-amber-100 text-amber-700"}`}>
                        {h.type === "match" ? "比赛" : "训练"}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-gray-800 mt-0.5 truncate">{h.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-snug">{h.summary}</div>
                    <div className="flex items-center gap-3 mt-1.5">
                      {h.badge && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">🏆 {h.badge}</span>
                      )}
                      {h.clipCount > 0 && <span className="text-xs text-gray-400">{h.clipCount}个打点</span>}
                    </div>
                  </div>
                  {h.hasReport && <div className="text-orange-300 text-xl self-center">›</div>}
                </div>
              );
              return h.hasReport && h.reportHref
                ? <Link key={h.id} href={h.reportHref}>{inner}</Link>
                : <div key={h.id}>{inner}</div>;
            });
          })()}
        </div>
      </div>

      {/* ── HIGHLIGHTS CTA ─────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <Link href="/parent/highlights">
          <div
            className="rounded-3xl p-4 flex items-center justify-between active:scale-98 transition-transform shadow-sm"
            style={{ background: "linear-gradient(135deg, #F97316 0%, #FBBF24 100%)" }}
          >
            <div>
              <div className="text-white font-black text-base leading-tight">🎬 生成本场集锦</div>
              <div className="text-orange-100 text-xs mt-0.5">上传视频 · AI剪辑精彩片段</div>
            </div>
            <div className="text-white text-2xl font-black">›</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
