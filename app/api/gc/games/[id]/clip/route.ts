import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Per-game server-side cache (Supabase round-trips cost ~1.5-2s; clips rarely change)
const _clipCache = new Map<string, { data: unknown; ts: number }>();
const CLIP_TTL_MS = 30_000;
const CLIP_CACHE_HEADER = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const label = (formData.get("label") as string) || "";

  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

  const ext = file.name.split(".").pop() ?? "mp4";
  const path = `${id}/${Date.now()}.${ext}`;

  const { error: upErr } = await getSupabaseAdmin().storage
    .from("clips")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: urlData } = getSupabaseAdmin().storage.from("clips").getPublicUrl(path);

  const { data, error } = await getSupabaseAdmin()
    .from("game_clips")
    .insert({
      game_id: id,
      file_path: path,
      public_url: urlData.publicUrl,
      size_bytes: file.size,
      label,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  _clipCache.delete(id); // new clip uploaded → invalidate
  return NextResponse.json(data);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cached = _clipCache.get(id);
  if (cached && Date.now() - cached.ts < CLIP_TTL_MS) {
    return NextResponse.json(cached.data, { headers: CLIP_CACHE_HEADER });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("game_clips")
    .select("*")
    .eq("game_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    if (cached) return NextResponse.json(cached.data, { headers: CLIP_CACHE_HEADER });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  _clipCache.set(id, { data, ts: Date.now() });
  return NextResponse.json(data, { headers: CLIP_CACHE_HEADER });
}
