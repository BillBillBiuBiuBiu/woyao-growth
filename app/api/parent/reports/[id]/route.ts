import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = await createSupabaseAdmin();

  // Verify parent is linked to this report's student
  const { data: report } = await admin
    .from("reports")
    .select("*, student:students(name, plan)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: link } = await admin
    .from("parent_student")
    .select("parent_id")
    .eq("parent_id", user.id)
    .eq("student_id", report.student_id)
    .single();

  if (!link) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json(report);
}
