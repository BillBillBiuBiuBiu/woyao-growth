import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { DbEvent } from "@/lib/supabase";

// Per-game server-side cache (Supabase round-trips are slow; events change only on save)
const _evCache = new Map<string, { data: unknown; ts: number }>();
const EV_TTL_MS = 30_000;
const EV_CACHE_HEADER = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cached = _evCache.get(id);
  if (cached && Date.now() - cached.ts < EV_TTL_MS) {
    return NextResponse.json(cached.data, { headers: EV_CACHE_HEADER });
  }
  const { data, error } = await supabase
    .from("game_events")
    .select("*")
    .eq("game_id", id)
    .order("seq", { ascending: true });

  if (error) {
    if (cached) return NextResponse.json(cached.data, { headers: EV_CACHE_HEADER });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  _evCache.set(id, { data, ts: Date.now() });
  return NextResponse.json(data, { headers: EV_CACHE_HEADER });
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
  _evCache.delete(id); // events re-saved → invalidate
  return NextResponse.json({ ok: true, count: rows.length });
}
