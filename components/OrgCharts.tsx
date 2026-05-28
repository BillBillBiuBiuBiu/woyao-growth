"use client";

const OPEN_RATES = [72, 75, 70, 80, 78];
const PLAY_RATES = [58, 60, 55, 65, 62];
function buildData() {
  const now = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (4 - i) * 7);
    return { week: `${d.getMonth() + 1}/${d.getDate()}`, open: OPEN_RATES[i], play: PLAY_RATES[i] };
  });
}
const data = buildData();

export function EngagementChart() {
  const maxVal = 100;
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <h2 className="text-sm font-semibold mb-4">📊 家长互动趋势</h2>
      <div className="flex items-end gap-3 h-36 px-2">
        {data.map((d) => (
          <div key={d.week} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex gap-0.5 items-end" style={{ height: 112 }}>
              <div
                className="flex-1 rounded-t-md bg-orange-400 transition-all"
                style={{ height: `${(d.open / maxVal) * 100}%` }}
                title={`打开率 ${d.open}%`}
              />
              <div
                className="flex-1 rounded-t-md bg-blue-400 transition-all"
                style={{ height: `${(d.play / maxVal) * 100}%` }}
                title={`播放率 ${d.play}%`}
              />
            </div>
            <span className="text-xs text-muted-foreground">{d.week}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 justify-center">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-orange-400" />报告打开率
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-blue-400" />视频播放率
        </div>
      </div>
      <div className="flex justify-end gap-4 mt-2 pr-2">
        <span className="text-xs font-medium text-orange-600">{data[data.length - 1].open}%</span>
        <span className="text-xs font-medium text-blue-600">{data[data.length - 1].play}%</span>
        <span className="text-xs text-muted-foreground">本周</span>
      </div>
    </div>
  );
}
