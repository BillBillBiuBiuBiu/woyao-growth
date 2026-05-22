"use client";
import { mockStudent, mockGrowthHistory, mockBadges, mockStudentCards } from "@/lib/mock-data";
import dynamic from "next/dynamic";
import Link from "next/link";
import BasketballCard from "@/components/BasketballCard";

const GrowthRadar = dynamic(() => import("@/components/GrowthCharts").then((m) => m.GrowthRadar), { ssr: false });
const GrowthCurve = dynamic(() => import("@/components/GrowthCharts").then((m) => m.GrowthCurve), { ssr: false });

export default function StudentProfilePage() {
  const card = mockStudentCards.find((c) => c.id === mockStudent.id)!;

  return (
    <div className="flex flex-col gap-6">
      {/* Header with basketball card */}
      <div className="flex items-start gap-4">
        <BasketballCard
          name={card.name}
          namePinyin={card.namePinyin}
          number={card.number}
          position={card.position}
          photo={card.photo}
          prebuiltCard={card.prebuiltCard}
          size="mini"
        />
        <div className="pt-2">
          <h1 className="text-xl font-bold">{mockStudent.name}的成长档案</h1>
          <div className="text-sm text-muted-foreground mt-1">{mockStudent.age}岁 · {mockStudent.class}</div>
          <div className="text-sm text-muted-foreground">教练：{mockStudent.coach}</div>
          <div className="text-sm text-muted-foreground">{mockStudent.organization}</div>
          <div className="text-xs bg-orange-100 text-orange-700 rounded-full px-2.5 py-1 inline-block mt-2">{mockStudent.currentStage}</div>
        </div>
      </div>

      <GrowthRadar />
      <GrowthCurve />

      {/* Badges */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <h2 className="font-semibold text-sm mb-3">🏆 成长勋章</h2>
        <div className="grid grid-cols-2 gap-3">
          {mockBadges.map((b) => (
            <div key={b.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-100">
              <span className="text-2xl">{b.icon}</span>
              <div>
                <div className="text-xs font-semibold text-foreground">{b.name}</div>
                <div className="text-xs text-muted-foreground">{b.awardedAt}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <h2 className="font-semibold text-sm mb-3">📅 成长时间线</h2>
        <div className="flex flex-col gap-3">
          {mockGrowthHistory.map((h) => (
            <Link key={h.id} href={`/parent/reports/${h.id}`}>
              <div className="flex gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                <div className="flex flex-col items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${h.type === "match" ? "bg-orange-400" : "bg-blue-400"}`} />
                  <div className="flex-1 w-px bg-border mt-1" />
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{h.date}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${h.type === "match" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}>
                      {h.type === "match" ? "比赛" : "训练"}
                    </span>
                  </div>
                  <div className="text-sm font-medium mt-0.5 truncate">{h.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{h.summary}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {h.badge && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">🏆 {h.badge}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{h.clipCount}个片段</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
