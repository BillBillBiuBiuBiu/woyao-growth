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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
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

/** Returns the current user's profile, or null if not authenticated / no profile yet. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data as Profile | null;
}
