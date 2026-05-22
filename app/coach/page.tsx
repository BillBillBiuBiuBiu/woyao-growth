import Link from "next/link";
import { mockPendingReports } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";

const statusMap: Record<string, { label: string; color: string }> = {
  awaiting_review: { label: "待确认", color: "bg-orange-100 text-orange-700" },
  in_review: { label: "确认中", color: "bg-blue-100 text-blue-700" },
  draft: { label: "草稿", color: "bg-slate-100 text-slate-600" },
};

export default function CoachPage() {
  const pending = mockPendingReports.filter((r) => r.status === "awaiting_review");

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">待处理报告</h1>
          <p className="text-sm text-muted-foreground mt-0.5">PAB U10提高班 · 5月24日比赛</p>
        </div>
        <div className="bg-orange-100 text-orange-700 text-sm font-bold px-3 py-1.5 rounded-xl">
          {pending.length} 待确认
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "待确认", value: pending.length, color: "text-orange-600" },
          { label: "已完成", value: 12, color: "text-green-600" },
          { label: "本月报告", value: 18, color: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-white p-3 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pending list */}
      <div>
        <h2 className="text-sm font-semibold mb-3">需要你确认的报告</h2>
        <div className="flex flex-col gap-3">
          {mockPendingReports.map((r) => {
            const s = statusMap[r.status] || statusMap.draft;
            return (
              <Link key={r.id} href={`/coach/annotate/${r.id}`}>
                <div className="rounded-2xl border border-border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{r.student}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{r.date}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {r.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{r.clipCount}个片段</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 leading-snug">{r.aiSummary}</p>
                    </div>
                    <span className="text-xl text-muted-foreground shrink-0 mt-1">›</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
