"use client";
import Link from "next/link";
import { mockVideos } from "@/lib/mock-data";

const typeLabel: Record<string, { label: string; color: string }> = {
  training:  { label: "训练",   color: "bg-blue-100 text-blue-700" },
  match:     { label: "比赛",   color: "bg-orange-100 text-orange-700" },
  highlight: { label: "精彩集锦", color: "bg-purple-100 text-purple-700" },
};

const statusConfig: Record<string, { label: string; dot: string }> = {
  uploaded:   { label: "已上传",   dot: "bg-gray-400" },
  processing: { label: "处理中",   dot: "bg-yellow-400" },
  analyzed:   { label: "已分析",   dot: "bg-green-400" },
  failed:     { label: "失败",     dot: "bg-red-400" },
};

function formatDuration(min: number) {
  return `${min}分钟`;
}

export default function CoachVideosPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">视频管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">共 {mockVideos.length} 个视频</p>
        </div>
        <button className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-orange-600 transition-colors">
          + 上传视频
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {mockVideos.map((video) => {
          const typeCfg = typeLabel[video.type] || typeLabel.training;
          const statusCfg = statusConfig[video.status] || statusConfig.uploaded;

          return (
            <div key={video.id} className="rounded-2xl border border-border bg-white overflow-hidden">
              {/* Thumbnail */}
              <div className="aspect-video bg-slate-900 relative">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover opacity-80"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white/30 text-4xl">▶</span>
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeCfg.color}`}>
                    {typeCfg.label}
                  </span>
                </div>
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                  {formatDuration(video.duration)}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 truncate mb-1">{video.title}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                        <span>{statusCfg.label}</span>
                      </div>
                      <span>关联 {video.studentIds.length} 名学员</span>
                      <span>{video.createdAt}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <Link href={`/coach/reports/generate?videoId=${video.id}`}>
                    <button className="w-full rounded-xl border border-orange-200 text-orange-600 text-sm font-medium py-2 hover:bg-orange-50 transition-colors">
                      生成报告
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
