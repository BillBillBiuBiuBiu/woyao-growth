"use client";
import { useState } from "react";
import Link from "next/link";
import { mockReports, mockStudent } from "@/lib/mock-data";
import PlanBadge from "@/components/PlanBadge";
import type { Report } from "@/lib/types";

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

export default function ParentReportsPage() {
  const reports = mockReports.filter((r) => r.studentId === mockStudent.id);

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
        <p className="text-sm text-orange-600">{mockStudent.name}的所有成长记录</p>
      </div>

      <div className="flex flex-col gap-3 px-4">
        {reports.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-10">暂无报告</div>
        )}
        {reports.map((r) => (
          <ReportCard key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}
