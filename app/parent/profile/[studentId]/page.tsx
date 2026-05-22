"use client";
import { mockStudent, mockGrowthHistory, mockBadges, mockAssessment } from "@/lib/mock-data";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";

const GrowthRadarDual = dynamic(() => import("@/components/GrowthCharts").then((m) => m.GrowthRadarDual), { ssr: false });
const GrowthCurve = dynamic(() => import("@/components/GrowthCharts").then((m) => m.GrowthCurve), { ssr: false });

const BLUE = "#1565C0";
const DARK_BLUE = "#0D47A1";

const dimensionEmoji: Record<string, string> = {
  "技术成长": "🏀", "战术认知": "🧠", "比赛状态": "⚡",
  "心理成长": "💪", "团队协作": "🤝", "训练习惯": "📅",
};

function ScoreBoxes({ score, max }: { score: number; max: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className="w-5 h-5 border border-blue-800"
          style={{ background: i < score ? BLUE : "white" }}
        />
      ))}
    </div>
  );
}

function HexIcon({ emoji }: { emoji: string }) {
  return (
    <div
      className="w-10 h-10 flex items-center justify-center text-xl shrink-0"
      style={{
        clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
        background: "linear-gradient(160deg, #1976D2, #0D47A1)",
      }}
    >
      {emoji}
    </div>
  );
}

export default function StudentProfilePage() {
  const a = mockAssessment;

  return (
    <div className="-mx-4 -mt-6 pb-10">
      {/* ── REPORT HEADER ───────────────────────────── */}
      <div
        className="relative overflow-hidden px-4 pt-5 pb-4"
        style={{ background: `linear-gradient(135deg, ${DARK_BLUE} 0%, ${BLUE} 100%)` }}
      >
        {/* BASKETBALL watermark */}
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none select-none"
          style={{
            writingMode: "vertical-rl",
            fontSize: 48,
            fontWeight: 900,
            letterSpacing: "0.05em",
            color: "rgba(255,255,255,0.08)",
            fontFamily: "Impact, Arial Black, sans-serif",
            paddingRight: 4,
          }}
        >
          BASKETBALL
        </div>

        {/* Yellow corner tag */}
        <div
          className="absolute top-0 left-0 px-3 py-2"
          style={{ background: "#FFC107", clipPath: "polygon(0 0, 100% 0, 85% 100%, 0 100%)" }}
        >
          <div className="text-xs font-black text-blue-900 leading-tight pr-3">
            <div>{mockStudent.name}</div>
            <div>{mockStudent.age}岁</div>
            <div className="opacity-80 text-xs">{mockStudent.class}</div>
          </div>
        </div>

        {/* Wing logo + Grade */}
        <div className="flex justify-end items-start mb-2 mr-8">
          <div className="text-right">
            <div className="text-yellow-300 text-xs font-bold tracking-widest mb-0.5">BASKETBALL</div>
            <div
              className="font-black leading-none"
              style={{ fontSize: 56, color: "#FFC107", fontFamily: "Impact, Arial Black, sans-serif", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
            >
              {a.levelGrade}
            </div>
            <div className="text-yellow-200 text-xs font-bold tracking-wider">{a.level} 稳定阶段</div>
          </div>
        </div>

        {/* Score row */}
        <div className="flex items-end gap-4 mt-1 pl-20">
          <div>
            <div className="text-blue-200 text-xs mb-0.5">总评分</div>
            <div
              className="font-black leading-none text-white"
              style={{ fontSize: 48, fontFamily: "Impact, Arial Black, sans-serif" }}
            >
              {a.totalScore}
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1 pb-1">
            {[
              ["身高", a.physicals.height],
              ["体重", a.physicals.weight],
              ["臂展", a.physicals.armspan],
              ["手指跨度", a.physicals.fingerSpan],
            ].map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-1">
                <span className="text-blue-200 text-xs">{label}</span>
                <span className="text-white font-bold text-sm">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Report label */}
        <div className="mt-3 text-center">
          <div className="inline-block border border-white/40 text-white/80 text-xs px-4 py-0.5 rounded-full tracking-widest">
            {mockStudent.organization} · 专项技能测评报告 · {a.date}
          </div>
        </div>
      </div>

      {/* ── SKILL ITEMS TABLE ───────────────────────── */}
      <div style={{ background: "#E3F2FD" }} className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="text-white text-xs font-bold px-2.5 py-0.5 rounded"
            style={{ background: BLUE }}
          >
            {a.level} 项目单
          </div>
          <div className="text-xs text-blue-700 font-medium">测评项目得分（0–4分）</div>
        </div>
        <div className="bg-white rounded-xl overflow-hidden border border-blue-100">
          {a.skillItems.map((item, i) => (
            <div
              key={item.name}
              className="flex items-center justify-between px-4 py-2.5 border-b border-blue-50 last:border-none"
              style={{ background: i % 2 === 0 ? "white" : "#F8FBFF" }}
            >
              <span className="text-sm font-medium text-blue-900">{item.name}</span>
              <div className="flex items-center gap-3">
                <ScoreBoxes score={item.score} max={item.max} />
                <span
                  className="text-sm font-black w-4 text-right"
                  style={{ color: item.score > 0 ? BLUE : "#9ca3af" }}
                >
                  {item.score}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RADAR CHART ─────────────────────────────── */}
      <div className="bg-white px-4 py-4 border-t border-b border-blue-100">
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-1 h-5 rounded-full"
            style={{ background: `linear-gradient(to bottom, #FFC107, ${BLUE})` }}
          />
          <span className="text-sm font-bold text-blue-900">个人能力分布</span>
        </div>
        <GrowthRadarDual />
      </div>

      {/* ── DIMENSION DETAIL CARDS ──────────────────── */}
      <div style={{ background: "#E3F2FD" }} className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-1 h-5 rounded-full"
            style={{ background: `linear-gradient(to bottom, #FFC107, ${BLUE})` }}
          />
          <span className="text-sm font-bold text-blue-900">六维能力详情</span>
        </div>
        <div className="flex flex-col gap-2">
          {a.dimensionDetails.map((d, i) => (
            <div
              key={d.dimension}
              className="rounded-xl overflow-hidden border border-blue-100"
            >
              {/* Blue header row */}
              <div
                className="flex items-center gap-3 px-3 py-2"
                style={{ background: i % 2 === 0 ? BLUE : "#1976D2" }}
              >
                <HexIcon emoji={dimensionEmoji[d.dimension] ?? "🏆"} />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm">{d.dimension}</div>
                  <div className="text-blue-100 text-xs">达标成绩：{d.result}</div>
                </div>
                <div className="text-right">
                  <div className="text-yellow-300 text-xs">达标评分</div>
                  <div
                    className="text-white font-black leading-none"
                    style={{ fontSize: 24, fontFamily: "Impact, Arial Black, sans-serif" }}
                  >
                    {d.achieveScore}
                  </div>
                </div>
                <div className="text-right ml-2">
                  <div className="text-yellow-300 text-xs">技能评分</div>
                  <div
                    className="text-white font-black leading-none"
                    style={{ fontSize: 24, fontFamily: "Impact, Arial Black, sans-serif" }}
                  >
                    {d.score}
                  </div>
                </div>
              </div>
              {/* White body */}
              <div className="bg-white px-3 py-2.5">
                <p className="text-xs text-gray-700 leading-relaxed">{d.desc}</p>
                <div className="mt-1.5 flex items-start gap-1.5">
                  <span
                    className="text-xs font-bold shrink-0 mt-0.5"
                    style={{ color: BLUE }}
                  >
                    下阶段目标：
                  </span>
                  <span className="text-xs text-gray-600">{d.next}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── GROWTH CURVE ────────────────────────────── */}
      <div className="px-4 py-3 bg-white border-t border-blue-100">
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-1 h-5 rounded-full"
            style={{ background: `linear-gradient(to bottom, #FFC107, ${BLUE})` }}
          />
          <span className="text-sm font-bold text-blue-900">近2个月成长趋势</span>
        </div>
        <GrowthCurve />
      </div>

      {/* ── BADGES ──────────────────────────────────── */}
      <div style={{ background: "#E3F2FD" }} className="px-4 py-3 border-t border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-1 h-5 rounded-full"
            style={{ background: `linear-gradient(to bottom, #FFC107, ${BLUE})` }}
          />
          <span className="text-sm font-bold text-blue-900">成长勋章</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {mockBadges.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 p-3 rounded-xl bg-white border border-blue-100"
            >
              <span className="text-2xl">{b.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-blue-900 truncate">{b.name}</div>
                <div className="text-xs text-blue-400">{b.awardedAt}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TIMELINE ────────────────────────────────── */}
      <div className="px-4 py-3 bg-white border-t border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-1 h-5 rounded-full"
            style={{ background: `linear-gradient(to bottom, #FFC107, ${BLUE})` }}
          />
          <span className="text-sm font-bold text-blue-900">成长时间线</span>
        </div>
        <div className="flex flex-col gap-2">
          {mockGrowthHistory.map((h) => (
            <Link key={h.id} href={`/parent/reports/${h.id}`}>
              <div
                className="flex gap-3 p-3 rounded-xl border border-blue-100 bg-white hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <div className="flex flex-col items-center pt-1">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: h.type === "match" ? "#F97316" : BLUE }}
                  />
                  <div className="flex-1 w-px mt-1" style={{ background: "#BBDEFB" }} />
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-400">{h.date}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: h.type === "match" ? "#FFF3E0" : "#E3F2FD",
                        color: h.type === "match" ? "#E65100" : BLUE,
                      }}
                    >
                      {h.type === "match" ? "比赛" : "训练"}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-blue-900 mt-0.5 truncate">{h.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-snug">{h.summary}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {h.badge && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: "#FFF8E1", color: "#F57F17" }}
                      >
                        🏆 {h.badge}
                      </span>
                    )}
                    <span className="text-xs text-blue-300">{h.clipCount}个片段</span>
                  </div>
                </div>
                <div className="text-blue-300 text-lg self-center">›</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer branding */}
      <div
        className="mx-4 mt-3 rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: DARK_BLUE }}
      >
        <div className="text-white/60 text-xs">{mockStudent.organization} · 成长证据系统</div>
        <div
          className="text-white/20 font-black text-xs tracking-widest"
          style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
        >
          BASKETBALL
        </div>
      </div>
    </div>
  );
}
