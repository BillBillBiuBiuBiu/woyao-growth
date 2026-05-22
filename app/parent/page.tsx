import Link from "next/link";
import { mockStudent, mockReport, mockBadges } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";

export default function ParentHome() {
  const badge = mockBadges[0];

  return (
    <div className="flex flex-col gap-5">
      {/* Student card */}
      <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 p-5 text-white shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-3xl font-bold">{mockStudent.name}</div>
            <div className="text-orange-100 text-sm mt-1">{mockStudent.age}岁 · {mockStudent.class}</div>
            <div className="text-orange-100 text-sm">教练：{mockStudent.coach}</div>
          </div>
          <div className="text-right">
            <div className="text-xs bg-white/20 rounded-full px-2.5 py-1">{mockStudent.currentStage}</div>
            <div className="text-xs text-orange-100 mt-2">最近活动 5月24日</div>
          </div>
        </div>
        <div className="mt-4 bg-white/15 rounded-xl p-3">
          <div className="text-xs text-orange-100 mb-1">今日最值得看见的成长</div>
          <div className="text-sm leading-snug">他开始敢在对抗中主动突破了。</div>
        </div>
      </div>

      {/* Latest badge */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
        <div className="text-xs text-muted-foreground mb-2">🏆 本场成长勋章</div>
        <div className="flex items-center gap-3">
          <div className="text-4xl">{badge.icon}</div>
          <div>
            <div className="font-semibold text-foreground">{badge.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{badge.description}</div>
            <Badge variant="secondary" className="mt-1.5 text-xs bg-orange-100 text-orange-700">{badge.dimension}</Badge>
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
            <div
              key={clip.id}
              className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer"
            >
              <div className="text-2xl">▶</div>
              <div className="text-xs text-slate-500 mt-1 px-1 text-center leading-tight">{clip.title}</div>
              <div className="absolute bottom-1 right-1 text-xs text-slate-400">{clip.timestamp}</div>
            </div>
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
