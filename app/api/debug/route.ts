import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();

  let inviteResult = null;
  let inviteError = null;
  let adminInviteResult = null;

  if (code) {
    // Try with user client (subject to RLS)
    const { data, error } = await supabase
      .from("student_invites")
      .select("code, student_id, used_at, expires_at, student:students(name)")
      .eq("code", code)
      .single();
    inviteResult = data;
    inviteError = error?.message ?? null;

    // Try with admin client (bypasses RLS)
    const admin = await createSupabaseAdmin();
    const { data: adminData } = await admin
      .from("student_invites")
      .select("code, student_id, used_at, expires_at, student:students(name)")
      .eq("code", code)
      .single();
    adminInviteResult = adminData;
  }

  return NextResponse.json({
    cookieNames: all.map((c) => c.name),
    sessionUserId: session?.user?.id ?? null,
    invite: { result: inviteResult, error: inviteError },
    adminInvite: adminInviteResult,
  });
}
