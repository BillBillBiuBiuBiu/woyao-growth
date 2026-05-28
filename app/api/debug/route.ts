import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();

  return NextResponse.json({
    cookieNames: all.map((c) => c.name),
    sessionUserId: session?.user?.id ?? null,
  });
}
