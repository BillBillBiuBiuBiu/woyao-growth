"use client";
import { useRole, Role } from "@/lib/store";
import { useRouter } from "next/navigation";

const roles: { value: Role; label: string; emoji: string; href: string }[] = [
  { value: "parent", label: "家长 欣冉", emoji: "👨‍👦", href: "/parent" },
  { value: "coach", label: "王教练", emoji: "🏀", href: "/coach" },
  { value: "org", label: "PAB球馆运营", emoji: "🏢", href: "/org" },
];

export default function RoleSwitcher() {
  const { role, setRole } = useRole();
  const router = useRouter();
  const current = roles.find((r) => r.value === role) || roles[0];

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = roles.find((r) => r.value === e.target.value);
    if (next) {
      setRole(next.value);
      router.push(next.href);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-base">{current.emoji}</span>
      <select
        value={role}
        onChange={handleChange}
        className="text-sm rounded-lg px-2 py-1 text-white border border-white/15 focus:outline-none focus:ring-2 focus:ring-brand/40"
        style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)" }}
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value} style={{ background: "#0F2038", color: "#EDF4FF" }}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
