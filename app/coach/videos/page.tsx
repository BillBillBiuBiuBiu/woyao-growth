"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { mockVideos } from "@/lib/mock-data";
import type { TrackingData } from "@/components/TrackingViewer";

const TrackingViewer = dynamic(() => import("@/components/TrackingViewer"), { ssr: false });

interface PossessionEvent {
  t: number; player: string; action: string;
  label: string; target?: string;
}
interface Possession {
  id: string; index: number; team: string;
  start: number; end: number; duration: number;
  videoFile: string; thumbFile: string;
  events?: PossessionEvent[];
}
interface PossessionManifest {
  sourceVideo: string; duration: number;
  possessionCount: number; possessions: Possession[];
}
interface PlayerStat {
  label: string; team: string; jerseyNumber: string | null;
  onCourtSeconds: number; totalDistanceM: number;
  offenseDistanceM: number; defenseDistanceM: number;
  holdCount: number; holdSeconds: number;
  passCount: number; receiveCount: number;
  stealCount: number; turnoverCount: number;
  driveCount: number; shotCount: number;
}
interface TeamStat {
  possessionSeconds: number; possessionPct: number;
  passCount: number; stealCount: number;
  driveCount: number; shotCount: number; playerCount: number;
}
interface StatsSummary {
  sourceVideo: string; duration: number;
  teamStats: Record<string, TeamStat>;
  playerStats: PlayerStat[];
}

const typeLabel: Record<string, { label: string; color: string }> = {
  training:  { label: "训练",    color: "bg-blue-100 text-blue-700" },
  match:     { label: "比赛",    color: "bg-orange-100 text-orange-700" },
  highlight: { label: "精彩集锦", color: "bg-purple-100 text-purple-700" },
};

const statusConfig: Record<string, { label: string; dot: string }> = {
  uploaded:   { label: "已上传", dot: "bg-gray-400" },
  processing: { label: "处理中", dot: "bg-yellow-400" },
  analyzed:   { label: "已分析", dot: "bg-green-400" },
  failed:     { label: "失败",   dot: "bg-red-400" },
};

const ANALYZED_VIDEO_IDS = new Set(["vid-001"]);
const TRACKING_DATA_MAP: Record<string, string>   = { "vid-001": "/videos/jhb1_tracking.json" };
const POSSESSION_DATA_MAP: Record<string, string> = { "vid-001": "/videos/jhb1_possessions.json" };
const STATS_DATA_MAP: Record<string, string>      = { "vid-001": "/videos/jhb1_stats.json" };

export default function CoachVideosPage() {
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<Record<string, TrackingData>>({});
  const [possessionData, setPossessionData] = useState<Record<string, PossessionManifest>>({});
  const [statsData, setStatsData] = useState<Record<string, StatsSummary>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, "tracking" | "possessions" | "stats">>({});

  async function handleAnalyze(videoId: string) {
    const jsonPath = TRACKING_DATA_MAP[videoId];
    if (!jsonPath) {
      alert("该视频暂无分析数据，请先用 player_tracker.py 处理视频。");
      return;
    }
    setAnalyzing(videoId);
    try {
      const [trackRes, possRes, statsRes] = await Promise.all([
        fetch(jsonPath),
        fetch(POSSESSION_DATA_MAP[videoId] || ""),
        fetch(STATS_DATA_MAP[videoId] || ""),
      ]);
      const data: TrackingData = await trackRes.json();
      setTrackingData((prev) => ({ ...prev, [videoId]: data }));
      if (possRes.ok) {
        const poss: PossessionManifest = await possRes.json();
        setPossessionData((prev) => ({ ...prev, [videoId]: poss }));
      }
      if (statsRes.ok) {
        const stats: StatsSummary = await statsRes.json();
        setStatsData((prev) => ({ ...prev, [videoId]: stats }));
      }
      setExpanded(videoId);
      setActiveTab((prev) => ({ ...prev, [videoId]: "stats" }));
    } catch {
      alert("加载分析数据失败");
    } finally {
      setAnalyzing(null);
    }
  }

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
          const hasAnalysis = ANALYZED_VIDEO_IDS.has(video.id);
          const isExpanded = expanded === video.id;
          const data = trackingData[video.id];

          return (
            <div key={video.id} className="rounded-2xl border border-border bg-white overflow-hidden">
              {/* Thumbnail */}
              <div className="aspect-video bg-slate-900 relative">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover opacity-80" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white/30 text-4xl">▶</span>
                  </div>
                )}
                <div className="absolute top-2 left-2 flex gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeCfg.color}`}>
                    {typeCfg.label}
                  </span>
                  {hasAnalysis && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                      ✓ 可分析
                    </span>
                  )}
                </div>
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                  {video.duration}分钟
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
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

                <div className="flex gap-2">
                  {/* 视频分析按钮 */}
                  <button
                    onClick={() => isExpanded ? setExpanded(null) : handleAnalyze(video.id)}
                    disabled={analyzing === video.id}
                    className={`flex-1 rounded-xl text-sm font-medium py-2 transition-colors ${
                      hasAnalysis
                        ? isExpanded
                          ? "bg-green-500 text-white hover:bg-green-600"
                          : "border border-green-500 text-green-700 hover:bg-green-50"
                        : "border border-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {analyzing === video.id ? "加载中..." : isExpanded ? "▲ 收起分析" : "📊 视频分析"}
                  </button>
                  <Link href={`/coach/reports/generate?videoId=${video.id}`} className="flex-1">
                    <button className="w-full rounded-xl border border-orange-200 text-orange-600 text-sm font-medium py-2 hover:bg-orange-50 transition-colors">
                      生成报告
                    </button>
                  </Link>
                </div>
              </div>

              {/* 分析结果展开区 */}
              {isExpanded && data && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-4 bg-gray-50">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-4 rounded-full bg-green-500" />
                    <span className="text-sm font-semibold text-gray-800">真实视频分析结果</span>
                    <span className="text-xs text-gray-400 ml-1">YOLOv8 + 光流追踪 · {data.sourceVideo}</span>
                  </div>

                  {/* 子tab */}
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {(["stats", "tracking", "possessions"] as const).map((t) => (
                      <button key={t} onClick={() => setActiveTab((prev) => ({ ...prev, [video.id]: t }))}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          (activeTab[video.id] || "stats") === t
                            ? "bg-green-500 text-white" : "bg-white border border-gray-200 text-gray-600"
                        }`}>
                        {t === "stats" ? "📈 技术统计" : t === "tracking" ? "🗺️ 运动轨迹" : "⚡ 回合切片"}
                        {t === "possessions" && possessionData[video.id] &&
                          <span className="ml-1 opacity-75">({possessionData[video.id].possessionCount})</span>}
                      </button>
                    ))}
                  </div>

                  {/* 技术统计 tab */}
                  {(activeTab[video.id] || "stats") === "stats" && statsData[video.id] && (() => {
                    const s = statsData[video.id];
                    const statCols = [
                      { key: "holdCount",      label: "持球次" },
                      { key: "holdSeconds",    label: "持球秒" },
                      { key: "passCount",      label: "传球" },
                      { key: "receiveCount",   label: "接球" },
                      { key: "stealCount",     label: "抢断" },
                      { key: "turnoverCount",  label: "失误" },
                      { key: "driveCount",     label: "突破" },
                      { key: "shotCount",      label: "投篮" },
                      { key: "totalDistanceM", label: "移动(m)" },
                      { key: "offenseDistanceM",label:"进攻(m)" },
                      { key: "defenseDistanceM",label:"防守(m)" },
                    ];
                    return (
                      <div className="flex flex-col gap-3">
                        {/* 队伍汇总 */}
                        <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600">队伍对比</div>
                          <div className="grid grid-cols-2 divide-x divide-gray-100">
                            {Object.entries(s.teamStats).map(([team, ts]) => (
                              <div key={team} className="p-3">
                                <div className={`text-sm font-bold mb-2 ${team === "红队" ? "text-red-600" : "text-gray-700"}`}>{team}</div>
                                <div className="flex flex-col gap-1 text-xs">
                                  <div className="flex justify-between"><span className="text-gray-500">球权时间</span><span className="font-semibold">{ts.possessionSeconds}s</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">球权占比</span><span className="font-semibold">{ts.possessionPct}%</span></div>
                                  {/* 占比条 */}
                                  <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                                    <div className={`h-full rounded-full ${team==="红队"?"bg-red-400":"bg-gray-600"}`} style={{width:`${ts.possessionPct}%`}}/>
                                  </div>
                                  <div className="flex justify-between mt-1"><span className="text-gray-500">传球</span><span className="font-semibold">{ts.passCount}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">抢断</span><span className="font-semibold">{ts.stealCount}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">突破</span><span className="font-semibold">{ts.driveCount}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">投篮</span><span className="font-semibold">{ts.shotCount}</span></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 球员详细统计 */}
                        <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600">球员统计</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs min-w-[600px]">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-white">球员</th>
                                  {statCols.map(c => (
                                    <th key={c.key} className="px-2 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">{c.label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {s.playerStats.map((ps, i) => (
                                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="px-3 py-2 sticky left-0 bg-white">
                                      <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${ps.team==="红队"?"bg-red-400":"bg-gray-600"}`}/>
                                        <span className="font-medium text-gray-800 whitespace-nowrap">{ps.label}</span>
                                      </div>
                                    </td>
                                    {statCols.map(c => {
                                      const val = (ps as unknown as Record<string,number>)[c.key];
                                      const isZero = val === 0;
                                      return (
                                        <td key={c.key} className={`px-2 py-2 text-right font-mono ${isZero?"text-gray-300":"text-gray-800 font-semibold"}`}>
                                          {c.key==="holdSeconds" ? `${val}s` : c.key.includes("Distance") ? `${val}` : val}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {(activeTab[video.id] || "stats") === "tracking" && <TrackingViewer data={data} />}

                  {(activeTab[video.id] || "stats") === "possessions" && (
                    <div className="flex flex-col gap-2">
                      {possessionData[video.id] ? (
                        possessionData[video.id].possessions.map((p) => (
                          <div key={p.id} className="rounded-xl bg-white border border-gray-100 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center gap-3 p-3">
                              <div className={`w-1.5 self-stretch rounded-full ${p.team === "红队" ? "bg-red-400" : "bg-gray-700"}`} />
                              <div className="w-16 h-10 rounded-lg bg-slate-800 overflow-hidden shrink-0">
                                <img src={`/videos/${p.thumbFile}`} alt={p.id}
                                  className="w-full h-full object-cover opacity-80"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    p.team === "红队" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                                  }`}>{p.team}</span>
                                  <span className="text-xs text-gray-400">回合 {p.index} · {p.duration.toFixed(1)}s</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">{p.start.toFixed(1)}s – {p.end.toFixed(1)}s</div>
                              </div>
                              <a href={`/videos/${p.videoFile}`} target="_blank" rel="noopener"
                                className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 shrink-0">
                                ▶ 播放
                              </a>
                            </div>

                            {/* Events timeline */}
                            {p.events && p.events.length > 0 && (
                              <div className="px-3 pb-3 border-t border-gray-50 pt-2">
                                <div className="text-xs text-gray-400 mb-1.5 font-medium">关键动作</div>
                                <div className="flex flex-col gap-1">
                                  {p.events.map((ev, ei) => {
                                    const cfg: Record<string, {icon:string; color:string}> = {
                                      hold:   { icon:"🏀", color:"bg-orange-50 text-orange-700 border-orange-100" },
                                      pass:   { icon:"➡️", color:"bg-blue-50 text-blue-700 border-blue-100" },
                                      steal:  { icon:"✋", color:"bg-red-50 text-red-700 border-red-100" },
                                      drive:  { icon:"⚡", color:"bg-yellow-50 text-yellow-700 border-yellow-100" },
                                      shot:   { icon:"🎯", color:"bg-green-50 text-green-700 border-green-100" },
                                      receive:{ icon:"👐", color:"bg-purple-50 text-purple-700 border-purple-100" },
                                    };
                                    const c = cfg[ev.action] || cfg.hold;
                                    return (
                                      <div key={ei} className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-xs ${c.color}`}>
                                        <span className="shrink-0 w-8 text-gray-400 font-mono">{ev.t.toFixed(1)}s</span>
                                        <span>{c.icon}</span>
                                        <span className="font-medium">{ev.label}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-400 text-center py-4">暂无回合数据</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 说明 */}
      <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 p-4">
        <div className="text-sm font-medium text-orange-700 mb-1">关于视频分析</div>
        <div className="text-xs text-orange-600 leading-relaxed">
          视频分析使用 YOLOv8 人体检测 + ByteTrack 多目标跟踪算法，可提取球员移动轨迹、移动距离（进攻/防守）、上场时间及球的运动轨迹。
          新视频分析请在本地运行：<code className="bg-white px-1 rounded">python3 player_tracker.py &lt;视频路径&gt; &lt;输出目录&gt;</code>
        </div>
      </div>
    </div>
  );
}
