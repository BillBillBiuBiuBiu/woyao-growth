"use client";
import { useRole, Role } from "@/lib/store";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

const roles = [
  {
    value: "parent" as Role,
    icon: "👨‍👦",
    name: "家长 欣冉",
    badge: "家长端",
    description: "查看孩子的成长报告和成长档案",
    href: "/parent",
  },
  {
    value: "coach" as Role,
    icon: "🏀",
    name: "王教练",
    badge: "教练端",
    description: "确认片段标注，发布成长报告",
    href: "/coach",
  },
  {
    value: "org" as Role,
    icon: "🏢",
    name: "PAB球馆管理员",
    badge: "机构端",
    description: "查看运营数据，管理转化线索",
    href: "/org",
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
      ["child_name", "child_plan", "coach_name", "my_highlights"].forEach((k) => localStorage.removeItem(k));
    } catch {}
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(255,212,71,0.2),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(56,189,248,0.16),transparent_34%),linear-gradient(180deg,#101b2d_0%,#07111f_58%,#05070d_100%)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-5 py-8">
        {/* Header */}
        <section className="rounded-[34px] border border-white/15 bg-white/10 p-6 text-center shadow-2xl shadow-black/25 backdrop-blur">
          <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-brand text-3xl text-slate-950">🏀</div>
          <h1 className="mt-5 text-3xl font-black">我耀成长证据系统</h1>
          <p className="mt-2 text-sm leading-7 text-slate-300">让每一次成长，都有证据</p>
          <div className="mt-4 inline-flex items-center rounded-full border border-transparent bg-orange-500 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-white">
            演示模式 · 选择你的角色
          </div>
        </section>

        {/* Role cards */}
        <section className="grid gap-3">
          {roles.map((role) => (
            <button
              key={role.value}
              onClick={() => handleSelect(role)}
              className="group rounded-[26px] border border-white/15 bg-white/10 p-4 text-left shadow-xl shadow-black/15 backdrop-blur transition hover:-translate-y-0.5 hover:border-brand/50 hover:bg-white/15"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-black/20 text-2xl">{role.icon}</div>
                  <div>
                    <p className="text-xl font-black">{role.name}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{role.description}</p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full border border-transparent bg-brand px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-950">
                  {role.badge}
                </span>
              </div>
            </button>
          ))}
        </section>

        <p className="text-center text-xs leading-5 text-slate-500">Demo学员：蒋皓博 · PAB U10提高班 · 教练王教练</p>

        <button
          onClick={handleReset}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 text-sm font-medium text-white transition-colors hover:bg-white/15"
        >
          <RotateCcw className="size-4" />
          重置演示
        </button>

        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-slate-600">AI YOUTH TRAINING PROCESS SERVICE</p>
      </div>
    </main>
  );
}
