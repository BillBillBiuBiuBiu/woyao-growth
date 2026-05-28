"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PlanBadge from "@/components/PlanBadge";

interface ReportDetail {
  id: string;
  title: string;
  scene: string;
  plan: "basic" | "vip" | "supervip";
  summary: string;
  strengths: string;
  weaknesses: string;
  coach_comment: string;
  published_at: string;
  student: { name: string; plan: string } | null;
}

const sceneLabel: Record<string, string> = {
  training: "训练报告", match: "比赛报告", period_summary: "阶段总结",
};

function parseLines(text: string): string[] {
  return text.split("\n").map((l) => l.replace(/^\d+[.、]\s*/, "").replace(/^[-→•]\s*/, "").trim()).filter(Boolean);
}

function fmtDate(ts: string) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function ParentReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/parent/reports/${params.id}`)
      .then(async (res) => {
        if (res.status === 404 || res.status === 403) { setNotFound(true); return; }
        if (res.ok) setReport(await res.json());
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div
        className="-mx-4 -mt-6 min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(160deg, #fff3e0 0%, #ffe9cc 40%, #fff8ec 100%)" }}
      >
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-2">🏀</div>
          <p className="text-sm">加载中…</p>
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div
        className="-mx-4 -mt-6 min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: "linear-gradient(160deg, #fff3e0 0%, #ffe9cc 40%, #fff8ec 100%)" }}
      >
        <div className="text-4xl">📋</div>
        <p className="text-gray-500 text-sm">报告不存在或无权查看</p>
        <button onClick={() => router.back()} className="text-orange-500 text-sm font-medium">← 返回</button>
      </div>
    );
  }

  const studentName = (report.student as { name: string } | null)?.name ?? "";
  const strengthLines = parseLines(report.strengths);
  const weaknessLines = parseLines(report.weaknesses);

  return (
    <div
      className="-mx-4 -mt-6 pb-12 min-h-screen"
      style={{ background: "linear-gradient(160deg, #fff3e0 0%, #ffe9cc 40%, #fff8ec 100%)" }}
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="text-orange-400 text-sm mb-3 flex items-center gap-1">
          ← 返回
        </button>
        <div className="flex items-center gap-2 mb-1">
          <PlanBadge plan={report.plan} size="sm" />
          <span className="text-xs text-gray-400">{sceneLabel[report.scene] ?? report.scene}</span>
        </div>
        <h1 className="text-xl font-black" style={{ color: "#7C3810" }}>{report.title}</h1>
        <p className="text-xs text-orange-500 mt-1">{fmtDate(report.published_at)}</p>
      </div>

      <div className="flex flex-col gap-4 px-4">
        {/* Hero summary */}
        <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4 relative overflow-hidden">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-amber-400">⭐</span>
            <span className="text-sm font-bold text-amber-700">
              {studentName ? `${studentName}的成长记录` : "成长记录"}
            </span>
            <span className="text-amber-400">⭐</span>
          </div>
          <div className="relative px-2">
            <span className="absolute -top-1 -left-0 text-4xl font-black text-orange-200 leading-none select-none">"</span>
            <p className="text-base font-bold text-gray-800 leading-relaxed pt-3 pb-1 px-4">{report.summary}</p>
            <span className="absolute -bottom-2 right-0 text-4xl font-black text-orange-200 leading-none select-none">"</span>
          </div>
        </div>

        {/* Strengths */}
        {strengthLines.length > 0 && (
          <div className="rounded-3xl bg-white/90 border border-green-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-base">✅</span>
              <span className="text-sm font-bold text-gray-800">本次进步点</span>
            </div>
            <ul className="flex flex-col gap-2">
              {strengthLines.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-green-400 font-black shrink-0">{i + 1}.</span>
                  <span className="text-gray-700">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Weaknesses */}
        {weaknessLines.length > 0 && (
          <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-base">📌</span>
              <span className="text-sm font-bold text-gray-800">下阶段练习重点</span>
            </div>
            <ul className="flex flex-col gap-2">
              {weaknessLines.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-orange-400 font-black shrink-0">→</span>
                  <span className="text-gray-700">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Coach comment */}
        {report.coach_comment && (
          <div className="rounded-3xl bg-white/90 border border-orange-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-300 to-amber-400 flex items-center justify-center text-xl shrink-0">
                🏀
              </div>
              <div>
                <div className="text-xs text-gray-500">教练寄语 ♡</div>
                <div className="text-sm font-bold text-gray-800">教练</div>
              </div>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{report.coach_comment}</p>
          </div>
        )}
      </div>
    </div>
  );
}
