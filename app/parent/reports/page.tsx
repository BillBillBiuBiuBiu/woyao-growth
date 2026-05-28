"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import PlanBadge from "@/components/PlanBadge";

interface Report {
  id: string;
  title: string;
  scene: string;
  plan: "basic" | "vip" | "supervip";
  summary: string;
  published_at: string;
  student: { name: string } | null;
}

const sceneLabel: Record<string, string> = {
  training: "训练", match: "比赛", period_summary: "阶段总结",
};

function fmtDate(ts: string) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ParentReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [childName, setChildName] = useState("");

  useEffect(() => {
    fetch("/api/parent/students")
      .then((r) => r.ok ? r.json() : [])
      .then((students: { name: string }[]) => { if (students.length > 0) setChildName(students[0].name); })
      .catch(() => {});

    fetch("/api/parent/reports")
      .then((r) => r.ok ? r.json() : [])
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="-mx-4 -mt-6 pb-10 min-h-screen"
      style={{ background: "linear-gradient(160deg, #fff3e0 0%, #ffe9cc 40%, #fff8ec 100%)" }}
    >
      <div className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-black mb-1" style={{ color: "#7C3810" }}>成长报告</h1>
        <p className="text-sm text-orange-600">
          {childName ? `${childName}的所有成长记录` : "孩子的所有成长记录"}
        </p>
      </div>

      <div className="flex flex-col gap-3 px-4">
        {loading ? (
          [1, 2, 3].map((i) => <div key={i} className="h-24 rounded-3xl bg-white/70 animate-pulse" />)
        ) : reports.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-16">
            <div className="text-4xl mb-3">📋</div>
            <p>暂无报告，等教练发布后即可查看</p>
          </div>
        ) : (
          reports.map((r) => (
            <Link key={r.id} href={`/parent/reports/${r.id}`}>
              <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4 flex items-start justify-between gap-3 active:scale-[0.98] transition-transform">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <PlanBadge plan={r.plan} size="sm" />
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">已发布</span>
                    <span className="text-xs text-gray-400">{sceneLabel[r.scene] ?? r.scene}</span>
                  </div>
                  <div className="font-bold text-gray-800 text-sm leading-snug mb-1">{r.title}</div>
                  {r.summary && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{r.summary}</p>
                  )}
                  <div className="text-xs text-orange-400 mt-2">{fmtDate(r.published_at)}</div>
                </div>
                <span className="text-2xl text-orange-300 leading-none shrink-0 mt-1">›</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
