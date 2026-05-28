"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PlanBadge from "@/components/PlanBadge";
import type { PlanType, ReportScene } from "@/lib/types";

interface DbStudent { id: string; name: string; plan: "basic" | "vip" | "supervip" }

const sceneOptions: { value: ReportScene; label: string; emoji: string; desc: string }[] = [
  { value: "training",       label: "训练课",   emoji: "🏋️", desc: "日常训练表现记录" },
  { value: "match",          label: "比赛",     emoji: "🏀", desc: "比赛表现与数据复盘" },
  { value: "period_summary", label: "阶段总结", emoji: "📊", desc: "月度/赛季综合成长总结" },
];

const draftTemplate: Record<PlanType, Record<ReportScene, { summary: string; strengths: string; weaknesses: string; coachComment: string }>> = {
  basic: {
    training:       { summary: "这次训练孩子表现积极，全程保持专注，展现出对篮球的热情。基本动作更加稳定。", strengths: "1. 训练专注度高\n2. 基础运球稳定性提升\n3. 与同伴互动更主动", weaknesses: "1. 投篮姿势仍需纠正\n2. 左手运球稳定性不足", coachComment: "本次训练进步明显，请继续鼓励孩子保持热情！" },
    match:          { summary: "比赛中表现积极，敢于尝试，在对抗下展示了基本技术。", strengths: "1. 比赛积极性高\n2. 基础技术稳定发挥\n3. 团队意识有所提升", weaknesses: "1. 比赛经验仍需积累\n2. 失误后回防需加快", coachComment: "第一次上场表现不错，继续保持！" },
    period_summary: { summary: "本阶段学员整体进步明显，基础技术日趋稳定，训练态度积极。", strengths: "1. 出勤率高，训练习惯良好\n2. 基础技术有明显进步\n3. 团队融合度提升", weaknesses: "1. 专项技术有待提高\n2. 比赛经验需要积累", coachComment: "本阶段表现令人满意，下一阶段继续努力！" },
  },
  vip: {
    training:       { summary: "训练中专项技术得到重点强化，进攻端主动性显著提升，防守端也有积极表现。", strengths: "1. 主动进攻意愿增强\n2. 传球选择更加合理\n3. 防守专注度高", weaknesses: "1. 左手突破终结需加强\n2. 无球跑动习惯尚未形成", coachComment: "专项训练效果明显，下阶段重点强化左手终结。" },
    match:          { summary: "本场比赛进攻端主动性显著提升，有效突破2次，传球助攻1次，防守端积极协防。综合评分相比上次提升约12%。", strengths: "1. 主动进攻意愿明显增强\n2. 传球视野有所拓宽\n3. 防守专注度维持高水平", weaknesses: "1. 左手突破终结需加强\n2. 传球后无球跑动尚未习惯", coachComment: "本场表现稳定，进攻端进步明显。下阶段重点加强左手终结和无球跑位。" },
    period_summary: { summary: "本月在决策速度、团队协作和防守覆盖三个维度均有提升，综合能力指数提升约10%。", strengths: "1. 决策速度提升，高压表现稳定\n2. 团队协作意识增强\n3. 防守覆盖范围扩大", weaknesses: "1. 外线投篮命中率有待提升\n2. 对抗速度型对手时移动效率需改善", coachComment: "本月成长令人印象深刻，下阶段将制定针对外线投篮的专项计划。" },
  },
  supervip: {
    training:       { summary: "高阶专项训练中，学员在对抗强度和战术执行层面均有突破，AI分析显示综合能力指数持续提升。", strengths: "1. 高强度对抗下技术稳定\n2. 战术理解力明显提升\n3. 领导力开始显现", weaknesses: "1. 体能分配需要优化\n2. 特定情境决策仍需打磨", coachComment: "精英班训练表现优秀，继续保持竞争意识！" },
    match:          { summary: "AI分析显示本场综合能力指数较上场提升15.3%，在核心数据维度上处于班级头部水平。", strengths: "1. 决策速度大幅提升\n2. 多次为队友创造得分机会\n3. 防守补位判断果断", weaknesses: "1. 外线投篮命中率有待提升\n2. 面对速度型对手时移动效率需改善", coachComment: "本场表现出色，下阶段将制定针对外线投篮和快速移动的专项计划。" },
    period_summary: { summary: "本月阶段总结显示在决策速度、团队协作和防守覆盖三个维度均有显著提升，综合能力指数较上月提升15.3%，同组头部水平。", strengths: "1. 决策速度大幅提升，高压下稳定\n2. 团队协作意识显著增强\n3. 防守覆盖范围扩大，补位判断果断", weaknesses: "1. 外线投篮命中率有待提升\n2. 面对速度型对手移动效率需改善", coachComment: "本月成长令人印象深刻。下阶段将为其制定外线投篮和快速移动专项计划，目标巩固精英班领先地位。" },
  },
};

function GenerateReportContent() {
  const router = useRouter();
  const [students, setStudents] = useState<DbStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  const [step, setStep] = useState(1);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedType, setSelectedType] = useState<PlanType>("vip");
  const [selectedScene, setSelectedScene] = useState<ReportScene>("match");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState({ summary: "", strengths: "", weaknesses: "", coachComment: "" });
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [published, setPublished] = useState(false);

  useEffect(() => {
    fetch("/api/coach/students")
      .then((r) => r.ok ? r.json() : [])
      .then((data: DbStudent[]) => {
        setStudents(data);
        if (data.length > 0) setSelectedStudentId(data[0].id);
      })
      .finally(() => setLoadingStudents(false));
  }, []);

  function handleGenerate() {
    setGenerating(true);
    setTimeout(() => {
      const t = draftTemplate[selectedType][selectedScene];
      setDraft(t);
      setGenerating(false);
      setStep(3);
    }, 1000);
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishError("");
    const res = await fetch("/api/coach/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: selectedStudentId,
        scene: selectedScene,
        plan: selectedType,
        summary: draft.summary,
        strengths: draft.strengths,
        weaknesses: draft.weaknesses,
        coach_comment: draft.coachComment,
      }),
    });
    setPublishing(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPublishError(body.error ?? "发布失败");
      return;
    }
    setPublished(true);
  }

  if (published) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 px-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-xl font-bold text-gray-800 text-center">报告已发布！</h2>
        <p className="text-sm text-gray-500 text-center">家长可在家长端查看成长报告。</p>
        <div className="flex gap-3 w-full max-w-xs">
          <Link href="/coach/reports" className="flex-1">
            <button className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-gray-700">
              查看报告列表
            </button>
          </Link>
          <button
            onClick={() => { setStep(1); setPublished(false); setDraft({ summary: "", strengths: "", weaknesses: "", coachComment: "" }); }}
            className="flex-1 rounded-xl bg-orange-500 text-white py-2.5 text-sm font-medium"
          >
            再生成一份
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">生成报告</h1>
        <div className="flex items-center gap-2 mt-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"}`}>{s}</div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? "bg-orange-400" : "bg-gray-200"}`} />}
            </div>
          ))}
          <span className="ml-2 text-xs text-gray-500">
            {step === 1 ? "选择学员" : step === 2 ? "选择场景" : "审核发布"}
          </span>
        </div>
      </div>

      {/* Step 1: Student + Type */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-3">选择学员</label>
            {loadingStudents ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
            ) : students.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">还没有学员，<Link href="/coach/students" className="text-orange-500">先添加学员</Link></p>
            ) : (
              <div className="flex flex-col gap-2">
                {students.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedStudentId(s.id); setSelectedType(s.plan); }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${selectedStudentId === s.id ? "border-orange-400 bg-orange-50" : "border-gray-200"}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-orange-400 text-white flex items-center justify-center text-sm font-bold shrink-0">{s.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800">{s.name}</div>
                    </div>
                    <PlanBadge plan={s.plan} size="sm" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-3">报告类型</label>
            <div className="flex gap-2">
              {(["basic","vip","supervip"] as PlanType[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedType(p)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${selectedType === p ? "border-orange-400 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-500"}`}
                >
                  {p === "basic" ? "基础版" : p === "vip" ? "专业版" : "高阶版"}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!selectedStudentId}
            className="w-full rounded-xl bg-orange-500 text-white py-3 font-medium disabled:opacity-40"
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
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${selectedScene === s.value ? "border-orange-400 bg-orange-50" : "border-gray-200"}`}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{s.label}</div>
                    <div className="text-xs text-gray-400">{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-gray-700">← 上一步</button>
            <button onClick={handleGenerate} disabled={generating} className="flex-1 rounded-xl bg-orange-500 text-white py-3 font-medium disabled:opacity-60">
              {generating ? "AI 生成中..." : "✨ 生成AI初稿"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Publish */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          {[
            { key: "summary" as const,      label: "报告摘要",  rows: 4 },
            { key: "strengths" as const,    label: "进步点",    rows: 4 },
            { key: "weaknesses" as const,   label: "改进方向",  rows: 3 },
            { key: "coachComment" as const, label: "教练寄语",  rows: 3 },
          ].map(({ key, label, rows }) => (
            <div key={key} className="rounded-2xl border border-border bg-white p-4">
              <label className="text-sm font-semibold text-gray-700 block mb-2">{label}</label>
              <textarea
                className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:border-orange-400"
                rows={rows}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}

          {publishError && <p className="text-sm text-red-500">{publishError}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-gray-700">← 上一步</button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex-1 rounded-xl bg-orange-500 text-white py-3 font-medium disabled:opacity-60"
            >
              {publishing ? "发布中..." : "确认发布"}
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
