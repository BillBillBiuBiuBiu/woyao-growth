"use client";
import { useRole, Role } from "@/lib/store";
import { useRouter } from "next/navigation";

const roles: { value: Role; label: string; emoji: string; href: string }[] = [
  { value: "parent", label: "家长 Bill", emoji: "👨‍👦", href: "/parent" },
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
        className="text-sm border border-border rounded-lg px-2 py-1 bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
