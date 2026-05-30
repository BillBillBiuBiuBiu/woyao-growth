import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { DbGame } from "@/lib/supabase";

// ── Server-side cache ──────────────────────────────────────────────────────
// The games list rarely changes but Supabase round-trips cost ~1.5-2.4s on the
// hosted tier. Cache the result in module memory so only the first request per
// window pays that cost; every page mount afterwards is instant. POST invalidates.
let _cache: { data: unknown; ts: number } | null = null;
const TTL_MS = 30_000;
const CACHE_HEADER = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" };

export async function GET() {
  if (_cache && Date.now() - _cache.ts < TTL_MS) {
    return NextResponse.json(_cache.data, { headers: CACHE_HEADER });
  }
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    // Serve stale cache on error rather than failing the page
    if (_cache) return NextResponse.json(_cache.data, { headers: CACHE_HEADER });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  _cache = { data, ts: Date.now() };
  return NextResponse.json(data, { headers: CACHE_HEADER });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Omit<DbGame, "created_at">;

  const { data, error } = await supabase
    .from("games")
    .upsert(body, { onConflict: "id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  _cache = null; // invalidate so the new game shows up
  return NextResponse.json(data);
}
