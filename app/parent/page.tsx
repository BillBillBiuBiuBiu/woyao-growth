"use client";
import Link from "next/link";
import { mockStudent, mockReport, mockBadges, mockStudentCards } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import BasketballCard from "@/components/BasketballCard";

export default function ParentHome() {
  const badge = mockBadges[0];
  const card = mockStudentCards.find((c) => c.id === mockStudent.id)!;

  return (
    <div className="flex flex-col gap-5">
      {/* Basketball card + info */}
      <div className="flex gap-4 items-start">
        <BasketballCard
          name={card.name}
          namePinyin={card.namePinyin}
          number={card.number}
          position={card.position}
          photo={card.photo}
          prebuiltCard={card.prebuiltCard}
          size="full"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-3 pt-1">
          <div>
            <div className="text-xl font-bold">{mockStudent.name}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{mockStudent.age}岁 · {mockStudent.class}</div>
            <div className="text-sm text-muted-foreground">教练：{mockStudent.coach}</div>
            <div className="text-xs bg-orange-100 text-orange-700 rounded-full px-2.5 py-1 inline-block mt-1.5">{mockStudent.currentStage}</div>
          </div>

          {/* Latest growth */}
          <div className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 p-3 text-white">
            <div className="text-xs text-orange-100 mb-1">今日成长</div>
            <div className="text-sm font-medium leading-snug">他开始敢在对抗中主动突破了。</div>
          </div>

          {/* Badge */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
            <span className="text-2xl">{badge.icon}</span>
            <div>
              <div className="text-xs font-semibold">{badge.name}</div>
              <div className="text-xs text-muted-foreground">{badge.dimension}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Report entry */}
      <Link href="/parent/reports/rpt-001">
        <div className="rounded-2xl border border-border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">📋 最新成长报告</div>
              <div className="font-semibold">{mockReport.title}</div>
              <div className="text-xs text-muted-foreground mt-1">3个成长证据 · 教练已确认</div>
            </div>
            <span className="text-2xl text-muted-foreground">›</span>
          </div>
        </div>
      </Link>

      {/* Growth clips preview */}
      <div>
        <div className="text-sm font-medium text-foreground mb-3">🎬 成长高光片段</div>
        <div className="grid grid-cols-3 gap-2">
          {mockReport.clips.map((clip) => (
            <Link key={clip.id} href="/parent/reports/rpt-001">
              <div className="aspect-video rounded-xl overflow-hidden relative cursor-pointer bg-slate-900">
                {clip.thumbnail ? (
                  <img src={clip.thumbnail} alt={clip.title} className="w-full h-full object-cover opacity-80" />
                ) : null}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center">
                    <span className="text-white text-sm">▶</span>
                  </div>
                </div>
                <div className="absolute bottom-1 left-1 right-1 text-xs text-white/90 text-center leading-tight px-1 truncate drop-shadow">{clip.title}</div>
                <div className="absolute top-1 right-1 text-xs text-white/60 bg-black/40 px-1 rounded">{clip.timestamp}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Next step */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="text-xs text-blue-600 mb-2 font-medium">📌 下阶段建议</div>
        <ul className="flex flex-col gap-1.5">
          {mockReport.nextSteps.map((step, i) => (
            <li key={i} className="text-sm text-foreground flex gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Cards showcase */}
      <div>
        <div className="text-sm font-medium text-foreground mb-3">🃏 球星卡</div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {mockStudentCards.map((c) => (
            <div key={c.id} className="shrink-0">
              <BasketballCard
                name={c.name}
                namePinyin={c.namePinyin}
                number={c.number}
                position={c.position}
                photo={c.photo}
                prebuiltCard={c.prebuiltCard}
                size="mini"
              />
              <div className="text-xs text-center text-muted-foreground mt-1">{c.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Profile link */}
      <Link href="/parent/profile/stu-001">
        <div className="rounded-2xl border border-border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">查看完整成长档案</div>
            <div className="text-xs text-muted-foreground mt-0.5">成长时间线 · 六维雷达图 · 所有报告</div>
          </div>
          <span className="text-xl text-muted-foreground">›</span>
        </div>
      </Link>
    </div>
  );
}
