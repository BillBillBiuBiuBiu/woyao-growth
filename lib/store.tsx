"use client";
import { createContext, useContext, useState, ReactNode } from "react";

export type Role = "parent" | "coach" | "org";

interface RoleState {
  role: Role;
  setRole: (r: Role) => void;
}

const RoleContext = createContext<RoleState>({ role: "parent", setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("parent");
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
