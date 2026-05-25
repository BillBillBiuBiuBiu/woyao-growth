"use client";
import { mockReport } from "@/lib/mock-data";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";

const growthTags = {
  "心理成长": ["敢于出手", "敢于突破", "失败后再尝试", "被防住后继续参与", "从犹豫到主动"],
  "比赛状态": ["快速回防", "主动要球", "关键回合参与", "对抗下处理球", "失误后继续参与"],
  "团队协作": ["主动传球", "帮助防守", "为队友创造机会", "传球后继续移动", "场上沟通"],
  "技术成长": ["投篮姿势改善", "运球稳定", "防守脚步", "空切", "拉开空间"],
};

const levels = [
  { value: "L1", label: "L1 参与", desc: "开始出现该行为" },
  { value: "L2", label: "L2 稳定", desc: "能较稳定完成" },
  { value: "L3", label: "L3 理解", desc: "理解行为背后的原因" },
  { value: "L4", label: "L4 迁移", desc: "不同场景都能运用" },
];

export default function AnnotatePage() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeClip, setActiveClip] = useState(0);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const [annotations, setAnnotations] = useState(
    mockReport.clips.map((c) => ({
      tag: c.tag,
      dimension: c.dimension,
      level: c.level,
      coachComment: c.coachComment,
      parentComment: c.parentExplanation,
      featured: true,
    }))
  );
  const [published, setPublished] = useState(false);

  const clip = mockReport.clips[activeClip];
  const ann = annotations[activeClip];

  function updateAnn(patch: Partial<typeof ann>) {
    setAnnotations((prev) => prev.map((a, i) => (i === activeClip ? { ...a, ...patch } : a)));
  }

  function handlePublish() {
    setPublished(true);
    timerRef.current = setTimeout(() => router.push("/coach"), 1500);
  }

  if (published) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-5xl">✅</div>
        <div className="text-xl font-bold text-green-600">报告已发布！</div>
        <div className="text-sm text-muted-foreground">家长将收到通知，正在返回...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">标注工作台</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{mockReport.title}</p>
      </div>

      {/* Clip tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {mockReport.clips.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setActiveClip(i)}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              i === activeClip
                ? "bg-primary text-white"
                : "bg-white border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            片段 {i + 1}：{c.title}
          </button>
        ))}
      </div>

      {/* Video */}
      <div className="rounded-2xl overflow-hidden bg-black">
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
            <span className="text-white/40 text-sm">暂无视频</span>
          </div>
        )}
      </div>

      {/* Dimension + Tag */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="text-sm font-semibold mb-3">成长标签</div>
        <div className="flex flex-col gap-3">
          {Object.entries(growthTags).map(([dim, tags]) => (
            <div key={dim}>
              <div className="text-xs text-muted-foreground mb-1.5">{dim}</div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => updateAnn({ tag, dimension: dim })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      ann.tag === tag && ann.dimension === dim
                        ? "bg-primary text-white border-primary"
                        : "bg-white border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Level */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="text-sm font-semibold mb-3">成长等级</div>
        <div className="grid grid-cols-2 gap-2">
          {levels.map((l) => (
            <button
              key={l.value}
              onClick={() => updateAnn({ level: l.value })}
              className={`rounded-xl border p-3 text-left transition-colors ${
                ann.level === l.value
                  ? "border-primary bg-orange-50"
                  : "border-border bg-white hover:border-primary/40"
              }`}
            >
              <div className={`text-sm font-medium ${ann.level === l.value ? "text-primary" : ""}`}>{l.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Coach comment */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="text-sm font-semibold mb-2">教练专业点评</div>
        <textarea
          value={ann.coachComment}
          onChange={(e) => updateAnn({ coachComment: e.target.value })}
          rows={3}
          className="w-full text-sm border border-border rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Parent-friendly comment */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">家长版表达</div>
          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-600">AI生成</Badge>
        </div>
        <textarea
          value={ann.parentComment}
          onChange={(e) => updateAnn({ parentComment: e.target.value })}
          rows={3}
          className="w-full text-sm border border-border rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pb-6">
        <button
          onClick={() => setActiveClip((i) => Math.min(i + 1, mockReport.clips.length - 1))}
          className="flex-1 rounded-xl border border-border bg-white py-3 text-sm font-medium hover:bg-slate-50 transition-colors"
          disabled={activeClip === mockReport.clips.length - 1}
        >
          下一片段 →
        </button>
        <button
          onClick={handlePublish}
          className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          发布报告
        </button>
      </div>
    </div>
  );
}
