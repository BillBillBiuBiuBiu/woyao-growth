"use client";
import { useState } from "react";
import Link from "next/link";
import { mockReports, mockStudents } from "@/lib/mock-data";
import PlanBadge from "@/components/PlanBadge";
import type { ReportStatus } from "@/lib/types";

const statusTabs: { key: ReportStatus | "all"; label: string }[] = [
  { key: "all",       label: "全部" },
  { key: "draft",     label: "草稿" },
  { key: "generated", label: "已生成" },
  { key: "reviewed",  label: "已审核" },
  { key: "sent",      label: "已发送" },
];

const statusBadge: Record<string, { label: string; color: string }> = {
  draft:     { label: "草稿",   color: "bg-slate-100 text-slate-500" },
  generated: { label: "已生成", color: "bg-blue-100 text-blue-600" },
  reviewed:  { label: "已审核", color: "bg-amber-100 text-amber-700" },
  sent:      { label: "已发送", color: "bg-green-100 text-green-700" },
};

const sceneLabel: Record<string, string> = {
  training:       "训练",
  match:          "比赛",
  period_summary: "阶段总结",
};

export default function CoachReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportStatus | "all">("all");

  const filtered = activeTab === "all"
    ? mockReports
    : mockReports.filter((r) => r.status === activeTab);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">报告管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">共 {mockReports.length} 份报告</p>
        </div>
        <Link href="/coach/reports/generate">
          <button className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-orange-600 transition-colors">
            + 生成新报告
          </button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white border-gray-200 text-gray-600 hover:border-orange-200"
            }`}
          >
            {tab.label}
            {tab.key !== "all" && (
              <span className="ml-1 opacity-70">
                {mockReports.filter((r) => r.status === tab.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Report list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">暂无报告</div>
        )}
        {filtered.map((r) => {
          const student = mockStudents.find((s) => s.id === r.studentId);
          const badge = statusBadge[r.status] || statusBadge.draft;

          return (
            <Link key={r.id} href={`/coach/annotate/${r.id}`} className="block rounded-2xl border border-border bg-white p-4 hover:shadow-md transition-shadow active:scale-[0.99]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-semibold text-gray-800">{student?.name ?? r.studentId}</span>
                    <PlanBadge plan={r.reportType} size="sm" />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
                    <span className="text-xs text-gray-400">{sceneLabel[r.scene] ?? r.scene}</span>
                  </div>
                  <div className="text-sm text-gray-700 truncate mb-1">{r.title}</div>
                  <div className="text-xs text-gray-400">{r.createdAt}</div>
                </div>
                <span className="shrink-0 text-xs text-orange-600 font-medium border border-orange-200 rounded-lg px-2.5 py-1.5">
                  编辑 ›
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
