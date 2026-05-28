import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const video = formData.get("video") as File | null;
  const name = ((formData.get("name") as string) || "highlight.mp4").replace(/[^a-z0-9_.\-]/gi, "_");

  if (!video || video.size === 0) {
    return NextResponse.json({ error: "no video file" }, { status: 400 });
  }
  if (video.size > 200 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (max 200MB)" }, { status: 413 });
  }

  const filePath = `highlights/${Date.now()}_${name}`;
  const { error } = await supabase.storage
    .from("clips")
    .upload(filePath, video, {
      contentType: video.type || "video/webm",
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from("clips").getPublicUrl(filePath);
  return NextResponse.json({ url: data.publicUrl });
}
