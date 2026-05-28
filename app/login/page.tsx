"use client";
import { useRole, Role } from "@/lib/store";
import { useRouter } from "next/navigation";

const roles = [
  {
    value: "parent" as Role,
    label: "家长 欣冉",
    emoji: "👨‍👦",
    desc: "查看孩子的成长报告和成长档案",
    href: "/parent",
    color: "from-orange-50 to-amber-50 border-orange-200 hover:border-orange-400",
    badge: "bg-orange-100 text-orange-700",
  },
  {
    value: "coach" as Role,
    label: "王教练",
    emoji: "🏀",
    desc: "确认片段标注，发布成长报告",
    href: "/coach",
    color: "from-blue-50 to-sky-50 border-blue-200 hover:border-blue-400",
    badge: "bg-blue-100 text-blue-700",
  },
  {
    value: "org" as Role,
    label: "PAB球馆管理员",
    emoji: "🏢",
    desc: "查看运营数据，管理转化线索",
    href: "/org",
    color: "from-purple-50 to-violet-50 border-purple-200 hover:border-purple-400",
    badge: "bg-purple-100 text-purple-700",
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-5xl mb-3">🏀</div>
          <h1 className="text-2xl font-bold text-foreground">我耀成长证据系统</h1>
          <p className="text-muted-foreground text-sm mt-2">让每一次成长，都有证据</p>
        </div>

        <div className="text-xs text-muted-foreground text-center mb-4 px-2">
          演示模式 · 选择你的角色
        </div>

        <div className="flex flex-col gap-3">
          {roles.map((r) => (
            <button
              key={r.value}
              onClick={() => handleSelect(r)}
              className={`w-full text-left rounded-2xl border-2 bg-gradient-to-br p-4 transition-all duration-200 cursor-pointer ${r.color}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{r.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.badge}`}>
                      {r.value === "parent" ? "家长端" : r.value === "coach" ? "教练端" : "机构端"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                </div>
                <span className="text-muted-foreground">›</span>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Demo学员：蒋皓博 · PAB U10提高班 · 教练王教练
        </p>
        <button
          onClick={() => {
            try {
              ["child_name","child_plan","coach_name","my_highlights","highlight_feedback","tester_badge"].forEach(k => localStorage.removeItem(k));
            } catch {}
            window.location.reload();
          }}
          className="block mx-auto mt-4 text-xs text-muted-foreground opacity-30 hover:opacity-60 transition-opacity"
        >
          重置演示
        </button>
      </div>
    </div>
  );
}
