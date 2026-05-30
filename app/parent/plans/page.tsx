"use client";
import { useState, useEffect } from "react";
import { PLAN_LABELS, PLAN_FEATURES } from "@/lib/plan-features";
import type { PlanType } from "@/lib/types";

const plans: { type: PlanType; audience: string; tagline: string; highlighted: boolean }[] = [
  {
    type: "basic",
    audience: "刚开始篮球训练的家庭",
    tagline: "用文字和片段记录孩子的每一次成长，让家长看见孩子的努力",
    highlighted: false,
  },
  {
    type: "vip",
    audience: "希望深度了解孩子进步的家庭",
    tagline: "数据+雷达图+视频片段，全面掌握孩子的技术成长轨迹",
    highlighted: true,
  },
  {
    type: "supervip",
    audience: "追求精英成长路径的家庭",
    tagline: "教练深度介入+个性化训练计划+趋势分析，全方位护航孩子篮球生涯",
    highlighted: false,
  },
];

const featureRows: { key: string; label: string }[] = [
  { key: "basicReport",         label: "基础成长报告" },
  { key: "emotionalFeedback",   label: "情感化成长解读" },
  { key: "videoHighlights",     label: "成长视频片段" },
  { key: "growthTimeline",      label: "成长时间线" },
  { key: "radarChart",          label: "六维雷达图" },
  { key: "detailedMetrics",     label: "详细数据统计" },
  { key: "trainingSuggestions", label: "专项训练建议" },
  { key: "trendAnalysis",       label: "趋势分析图表" },
  { key: "coachReview",         label: "教练联合点评" },
  { key: "personalizedPlan",    label: "个性化训练计划" },
];

const PLAN_ORDER: Record<string, number> = { basic: 0, vip: 1, supervip: 2 };

export default function ParentPlansPage() {
  const [expandedPlan, setExpandedPlan] = useState<PlanType | null>(null);
  // Read localStorage after mount to avoid SSR/client hydration mismatch (React #418)
  const [currentPlan, setCurrentPlan] = useState<PlanType | null>(null);
  useEffect(() => {
    try { setCurrentPlan((localStorage.getItem("child_plan") as PlanType) || null); } catch {}
  }, []);
  const currentOrder = currentPlan != null ? (PLAN_ORDER[currentPlan] ?? -1) : -1;

  return (
    <div
      className="-mx-4 -mt-6 pb-10 min-h-screen"
      style={{ background: "radial-gradient(circle at 15% 0%, rgba(255,132,39,0.22), transparent 30%), radial-gradient(circle at 85% 12%, rgba(255,212,71,0.12), transparent 34%), linear-gradient(180deg, #101B2D 0%, #07111F 58%, #05070D 100%)" }}
    >
      <div className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-black mb-1" style={{ color: "#EDF4FF" }}>版本权益</h1>
        <p className="text-sm text-orange-300">{currentPlan ? `已开通 ${PLAN_LABELS[currentPlan]} · 查看全部权益` : "选择最适合孩子的成长记录方案"}</p>
      </div>
      {currentPlan === null && (
        <div className="mx-4 mb-2 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-xs text-orange-300 leading-relaxed">
          你的孩子正在体验阶段 · 如需开通正式套餐，请联系班级教练办理
        </div>
      )}

      {/* Plan cards */}
      <div className="flex flex-col gap-4 px-4">
        {plans.map((plan) => {
          const isCurrent = plan.type === currentPlan;
          const isBelow = (PLAN_ORDER[plan.type] ?? 0) < currentOrder;
          return (
            <div
              key={plan.type}
              className={`rounded-3xl bg-white/10 backdrop-blur shadow-sm p-5 border-2 transition-all ${
                isCurrent
                  ? "border-orange-400 shadow-orange-100"
                  : "border-orange-500/20"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-black text-white">{PLAN_LABELS[plan.type]}</span>
                    {isCurrent && (
                      <span className="text-xs bg-orange-400 text-white rounded-full px-2 py-0.5 font-medium">当前版本</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{plan.audience}</p>
                </div>
              </div>

              <p className="text-sm text-gray-200 leading-relaxed mb-4 border-l-2 border-orange-500/30 pl-3">
                {plan.tagline}
              </p>

              {/* Feature checklist */}
              <div className="flex flex-col gap-2">
                {featureRows.map((row) => {
                  const hasFeature = PLAN_FEATURES[plan.type][row.key] ?? false;
                  return (
                    <div key={row.key} className="flex items-center gap-2 text-sm">
                      <span className={`shrink-0 font-bold ${hasFeature ? "text-green-500" : "text-gray-300"}`}>
                        {hasFeature ? "✓" : "✗"}
                      </span>
                      <span className={hasFeature ? "text-gray-200" : "text-gray-400"}>{row.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              {isCurrent && (
                <div className="mt-4 w-full rounded-full py-2.5 text-sm font-bold text-orange-300 bg-orange-500/10 border border-orange-500/30 text-center">
                  当前已开通
                </div>
              )}
              {isBelow && !isCurrent && (
                <div className="mt-4 w-full rounded-full py-2.5 text-xs text-gray-400 bg-white/5 border border-white/15 text-center">
                  已超越此版本
                </div>
              )}
              {!isCurrent && !isBelow && (
                <>
                  <button
                    onClick={() => setExpandedPlan(expandedPlan === plan.type ? null : plan.type)}
                    className="mt-4 w-full rounded-full py-2.5 text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)" }}
                  >
                    升级到{PLAN_LABELS[plan.type]}
                  </button>
                  {expandedPlan === plan.type && (
                    <div className="mt-3 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-3">
                      <div className="text-xs font-medium text-orange-300 mb-1">如需升级，请联系 PAB 球馆</div>
                      <div className="text-xs text-orange-300 leading-relaxed">
                        微信搜索 <span className="font-bold">PABbasketball</span> 或联系你的班级教练，告知希望升级至{PLAN_LABELS[plan.type]}，教练会协助办理。
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
