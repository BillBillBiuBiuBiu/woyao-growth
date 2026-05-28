import * as tus from "tus-js-client";
import { getSupabaseBrowser } from "./supabase-browser";

export interface UploadProgress {
  percent: number;        // 0-100
  bytesUploaded: number;
  bytesTotal: number;
  speedBps: number;       // bytes/sec
}

export interface UploadResult {
  storagePath: string;    // path inside the bucket, e.g. "userId/timestamp-name.mp4"
  publicUrl: string | null;
}

const BUCKET = "game-videos";
const CHUNK = 6 * 1024 * 1024; // 6 MB — Supabase TUS minimum chunk size

export function uploadVideoTUS(
  file: File,
  onProgress: (p: UploadProgress) => void,
): { promise: Promise<UploadResult>; abort: () => void } {
  let uploadInstance: tus.Upload | null = null;
  let lastBytes = 0;
  let lastTime = Date.now();

  const promise = new Promise<UploadResult>(async (resolve, reject) => {
    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { reject(new Error("未登录")); return; }

    const userId = session.user.id;
    const objectName = `${userId}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;

    uploadInstance = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK,
      metadata: {
        bucketName: BUCKET,
        objectName,
        contentType: file.type || "video/mp4",
        cacheControl: "3600",
      },
      onError: reject,
      onProgress(bytesUploaded, bytesTotal) {
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        const speedBps = dt > 0 ? (bytesUploaded - lastBytes) / dt : 0;
        lastBytes = bytesUploaded;
        lastTime = now;
        onProgress({
          percent: Math.round((bytesUploaded / bytesTotal) * 100),
          bytesUploaded,
          bytesTotal,
          speedBps,
        });
      },
      onSuccess() {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
        resolve({ storagePath: objectName, publicUrl: data?.publicUrl ?? null });
      },
    });

    const previous = await uploadInstance.findPreviousUploads();
    if (previous.length > 0) uploadInstance.resumeFromPreviousUpload(previous[0]);
    uploadInstance.start();
  });

  return {
    promise,
    abort() { uploadInstance?.abort(); },
  };
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function fmtSpeed(bps: number): string {
  return `${fmtBytes(bps)}/s`;
}
