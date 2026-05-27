"use client";
import { useState } from "react";
import Link from "next/link";
import { mockStudents, mockReports } from "@/lib/mock-data";
import PlanBadge from "@/components/PlanBadge";

const levelLabel: Record<string, { label: string; color: string }> = {
  basic_class: { label: "基础班", color: "bg-slate-100 text-slate-600" },
  match_class:  { label: "比赛班", color: "bg-blue-100 text-blue-700" },
  elite_class:  { label: "精英班", color: "bg-amber-100 text-amber-700" },
};

const avatarColors = [
  "bg-orange-400", "bg-blue-400", "bg-green-400", "bg-purple-400", "bg-pink-400", "bg-teal-400",
];

export default function CoachStudentsPage() {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? mockStudents.filter((s) => s.name.includes(query.trim()))
    : mockStudents;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">学员管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {query.trim() ? `找到 ${filtered.length} / ${mockStudents.length} 名学员` : `共 ${mockStudents.length} 名学员`}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索学员姓名…"
          className="w-full rounded-xl border border-border bg-white pl-8 pr-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm active:opacity-60">✕</button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">没有找到「{query}」</div>
        )}
        {filtered.map((student) => {
          const idx = mockStudents.indexOf(student);
          const lv = levelLabel[student.level] || levelLabel.basic_class;
          const lastReport = mockReports.filter((r) => r.studentId === student.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const avatarColor = avatarColors[idx % avatarColors.length];

          return (
            <Link key={student.id} href={`/coach/students/${student.id}`}>
              <div className="rounded-2xl border border-border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                    {student.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{student.name}</span>
                      <span className="text-xs text-gray-400">{student.age}岁</span>
                      <PlanBadge plan={student.plan} size="sm" />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lv.color}`}>{lv.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {student.position === "guard" ? "后卫" : student.position === "forward" ? "前锋" : student.position === "center" ? "中锋" : "未知"}
                      </span>
                      {lastReport && (
                        <span className="text-xs text-muted-foreground">最近报告：{lastReport.createdAt}</span>
                      )}
                    </div>
                  </div>

                  <span className="text-xl text-muted-foreground shrink-0">›</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
