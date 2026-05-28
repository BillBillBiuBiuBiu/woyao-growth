import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("students")
    .select("*")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as {
    name: string;
    age?: number;
    gender?: string;
    class_name?: string;
    avatar_url?: string;
    plan?: string;
    player_name?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("students")
    .insert({
      coach_id: user.id,
      name: body.name.trim(),
      age: body.age ?? null,
      gender: body.gender ?? null,
      class_name: body.class_name ?? "",
      avatar_url: body.avatar_url ?? null,
      plan: body.plan ?? "basic",
      player_name: body.player_name ?? body.name.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
