"use client";
import { mockReports, mockStudent, mockRadarData } from "@/lib/mock-data";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import PlanBadge from "@/components/PlanBadge";
import type { Report } from "@/lib/types";

const GrowthRadarCompact = dynamic(
  () => import("@/components/GrowthCharts").then((m) => m.GrowthRadarCompact),
  { ssr: false }
);

const GrowthCurve = dynamic(
  () => import("@/components/GrowthCharts").then((m) => m.GrowthCurve),
  { ssr: false }
);

const radarLeft = [
  { key: "心理成长", emoji: "💪" },
  { key: "团队协作", emoji: "🤝" },
];
const radarRight = [
  { key: "技术成长", emoji: "🎯" },
  { key: "比赛状态", emoji: "⚡" },
];
const scoreDeltas: Record<string, number> = {
  "技术成长": 8, "战术认知": 5, "比赛状态": 15, "心理成长": 10, "团队协作": 5, "训练习惯": 3,
};

const sceneLabel: Record<string, string> = {
  training: "训练报告", match: "比赛报告", period_summary: "阶段总结",
};

function MetricsCards({ metrics }: { metrics: NonNullable<Report["metrics"]> }) {
  const items = [
    { label: "出手次数", value: metrics.shootingAttempts },
    { label: "命中次数", value: metrics.shootingMade },
    { label: "助攻", value: metrics.assists },
    { label: "篮板", value: metrics.rebounds },
    { label: "抢断", value: metrics.steals },
    { label: "失误", value: metrics.turnovers },
  ].filter((i) => i.value !== undefined);

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="bg-orange-50 rounded-2xl p-3 text-center">
          <div className="text-lg font-black text-orange-600">{item.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function BasicReportLayout({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-4 px-4">
      {/* Hero summary */}
      <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4 relative overflow-hidden">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-amber-400">⭐</span>
          <span className="text-sm font-bold text-amber-700">成长记录</span>
          <span className="text-amber-400">⭐</span>
        </div>
        <div className="relative px-2">
          <span className="absolute -top-1 -left-0 text-4xl font-black text-orange-200 leading-none select-none">"</span>
          <p className="text-base font-bold text-gray-800 leading-relaxed pt-3 pb-1 px-4">{report.summary}</p>
          <span className="absolute -bottom-2 right-0 text-4xl font-black text-orange-200 leading-none select-none">"</span>
        </div>
      </div>

      {/* Strengths */}
      <div className="rounded-3xl bg-white/90 border border-green-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-base">✅</span>
          <span className="text-sm font-bold text-gray-800">本次进步点</span>
        </div>
        <ul className="flex flex-col gap-2">
          {report.strengths.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-green-400 font-black shrink-0">{i + 1}.</span>
              <span className="text-gray-700">{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Weaknesses */}
      {report.weaknesses.length > 0 && (
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-base">📌</span>
            <span className="text-sm font-bold text-gray-800">下阶段练习重点</span>
          </div>
          <ul className="flex flex-col gap-2">
            {report.weaknesses.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-orange-400 font-black shrink-0">→</span>
                <span className="text-gray-700">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Coach comment */}
      {report.coachComment && (
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-300 to-amber-400 flex items-center justify-center text-xl shrink-0">
              🏀
            </div>
            <div>
              <div className="text-xs text-gray-500">教练寄语 ♡</div>
              <div className="text-sm font-bold text-gray-800">{mockStudent.coach}</div>
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{report.coachComment}</p>
        </div>
      )}
    </div>
  );
}

function VipReportLayout({ report }: { report: Report }) {
  const [activeClip, setActiveClip] = useState(0);
  const clips = report.clips ?? [];
  const clip = clips[activeClip];

  return (
    <div className="flex flex-col gap-4 px-4">
      {/* Hero quote card */}
      <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4 relative overflow-hidden">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-amber-400">⭐</span>
          <span className="text-sm font-bold text-amber-700">本场最值得看见的成长</span>
          <span className="text-amber-400">⭐</span>
        </div>
        <div className="relative px-2">
          <span className="absolute -top-1 -left-0 text-4xl font-black text-orange-200 leading-none select-none">"</span>
          <p className="text-base font-bold text-gray-800 leading-relaxed pt-3 pb-1 px-4">{report.summary}</p>
          <span className="absolute -bottom-2 right-0 text-4xl font-black text-orange-200 leading-none select-none">"</span>
        </div>
        <div className="absolute top-3 right-4 text-5xl select-none opacity-90">🏆</div>
      </div>

      {/* Video section */}
      {clips.length > 0 && clip && (
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <span className="text-base">▶️</span>
            <span className="text-sm font-bold text-gray-800">本场精彩瞬间</span>
          </div>
          <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
            {clips.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setActiveClip(i)}
                className={`shrink-0 text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                  i === activeClip ? "bg-orange-400 text-white border-orange-400" : "bg-white border-orange-200 text-orange-600"
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
          <div className="flex gap-2 px-3 pb-4">
            <div className="flex-1 rounded-2xl overflow-hidden bg-black min-w-0">
              {clip.videoUrl ? (
                <video
                  key={clip.videoUrl}
                  className="w-full aspect-video"
                  controls
                  playsInline
                  poster={clip.thumbnail ?? undefined}
                  src={clip.videoUrl}
                />
              ) : (
                <div className="aspect-video flex items-center justify-center">
                  <span className="text-white/30 text-xs">暂无视频</span>
                </div>
              )}
            </div>
            <div className="w-28 shrink-0 flex flex-col justify-center">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm p-2.5 relative">
                <div className="text-xs font-semibold text-amber-700 mb-1">教练点评：</div>
                <p className="text-xs text-gray-700 leading-snug line-clamp-4">{clip.coachComment}</p>
              </div>
              <div className="text-xs text-orange-400 mt-1.5 text-center">♡</div>
            </div>
          </div>
          <div className="mx-4 mb-4 bg-orange-50 rounded-2xl p-3">
            <div className="text-xs font-medium text-orange-700 mb-1">👨‍👦 写给家长的话</div>
            <p className="text-xs text-gray-700 leading-relaxed">{clip.parentExplanation}</p>
          </div>
        </div>
      )}

      {/* Radar section */}
      <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-base">⭐</span>
          <span className="text-sm font-bold text-gray-800">成长雷达图</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-3 w-20 shrink-0">
            {radarLeft.map(({ key, emoji }) => {
              const d = mockRadarData.find((r) => r.dimension === key);
              if (!d) return null;
              return (
                <div key={key} className="flex flex-col items-center bg-orange-50 rounded-2xl p-2">
                  <span className="text-xl mb-0.5">{emoji}</span>
                  <div className="text-xs text-gray-500 leading-tight text-center">{key}</div>
                  <div className="text-base font-black text-orange-600">{d.score}分</div>
                  <div className="text-xs text-green-600 font-medium">进步↑{scoreDeltas[key]}</div>
                </div>
              );
            })}
          </div>
          <div className="flex-1 min-w-0">
            <GrowthRadarCompact />
          </div>
          <div className="flex flex-col gap-3 w-20 shrink-0">
            {radarRight.map(({ key, emoji }) => {
              const d = mockRadarData.find((r) => r.dimension === key);
              if (!d) return null;
              return (
                <div key={key} className="flex flex-col items-center bg-orange-50 rounded-2xl p-2">
                  <span className="text-xl mb-0.5">{emoji}</span>
                  <div className="text-xs text-gray-500 leading-tight text-center">{key}</div>
                  <div className="text-base font-black text-orange-600">{d.score}分</div>
                  <div className="text-xs text-green-600 font-medium">进步↑{scoreDeltas[key]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Metrics */}
      {report.metrics && (
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-base">📊</span>
            <span className="text-sm font-bold text-gray-800">数据统计</span>
          </div>
          <MetricsCards metrics={report.metrics} />
        </div>
      )}

      {/* Growth points */}
      <div className="rounded-3xl bg-white/90 border border-green-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-base">✅</span>
          <span className="text-sm font-bold text-gray-800">进步点</span>
        </div>
        <ul className="flex flex-col gap-2">
          {report.strengths.map((pt, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-green-400 font-black shrink-0">{i + 1}.</span>
              <span className="text-gray-700">{pt}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Coach message */}
      {report.coachComment && (
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-300 to-amber-400 flex items-center justify-center text-xl shrink-0">
              🏀
            </div>
            <div>
              <div className="text-xs text-gray-500">教练寄语 ♡</div>
              <div className="text-sm font-bold text-gray-800">{mockStudent.coach}</div>
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{report.coachComment}</p>
          <div className="text-right text-xs text-gray-400 mt-2">— Coach {mockStudent.coach}</div>
        </div>
      )}
    </div>
  );
}

function SupervipReportLayout({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-4 px-4">
      {/* VIP core content (summary, radar, metrics, strengths, coach) */}
      <VipReportLayout report={report} />

      {/* Trend analysis */}
      {report.trendData && (
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-base">📈</span>
            <span className="text-sm font-bold text-gray-800">阶段成长趋势</span>
          </div>
          <GrowthCurve />
        </div>
      )}

      {/* Coach joint review */}
      <div className="rounded-3xl bg-white/90 border border-amber-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🎓</span>
          <span className="text-sm font-bold text-gray-800">本月教练联合点评</span>
        </div>
        <div className="bg-amber-50 rounded-2xl p-3">
          <p className="text-sm text-gray-700 leading-relaxed">
            {report.coachComment ?? "教练暂未填写本月点评。"}
          </p>
        </div>
        {report.internalCoachNotes && (
          <div className="mt-3 bg-blue-50 rounded-2xl p-3">
            <div className="text-xs font-medium text-blue-700 mb-1">专项建议</div>
            <p className="text-xs text-gray-600 leading-relaxed">{report.internalCoachNotes}</p>
          </div>
        )}
      </div>

      {/* Training plan */}
      <div className="rounded-3xl bg-white/90 border border-green-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-base">📋</span>
          <span className="text-sm font-bold text-gray-800">下阶段训练计划</span>
        </div>
        <ul className="flex flex-col gap-2">
          {report.suggestions.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
              <span className="text-gray-700">{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const report = mockReports.find((r) => r.id === id) ?? mockReports[0];
  const [liked, setLiked] = useState(() => {
    try { return localStorage.getItem(`report_liked_${id}`) === "1"; } catch { return false; }
  });

  return (
    <div className="-mx-4 -mt-6 pb-10" style={{ background: "linear-gradient(160deg, #fff3e0 0%, #ffe9cc 40%, #fff8ec 100%)" }}>
      {/* Top hero */}
      <div className="relative flex flex-col items-center pt-8 pb-4 px-4">
        <span className="absolute top-5 left-8 text-amber-400 text-xl select-none">✦</span>
        <span className="absolute top-12 right-10 text-orange-300 text-sm select-none">✦</span>
        <span className="absolute top-4 right-6 text-yellow-300 text-xs select-none">✦</span>

        {/* Avatar */}
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg mb-4 relative">
          <Image
            src={mockStudent.avatar}
            alt={mockStudent.name}
            fill
            className="object-cover object-top"
            sizes="96px"
          />
        </div>

        {/* Title + plan badge */}
        <div className="flex items-center gap-2 mb-1">
          <h1
            className="text-xl font-black text-center leading-tight"
            style={{ color: "#7C3810", fontFamily: "PingFang SC, Hiragino Sans GB, sans-serif" }}
          >
            {report.title}
          </h1>
        </div>

        {/* Date + scene + plan badge row */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <div className="flex items-center gap-1.5 bg-white/70 border border-orange-200 rounded-full px-3 py-1">
            <span className="text-orange-500 text-xs">🗓</span>
            <span className="text-xs font-medium text-orange-700">{report.createdAt} {sceneLabel[report.scene] ?? report.scene}</span>
            <span className="text-orange-400 text-xs">♡</span>
          </div>
          <PlanBadge plan={report.reportType} size="sm" />
        </div>
      </div>

      {/* Report body by type */}
      {report.reportType === "basic" && <BasicReportLayout report={report} />}
      {report.reportType === "vip" && <VipReportLayout report={report} />}
      {report.reportType === "supervip" && <SupervipReportLayout report={report} />}

      {/* Coach appreciation */}
      <div className="px-4 pt-3">
        <button
          onClick={() => {
            setLiked(true);
            try { localStorage.setItem(`report_liked_${id}`, "1"); } catch {}
          }}
          disabled={liked}
          className={`w-full rounded-3xl py-4 text-base font-bold transition-all active:scale-95 ${
            liked
              ? "bg-orange-50 text-orange-500 border border-orange-200 cursor-default"
              : "bg-white border border-orange-200 text-orange-600 hover:bg-orange-50"
          }`}
        >
          {liked ? "已回应 ❤️ 谢谢教练！" : "❤️ 谢谢教练，看到啦！"}
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-4 px-4">
        <Link href={`/parent/profile/${mockStudent.id}`} className="flex-1">
          <button
            className="w-full rounded-full py-4 text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)" }}
          >
            <div>💾 查看成长档案</div>
            <div className="text-xs font-normal opacity-80 mt-0.5">记录成长，珍藏美好</div>
          </button>
        </Link>
        <Link href="/parent/highlights" className="flex-1">
          <button
            className="w-full rounded-full py-4 text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)" }}
          >
            <div>🎬 生成本场集锦</div>
            <div className="text-xs font-normal opacity-80 mt-0.5">AI剪辑本场精彩片段</div>
          </button>
        </Link>
      </div>
    </div>
  );
}
