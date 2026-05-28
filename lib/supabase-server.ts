import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can fail in API routes — reads still work
          }
        },
      },
    }
  );
}

export async function createSupabaseAdmin() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* ignore */ }
        },
      },
      auth: { persistSession: false },
    }
  );
}

export interface Profile {
  id: string;
  role: "coach" | "parent" | "org_admin";
  name: string;
  phone: string;
  created_at: string;
}

export interface Student {
  id: string;
  coach_id: string;
  name: string;
  age: number | null;
  gender: "male" | "female" | "unknown" | null;
  class_name: string;
  avatar_url: string | null;
  plan: "basic" | "vip" | "supervip";
  player_name: string;
  created_at: string;
}

/** Returns the current session user id, or null. Uses getSession (no network call). */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/** Returns the current user's profile, or null. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServer();
  const userId = await getSessionUserId();
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data as Profile | null;
}
