import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createJob, updateJob } from "@/lib/encode-jobs";
import { randomUUID } from "crypto";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execAsync = promisify(exec);

// Force Node.js runtime — Edge runtime has no child_process / fs
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set on server" }, { status: 500 });
  }

  // IMPORTANT: read body BEFORE returning the response.
  // After NextResponse is sent, req.body may be closed.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    return NextResponse.json({ error: `Failed to parse upload: ${(e as Error).message}` }, { status: 400 });
  }

  // Basic validation
  const hasVideo = formData.has("video_0") || formData.has("video");
  if (!hasVideo) {
    return NextResponse.json({ error: "No video file found in request" }, { status: 400 });
  }

  const jobId = randomUUID();
  createJob(jobId);

  // Fire-and-forget: formData is already in memory, safe to use after response
  processVideo(formData, jobId).catch(err => {
    updateJob(jobId, { status: "error", error: err.message || "处理失败", stage: "出错" });
  });

  return NextResponse.json({ jobId });
}

async function processVideo(formData: FormData, jobId: string): Promise<void> {
  const paths: string[] = [];

  try {
    updateJob(jobId, { status: "uploading", progress: 5, stage: "解析文件…" });

    const name = ((formData.get("name") as string) || "highlight.mp4")
      .replace(/[^a-z0-9._\-]/gi, "_");
    const bgm = formData.get("bgm") === "true";

    // Collect video files + clip windows
    interface Segment { file: File; start: number; end: number }
    const segments: Segment[] = [];

    // Support both video_0/video_1... and legacy single "video" field
    let idx = 0;
    while (true) {
      const f = (formData.get(`video_${idx}`) ?? (idx === 0 ? formData.get("video") : null)) as File | null;
      if (!f) break;
      const s = parseFloat((formData.get(`start_${idx}`) as string) || "0");
      const e = parseFloat((formData.get(`end_${idx}`) as string) || String(s + 15));
      segments.push({ file: f, start: Math.max(0, s), end: Math.max(s + 1, e) });
      idx++;
    }
    if (segments.length === 0) throw new Error("No video segments found");

    const totalBytes = segments.reduce((s, seg) => s + seg.file.size, 0);
    if (totalBytes > 500 * 1024 * 1024) throw new Error("视频超过500MB，请先压缩后重试");

    // Write each input file to /tmp
    updateJob(jobId, { progress: 15, stage: `写入 ${segments.length} 个视频文件…` });
    const segPaths: Array<{ input: string; clip: string; start: number; dur: number }> = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const inputPath = join("/tmp", `hl_in_${jobId}_${i}.mp4`);
      paths.push(inputPath);
      const buf = Buffer.from(await seg.file.arrayBuffer());
      await writeFile(inputPath, buf);
      const clipPath = join("/tmp", `hl_seg_${jobId}_${i}.mp4`);
      paths.push(clipPath);
      segPaths.push({ input: inputPath, clip: clipPath, start: seg.start, dur: seg.end - seg.start });
    }

    // Cut each segment with FFmpeg
    updateJob(jobId, { status: "encoding", progress: 30, stage: "FFmpeg 剪辑中…" });
    for (let i = 0; i < segPaths.length; i++) {
      const { input, clip, start, dur } = segPaths[i];
      await execAsync(
        `ffmpeg -y -ss ${start.toFixed(3)} -i "${input}" -t ${dur.toFixed(3)} ` +
        `-c:v libx264 -preset fast -crf 23 -vf "scale=720:-2" ` +
        `-c:a aac -b:a 128k -movflags +faststart "${clip}"`,
        { timeout: 90_000 }
      );
      updateJob(jobId, { progress: 30 + Math.round(((i + 1) / segPaths.length) * 35) });
    }

    // Concat and optionally add BGM
    const outputPath = join("/tmp", `hl_out_${jobId}.mp4`);
    paths.push(outputPath);
    const bgmPath = join(process.cwd(), "public", "bgm", "sport1.mp3");
    const hasBgm = bgm && existsSync(bgmPath);

    updateJob(jobId, { progress: 65, stage: hasBgm ? "混入BGM…" : "合并片段…" });

    if (segPaths.length === 1 && !hasBgm) {
      await execAsync(`cp "${segPaths[0].clip}" "${outputPath}"`);
    } else if (segPaths.length === 1 && hasBgm) {
      await execAsync(
        `ffmpeg -y -i "${segPaths[0].clip}" -i "${bgmPath}" ` +
        `-filter_complex "[0:a][1:a]amix=inputs=2:weights=0.3|0.7[fa]" ` +
        `-map 0:v -map "[fa]" -c:v copy -c:a aac -b:a 128k -shortest ` +
        `-movflags +faststart "${outputPath}"`,
        { timeout: 60_000 }
      );
    } else {
      // Multiple segments: concat first
      const listPath = join("/tmp", `hl_list_${jobId}.txt`);
      paths.push(listPath);
      await writeFile(listPath, segPaths.map(s => `file '${s.clip}'`).join("\n"));
      const concatPath = join("/tmp", `hl_concat_${jobId}.mp4`);
      paths.push(concatPath);
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${concatPath}"`,
        { timeout: 60_000 }
      );
      if (hasBgm) {
        await execAsync(
          `ffmpeg -y -i "${concatPath}" -i "${bgmPath}" ` +
          `-filter_complex "[0:a][1:a]amix=inputs=2:weights=0.3|0.7[fa]" ` +
          `-map 0:v -map "[fa]" -c:v copy -c:a aac -b:a 128k -shortest ` +
          `-movflags +faststart "${outputPath}"`,
          { timeout: 60_000 }
        );
      } else {
        await execAsync(`cp "${concatPath}" "${outputPath}"`);
      }
    }

    // Upload to Supabase
    updateJob(jobId, { status: "storing", progress: 85, stage: "上传到云端…" });
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const outBuffer = await readFile(outputPath);
    const filePath = `highlights/${Date.now()}_${name}`;
    const { error: uploadErr } = await supabase.storage
      .from("clips")
      .upload(filePath, outBuffer, { contentType: "video/mp4", upsert: false });
    if (uploadErr) throw new Error(`存储失败: ${uploadErr.message}`);

    const { data } = supabase.storage.from("clips").getPublicUrl(filePath);
    updateJob(jobId, { status: "done", progress: 100, stage: "完成！", url: data.publicUrl });

  } finally {
    for (const p of paths) unlink(p).catch(() => {});
  }
}
