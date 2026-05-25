"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { mockStudents, mockVideos } from "@/lib/mock-data";
import PlanBadge from "@/components/PlanBadge";
import type { PlanType, ReportScene } from "@/lib/types";

const reportTypes: { type: PlanType; label: string; desc: string }[] = [
  { type: "basic",    label: "基础版", desc: "成长记录 + 视频片段 + 教练寄语" },
  { type: "vip",      label: "专业版", desc: "雷达图 + 数据统计 + 专项建议" },
  { type: "supervip", label: "高阶版", desc: "趋势分析 + 联合点评 + 训练计划" },
];

const sceneOptions: { value: ReportScene; label: string; emoji: string }[] = [
  { value: "training",       label: "训练",     emoji: "🏋️" },
  { value: "match",          label: "比赛",     emoji: "🏀" },
  { value: "period_summary", label: "阶段总结", emoji: "📊" },
];

const mockDraft: Record<PlanType, { summary: string; strengths: string; weaknesses: string; coachComment: string }> = {
  basic: {
    summary: "这次训练孩子表现非常积极，全程保持专注，展现出对篮球的热情。基本动作更加稳定，和队友的互动也更加主动了。",
    strengths: "1. 训练专注度高\n2. 基础运球动作稳定性提升\n3. 与同伴的互动更加主动",
    weaknesses: "1. 投篮姿势仍需持续纠正\n2. 左手运球稳定性不足",
    coachComment: "本次训练进步明显，请家长继续鼓励孩子保持练习热情！",
  },
  vip: {
    summary: "本场比赛该学员在进攻端主动性显著提升，有效突破2次，传球助攻1次，防守端积极参与协防。综合评分相比上次提升约12%。",
    strengths: "1. 主动进攻意愿明显增强\n2. 传球选择更加合理，视野有所拓宽\n3. 防守专注度维持较高水平",
    weaknesses: "1. 左手突破终结需要加强\n2. 传球后的无球跑动尚未形成习惯",
    coachComment: "本场表现稳定，进攻端进步明显。下阶段重点加强左手终结和无球跑位。",
  },
  supervip: {
    summary: "本月阶段总结显示，该学员在决策速度、团队协作和防守覆盖三个维度均有显著提升。AI分析显示其综合能力指数较上月提升15.3%，在同组学员中处于头部水平。",
    strengths: "1. 决策速度大幅提升，高压下表现稳定\n2. 团队协作意识显著增强，多次创造队友得分\n3. 防守覆盖范围扩大，补位判断更加果断",
    weaknesses: "1. 外线投篮命中率有待提升\n2. 面对速度型对手时移动效率需改善",
    coachComment: "本月成长令人印象深刻。下阶段将为其制定针对外线投篮和快速移动的专项计划，目标是进一步巩固在精英班中的领先地位。",
  },
};

function GenerateReportContent() {
  const searchParams = useSearchParams();
  const preVideoId = searchParams.get("videoId") ?? "";

  const [step, setStep] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState(mockStudents[0].id);
  const [selectedVideo, setSelectedVideo] = useState(preVideoId || mockVideos[0].id);
  const [selectedType, setSelectedType] = useState<PlanType>("vip");
  const [selectedScene, setSelectedScene] = useState<ReportScene>("training");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState({ summary: "", strengths: "", weaknesses: "", coachComment: "" });
  const [published, setPublished] = useState(false);

  function handleGenerate() {
    setGenerating(true);
    setTimeout(() => {
      if (draft.summary === "") setDraft(mockDraft[selectedType]);
      setGenerating(false);
      setStep(3);
    }, 1200);
  }

  if (published) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 px-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-xl font-bold text-gray-800 text-center">报告已发布！</h2>
        <p className="text-sm text-gray-500 text-center">家长将收到通知，可在家长端查看成长报告。</p>
        <div className="flex gap-3 w-full max-w-xs">
          <Link href="/coach/reports" className="flex-1">
            <button className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              查看报告列表
            </button>
          </Link>
          <button
            onClick={() => { setStep(1); setPublished(false); setDraft({ summary: "", strengths: "", weaknesses: "", coachComment: "" }); }}
            className="flex-1 rounded-xl bg-orange-500 text-white py-2.5 text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            再生成一份
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">生成报告</h1>
        <div className="flex items-center gap-2 mt-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step >= s ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"
              }`}>{s}</div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? "bg-orange-400" : "bg-gray-200"}`} />}
            </div>
          ))}
          <span className="ml-2 text-xs text-gray-500">
            {step === 1 ? "选择学员与视频" : step === 2 ? "选择训练场景" : "审核与发布"}
          </span>
        </div>
      </div>

      {/* Step 1: Student + Video + Type */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          {/* Student */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-3">选择学员</label>
            <div className="flex flex-col gap-2">
              {mockStudents.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                    selectedStudent === s.id ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-orange-400 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {s.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.age}岁</div>
                  </div>
                  <PlanBadge plan={s.plan} size="sm" />
                </button>
              ))}
            </div>
          </div>

          {/* Video */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-3">选择视频</label>
            <div className="flex flex-col gap-2">
              {mockVideos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVideo(v.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                    selectedVideo === v.id ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="w-12 h-9 rounded-lg overflow-hidden bg-slate-800 shrink-0">
                    {v.thumbnailUrl && <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover opacity-70" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{v.title}</div>
                    <div className="text-xs text-gray-400">{v.duration}分钟 · {v.studentIds.length}名学员</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Report type */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-3">报告类型</label>
            <div className="flex flex-col gap-2">
              {reportTypes.map((rt) => (
                <button
                  key={rt.type}
                  onClick={() => setSelectedType(rt.type)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                    selectedType === rt.type ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <PlanBadge plan={rt.type} size="md" />
                  <div className="text-xs text-gray-500">{rt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full rounded-xl bg-orange-500 text-white py-3 font-medium hover:bg-orange-600 transition-colors"
          >
            下一步 →
          </button>
        </div>
      )}

      {/* Step 2: Scene */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-3">训练场景</label>
            <div className="flex flex-col gap-2">
              {sceneOptions.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSelectedScene(s.value)}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${
                    selectedScene === s.value ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="font-medium text-gray-800">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep(1); setDraft({ summary: "", strengths: "", weaknesses: "", coachComment: "" }); }}
              className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← 上一步
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 rounded-xl bg-orange-500 text-white py-3 font-medium hover:bg-orange-600 transition-colors disabled:opacity-60"
            >
              {generating ? "AI 生成中..." : "✨ 生成AI初稿"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Publish */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-2">报告摘要</label>
            <textarea
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:border-orange-400"
              rows={4}
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
          </div>

          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-2">进步点</label>
            <textarea
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:border-orange-400"
              rows={4}
              value={draft.strengths}
              onChange={(e) => setDraft({ ...draft, strengths: e.target.value })}
            />
          </div>

          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-2">改进方向</label>
            <textarea
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:border-orange-400"
              rows={3}
              value={draft.weaknesses}
              onChange={(e) => setDraft({ ...draft, weaknesses: e.target.value })}
            />
          </div>

          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-2">教练寄语</label>
            <textarea
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:border-orange-400"
              rows={3}
              value={draft.coachComment}
              onChange={(e) => setDraft({ ...draft, coachComment: e.target.value })}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep(2); setDraft({ summary: "", strengths: "", weaknesses: "", coachComment: "" }); }}
              className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← 上一步
            </button>
            <button
              onClick={() => setPublished(true)}
              className="flex-1 rounded-xl bg-orange-500 text-white py-3 font-medium hover:bg-orange-600 transition-colors"
            >
              确认发布
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GenerateReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">加载中...</div>}>
      <GenerateReportContent />
    </Suspense>
  );
}
