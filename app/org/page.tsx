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

// Generate context-aware task message for a lead
function genTaskMsg(lead: typeof mockLeads[0]): string {
  if (lead.type === "private_training") {
    return `${lead.student}最近几场比赛都有精彩集锦，正是聊进阶私教的好时机——不是推销，是真心觉得他可以更好。`;
  }
  if (lead.type === "renewal") {
    return `${lead.student}的月度成长报告刚发出去，家长打开了。趁热聊续课，引用孩子进步数据，感觉不像推销。`;
  }
  return lead.suggestedMessage;
}

export default function OrgDashboard() {
  const [realGameCount, setRealGameCount] = useState<number | null>(null);
  const [copiedTask, setCopiedTask] = useState<string | null>(null);

  useEffect(() => {
    apiLoadGames().then(games => setRealGameCount(games.length)).catch(() => {});
  }, []);

  const newLeads = mockLeads.filter(l => l.status === "new");
  const topTasks = newLeads.slice(0, 3);
  const availableMaterials = mockLeads.filter(l => l.type !== "care").length + 3; // clips + reports
  const taskCount = Math.min(topTasks.length + 1, 3); // tasks + weekly highlight push

  function copyTask(id: string, msg: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(msg).then(() => {
        setCopiedTask(id);
        setTimeout(() => setCopiedTask(null), 2500);
      }).catch(() => {});
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">运营看板</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{`PAB球馆 · ${new Date().getFullYear()}年${new Date().getMonth() + 1}月`}</p>
      </div>

      {/* 今天只做X件事 — 具名行动清单 */}
      <div className="rounded-2xl border border-orange-100 bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-orange-50">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">今天只做 {taskCount} 件事</span>
          </div>
          <h2 className="text-lg font-black text-gray-900">让销售更简单，也更有温度</h2>
          <p className="text-xs text-gray-400 mt-0.5">每天打开这里，只看：联系谁、为什么联系、怎么说。</p>
          <div className="flex gap-4 mt-3">
            <div className="text-center">
              <div className="text-lg font-black text-orange-600">{newLeads.length}</div>
              <div className="text-xs text-gray-400">今日线索</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-blue-600">{availableMaterials}</div>
              <div className="text-xs text-gray-400">可用素材</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-green-600">{taskCount}</div>
              <div className="text-xs text-gray-400">推荐动作</div>
            </div>
          </div>
        </div>

        {/* Task list */}
        <div className="flex flex-col divide-y divide-orange-50">
          {topTasks.map((lead, i) => {
            const msg = genTaskMsg(lead);
            const copied = copiedTask === lead.id;
            return (
              <div key={lead.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-800 mb-0.5">
                      先联系{lead.student}{lead.type === "private_training" ? "家长" : "妈妈"}
                    </div>
                    <div className="text-xs text-gray-500 leading-relaxed mb-2">{lead.reason}</div>
                    <button
                      onClick={() => copyTask(lead.id, msg)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-colors ${
                        copied
                          ? "bg-green-50 text-green-600 border border-green-200"
                          : "bg-orange-500 text-white active:opacity-80"
                      }`}
                    >
                      {copied ? "✅ 话术已复制，去发微信吧" : "复制温暖话术 →"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Fixed task: send weekly highlight */}
          <div className="px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{topTasks.length + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-800 mb-0.5">发送本周高光给家长群</div>
                <div className="text-xs text-gray-500 leading-relaxed mb-2">用孩子真实片段做沟通素材，比单纯发通知更有温度。</div>
                <Link href="/org/leads">
                  <button className="w-full py-2 rounded-xl text-xs font-bold bg-orange-500 text-white active:opacity-80">
                    去转化线索页取材料 →
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

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
              <div key={s.id} className={`flex items-center gap-3 py-2.5 ${i < mockStudentList.length - 1 ? "border-b border-border" : ""}`}>
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
