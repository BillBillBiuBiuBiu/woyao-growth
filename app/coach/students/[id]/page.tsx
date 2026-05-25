"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { mockStudents, mockReports, mockGrowthHistory, mockRadarData } from "@/lib/mock-data";
import PlanBadge from "@/components/PlanBadge";
import LockedFeature from "@/components/LockedFeature";
import dynamic from "next/dynamic";

const GrowthRadarCompact = dynamic(
  () => import("@/components/GrowthCharts").then((m) => m.GrowthRadarCompact),
  { ssr: false }
);

const levelLabel: Record<string, string> = {
  basic_class: "基础班",
  match_class: "比赛班",
  elite_class: "精英班",
};

const positionLabel: Record<string, string> = {
  guard: "后卫",
  forward: "前锋",
  center: "中锋",
  unknown: "未知",
};

const avatarColors = [
  "bg-orange-400", "bg-blue-400", "bg-green-400", "bg-purple-400", "bg-pink-400", "bg-teal-400",
];

const statusLabel: Record<string, { label: string; color: string }> = {
  draft:     { label: "草稿",   color: "bg-slate-100 text-slate-500" },
  generated: { label: "已生成", color: "bg-blue-100 text-blue-600" },
  reviewed:  { label: "已审核", color: "bg-amber-100 text-amber-700" },
  sent:      { label: "已发送", color: "bg-green-100 text-green-700" },
};

export default function CoachStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const student = mockStudents.find((s) => s.id === id) ?? mockStudents[0];
  const studentIdx = mockStudents.findIndex((s) => s.id === student.id);
  const avatarColor = avatarColors[studentIdx % avatarColors.length];

  const reports = mockReports
    .filter((r) => r.studentId === student.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const growthItems = student.id === "stu-001"
    ? mockGrowthHistory
    : mockGrowthHistory.slice(0, 2).map((g) => ({ ...g, id: `${student.id}-${g.id}` }));

  const hasRadar = student.plan === "vip" || student.plan === "supervip";

  return (
    <div className="flex flex-col gap-4">
      {/* Back */}
      <Link href="/coach/students" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        ← 返回学员列表
      </Link>

      {/* Profile card */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-2xl shrink-0`}>
            {student.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xl font-bold text-gray-800">{student.name}</span>
              <PlanBadge plan={student.plan} size="md" />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              <span>{student.age}岁</span>
              <span>·</span>
              <span>{positionLabel[student.position ?? "unknown"] ?? "未知"}</span>
              <span>·</span>
              <span>{levelLabel[student.level] ?? student.level}</span>
              {student.number && <><span>·</span><span>#{student.number}</span></>}
            </div>
          </div>
        </div>
      </div>

      {/* Radar / Locked */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <h2 className="text-sm font-semibold mb-3">能力概览</h2>
        {hasRadar ? (
          <div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-2 w-20 shrink-0">
                {[{ key: "心理成长", emoji: "💪" }, { key: "团队协作", emoji: "🤝" }].map(({ key, emoji }) => {
                  const d = mockRadarData.find((r) => r.dimension === key);
                  if (!d) return null;
                  return (
                    <div key={key} className="flex flex-col items-center bg-orange-50 rounded-xl p-2">
                      <span className="text-lg mb-0.5">{emoji}</span>
                      <div className="text-xs text-gray-500 leading-tight text-center">{key}</div>
                      <div className="text-sm font-black text-orange-600">{d.score}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex-1 min-w-0">
                <GrowthRadarCompact />
              </div>
              <div className="flex flex-col gap-2 w-20 shrink-0">
                {[{ key: "技术成长", emoji: "🎯" }, { key: "比赛状态", emoji: "⚡" }].map(({ key, emoji }) => {
                  const d = mockRadarData.find((r) => r.dimension === key);
                  if (!d) return null;
                  return (
                    <div key={key} className="flex flex-col items-center bg-orange-50 rounded-xl p-2">
                      <span className="text-lg mb-0.5">{emoji}</span>
                      <div className="text-xs text-gray-500 leading-tight text-center">{key}</div>
                      <div className="text-sm font-black text-orange-600">{d.score}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <LockedFeature feature="六维能力雷达图" requiredPlan="vip" />
        )}
      </div>

      {/* Recent reports */}
      <div>
        <h2 className="text-sm font-semibold mb-3">成长报告 ({reports.length})</h2>
        {reports.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted-foreground">暂无报告</div>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((r) => {
              const s = statusLabel[r.status] || statusLabel.draft;
              return (
                <Link key={r.id} href={`/coach/annotate/${r.id}`} className="block rounded-2xl border border-border bg-white p-4 hover:shadow-md transition-shadow active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <PlanBadge plan={r.reportType} size="sm" />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                        <span className="text-xs text-gray-400">{r.createdAt}</span>
                      </div>
                      <div className="text-sm font-medium text-gray-700 truncate">{r.title}</div>
                    </div>
                    <span className="text-xs text-orange-600 font-medium shrink-0">编辑 ›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Growth timeline */}
      <div>
        <h2 className="text-sm font-semibold mb-3">成长时间线</h2>
        <div className="flex flex-col gap-2">
          {growthItems.map((item) => (
            <div key={item.id} className="flex gap-3 items-start">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className={`w-3 h-3 rounded-full mt-0.5 ${item.type === "match" ? "bg-orange-400" : "bg-blue-400"}`} />
                <div className="w-0.5 h-6 bg-gray-200" />
              </div>
              <div className="flex-1 pb-2">
                <div className="text-xs text-gray-400 mb-0.5">{item.date}</div>
                <div className="text-sm font-medium text-gray-700">{item.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.summary}</div>
                {item.badge && (
                  <span className="inline-block mt-1 text-xs bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-amber-700">
                    {item.badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
