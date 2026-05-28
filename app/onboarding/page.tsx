"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Role = "coach" | "parent";

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!role) { setError("请选择你的身份"); return; }
    if (!name.trim()) { setError("请输入你的名字"); return; }
    setError("");
    setLoading(true);

    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error: err } = await supabase.from("profiles").insert({
      id: user.id,
      role,
      name: name.trim(),
      phone: user.phone ?? "",
    });
    setLoading(false);

    if (err) {
      setError("保存失败，请重试");
      return;
    }

    router.push(role === "coach" ? "/coach" : "/parent");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏀</div>
          <h1 className="text-xl font-bold text-foreground">完善你的信息</h1>
          <p className="text-muted-foreground text-sm mt-1">仅需一步，马上开始</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">你是？</label>
            <div className="grid grid-cols-2 gap-3">
              {(["coach", "parent"] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`py-4 rounded-xl border-2 text-sm font-medium transition-all ${
                    role === r
                      ? "border-orange-400 bg-orange-50 text-orange-700"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  <div className="text-2xl mb-1">{r === "coach" ? "🏀" : "👨‍👦"}</div>
                  {r === "coach" ? "教练" : "家长"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {role === "coach" ? "你的名字（如：王教练）" : "你的名字（如：蒋皓博家长）"}
            </label>
            <input
              type="text"
              placeholder={role === "coach" ? "王教练" : "张先生 / 张女士"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full px-3 py-3 text-sm rounded-xl border border-gray-200 outline-none focus:border-orange-400 transition-colors"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={submit}
            disabled={loading || !role || !name.trim()}
            className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 active:scale-95 transition-all"
          >
            {loading ? "保存中…" : "进入 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
