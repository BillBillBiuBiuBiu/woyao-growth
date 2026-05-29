"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { mockReports } from "@/lib/mock-data";
import PlanBadge from "@/components/PlanBadge";
import type { Report } from "@/lib/types";

function useChildName() {
  const [name] = useState(() => {
    try { return localStorage.getItem("child_name") || ""; } catch { return ""; }
  });
  return name;
}

const statusLabel: Record<string, { label: string; color: string }> = {
  draft:     { label: "准备中",   color: "bg-slate-100 text-slate-400" },
  generated: { label: "准备中",   color: "bg-slate-100 text-slate-400" },
  reviewed:  { label: "教练已确认", color: "bg-amber-100 text-amber-700" },
  sent:      { label: "已发送",   color: "bg-green-100 text-green-700" },
};

const sceneLabel: Record<string, string> = {
  training:       "训练",
  match:          "比赛",
  period_summary: "阶段总结",
};

function ReportCard({ r }: { r: Report }) {
  const [isRead] = useState(() => {
    try { return localStorage.getItem(`report_read_${r.id}`) === "1"; } catch { return false; }
  });
  const showDot = !isRead && r.status === "sent";
  const s = statusLabel[r.status] || statusLabel.draft;
  return (
    <Link href={`/parent/reports/${r.id}`}>
      <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4 flex items-start justify-between gap-3 active:scale-98 transition-transform hover:shadow-md">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <PlanBadge plan={r.reportType} size="sm" />
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
            <span className="text-xs text-gray-400">{sceneLabel[r.scene] ?? r.scene}</span>
          </div>
          <div className="font-bold text-gray-800 text-sm leading-snug mb-1">{r.title}</div>
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{r.summary}</p>
          <div className="text-xs text-orange-400 mt-2">{r.createdAt}</div>
        </div>
        <div className="shrink-0 mt-1 flex flex-col items-center gap-1">
          {showDot && <span className="w-2 h-2 rounded-full bg-orange-500 block" />}
          <span className="text-2xl text-orange-300 leading-none">›</span>
        </div>
      </div>
    </Link>
  );
}

type FilterTab = "all" | "sent" | "pending";

export default function ParentReportsPage() {
  const reports = mockReports.filter((r) => r.studentId === "stu-001");
  const childName = useChildName();
  const [tab, setTab] = useState<FilterTab>("all");
  const [unreadSent, setUnreadSent] = useState(0);

  useEffect(() => {
    try {
      const n = reports.filter(r => r.status === "sent" && localStorage.getItem(`report_read_${r.id}`) !== "1").length;
      setUnreadSent(n);
    } catch {}
  }, []);

  const sentCount = reports.filter((r) => r.status === "sent").length;
  const pendingCount = reports.filter((r) => r.status === "draft" || r.status === "generated" || r.status === "reviewed").length;

  const filtered = tab === "sent"
    ? reports.filter((r) => r.status === "sent")
    : tab === "pending"
    ? reports.filter((r) => r.status === "draft" || r.status === "generated" || r.status === "reviewed")
    : reports;

  const tabs: { key: FilterTab; label: string; count: number; dot?: boolean }[] = [
    { key: "all",     label: "全部",   count: reports.length },
    { key: "sent",    label: "已发送", count: sentCount, dot: unreadSent > 0 },
    { key: "pending", label: "准备中", count: pendingCount },
  ];

  return (
    <div
      className="-mx-4 -mt-6 pb-10 min-h-screen"
      style={{ background: "linear-gradient(160deg, #fff3e0 0%, #ffe9cc 40%, #fff8ec 100%)" }}
    >
      <div className="px-4 pt-8 pb-4">
        <h1
          className="text-2xl font-black mb-1"
          style={{ color: "#7C3810" }}
        >
          成长报告
        </h1>
        <p className="text-sm text-orange-600">{childName ? `${childName}的所有成长记录` : "孩子的所有成长记录"}</p>
      </div>

      {/* Monthly growth summary */}
      {(() => {
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const monthReports = reports.filter(r => r.status === "sent" && r.createdAt?.startsWith(thisMonth));
        if (monthReports.length === 0) return null;
        // Find most common dimension across all clips
        const dimCount: Record<string, number> = {};
        for (const r of monthReports) {
          for (const c of r.clips || []) {
            if (c.dimension) dimCount[c.dimension] = (dimCount[c.dimension] || 0) + 1;
          }
        }
        const topDim = Object.entries(dimCount).sort((a, b) => b[1] - a[1])[0]?.[0];
        const dimEmoji: Record<string, string> = { "心理成长": "💪", "比赛状态": "⚡", "团队协作": "🤝", "技术成长": "🏀", "训练习惯": "📅", "战术认知": "🧠" };
        const summary = topDim
          ? `本月收到 ${monthReports.length} 份报告，${childName || "孩子"}在「${topDim}」方面最为突出，教练特别关注并记录了多个成长时刻。`
          : `本月收到 ${monthReports.length} 份成长报告，保持了很好的进步势头。`;
        return (
          <div className="mx-4 mb-4 rounded-2xl p-4" style={{ background: "linear-gradient(135deg, #7C3810 0%, #B45309 60%, #D97706 100%)" }}>
            <div className="text-xs text-amber-200 font-bold mb-1">{now.getMonth() + 1}月成长摘要</div>
            <div className="flex items-center gap-2 mb-2">
              {topDim && <span className="text-2xl">{dimEmoji[topDim] || "🏆"}</span>}
              <div className="text-sm font-bold text-white leading-snug">{topDim ? `本月重点：${topDim}` : "综合成长"}</div>
              <span className="ml-auto text-xs bg-white/20 text-amber-100 px-2 py-0.5 rounded-full">{monthReports.length}份报告</span>
            </div>
            <p className="text-xs text-amber-100 leading-relaxed">{summary}</p>
          </div>
        );
      })()}

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              tab === t.key
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-white/70 text-gray-500 border border-orange-100"
            }`}
          >
            {t.label}
            {t.dot && tab !== t.key && <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />}
            {t.count > 0 && (
              <span className={`text-[10px] px-1 rounded-full ${tab === t.key ? "bg-white/30 text-white" : "bg-gray-100 text-gray-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 px-4">
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-10">暂无报告</div>
        )}
        {filtered.map((r) => (
          <ReportCard key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}
