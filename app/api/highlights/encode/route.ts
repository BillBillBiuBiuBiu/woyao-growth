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

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Validate service role key is configured
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const jobId = randomUUID();
  createJob(jobId);

  // Fire-and-forget: process in background, client polls via SSE
  processVideo(req, jobId).catch(err => {
    updateJob(jobId, { status: "error", error: err.message || "处理失败", stage: "出错" });
  });

  return NextResponse.json({ jobId });
}

async function processVideo(req: NextRequest, jobId: string): Promise<void> {
  const paths: string[] = [];

  try {
    // ── 1. Parse FormData ────────────────────────────────────────────────────
    updateJob(jobId, { status: "uploading", progress: 5, stage: "接收视频文件…" });
    const formData = await req.formData();

    const name = ((formData.get("name") as string) || "highlight.mp4")
      .replace(/[^a-z0-9._\-]/gi, "_");
    const bgm = formData.get("bgm") === "true";

    // Collect video files + their clip windows (support multi-segment)
    interface Segment { file: File; start: number; end: number }
    const segments: Segment[] = [];
    let idx = 0;
    while (true) {
      const f = formData.get(`video_${idx}`) as File | null;
      if (!f) break;
      const s = parseFloat((formData.get(`start_${idx}`) as string) || "0");
      const e = parseFloat((formData.get(`end_${idx}`) as string) || String(s + 15));
      segments.push({ file: f, start: s, end: e });
      idx++;
    }
    if (segments.length === 0) throw new Error("No video file received");

    const totalBytes = segments.reduce((s, seg) => s + seg.file.size, 0);
    if (totalBytes > 500 * 1024 * 1024) throw new Error("视频文件超过500MB，请先压缩");

    // ── 2. Write input files to /tmp ─────────────────────────────────────────
    updateJob(jobId, { progress: 20, stage: "写入临时文件…" });
    const segPaths: Array<{ input: string; clip: string; start: number; dur: number }> = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const inputPath = join("/tmp", `hl_in_${jobId}_${i}.mp4`);
      paths.push(inputPath);
      await writeFile(inputPath, Buffer.from(await seg.file.arrayBuffer()));
      segPaths.push({ input: inputPath, clip: join("/tmp", `hl_seg_${jobId}_${i}.mp4`), start: seg.start, dur: seg.end - seg.start });
      paths.push(segPaths[i].clip);
    }

    // ── 3. FFmpeg: cut each segment ──────────────────────────────────────────
    updateJob(jobId, { status: "encoding", progress: 30, stage: "FFmpeg 剪辑中…" });
    for (let i = 0; i < segPaths.length; i++) {
      const { input, clip, start, dur } = segPaths[i];
      const cmd = [
        "ffmpeg -y",
        `-ss ${start.toFixed(3)} -i "${input}"`,
        `-t ${dur.toFixed(3)}`,
        `-c:v libx264 -preset fast -crf 23`,
        `-vf "scale=720:-2"`,
        `-c:a aac -b:a 128k`,
        `-movflags +faststart`,
        `"${clip}"`,
      ].join(" ");
      await execAsync(cmd, { timeout: 90_000 });
      updateJob(jobId, { progress: 30 + Math.round(((i + 1) / segPaths.length) * 35) });
    }

    // ── 4. Concat if multiple segments; optionally add BGM ───────────────────
    const outputPath = join("/tmp", `hl_out_${jobId}.mp4`);
    paths.push(outputPath);
    const bgmPath = join(process.cwd(), "public", "bgm", "sport1.mp3");
    const hasBgm = bgm && existsSync(bgmPath);

    updateJob(jobId, { progress: 65, stage: hasBgm ? "混入BGM…" : "合并片段…" });

    if (segPaths.length === 1 && !hasBgm) {
      // Single segment, no BGM — just rename
      const { exec: execCb } = await import("child_process");
      await new Promise<void>((res, rej) => execCb(`cp "${segPaths[0].clip}" "${outputPath}"`, e => e ? rej(e) : res()));
    } else if (segPaths.length === 1 && hasBgm) {
      const cmd = [
        "ffmpeg -y",
        `-i "${segPaths[0].clip}" -i "${bgmPath}"`,
        `-filter_complex "[0:a][1:a]amix=inputs=2:weights=0.3|0.7[fa]"`,
        `-map 0:v -map "[fa]"`,
        `-c:v copy -c:a aac -b:a 128k -shortest`,
        `-movflags +faststart`,
        `"${outputPath}"`,
      ].join(" ");
      await execAsync(cmd, { timeout: 60_000 });
    } else {
      // Concat list file
      const listPath = join("/tmp", `hl_list_${jobId}.txt`);
      paths.push(listPath);
      const listContent = segPaths.map(s => `file '${s.clip}'`).join("\n");
      await writeFile(listPath, listContent);

      const concatClip = join("/tmp", `hl_concat_${jobId}.mp4`);
      paths.push(concatClip);
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${concatClip}"`,
        { timeout: 60_000 }
      );

      if (hasBgm) {
        const cmd = [
          "ffmpeg -y",
          `-i "${concatClip}" -i "${bgmPath}"`,
          `-filter_complex "[0:a][1:a]amix=inputs=2:weights=0.3|0.7[fa]"`,
          `-map 0:v -map "[fa]"`,
          `-c:v copy -c:a aac -b:a 128k -shortest`,
          `-movflags +faststart`,
          `"${outputPath}"`,
        ].join(" ");
        await execAsync(cmd, { timeout: 60_000 });
      } else {
        await execAsync(`cp "${concatClip}" "${outputPath}"`);
      }
    }

    // ── 5. Upload to Supabase Storage ────────────────────────────────────────
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
