import { NextRequest } from "next/server";
import { getJob } from "@/lib/encode-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      const tick = () => {
        const job = getJob(jobId);
        if (!job) { send({ error: "job_not_found" }); controller.close(); return; }
        send(job);
        if (job.status === "done" || job.status === "error") { controller.close(); return; }
        setTimeout(tick, 600);
      };
      tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
