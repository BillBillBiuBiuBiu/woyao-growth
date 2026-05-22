"use client";
import { mockLeads } from "@/lib/mock-data";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

const typeColors: Record<string, string> = {
  private_training: "bg-orange-100 text-orange-700",
  renewal: "bg-blue-100 text-blue-700",
  care: "bg-slate-100 text-slate-600",
};

const statusColors: Record<string, string> = {
  new: "bg-red-100 text-red-600",
  contacted: "bg-yellow-100 text-yellow-700",
  converted: "bg-green-100 text-green-700",
  dismissed: "bg-slate-100 text-slate-400",
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

export default function LeadsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(mockLeads.map((l) => [l.id, l.status]))
  );
  const [copied, setCopied] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  function updateStatus(id: string, status: string) {
    setStatuses((prev) => ({ ...prev, [id]: status }));
  }

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">转化线索</h1>
        <p className="text-sm text-muted-foreground mt-0.5">PAB球馆 · 5月</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "私教推荐", value: mockLeads.filter((l) => l.type === "private_training").length, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "续费线索", value: mockLeads.filter((l) => l.type === "renewal").length, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "关怀跟进", value: mockLeads.filter((l) => l.type === "care").length, color: "text-slate-600", bg: "bg-slate-50" },
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
              className={`rounded-2xl border border-l-4 border-border bg-white overflow-hidden ${priorityColors[lead.priority]}`}
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
                  <div className="text-xs font-semibold text-muted-foreground mb-2">建议沟通话术</div>
                  <div className="bg-slate-50 rounded-xl p-3 text-sm text-foreground leading-relaxed">
                    {lead.suggestedMessage}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleCopy(lead.id, lead.suggestedMessage)}
                      className="flex-1 text-xs py-2 rounded-lg border border-border bg-white hover:bg-slate-50 transition-colors"
                    >
                      {copied === lead.id ? "✓ 已复制" : "复制话术"}
                    </button>
                    <button
                      onClick={() => updateStatus(lead.id, "contacted")}
                      className={`flex-1 text-xs py-2 rounded-lg transition-colors ${
                        status === "contacted" || status === "converted"
                          ? "bg-green-100 text-green-700 border border-green-200"
                          : "bg-primary text-white hover:bg-primary/90"
                      }`}
                    >
                      {status === "contacted" ? "已标记联系" : status === "converted" ? "已转化 ✓" : "标记已联系"}
                    </button>
                    <button
                      onClick={() => updateStatus(lead.id, "converted")}
                      className="px-3 text-xs py-2 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      转化 ✓
                    </button>
                  </div>
                  {lead.coachConfirmed && (
                    <div className="mt-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5">
                      🏀 王教练已确认推荐
                    </div>
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
