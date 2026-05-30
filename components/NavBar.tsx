"use client";
import Link from "next/link";
import { useRole } from "@/lib/store";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import RoleSwitcher from "./RoleSwitcher";
import { mockStudent } from "@/lib/mock-data";

const navItems = {
  parent: [
    { href: "/parent", label: "首页" },
    { href: "/parent/reports", label: "报告" },
    { href: `/parent/profile/${mockStudent.id}`, label: "成长档案" },
    { href: "/parent/plans", label: "版本权益" },
  ],
  coach: [
    { href: "/coach", label: "工作台" },
    { href: "/coach/students", label: "学员" },
    { href: "/coach/videos", label: "视频" },
    { href: "/coach/reports", label: "报告" },
    { href: "/coach/plans", label: "套餐" },
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

  const tabIcons: Record<string, string> = {
    "首页": "🏠", "报告": "📋", "成长档案": "📈", "版本权益": "⭐",
    "工作台": "🏋️", "学员": "👥", "视频": "📹", "套餐": "💎",
    "运营看板": "📊", "转化线索": "🎯",
  };

  // Longest-prefix match: find the most specific tab whose href is a prefix of the current path
  const bestMatchHref = items
    .filter(i => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "";

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10" style={{ background: "rgba(15,32,56,0.75)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold text-primary text-lg">🏀 我耀</Link>
            <nav className="hidden sm:flex items-center gap-4">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm transition-colors ${
                    item.href === bestMatchHref
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

      {/* Mobile bottom tab bar — only on small screens */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/10" style={{ background: "rgba(15,32,56,0.9)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-stretch">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors ${
                item.href === bestMatchHref ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <span className="text-lg leading-none">{tabIcons[item.label] ?? "•"}</span>
              <span className="font-medium leading-none">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
