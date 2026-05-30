"use client";
import { mockStudents } from "@/lib/mock-data";
import { PLAN_LABELS, PLAN_FEATURES, PLAN_COLORS } from "@/lib/plan-features";
import type { PlanType } from "@/lib/types";

const allPlans: PlanType[] = ["basic", "vip", "supervip"];

const featureRows: { key: string; label: string }[] = [
  { key: "basicReport",         label: "基础成长报告" },
  { key: "emotionalFeedback",   label: "情感化成长解读" },
  { key: "videoHighlights",     label: "成长视频片段" },
  { key: "growthTimeline",      label: "成长时间线" },
  { key: "radarChart",          label: "六维雷达图" },
  { key: "detailedMetrics",     label: "详细数据统计" },
  { key: "trainingSuggestions", label: "专项训练建议" },
  { key: "trendAnalysis",       label: "趋势分析" },
  { key: "coachReview",         label: "教练联合点评" },
  { key: "personalizedPlan",    label: "个性化训练计划" },
];

export default function CoachPlansPage() {
  const planCounts = allPlans.map((p) => ({
    plan: p,
    count: mockStudents.filter((s) => s.plan === p).length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">套餐管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">学员套餐分布与功能对比</p>
      </div>

      {/* Breakdown */}
      <div>
        <h2 className="text-sm font-semibold mb-3">学员套餐分布</h2>
        <div className="grid grid-cols-3 gap-3">
          {planCounts.map(({ plan, count }) => {
            const colors = PLAN_COLORS[plan];
            return (
              <div key={plan} className={`rounded-2xl border p-4 text-center ${colors.bg} ${colors.border}`}>
                <div className={`text-2xl font-bold ${colors.text}`}>{count}</div>
                <div className={`text-xs mt-1 ${colors.text}`}>{PLAN_LABELS[plan]}</div>
                <div className="text-xs text-gray-400 mt-0.5">名学员</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature comparison table */}
      <div>
        <h2 className="text-sm font-semibold mb-3">功能对比</h2>
        <div className="rounded-2xl border border-border bg-white/10 backdrop-blur overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-4 border-b border-border">
            <div className="p-3 text-xs font-medium text-slate-400">功能</div>
            {allPlans.map((p) => {
              const colors = PLAN_COLORS[p];
              return (
                <div key={p} className={`p-3 text-center text-xs font-bold ${colors.text}`}>
                  {PLAN_LABELS[p]}
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {featureRows.map((row, idx) => (
            <div
              key={row.key}
              className={`grid grid-cols-4 border-b border-border last:border-b-0 ${idx % 2 === 0 ? "" : "bg-white/5"}`}
            >
              <div className="p-3 text-xs text-gray-300">{row.label}</div>
              {allPlans.map((p) => {
                const has = PLAN_FEATURES[p][row.key] ?? false;
                return (
                  <div key={p} className="p-3 text-center">
                    <span className={`text-sm font-bold ${has ? "text-green-500" : "text-gray-300"}`}>
                      {has ? "✓" : "✗"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade tips */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="text-sm font-semibold text-amber-800 mb-2">套餐升级建议</div>
        <ul className="flex flex-col gap-1.5 text-xs text-amber-300">
          <li>· 基础班学员：建议家长升级专业版，解锁雷达图和数据统计</li>
          <li>· 精英班学员：推荐高阶版，获得完整的趋势分析和个性化训练计划</li>
          <li>· 升级咨询可联系球馆管理员</li>
        </ul>
      </div>
    </div>
  );
}
