"use client";
import { useRole, Role } from "@/lib/store";
import { useRouter } from "next/navigation";

const roles = [
  {
    value: "parent" as Role,
    label: "家长端",
    desc: "看见孩子每一次上场、每一次尝试、每一次被记录的成长。",
    href: "/parent",
    gradient: "linear-gradient(135deg, #F97316 0%, #fb923c 50%, #f59e0b 100%)",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 shrink-0">
        <path d="M24 41s-17-10.5-17-22a11 11 0 0 1 17-9.17A11 11 0 0 1 41 19c0 11.5-17 22-17 22z" />
        <path d="M16 24c2 2 4 3 8 3s6-1 8-3" />
      </svg>
    ),
  },
  {
    value: "coach" as Role,
    label: "教练端",
    desc: "课后快速生成反馈包，把视频片段变成有温度的家校沟通。",
    href: "/coach",
    gradient: "linear-gradient(135deg, #10b981 0%, #059669 50%, #0d9488 100%)",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 shrink-0">
        <rect x="12" y="6" width="24" height="36" rx="3" />
        <path d="M18 6v-2a2 2 0 0 1 4 0v2" />
        <path d="M26 6v-2a2 2 0 0 1 4 0v2" />
        <path d="M17 24l4 4 10-10" />
      </svg>
    ),
  },
  {
    value: "org" as Role,
    label: "机构端",
    desc: "用每课、每周、每月的服务节奏，让续费和转介绍更自然。",
    href: "/org",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #4f46e5 100%)",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 shrink-0">
        <rect x="6" y="18" width="36" height="24" rx="2" />
        <path d="M16 18V14a8 8 0 0 1 16 0v4" />
        <rect x="18" y="28" width="12" height="8" rx="1" />
        <path d="M12 28h2M34 28h2M12 36h2M34 36h2" />
      </svg>
    ),
  },
];

export default function LoginPage() {
  const { setRole } = useRole();
  const router = useRouter();

  function handleSelect(r: (typeof roles)[0]) {
    setRole(r.value);
    if (r.value === "parent") {
      try {
        if (!localStorage.getItem("child_name")) localStorage.setItem("child_name", "蒋皓博");
        if (!localStorage.getItem("child_plan")) localStorage.setItem("child_plan", "vip");
      } catch {}
    }
    if (r.value === "coach") {
      try {
        if (!localStorage.getItem("coach_name")) localStorage.setItem("coach_name", "王教练");
      } catch {}
    }
    router.push(r.href);
  }

  function handleReset() {
    try {
      ["child_name","child_plan","coach_name","my_highlights"].forEach(k => localStorage.removeItem(k));
    } catch {}
    router.push("/login");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0b0f1a 0%, #111827 60%, #0b0f1a 100%)" }}
    >
      {/* Subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(249,115,22,0.08) 0%, transparent 70%)"
      }} />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">

        {/* Logo */}
        <div className="text-center">
          <h1
            className="font-black text-white leading-none mb-3"
            style={{ fontSize: 72, fontFamily: "Impact, Arial Black, 'PingFang SC', sans-serif", letterSpacing: "-0.02em" }}
          >
            我耀
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            让每一次上场，都被看见。<br />
            <span className="text-gray-500">选择身份，进入你的过程服务工作台。</span>
          </p>
        </div>

        {/* Role cards */}
        <div className="w-full flex flex-col gap-3">
          {roles.map((r) => (
            <button
              key={r.value}
              onClick={() => handleSelect(r)}
              className="w-full rounded-2xl p-5 flex items-center justify-between gap-4 active:scale-98 transition-transform text-left"
              style={{ background: r.gradient }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-2xl font-black text-white mb-1.5">{r.label}</div>
                <div className="text-sm text-white/75 leading-snug">{r.desc}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.icon}
                <span className="text-white/80 text-xl font-light">→</span>
              </div>
            </button>
          ))}
        </div>

        {/* Demo info */}
        <div className="text-center">
          <p className="text-gray-600 text-xs mb-2">
            Demo学员：蒋皓博 · PAB U10提高班 · 教练王教练
          </p>
          <button onClick={handleReset} className="text-xs text-gray-700 active:text-gray-500 transition-colors">
            重置演示
          </button>
        </div>

        {/* Footer */}
        <p className="text-gray-800 text-xs tracking-widest font-medium" style={{ letterSpacing: "0.2em" }}>
          AI YOUTH TRAINING PROCESS SERVICE
        </p>
      </div>
    </div>
  );
}
