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

      <Link href="/gc/live" className="w-full max-w-sm">
        <div className="bg-orange-500 text-white text-center font-black text-lg rounded-2xl py-4 active:scale-98 transition-transform">
          开始记录 →
        </div>
      </Link>

      <p className="mt-6 text-xs text-gray-600 text-center max-w-xs leading-relaxed">
        记录员在场边实时点击 · 视频时间戳自动同步 · 赛后一键生成集锦
      </p>
    </div>
  );
}
