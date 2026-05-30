"use client";
import { mockLeads } from "@/lib/mock-data";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

const typeColors: Record<string, string> = {
  private_training: "bg-orange-500/15 text-orange-300",
  renewal: "bg-sky-500/15 text-sky-300",
  care: "bg-white/10 text-slate-300",
};

const statusColors: Record<string, string> = {
  new: "bg-red-500/15 text-red-300",
  contacted: "bg-amber-500/15 text-amber-300",
  converted: "bg-green-500/15 text-green-300",
  dismissed: "bg-white/10 text-slate-400",
};

const statusLabels: Record<string, string> = {
  new: "未跟进",
  contacted: "已联系",
  converted: "已转化",
  dismissed: "已忽略",
};

const priorityColors: Record<string, string> = {
  high: "border-l-orange-500",
  medium: "border-l-blue-400",
  low: "border-l-slate-300",
};

const referralTemplates = [
  {
    label: "体验课邀请",
    emoji: "🏀",
    gen: () => `你好！我是PAB篮球班的一位家长，我家孩子在这里训练了3个月，真的感受到了成长。\n\n最近教练给我们发了一份成长报告，里面有孩子的专项数据、教练点评，还有精彩集锦视频，我一下子就看懂了孩子在哪里进步了——太有价值了！\n\n如果你在考虑让孩子学篮球，我很推荐PAB。特别适合0基础到进阶的孩子，目前还有体验课名额。需要我帮你联系一下王教练吗？🙌\n\n——来自「我耀成长」`,
  },
  {
    label: "成长报告分享",
    emoji: "📊",
    gen: () => `分享一下我家孩子最近的篮球成长报告，看了真的很感动～\n\n本赛季打了9场，8胜，教练说在「团队协作」和「比赛心态」上进步明显！还有一段精彩集锦视频，孩子知道自己被记录了特别开心。\n\n如果你家孩子也对篮球感兴趣，可以来PAB试试，用数据记录孩子每一步成长，特别有成就感。\n\n——来自「我耀成长」`,
  },
  {
    label: "家长口碑推荐",
    emoji: "⭐",
    gen: () => `强烈推荐PAB篮球班！\n\n以前我完全不懂孩子在球场上什么情况，现在「我耀成长」会把每场比赛的精彩时刻剪成短视频，还有教练点评和成长数据，让我作为家长真正看懂了孩子的进步。\n\n最让我感动的是教练会用孩子能理解的语言解释每个技术动作——孩子打球更有自信了，也更懂得配合队友了。\n\n名额有限，有兴趣的可以联系我～ 🏀`,
  },
];

export default function LeadsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(mockLeads.map((l) => [l.id, l.status]))
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [refTemplate, setRefTemplate] = useState(0);
  const [refCopied, setRefCopied] = useState(false);

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  function updateStatus(id: string, status: string) {
    setStatuses((prev) => ({ ...prev, [id]: status }));
  }

  function handleCopy(id: string, text: string) {
    function onSuccess() {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
    function onFail() {
      setCopied(`err-${id}`);
      setTimeout(() => setCopied(null), 2500);
    }
    function execFallback() {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand("copy") ? onSuccess() : onFail();
      } catch {
        onFail();
      } finally {
        document.body.removeChild(el);
      }
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(execFallback);
    } else {
      execFallback();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">转化线索</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{`PAB球馆 · ${new Date().getFullYear()}年${new Date().getMonth() + 1}月`}</p>
      </div>

      {/* Referral message generator */}
      <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🤝</span>
          <div className="text-sm font-bold text-orange-800">转介绍文案生成器</div>
          <span className="text-xs bg-orange-500/15 text-orange-300 px-2 py-0.5 rounded-full">一键复制发微信</span>
        </div>
        <div className="flex gap-2 mb-3">
          {referralTemplates.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setRefTemplate(i)}
              className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${refTemplate === i ? "bg-orange-500 text-white border-orange-500" : "bg-white/10 text-gray-300 border-white/15"}`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-white/10 border border-orange-500/20 p-3 text-xs text-gray-200 leading-relaxed whitespace-pre-line mb-3">
          {referralTemplates[refTemplate].gen()}
        </div>
        <button
          onClick={() => {
            const text = referralTemplates[refTemplate].gen();
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(text).then(() => { setRefCopied(true); setTimeout(() => setRefCopied(false), 2000); }).catch(() => {});
            }
          }}
          className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${refCopied ? "bg-green-500 text-white" : "bg-orange-500 text-white active:opacity-80"}`}
        >
          {refCopied ? "✅ 已复制！发给家长吧" : "📋 复制文案"}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "私教推荐", value: mockLeads.filter((l) => l.type === "private_training").length, color: "text-orange-300", bg: "bg-orange-500/10" },
          { label: "续费线索", value: mockLeads.filter((l) => l.type === "renewal").length, color: "text-sky-300", bg: "bg-sky-500/10" },
          { label: "关怀跟进", value: mockLeads.filter((l) => l.type === "care").length, color: "text-slate-300", bg: "bg-white/5" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border border-border ${s.bg} p-3 text-center`}>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Leads list */}
      <div className="flex flex-col gap-3">
        {mockLeads.map((lead) => {
          const status = statuses[lead.id];
          const isExpanded = expanded === lead.id;
          return (
            <div
              key={lead.id}
              className={`rounded-2xl border border-l-4 border-border bg-white/10 overflow-hidden ${priorityColors[lead.priority]}`}
            >
              {/* Summary row */}
              <button
                className="w-full text-left p-4"
                onClick={() => toggleExpand(lead.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{lead.student}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[lead.type]}`}>
                        {lead.typeLabel}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[status]}`}>
                        {statusLabels[status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{lead.reason}</p>
                    <div className="text-xs text-muted-foreground mt-1">关联：{lead.relatedReport}</div>
                  </div>
                  <span className="text-muted-foreground mt-0.5 shrink-0">{isExpanded ? "∧" : "∨"}</span>
                </div>
              </button>

              {/* Expanded */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-muted-foreground">建议沟通话术</div>
                    {(() => {
                      if (lead.priority === "high") return <span className="text-xs bg-red-500/10 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">📞 建议电话</span>;
                      if (lead.type === "renewal") return <span className="text-xs bg-sky-500/10 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full font-medium">💬 建议微信</span>;
                      if (lead.type === "care") return <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-medium">🤝 当面聊聊</span>;
                      return <span className="text-xs bg-white/5 text-slate-400 border border-white/15 px-2 py-0.5 rounded-full font-medium">💬 建议沟通</span>;
                    })()}
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-sm text-foreground leading-relaxed">
                    {lead.suggestedMessage}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleCopy(lead.id, lead.suggestedMessage)}
                      className="flex-1 text-xs py-2 rounded-lg border border-border bg-white/10 hover:bg-white/5 transition-colors"
                    >
                      {copied === lead.id ? "✓ 已复制" : copied === `err-${lead.id}` ? "复制失败，请手动选取" : "复制话术"}
                    </button>
                    <button
                      onClick={() => updateStatus(lead.id, "contacted")}
                      className={`flex-1 text-xs py-2 rounded-lg transition-colors ${
                        status === "contacted" || status === "converted"
                          ? "bg-green-500/15 text-green-300 border border-green-500/30"
                          : "bg-primary text-white hover:bg-primary/90"
                      }`}
                    >
                      {status === "contacted" ? "已标记联系" : status === "converted" ? "已转化 ✓" : "标记已联系"}
                    </button>
                    <button
                      onClick={() => updateStatus(lead.id, "converted")}
                      className="px-3 text-xs py-2 rounded-lg border border-green-300 text-green-300 bg-green-500/15 hover:bg-green-500/15 transition-colors"
                    >
                      转化 ✓
                    </button>
                  </div>
                  {lead.coachConfirmed && (
                    <div className="mt-2 text-xs text-sky-300 bg-sky-500/10 rounded-lg px-3 py-1.5">
                      🏀 教练已确认推荐
                    </div>
                  )}
                  {status !== "dismissed" ? (
                    <button
                      onClick={() => updateStatus(lead.id, "dismissed")}
                      className="mt-2 text-xs text-slate-400 hover:text-slate-300 w-full text-right transition-colors"
                    >
                      忽略此线索
                    </button>
                  ) : (
                    <button
                      onClick={() => updateStatus(lead.id, "new")}
                      className="mt-2 text-xs text-blue-500 hover:text-sky-300 w-full text-right transition-colors"
                    >
                      ↺ 恢复跟进
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
