// In-memory job store — single Railway instance is fine for demo

export type JobStatus = "queued" | "uploading" | "encoding" | "storing" | "done" | "error";

export interface EncodeJob {
  status: JobStatus;
  progress: number;
  stage: string;
  url?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, EncodeJob>();

export function createJob(id: string): void {
  jobs.set(id, { status: "queued", progress: 0, stage: "等待处理…", createdAt: Date.now() });
  // Evict jobs older than 2 hours
  const cutoff = Date.now() - 7_200_000;
  for (const [k, v] of jobs) {
    if (v.createdAt < cutoff) jobs.delete(k);
  }
}

export function updateJob(id: string, patch: Partial<EncodeJob>): void {
  const job = jobs.get(id);
  if (job) jobs.set(id, { ...job, ...patch });
}

export function getJob(id: string): EncodeJob | undefined {
  return jobs.get(id);
}
