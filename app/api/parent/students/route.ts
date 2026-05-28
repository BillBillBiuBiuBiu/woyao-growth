import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("parent_student")
    .select("student:students(*)")
    .eq("parent_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const students = (data ?? []).map((r) => r.student).filter(Boolean);
  return NextResponse.json(students);
}
