"use client";
import Link from "next/link";
import { mockStudent, mockReport, mockBadges, mockStudentCards } from "@/lib/mock-data";
import BasketballCard from "@/components/BasketballCard";

export default function ParentHome() {
  const badge = mockBadges[0];
  const card = mockStudentCards.find((c) => c.id === mockStudent.id)!;

  return (
    <div className="-mx-4 -mt-6 pb-10" style={{ background: "linear-gradient(160deg, #fff3e0 0%, #ffe9cc 40%, #fff8ec 100%)" }}>
      {/* Hero header */}
      <div className="relative flex flex-col items-center pt-8 pb-4 px-4">
        <span className="absolute top-5 left-8 text-amber-400 text-xl select-none">✦</span>
        <span className="absolute top-10 right-10 text-orange-300 text-sm select-none">✦</span>
        <span className="absolute top-4 right-6 text-yellow-300 text-xs select-none">✦</span>

        <h1
          className="text-2xl font-black text-center mb-1 leading-tight"
          style={{ color: "#7C3810" }}
        >
          {mockStudent.name}的篮球成长日记
        </h1>
        <div className="flex items-center gap-1.5 bg-white/70 border border-orange-200 rounded-full px-3 py-1 mb-4">
          <span className="text-xs font-medium text-orange-700">{mockStudent.age}岁 · {mockStudent.class}</span>
          <span className="text-orange-400 text-xs">♡</span>
        </div>

        {/* Card + info side by side */}
        <div className="flex gap-4 items-start w-full">
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
              <div className="text-sm text-gray-500">教练：{mockStudent.coach}</div>
              <div className="text-xs bg-orange-100 text-orange-700 rounded-full px-2.5 py-1 inline-block mt-1.5 font-medium">{mockStudent.currentStage}</div>
            </div>

            {/* Today's growth */}
            <div className="rounded-2xl p-3 text-white shadow-sm" style={{ background: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)" }}>
              <div className="text-xs font-medium text-yellow-100 mb-1">✨ 今日成长</div>
              <div className="text-sm font-bold leading-snug" style={{ color: "#7C3810" }}>{mockBadges[0].description}</div>
            </div>

            {/* Badge */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-2.5 flex items-center gap-2 shadow-sm">
              <span className="text-2xl">{badge.icon}</span>
              <div>
                <div className="text-xs font-bold text-gray-800">{badge.name}</div>
                <div className="text-xs text-amber-600">{badge.dimension}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4">
        {/* Highlight reel — core feature, first visible CTA after hero */}
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
              <div className="text-lg font-black text-white leading-tight">生成孩子的精彩集锦</div>
              <div className="text-sm text-orange-100 mt-1">上传比赛视频 · AI识别有球片段 · 一键生成</div>
              <div className="mt-3 inline-flex items-center gap-1 bg-white text-orange-600 text-xs font-bold px-3 py-1.5 rounded-full">
                立即体验 →
              </div>
            </div>
          </div>
        </Link>

        {/* Latest report */}
        <Link href="/parent/reports/rpt-001">
          <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4 flex items-center justify-between active:scale-98 transition-transform">
            <div>
              <div className="text-xs text-orange-500 mb-1 font-medium">📋 最新成长报告</div>
              <div className="font-bold text-gray-800">{mockReport.title}</div>
              <div className="text-xs text-gray-400 mt-1">{mockReport.clips.length}个成长证据 · 教练已确认 ✓</div>
            </div>
            <div className="text-2xl text-orange-300 ml-2">›</div>
          </div>
        </Link>

        {/* Clips */}
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">🎞️ 教练标注片段</div>
          <div className="grid grid-cols-3 gap-2">
            {mockReport.clips.map((clip) => (
              <Link key={clip.id} href="/parent/reports/rpt-001">
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

        {/* Next steps */}
        <div className="rounded-3xl bg-white/90 border border-blue-100 shadow-sm p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">📌 下阶段建议</div>
          <ul className="flex flex-col gap-2">
            {mockReport.nextSteps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-orange-400 font-bold shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Cards showcase */}
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">🃏 球星卡</div>
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

        {/* Profile link */}
        <Link href="/parent/profile/stu-001">
          <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4 flex items-center justify-between active:scale-98 transition-transform">
            <div>
              <div className="font-bold text-sm text-gray-800">查看完整成长档案</div>
              <div className="text-xs text-gray-400 mt-0.5">成长时间线 · 六维雷达图 · 所有报告</div>
            </div>
            <div className="text-2xl text-orange-300">›</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
