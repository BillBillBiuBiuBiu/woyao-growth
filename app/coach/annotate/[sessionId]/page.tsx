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

const tagPhrases: Record<string, string> = {
  "敢于出手": "在有机会时鼓起勇气出手投篮",
  "敢于突破": "在对抗中主动选择突破，没有退缩",
  "失败后再尝试": "投失之后没有沮丧，继续寻找机会",
  "被防住后继续参与": "被防守盯死后仍然积极跑位继续参与",
  "从犹豫到主动": "从以前等待变成了主动要求参与",
  "快速回防": "进攻结束后第一时间转身回防",
  "主动要球": "在好位置时主动要球，不被动等待",
  "关键回合参与": "在比赛关键时刻主动参与、不回避",
  "对抗下处理球": "在身体对抗中稳定地处理球",
  "失误后继续参与": "出现失误后没有消极，马上振作投入",
  "主动传球": "被紧盯时主动把球传给更好位置的队友",
  "帮助防守": "队友被突破时主动补上来防守",
  "为队友创造机会": "主动跑动拉开空间、为队友创造机会",
  "传球后继续移动": "传完球没有停下来看，继续跑位找机会",
  "场上沟通": "在场上主动跟队友沟通，提示位置和战术",
  "投篮姿势改善": "投篮姿势比上次有明显进步",
  "运球稳定": "运球时更加稳健，不容易丢球",
  "防守脚步": "防守移动脚步更灵活，贴防位置更准",
  "空切": "抓住防守漏洞完成了一次漂亮的空切",
  "拉开空间": "主动跑到边角拉开空间，帮助团队进攻",
};

const levelTemplate: Record<string, [string, string]> = {
  "L1": ["今天有一个值得记录的时刻——", "这是很珍贵的开始，说明孩子正在突破自己。"],
  "L2": ["这场比赛里我们看到了稳定的进步——", "这个习惯越来越自然了，我们会继续巩固。"],
  "L3": ["今天孩子不只是做到了，更是「懂了」——", "说明孩子已理解背后的原因，这是质的提升。"],
  "L4": ["无论面对什么情况，孩子都能做到——", "好习惯已经成为本能，这是最让人骄傲的成长。"],
};

function genWarmComment(tag: string, level: string): string {
  const behavior = tagPhrases[tag] || `做到了「${tag}」`;
  const [opening, closing] = levelTemplate[level] || levelTemplate["L2"];
  return `${opening}孩子${behavior}。${closing}`;
}

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
    timerRef.current = setTimeout(() => router.push("/coach/reports"), 1500);
  }

  if (published) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-5xl">✅</div>
        <div className="text-xl font-bold text-green-400">报告已发布！</div>
        <div className="text-sm text-muted-foreground">家长将收到通知，正在返回...</div>
        <button
          onClick={() => { if (timerRef.current) clearTimeout(timerRef.current); setPublished(false); }}
          className="text-sm text-muted-foreground underline underline-offset-2"
        >
          撤销发布
        </button>
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
                : "bg-white/10 border border-border text-muted-foreground hover:text-foreground"
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
      <div className="rounded-2xl border border-border bg-white/10 p-4">
        <div className="text-sm font-semibold mb-3">成长标签</div>
        <div className="flex flex-col gap-3">
          {Object.entries(growthTags).map(([dim, tags]) => (
            <div key={dim}>
              <div className="text-xs text-muted-foreground mb-1.5">{dim}</div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      const patch: Partial<typeof ann> = { tag, dimension: dim };
                      if (ann.level) patch.parentComment = genWarmComment(tag, ann.level);
                      updateAnn(patch);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      ann.tag === tag && ann.dimension === dim
                        ? "bg-primary text-white border-primary"
                        : "bg-white/10 border-border text-muted-foreground hover:border-primary/40"
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
      <div className="rounded-2xl border border-border bg-white/10 p-4">
        <div className="text-sm font-semibold mb-3">成长等级</div>
        <div className="grid grid-cols-2 gap-2">
          {levels.map((l) => (
            <button
              key={l.value}
              onClick={() => {
                const patch: Partial<typeof ann> = { level: l.value };
                if (ann.tag) patch.parentComment = genWarmComment(ann.tag, l.value);
                updateAnn(patch);
              }}
              className={`rounded-xl border p-3 text-left transition-colors ${
                ann.level === l.value
                  ? "border-primary bg-orange-500/10"
                  : "border-border bg-white/10 hover:border-primary/40"
              }`}
            >
              <div className={`text-sm font-medium ${ann.level === l.value ? "text-primary" : ""}`}>{l.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Coach comment */}
      <div className="rounded-2xl border border-border bg-white/10 p-4">
        <div className="text-sm font-semibold mb-2">教练专业点评</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {[
            "训练动作已见雏形，继续强化细节",
            "本场表现超出预期，建议加练这个方向",
            "技术稳定，下阶段提升对抗中的应用",
            "心理层面有突破，保持这个状态",
          ].map((t) => (
            <button
              key={t}
              onClick={() => updateAnn({ coachComment: ann.coachComment ? `${ann.coachComment}${t}` : t })}
              className="text-xs text-slate-400 border border-dashed border-gray-300 px-2 py-0.5 rounded-full hover:border-primary/50 hover:text-primary transition-colors"
            >
              + {t}
            </button>
          ))}
        </div>
        <textarea
          value={ann.coachComment}
          onChange={(e) => updateAnn({ coachComment: e.target.value })}
          rows={3}
          className="w-full text-sm border border-border rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Parent-friendly comment */}
      <div className="rounded-2xl border border-border bg-white/10 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">家长版表达</div>
          <div className="flex items-center gap-2">
            {ann.tag && ann.level && (
              <button
                onClick={() => updateAnn({ parentComment: genWarmComment(ann.tag, ann.level) })}
                className="text-xs bg-orange-500/10 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full font-medium active:opacity-70"
              >
                ✨ 一键生成
              </button>
            )}
            <Badge variant="secondary" className="text-xs bg-sky-500/10 text-sky-300">AI生成</Badge>
          </div>
        </div>
        <textarea
          value={ann.parentComment}
          onChange={(e) => updateAnn({ parentComment: e.target.value })}
          rows={3}
          className="w-full text-sm border border-border rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveClip((i) => Math.max(i - 1, 0))}
            disabled={activeClip === 0}
            className="flex-1 rounded-xl border border-border bg-white/10 py-3 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            ← 上一片段
          </button>
          <button
            onClick={() => setActiveClip((i) => Math.min(i + 1, mockReport.clips.length - 1))}
            disabled={activeClip === mockReport.clips.length - 1}
            className="flex-1 rounded-xl border border-border bg-white/10 py-3 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            下一片段 →
          </button>
        </div>
        <button
          onClick={handlePublish}
          className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          发布报告
        </button>
      </div>
    </div>
  );
}
