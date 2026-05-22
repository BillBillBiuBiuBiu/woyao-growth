"use client";
import Link from "next/link";
import { useRole } from "@/lib/store";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import RoleSwitcher from "./RoleSwitcher";

const navItems = {
  parent: [
    { href: "/parent", label: "首页" },
    { href: "/parent/reports/rpt-001", label: "成长报告" },
    { href: "/parent/profile/stu-001", label: "成长档案" },
  ],
  coach: [
    { href: "/coach", label: "待处理" },
    { href: "/coach/annotate/sess-001", label: "标注工作台" },
  ],
  org: [
    { href: "/org", label: "运营看板" },
    { href: "/org/leads", label: "转化线索" },
  ],
};

function detectRole(path: string) {
  if (path.startsWith("/coach")) return "coach" as const;
  if (path.startsWith("/org")) return "org" as const;
  return "parent" as const;
}

export default function NavBar() {
  const { role, setRole } = useRole();
  const pathname = usePathname();

  useEffect(() => {
    const detected = detectRole(pathname);
    if (detected !== role) setRole(detected);
  }, [pathname]);

  const items = navItems[role] || [];

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-primary text-lg">🏀 我耀</Link>
          <nav className="hidden sm:flex items-center gap-4">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition-colors ${
                  pathname === item.href
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <RoleSwitcher />
      </div>
    </header>
  );
}
