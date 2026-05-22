"use client";
import { mockReport } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import Link from "next/link";

const levelColors: Record<string, string> = {
  L1: "bg-slate-100 text-slate-600",
  L2: "bg-blue-100 text-blue-700",
  L3: "bg-purple-100 text-purple-700",
  L4: "bg-orange-100 text-orange-700",
};

const levelLabels: Record<string, string> = {
  L1: "L1 参与",
  L2: "L2 稳定",
  L3: "L3 理解",
  L4: "L4 迁移",
};

const dimensionEmoji: Record<string, string> = {
  "技术成长": "🎯",
  "战术认知": "🧠",
  "比赛状态": "⚡",
  "心理成长": "💪",
  "团队协作": "🤝",
  "训练习惯": "📅",
};

export default function ReportDetailPage() {
  const report = mockReport;
  const [shared, setShared] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">成长报告 · {report.date}</div>
        <h1 className="text-xl font-bold text-foreground">{report.title}</h1>
      </div>

      {/* Hero summary */}
      <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 p-5 text-white shadow-md">
        <div className="text-xs font-medium text-orange-100 mb-2">✨ 本场最值得看见的成长</div>
        <p className="text-sm leading-relaxed">{report.heroSummary}</p>
      </div>

      {/* Badge */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
        <div className="text-4xl">{report.badge.icon}</div>
        <div>
          <div className="font-semibold">{report.badge.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{report.badge.description}</div>
        </div>
      </div>

      {/* Growth clips */}
      <div>
        <h2 className="font-semibold text-foreground mb-3">📹 成长证据</h2>
        <div className="flex flex-col gap-4">
          {report.clips.map((clip, i) => (
            <div key={clip.id} className="rounded-2xl border border-border bg-white overflow-hidden">
              {/* Video placeholder */}
              <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center cursor-pointer relative group">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <span className="text-white text-xl">▶</span>
                </div>
                <div className="absolute top-2 left-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${levelColors[clip.level]}`}>
                    {levelLabels[clip.level]}
                  </span>
                </div>
                <div className="absolute bottom-2 right-2 text-xs text-white/60 bg-black/30 px-1.5 py-0.5 rounded">
                  {clip.timestamp}
                </div>
                <div className="absolute bottom-2 left-2 text-xs text-white/60">证据 {i + 1}</div>
              </div>

              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{dimensionEmoji[clip.dimension] || "📌"}</span>
                  <span className="font-semibold text-sm">{clip.title}</span>
                  <Badge variant="secondary" className="text-xs ml-auto bg-orange-50 text-orange-700 border-orange-100">
                    {clip.tag}
                  </Badge>
                </div>

                <div className="bg-orange-50 rounded-xl p-3 mb-3">
                  <div className="text-xs font-medium text-orange-700 mb-1">👨‍👦 家长版解释</div>
                  <p className="text-sm text-foreground leading-relaxed">{clip.parentExplanation}</p>
                </div>

                <div className="bg-blue-50 rounded-xl p-3">
                  <div className="text-xs font-medium text-blue-700 mb-1">🏀 教练点评</div>
                  <p className="text-sm text-foreground leading-relaxed">{clip.coachComment}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress points */}
      <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
        <h3 className="text-sm font-semibold text-green-700 mb-2">✅ 本场进步点</h3>
        <ul className="flex flex-col gap-2">
          {report.progressPoints.map((pt, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-green-500 font-bold shrink-0">{i + 1}.</span>
              <span className="text-foreground">{pt}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Improvement points */}
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
        <h3 className="text-sm font-semibold text-sky-700 mb-2">🌱 下阶段提升方向</h3>
        <ul className="flex flex-col gap-2">
          {report.improvementPoints.map((pt, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-sky-500 shrink-0">•</span>
              <span className="text-foreground">{pt}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Coach advice */}
      <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
        <h3 className="text-sm font-semibold text-purple-700 mb-2">💬 教练建议</h3>
        <p className="text-sm text-foreground leading-relaxed">{report.coachAdvice}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link href="/parent/profile/stu-001" className="flex-1">
          <button className="w-full rounded-xl border border-border bg-white py-3 text-sm font-medium text-foreground hover:bg-slate-50 transition-colors">
            查看成长曲线
          </button>
        </Link>
        <button
          onClick={() => setShared(true)}
          className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          {shared ? "✓ 已分享" : "分享给家人"}
        </button>
      </div>
    </div>
  );
}
