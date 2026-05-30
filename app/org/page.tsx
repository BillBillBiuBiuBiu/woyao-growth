"use client";
import { mockOrgStats, mockStudentList, mockLeads } from "@/lib/mock-data";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { apiLoadGames } from "@/lib/gc-api";

const EngagementChart = dynamic(() => import("@/components/OrgCharts").then((m) => m.EngagementChart), { ssr: false });

const growthTrendMap: Record<string, { icon: string; color: string }> = {
  up: { icon: "↑", color: "text-green-300" },
  stable: { icon: "→", color: "text-sky-300" },
  down: { icon: "↓", color: "text-orange-300" },
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
    <div className="flex flex-col gap-5" style={{ background: "radial-gradient(circle at 12% 0%, rgba(56,189,248,0.2), transparent 34%), radial-gradient(circle at 88% 10%, rgba(255,212,71,0.14), transparent 32%), linear-gradient(180deg, #0B1727 0%, #07111F 64%, #05070D 100%)", minHeight: "100vh" }}>
      <div>
        <h1 className="text-xl font-bold text-white">运营看板</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{`PAB球馆 · ${new Date().getFullYear()}年${new Date().getMonth() + 1}月`}</p>
      </div>

      {/* 今天只做X件事 — 具名行动清单 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(249,115,22,0.3)", backdropFilter: "blur(12px)" }}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">今天只做 {taskCount} 件事</span>
          </div>
          <h2 className="text-lg font-black text-white">让销售更简单，也更有温度</h2>
          <p className="text-xs text-gray-500 mt-0.5">每天打开这里，只看：联系谁、为什么联系、怎么说。</p>
          <div className="flex gap-4 mt-3">
            <div className="text-center">
              <div className="text-lg font-black text-orange-400">{newLeads.length}</div>
              <div className="text-xs text-gray-500">今日线索</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-blue-400">{availableMaterials}</div>
              <div className="text-xs text-gray-500">可用素材</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-green-400">{taskCount}</div>
              <div className="text-xs text-gray-500">推荐动作</div>
            </div>
          </div>
        </div>

        {/* Task list */}
        <div className="flex flex-col" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {topTasks.map((lead, i) => {
            const msg = genTaskMsg(lead);
            const copied = copiedTask === lead.id;
            return (
              <div key={lead.id} className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white mb-0.5">
                      先联系{lead.student}{lead.type === "private_training" ? "家长" : "妈妈"}
                    </div>
                    <div className="text-xs text-gray-400 leading-relaxed mb-2">{lead.reason}</div>
                    <button
                      onClick={() => copyTask(lead.id, msg)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-colors ${
                        copied
                          ? "bg-green-500/15 text-green-300 border border-green-500/30"
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
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{topTasks.length + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white mb-0.5">发送本周高光给家长群</div>
                <div className="text-xs text-gray-400 leading-relaxed mb-2">用孩子真实片段做沟通素材，比单纯发通知更有温度。</div>
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
          { label: "活跃学员", value: mockOrgStats.activeStudents, unit: "人", color: "text-sky-300", bg: "bg-sky-500/10" },
          { label: "实战场次", value: realGameCount ?? mockOrgStats.reportsThisMonth, unit: "场", color: "text-orange-300", bg: "bg-orange-500/10" },
          { label: "报告打开率", value: `${Math.round(mockOrgStats.reportOpenRate * 100)}%`, unit: "", color: "text-green-300", bg: "bg-green-500/15" },
          { label: "视频播放率", value: `${Math.round(mockOrgStats.videoPlayRate * 100)}%`, unit: "", color: "text-purple-300", bg: "bg-purple-500/10" },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
            <div className={`text-2xl font-bold ${m.color}`}>{m.value}<span className="text-sm">{m.unit}</span></div>
            <div className="text-xs text-gray-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-300 text-center px-2 -mt-2">
        🏀 本赛季 PAB U10 整体表现优秀，报告打开率 {Math.round(mockOrgStats.reportOpenRate * 100)}%，家长参与度持续上升
      </div>

      {/* Conversion summary */}
      <div className="rounded-2xl p-4" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-amber-300">转化线索本月</div>
            <div className="text-xs text-amber-400 mt-0.5">
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
      <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">学员成长概览</h2>
          <span className="text-xs text-gray-500">{mockStudentList.length}人</span>
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
                    <span className="text-sm font-medium text-white">{s.name}</span>
                    <span className="text-xs text-gray-500">{s.age}岁</span>
                    <span className={`text-xs font-bold ml-auto ${trend.color}`}>{trend.icon}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500">打开率 {Math.round(s.openRate * 100)}%</span>
                    <span className="text-xs text-gray-500">最近 {s.lastActive}</span>
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
