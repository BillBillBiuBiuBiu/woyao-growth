"use client";
import Link from "next/link";

export default function GcSetupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center mb-10">
        <div className="text-3xl font-black mb-1">🏀 现场记录</div>
        <div className="text-gray-400 text-sm">人工打点 · 时间戳同步 · 自动生成集锦</div>
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-[#1a1d27] border border-white/10 p-5 mb-6">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-4">今日对阵</div>
        <div className="flex items-center justify-between">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl">🏀</span>
            </div>
            <div className="font-bold text-orange-400">PAB篮球</div>
            <div className="text-xs text-gray-500 mt-0.5">主场</div>
          </div>
          <div className="text-2xl font-black text-gray-600">VS</div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl">🏀</span>
            </div>
            <div className="font-bold text-blue-400">STB铁骑</div>
            <div className="text-xs text-gray-500 mt-0.5">客场</div>
          </div>
        </div>
        <div className="mt-4 text-xs text-gray-600 text-center">2026-05-25 · PAB球馆</div>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        <Link href="/gc/live">
          <div className="bg-orange-500 text-white text-center font-black text-lg rounded-2xl py-4 active:scale-98 transition-transform">
            🏀 现场实时记录 →
          </div>
        </Link>
        <Link href="/gc/review">
          <div
            className="text-white text-center font-bold text-base rounded-2xl py-3.5 active:scale-98 transition-transform border"
            style={{ background: "rgba(249,115,22,0.12)", borderColor: "rgba(249,115,22,0.35)" }}
          >
            🎬 赛后视频打点 →
          </div>
        </Link>
      </div>

      <div className="mt-5 w-full max-w-sm">
        <div className="text-xs text-gray-700 text-center leading-relaxed">
          <span className="text-orange-500">现场记录</span>：场边实时打点，不需要视频<br />
          <span className="text-orange-400">视频打点</span>：上传比赛视频，边看边标记，自动切片
        </div>
      </div>
    </div>
  );
}
