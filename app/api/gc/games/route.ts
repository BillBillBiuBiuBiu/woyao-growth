import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { DbGame } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Omit<DbGame, "created_at">;

  const { data, error } = await supabase
    .from("games")
    .upsert(body, { onConflict: "id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
