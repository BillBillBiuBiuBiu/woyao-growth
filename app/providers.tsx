"use client";
import { RoleProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoleProvider>{children}</RoleProvider>
    </AuthProvider>
  );
}
