"use client";
import { RoleProvider } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return <RoleProvider>{children}</RoleProvider>;
}
