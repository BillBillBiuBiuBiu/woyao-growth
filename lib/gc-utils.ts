/** Format seconds as MM:SS */
export function fmt(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Merge overlapping [start, end] segments */
export function mergeSegs(segs: [number, number][]): [number, number][] {
  if (segs.length === 0) return [];
  const sorted = [...segs].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      out.push([sorted[i][0], sorted[i][1]]);
    }
  }
  return out;
}

/**
 * Build the FFmpeg argument list for the highlight reel from merged segments.
 *
 * Pure function — extracted from gc/review's generateHighlight (C363) so the
 * crash-prone filter_complex string construction can be reasoned about and
 * tested in isolation. Output must stay byte-identical to the inline version.
 *
 * Uses a single -i decode stream for all segments (split/concat) to avoid the
 * n×decode-buffer OOM that n separate inputs cause on mobile WKWebView.
 * Encoding params (scale 480, ultrafast, crf 28, aac 96k) are a mobile-tuned
 * contract — do not change here.
 */
export function buildHighlightFFmpegArgs(segs: [number, number][]): string[] {
  const n = segs.length;
  let filterComplex: string;
  let mapArgs: string[];
  if (n === 1) {
    const [segS, segE] = segs[0];
    const dur = segE - segS;
    filterComplex = `[0:v]trim=start=${segS.toFixed(3)}:duration=${dur.toFixed(3)},setpts=PTS-STARTPTS,scale=480:-2[cv];[0:a]atrim=start=${segS.toFixed(3)}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS[ca]`;
    mapArgs = ["-map", "[cv]", "-map", "[ca]"];
  } else {
    const vSplitOuts = segs.map((_, i) => `[vs${i}]`).join("");
    const aSplitOuts = segs.map((_, i) => `[as${i}]`).join("");
    const trimParts  = segs.map(([segS, segE], i) => {
      const dur = segE - segS;
      return `[vs${i}]trim=start=${segS.toFixed(3)}:duration=${dur.toFixed(3)},setpts=PTS-STARTPTS[v${i}];[as${i}]atrim=start=${segS.toFixed(3)}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`;
    }).join(";");
    const concatIn = segs.map((_, i) => `[v${i}][a${i}]`).join("");
    filterComplex = `[0:v]split=${n}${vSplitOuts};[0:a]asplit=${n}${aSplitOuts};${trimParts};${concatIn}concat=n=${n}:v=1:a=1[rawv][rawa];[rawv]scale=480:-2[cv]`;
    mapArgs = ["-map", "[cv]", "-map", "[rawa]"];
  }
  return [
    "-i", "input.mp4",
    "-filter_complex", filterComplex,
    ...mapArgs,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
    "-c:a", "aac", "-b:a", "96k",
    "-movflags", "+faststart",
    "-y", "highlight.mp4",
  ];
}
