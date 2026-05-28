import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("reports")
    .select("*, student:students(name, plan)")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as {
    student_id: string;
    scene: string;
    plan: string;
    summary: string;
    strengths: string;
    weaknesses: string;
    coach_comment: string;
    title?: string;
    game_id?: string;
  };

  if (!body.student_id) return NextResponse.json({ error: "student_id required" }, { status: 400 });

  const sceneLabel: Record<string, string> = {
    training: "训练", match: "比赛", period_summary: "阶段总结",
  };
  const { data: student } = await supabase
    .from("students").select("name").eq("id", body.student_id).single();

  const title = body.title ||
    `${student?.name ?? "学员"} ${new Date().toLocaleDateString("zh-CN")}${sceneLabel[body.scene] ?? ""}报告`;

  const { data, error } = await supabase.from("reports").insert({
    coach_id: user.id,
    student_id: body.student_id,
    title,
    scene: body.scene ?? "training",
    plan: body.plan ?? "basic",
    status: "published",
    summary: body.summary ?? "",
    strengths: body.strengths ?? "",
    weaknesses: body.weaknesses ?? "",
    coach_comment: body.coach_comment ?? "",
    game_id: body.game_id ?? null,
    published_at: new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
