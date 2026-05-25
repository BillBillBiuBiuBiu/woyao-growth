"use client";
import { useState } from "react";

export interface TrackPoint { t: number; x: number; y: number }
export interface TrackedPlayer {
  trackId: number;
  label: string;
  onCourtSeconds: number;
  totalDistanceM: number;
  offenseDistanceM: number;
  defenseDistanceM: number;
  route: TrackPoint[];
  heatmapPoints: { x: number; y: number }[];
}
export interface TrackingData {
  sourceVideo: string;
  durationSeconds: number;
  fps: number;
  frameSize: [number, number];
  playerCount: number;
  players: TrackedPlayer[];
  ballTrajectory: TrackPoint[];
}

const COLORS = [
  "#F97316","#EF4444","#10B981","#3B82F6","#8B5CF6",
  "#F59E0B","#06B6D4","#EC4899","#84CC16","#A78BFA",
  "#F472B4","#34D399",
];

// Full court SVG: 360×192 px (matches 28.65m × 15.24m ratio)
// Scale: ~12.6 px/m
const W = 360, H = 192;
const S = W / 28.65;  // px per meter

function CourtLines() {
  const cy = H / 2;
  // left basket at x=20,cy  right basket at x=340,cy
  const lbx = 20, rbx = W - 20;
  const lftx = lbx + 5.8 * S;   // left free throw line x
  const rftx = rbx - 5.8 * S;   // right free throw line x
  const laneH = 4.9 * S / 2;    // half lane width

  return (
    <g stroke="rgba(255,255,255,0.55)" strokeWidth="1" fill="none">
      {/* Court border */}
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="2" />
      {/* Half court line */}
      <line x1={W / 2} y1="0" x2={W / 2} y2={H} />
      {/* Center circle */}
      <circle cx={W / 2} cy={cy} r={1.8 * S} />

      {/* Left paint (lane) */}
      <rect x={lbx} y={cy - laneH} width={5.8 * S} height={laneH * 2} />
      {/* Left free throw circle */}
      <circle cx={lftx} cy={cy} r={1.8 * S} strokeDasharray="4 3" />
      {/* Left backboard */}
      <line x1={lbx} y1={cy - 10} x2={lbx} y2={cy + 10} strokeWidth="2.5" stroke="white" />
      {/* Left basket */}
      <circle cx={lbx + 4} cy={cy} r={3} stroke="#F97316" strokeWidth="1.5" />
      {/* Left 3pt arc */}
      <path
        d={`M ${lbx} ${cy - 6.75 * S}
            A ${6.75 * S} ${6.75 * S} 0 0 1 ${lbx} ${cy + 6.75 * S}`}
        clipPath="url(#courtClip)"
      />
      {/* Left corner 3pt lines */}
      <line x1={lbx} y1={cy - 6.75 * S} x2={lbx + 3 * S} y2={cy - 6.75 * S} />
      <line x1={lbx} y1={cy + 6.75 * S} x2={lbx + 3 * S} y2={cy + 6.75 * S} />

      {/* Right paint */}
      <rect x={rbx - 5.8 * S} y={cy - laneH} width={5.8 * S} height={laneH * 2} />
      {/* Right free throw circle */}
      <circle cx={rftx} cy={cy} r={1.8 * S} strokeDasharray="4 3" />
      {/* Right backboard */}
      <line x1={rbx} y1={cy - 10} x2={rbx} y2={cy + 10} strokeWidth="2.5" stroke="white" />
      {/* Right basket */}
      <circle cx={rbx - 4} cy={cy} r={3} stroke="#F97316" strokeWidth="1.5" />
      {/* Right 3pt arc */}
      <path
        d={`M ${rbx} ${cy - 6.75 * S}
            A ${6.75 * S} ${6.75 * S} 0 0 0 ${rbx} ${cy + 6.75 * S}`}
        clipPath="url(#courtClip)"
      />
      <line x1={rbx} y1={cy - 6.75 * S} x2={rbx - 3 * S} y2={cy - 6.75 * S} />
      <line x1={rbx} y1={cy + 6.75 * S} x2={rbx - 3 * S} y2={cy + 6.75 * S} />

      {/* Restricted area arcs */}
      <path d={`M ${lbx} ${cy - 1.25 * S} A ${1.25 * S} ${1.25 * S} 0 0 1 ${lbx} ${cy + 1.25 * S}`} strokeOpacity="0.4" />
      <path d={`M ${rbx} ${cy - 1.25 * S} A ${1.25 * S} ${1.25 * S} 0 0 0 ${rbx} ${cy + 1.25 * S}`} strokeOpacity="0.4" />

      <defs>
        <clipPath id="courtClip">
          <rect x="0" y="0" width={W} height={H} />
        </clipPath>
      </defs>
    </g>
  );
}

export default function TrackingViewer({ data }: { data: TrackingData }) {
  const [visible, setVisible] = useState<Set<number>>(
    new Set(data.players.map((p) => p.trackId))
  );
  const [showBall, setShowBall] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const [tab, setTab] = useState<"viz" | "stats">("viz");
  const [selected, setSelected] = useState<number | null>(null);

  function toggle(id: number) {
    setVisible((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function px(norm: number, dim: number) { return norm * dim; }

  const displayPlayers = selected !== null
    ? data.players.filter((p) => p.trackId === selected)
    : data.players.filter((p) => visible.has(p.trackId));

  return (
    <div className="flex flex-col gap-3">
      {/* Tab bar */}
      <div className="flex gap-2 text-sm">
        {(["viz", "stats"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-full font-medium transition-colors ${
              tab === t ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "viz" ? "运动轨迹" : "数据统计"}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-gray-400 self-center">
          {data.durationSeconds}s · {data.playerCount}名球员
        </span>
      </div>

      {tab === "viz" && (
        <>
          {/* Court SVG */}
          <div className="rounded-2xl overflow-hidden border border-gray-700 shadow-lg bg-[#1a5c2a]">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              <CourtLines />

              {/* Heatmap points */}
              {showHeat && displayPlayers.map((p, i) => {
                const color = COLORS[data.players.indexOf(p) % COLORS.length];
                return p.heatmapPoints.map((pt, j) => (
                  <circle
                    key={`h-${p.trackId}-${j}`}
                    cx={px(pt.x, W)}
                    cy={px(pt.y, H)}
                    r={3}
                    fill={color}
                    fillOpacity={0.12}
                  />
                ));
              })}

              {/* Player routes */}
              {displayPlayers.map((p, i) => {
                const color = COLORS[data.players.indexOf(p) % COLORS.length];
                const pts = p.route.map((r) => `${px(r.x, W)},${px(r.y, H)}`).join(" ");
                return (
                  <g key={p.trackId}>
                    <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.85" strokeLinejoin="round" />
                    {/* Start dot */}
                    {p.route[0] && (
                      <circle cx={px(p.route[0].x, W)} cy={px(p.route[0].y, H)} r={3} fill={color} />
                    )}
                    {/* End arrow dot */}
                    {p.route[p.route.length - 1] && (
                      <circle
                        cx={px(p.route[p.route.length - 1].x, W)}
                        cy={px(p.route[p.route.length - 1].y, H)}
                        r={4} fill={color} stroke="white" strokeWidth="1"
                      />
                    )}
                  </g>
                );
              })}

              {/* Ball trajectory */}
              {showBall && (
                <polyline
                  points={data.ballTrajectory.map((b) => `${px(b.x, W)},${px(b.y, H)}`).join(" ")}
                  fill="none"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  strokeOpacity="0.9"
                />
              )}
            </svg>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setShowBall(!showBall)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors ${
                showBall ? "border-white bg-gray-700 text-white" : "border-gray-300 text-gray-500"
              }`}
            >
              <div className="w-4 h-0.5 bg-white opacity-80 rounded border-dashed" style={{ borderTop: "1.5px dashed white" }} />
              球轨迹
            </button>
            <button
              onClick={() => setShowHeat(!showHeat)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors ${
                showHeat ? "border-orange-400 bg-orange-50 text-orange-600" : "border-gray-300 text-gray-500"
              }`}
            >
              🔥 热区
            </button>
            <button
              onClick={() => { setSelected(null); setVisible(new Set(data.players.map((p) => p.trackId))); }}
              className="px-2 py-1 rounded-full text-xs border border-gray-300 text-gray-500 hover:bg-gray-100"
            >
              全选
            </button>
          </div>

          {/* Player toggle chips */}
          <div className="flex flex-wrap gap-1.5">
            {data.players.map((p, i) => {
              const color = COLORS[i % COLORS.length];
              const active = visible.has(p.trackId);
              return (
                <button
                  key={p.trackId}
                  onClick={() => setSelected(selected === p.trackId ? null : p.trackId)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors ${
                    active ? "border-transparent text-white" : "border-gray-200 text-gray-400 bg-gray-50"
                  }`}
                  style={active ? { background: color } : {}}
                >
                  {p.label}
                  <span className="opacity-75">{p.onCourtSeconds}s</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === "stats" && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-orange-50 border-b border-orange-100">
                  <th className="px-3 py-2 text-left font-semibold text-orange-700">球员</th>
                  <th className="px-3 py-2 text-right font-semibold text-orange-700">上场时间</th>
                  <th className="px-3 py-2 text-right font-semibold text-orange-700">总移动</th>
                  <th className="px-3 py-2 text-right font-semibold text-orange-700">进攻距离</th>
                  <th className="px-3 py-2 text-right font-semibold text-orange-700">防守距离</th>
                  <th className="px-3 py-2 text-right font-semibold text-orange-700">进攻占比</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p, i) => {
                  const color = COLORS[i % COLORS.length];
                  const offPct = p.totalDistanceM > 0
                    ? Math.round((p.offenseDistanceM / p.totalDistanceM) * 100)
                    : 0;
                  return (
                    <tr key={p.trackId} className="border-b border-gray-50 hover:bg-orange-50/40 transition-colors">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="font-medium text-gray-800">{p.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{p.onCourtSeconds}s</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">{p.totalDistanceM}m</td>
                      <td className="px-3 py-2 text-right text-blue-600">{p.offenseDistanceM}m</td>
                      <td className="px-3 py-2 text-right text-red-500">{p.defenseDistanceM}m</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-400" style={{ width: `${offPct}%` }} />
                          </div>
                          <span className="text-gray-500 w-7">{offPct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
            <div className="flex gap-4 text-xs text-gray-500">
              <span>视频时长 <strong className="text-gray-700">{data.durationSeconds}s</strong></span>
              <span>检测球员 <strong className="text-gray-700">{data.playerCount}名</strong></span>
              <span>球轨迹点 <strong className="text-gray-700">{data.ballTrajectory.length}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
