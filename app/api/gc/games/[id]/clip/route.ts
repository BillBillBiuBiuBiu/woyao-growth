import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

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
  return NextResponse.json(data);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin()
    .from("game_clips")
    .select("*")
    .eq("game_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
