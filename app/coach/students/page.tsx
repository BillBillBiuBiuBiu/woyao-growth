"use client";
import { useState, useEffect, useCallback } from "react";
import PlanBadge from "@/components/PlanBadge";

interface Student {
  id: string;
  name: string;
  age: number | null;
  class_name: string;
  plan: "basic" | "vip" | "supervip";
  player_name: string;
  created_at: string;
}

const avatarColors = [
  "bg-orange-400", "bg-blue-400", "bg-green-400",
  "bg-purple-400", "bg-pink-400", "bg-teal-400",
];

export default function CoachStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [inviteLink, setInviteLink] = useState<{ name: string; link: string } | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/coach/students");
    if (res.ok) setStudents(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const filtered = query.trim()
    ? students.filter((s) => s.name.includes(query.trim()))
    : students;

  async function handleInvite(student: Student) {
    const res = await fetch(`/api/coach/students/${student.id}/invite`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setInviteLink({ name: student.name, link: data.link });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">学员管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {query.trim() ? `找到 ${filtered.length} / ${students.length} 名学员` : `共 ${students.length} 名学员`}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold active:scale-95 transition-all"
        >
          + 添加学员
        </button>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索学员姓名…"
          className="w-full rounded-xl border border-border bg-white pl-8 pr-3 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">✕</button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-white p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : filtered.length === 0 && !query ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🏀</div>
          <p className="text-sm font-medium">还没有学员</p>
          <p className="text-xs mt-1">点右上角「添加学员」开始录入</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">没有找到「{query}」</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((student, idx) => (
            <div key={student.id} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full ${avatarColors[idx % avatarColors.length]} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                  {student.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{student.name}</span>
                    {student.age && <span className="text-xs text-gray-400">{student.age}岁</span>}
                    <PlanBadge plan={student.plan} size="sm" />
                  </div>
                  {student.class_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{student.class_name}</p>
                  )}
                </div>
                <button
                  onClick={() => handleInvite(student)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-medium active:scale-95 transition-all shrink-0"
                >
                  邀请家长
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加学员 Sheet */}
      {showAdd && (
        <AddStudentSheet
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadStudents(); }}
        />
      )}

      {/* 邀请链接弹窗 */}
      {inviteLink && (
        <InviteLinkModal
          name={inviteLink.name}
          link={inviteLink.link}
          onClose={() => setInviteLink(null)}
        />
      )}
    </div>
  );
}

// ── 添加学员表单 ──────────────────────────────────────────────────────────────

function AddStudentSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [className, setClassName] = useState("");
  const [plan, setPlan] = useState<"basic" | "vip" | "supervip">("basic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) { setError("请输入学员姓名"); return; }
    setSaving(true);
    const res = await fetch("/api/coach/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        age: age ? parseInt(age) : null,
        class_name: className.trim(),
        plan,
        player_name: name.trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) { setError("保存失败，请重试"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">添加学员</h2>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="蒋皓博"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-orange-400 transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="10"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-orange-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">班级</label>
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="U10提高班"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-orange-400 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">套餐</label>
          <div className="grid grid-cols-3 gap-2">
            {(["basic", "vip", "supervip"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlan(p)}
                className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                  plan === p ? "border-orange-400 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-500"
                }`}
              >
                {p === "basic" ? "基础版" : p === "vip" ? "专业版" : "高阶版"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 active:scale-95 transition-all"
        >
          {saving ? "保存中…" : "保存学员"}
        </button>
      </div>
    </div>
  );
}

// ── 邀请链接弹窗 ──────────────────────────────────────────────────────────────

function InviteLinkModal({ name, link, onClose }: { name: string; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <div className="text-3xl mb-2">🔗</div>
          <h2 className="text-lg font-bold">{name} 的家长邀请链接</h2>
          <p className="text-xs text-muted-foreground mt-1">家长点链接登录后自动绑定，有效期 7 天</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 break-all select-all">
          {link}
        </div>

        <button
          onClick={copy}
          className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm active:scale-95 transition-all"
        >
          {copied ? "已复制 ✓" : "复制链接"}
        </button>
        <button onClick={onClose} className="w-full py-2 text-sm text-muted-foreground">
          关闭
        </button>
      </div>
    </div>
  );
}
