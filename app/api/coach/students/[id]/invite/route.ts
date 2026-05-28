import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await params;
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Verify student belongs to this coach
  const { data: student } = await supabase
    .from("students")
    .select("id, name")
    .eq("id", studentId)
    .eq("coach_id", user.id)
    .single();

  if (!student) return NextResponse.json({ error: "student not found" }, { status: 404 });

  const code = generateCode();
  const { error } = await supabase.from("student_invites").insert({
    code,
    student_id: studentId,
    created_by: user.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.json({
    code,
    link: `${baseUrl}/join/${code}`,
    student_name: student.name,
    expires_in: "7天",
  });
}
