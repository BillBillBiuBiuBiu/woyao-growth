import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  // Use admin to bypass RLS for public invite lookup
  const admin = await createSupabaseAdmin();
  const { data } = await admin
    .from("student_invites")
    .select("student_id, used_at, expires_at, student:students(name)")
    .eq("code", code)
    .single();

  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (data.used_at) return NextResponse.json({ error: "used" }, { status: 410 });
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: "expired" }, { status: 410 });

  const student = (Array.isArray(data.student) ? data.student[0] : data.student) as { name: string } | null;
  return NextResponse.json({ studentName: student?.name ?? "" });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  // Auth check via server session
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // All DB ops via admin to bypass RLS
  const admin = await createSupabaseAdmin();

  const { data: invite } = await admin
    .from("student_invites")
    .select("student_id, used_at, expires_at")
    .eq("code", code)
    .single();

  if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ error: "used" }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: "expired" }, { status: 410 });

  await admin.from("parent_student").insert({
    parent_id: user.id,
    student_id: invite.student_id,
  });

  await admin
    .from("student_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code);

  return NextResponse.json({ success: true });
}
