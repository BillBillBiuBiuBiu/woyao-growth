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
