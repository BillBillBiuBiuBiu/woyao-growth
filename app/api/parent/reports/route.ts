import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Get student IDs linked to this parent (use admin to bypass RLS cycle)
  const admin = await createSupabaseAdmin();
  const { data: links } = await admin
    .from("parent_student")
    .select("student_id")
    .eq("parent_id", user.id);

  if (!links || links.length === 0) return NextResponse.json([]);

  const studentIds = links.map((l) => l.student_id);

  const { data, error } = await admin
    .from("reports")
    .select("id, title, scene, plan, status, summary, created_at, published_at, student:students(name)")
    .in("student_id", studentIds)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
