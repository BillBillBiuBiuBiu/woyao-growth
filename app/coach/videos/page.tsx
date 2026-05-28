"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { uploadVideoTUS, fmtBytes, fmtSpeed, type UploadProgress } from "@/lib/video-upload";

interface GameVideo {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number | null;
  status: "uploaded" | "processing" | "done" | "error";
  game_id: string | null;
  created_at: string;
}

function fmtDate(ts: string) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

const statusLabel: Record<string, { text: string; color: string }> = {
  uploaded:   { text: "已上传", color: "bg-blue-100 text-blue-700" },
  processing: { text: "处理中", color: "bg-yellow-100 text-yellow-700" },
  done:       { text: "完成",   color: "bg-green-100 text-green-700" },
  error:      { text: "出错",   color: "bg-red-100 text-red-700" },
};

export default function CoachVideosPage() {
  const [videos, setVideos] = useState<GameVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadDone, setUploadDone] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/coach/videos");
    if (res.ok) setVideos(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadFile(f);
    setUploadError("");
    setUploadDone(false);
    setProgress(null);
  }

  async function startUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError("");
    setUploadDone(false);

    const { promise, abort } = uploadVideoTUS(uploadFile, setProgress);
    abortRef.current = abort;

    try {
      const result = await promise;
      // Save record to DB
      await fetch("/api/coach/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: uploadFile.name,
          storage_path: result.storagePath,
          size_bytes: uploadFile.size,
        }),
      });
      setUploadDone(true);
      setUploadFile(null);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadVideos();
    } catch (err) {
      setUploadError(String(err));
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  }

  function cancelUpload() {
    abortRef.current?.();
    setUploading(false);
    setProgress(null);
  }

  const eta = progress && progress.speedBps > 0
    ? Math.round((progress.bytesTotal - progress.bytesUploaded) / progress.speedBps)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">比赛视频</h1>
        <p className="text-sm text-muted-foreground mt-0.5">上传比赛录像，自动生成集锦切片</p>
      </div>

      {/* Upload card */}
      <div className="rounded-2xl border border-border bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">上传视频</h2>

        {/* File picker */}
        <div
          className="rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/50 p-5 text-center cursor-pointer active:bg-orange-50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={pickFile}
          />
          {uploadFile ? (
            <div>
              <div className="text-2xl mb-1">🎬</div>
              <div className="text-sm font-medium text-gray-700 break-all">{uploadFile.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{fmtBytes(uploadFile.size)}</div>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-1">📁</div>
              <div className="text-sm font-medium text-gray-600">点击选择比赛视频</div>
              <div className="text-xs text-gray-400 mt-0.5">支持 MP4、MOV 等格式，不限大小</div>
            </div>
          )}
        </div>

        {/* Progress */}
        {uploading && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>上传中… {progress.percent}%</span>
              <span>
                {fmtBytes(progress.bytesUploaded)} / {fmtBytes(progress.bytesTotal)}
                {progress.speedBps > 0 && ` · ${fmtSpeed(progress.speedBps)}`}
                {eta !== null && eta > 0 && ` · 约${eta < 60 ? `${eta}秒` : `${Math.ceil(eta / 60)}分钟`}`}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {uploadError && (
          <p className="text-sm text-red-500">{uploadError}</p>
        )}

        {uploadDone && (
          <p className="text-sm text-green-600 font-medium">✓ 上传成功</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {uploading ? (
            <button
              onClick={cancelUpload}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 active:bg-gray-50"
            >
              取消上传
            </button>
          ) : (
            <button
              onClick={startUpload}
              disabled={!uploadFile}
              className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-40 active:scale-95 transition-all"
            >
              开始上传
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400">
          支持断点续传 — 上传中断后重新选择同一文件可继续
        </p>
      </div>

      {/* Video list */}
      <div>
        <h2 className="text-sm font-semibold mb-3">
          已上传视频{videos.length > 0 && ` (${videos.length})`}
        </h2>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map((i) => <div key={i} className="h-16 rounded-2xl border border-border bg-white animate-pulse" />)}
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
            还没有视频，上传第一个试试
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-white overflow-hidden">
            {videos.map((v, i) => {
              const s = statusLabel[v.status] ?? statusLabel.uploaded;
              return (
                <div
                  key={v.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.05)" }}
                >
                  <div className="text-2xl shrink-0">🎬</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{v.file_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {v.size_bytes ? fmtBytes(v.size_bytes) : ""} · {fmtDate(v.created_at)}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${s.color}`}>
                    {s.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
