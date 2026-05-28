"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

interface Profile {
  id: string;
  role: "coach" | "parent" | "org_admin";
  name: string;
  phone: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    async function loadProfile(userId: string) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      return data as Profile | null;
    }

    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: Session | null } }) => {
      const profile = session?.user ? await loadProfile(session.user.id) : null;
      setState({ user: session?.user ?? null, session, profile, loading: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      const profile = session?.user ? await loadProfile(session.user.id) : null;
      setState({ user: session?.user ?? null, session, profile, loading: false });
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
