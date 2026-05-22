"use client";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { mockRadarData, mockGrowthCurve, dimensionColors } from "@/lib/mock-data";

export function GrowthRadar() {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <h2 className="font-semibold text-sm mb-4">📊 六维成长雷达图</h2>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={mockRadarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "#6b7280" }} />
          <Radar
            name="成长指数"
            dataKey="score"
            stroke="#F97316"
            fill="#F97316"
            fillOpacity={0.25}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {mockRadarData.map((d) => (
          <div key={d.dimension} className="flex items-center gap-1.5 text-xs">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: dimensionColors[d.dimension] || "#94a3b8" }}
            />
            <span className="text-muted-foreground">{d.dimension}</span>
            <span className="font-medium ml-auto">{d.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GrowthRadarCompact() {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={mockRadarData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <PolarGrid stroke="#fbd5a8" />
        <PolarAngleAxis dataKey="dimension" tick={false} />
        <Radar
          name="成长指数"
          dataKey="score"
          stroke="#F97316"
          fill="#F97316"
          fillOpacity={0.3}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function GrowthCurve() {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <h2 className="font-semibold text-sm mb-4">📈 近2个月成长趋势</h2>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={mockGrowthCurve} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="week" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={[30, 90]} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="技术成长" stroke="#F97316" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="心理成长" stroke="#EF4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="团队协作" stroke="#10B981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
