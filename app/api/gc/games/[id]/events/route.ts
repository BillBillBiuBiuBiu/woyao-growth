import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { DbEvent } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("game_events")
    .select("*")
    .eq("game_id", id)
    .order("seq", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const events = await req.json() as Omit<DbEvent, "game_id">[];

  const rows = events.map((e) => ({ ...e, game_id: id }));

  // Delete old events for this game and re-insert (idempotent save)
  await supabase.from("game_events").delete().eq("game_id", id);
  const { error } = await supabase.from("game_events").insert(rows);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: rows.length });
}
