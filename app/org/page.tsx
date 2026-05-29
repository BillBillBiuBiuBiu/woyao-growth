"use client";
import { mockOrgStats, mockStudentList, mockLeads } from "@/lib/mock-data";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { apiLoadGames } from "@/lib/gc-api";

const EngagementChart = dynamic(() => import("@/components/OrgCharts").then((m) => m.EngagementChart), { ssr: false });

const growthTrendMap: Record<string, { icon: string; color: string }> = {
  up: { icon: "↑", color: "text-green-600" },
  stable: { icon: "→", color: "text-blue-600" },
  down: { icon: "↓", color: "text-orange-600" },
};

export default function OrgDashboard() {
  const [realGameCount, setRealGameCount] = useState<number | null>(null);

  useEffect(() => {
    apiLoadGames().then(games => setRealGameCount(games.length)).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">运营看板</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{`PAB球馆 · ${new Date().getFullYear()}年${new Date().getMonth() + 1}月`}</p>
      </div>

      {/* Today's action items */}
      {(() => {
        const newLeads = mockLeads.filter(l => l.status === "new").length;
        if (newLeads === 0) return null;
        return (
          <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-orange-800 mb-0.5">🔔 今日待办</div>
              <div className="text-sm text-orange-700">
                <span className="font-bold">{newLeads} 个线索</span> 还没有跟进——趁热！
              </div>
              <div className="text-xs text-orange-500 mt-0.5">越快联系，转化率越高</div>
            </div>
            <Link href="/org/leads">
              <button className="shrink-0 bg-orange-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl active:opacity-80 transition-opacity">
                去跟进 →
              </button>
            </Link>
          </div>
        );
      })()}

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "活跃学员", value: mockOrgStats.activeStudents, unit: "人", color: "text-blue-600", bg: "bg-blue-50" },
          { label: "实战场次", value: realGameCount ?? mockOrgStats.reportsThisMonth, unit: "场", color: "text-orange-600", bg: "bg-orange-50" },
          { label: "报告打开率", value: `${Math.round(mockOrgStats.reportOpenRate * 100)}%`, unit: "", color: "text-green-600", bg: "bg-green-50" },
          { label: "视频播放率", value: `${Math.round(mockOrgStats.videoPlayRate * 100)}%`, unit: "", color: "text-purple-600", bg: "bg-purple-50" },
        ].map((m) => (
          <div key={m.label} className={`rounded-2xl border border-border ${m.bg} p-4`}>
            <div className={`text-2xl font-bold ${m.color}`}>{m.value}<span className="text-sm">{m.unit}</span></div>
            <div className="text-xs text-muted-foreground mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Warm summary line */}
      <div className="text-xs text-gray-500 text-center px-2 -mt-2">
        🏀 本赛季 PAB U10 整体表现优秀，报告打开率 {Math.round(mockOrgStats.reportOpenRate * 100)}%，家长参与度持续上升
      </div>

      {/* Conversion summary */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-amber-800">转化线索本月</div>
            <div className="text-xs text-amber-600 mt-0.5">
              私教推荐 {mockLeads.filter(l => l.type === "private_training").length}个 · 续费线索 {mockLeads.filter(l => l.type === "renewal").length}个
            </div>
          </div>
          <Link href="/org/leads">
            <button className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors">
              查看全部 →
            </button>
          </Link>
        </div>
      </div>

      <EngagementChart />

      {/* Student list */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">学员成长概览</h2>
          <span className="text-xs text-muted-foreground">{mockStudentList.length}人</span>
        </div>
        <div className="flex flex-col gap-0">
          {mockStudentList.map((s, i) => {
            const trend = growthTrendMap[s.growth];
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 py-2.5 ${i < mockStudentList.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-300 to-amber-200 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {s.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.age}岁</span>
                    <span className={`text-xs font-bold ml-auto ${trend.color}`}>{trend.icon}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">打开率 {Math.round(s.openRate * 100)}%</span>
                    <span className="text-xs text-muted-foreground">最近 {s.lastActive}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
