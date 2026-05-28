"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import PlanBadge from "@/components/PlanBadge";

interface Report {
  id: string;
  title: string;
  scene: string;
  plan: "basic" | "vip" | "supervip";
  status: "draft" | "published";
  summary: string;
  created_at: string;
  student: { name: string; plan: string } | null;
}

const sceneLabel: Record<string, string> = {
  training: "训练", match: "比赛", period_summary: "阶段总结",
};

export default function CoachReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/coach/reports")
      .then((r) => r.ok ? r.json() : [])
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  function fmtDate(ts: string) {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">报告管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "加载中..." : `共 ${reports.length} 份报告`}
          </p>
        </div>
        <Link href="/coach/reports/generate">
          <button className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-xl">
            + 生成报告
          </button>
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl border border-border bg-white animate-pulse" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm text-gray-500">还没有报告</p>
          <Link href="/coach/reports/generate">
            <button className="mt-3 text-sm text-orange-500 font-medium">生成第一份 →</button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => {
            const studentName = (r.student as { name: string } | null)?.name ?? "未知学员";
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="font-semibold text-gray-800">{studentName}</span>
                      <PlanBadge plan={r.plan} size="sm" />
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">已发布</span>
                      <span className="text-xs text-gray-400">{sceneLabel[r.scene] ?? r.scene}</span>
                    </div>
                    <div className="text-sm text-gray-700 truncate mb-1">{r.title}</div>
                    {r.summary && (
                      <p className="text-xs text-gray-400 line-clamp-1">{r.summary}</p>
                    )}
                    <div className="text-xs text-gray-400 mt-1">{fmtDate(r.created_at)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
