/** Maps raw technical error messages to user-friendly Chinese strings. */
export function translateError(msg: string): string {
  if (!msg) return "未知错误，请重试";
  const m = msg.toLowerCase();
  if (m.includes("加载超时") || (m.includes("timeout") && !m.includes("ffmpeg")))
    return "视频加载超时，请检查文件是否完整，或尝试使用较短的视频";
  if (m.includes("视频引擎加载超时") || m.includes("ffmpeg") && m.includes("timeout"))
    return "视频处理引擎加载超时，请在 WiFi 环境下重试";
  if (m.includes("command failed") || m.includes("ffmpeg") && m.includes("error"))
    return "视频剪辑失败，视频格式可能不兼容 · 建议使用 MP4/H.264 格式";
  if (m.includes("无法加载") || m.includes("cannot load") || m.includes("not supported"))
    return "视频格式暂不支持 · 建议将 .MOV 转为 MP4，或在 iPhone 上开启「最兼容」格式录制";
  if (m.includes("超过500") || m.includes("too large"))
    return "视频文件过大（超过500MB），请先压缩或裁剪后重试";
  if (m.includes("视频时长") || m.includes("duration"))
    return "无法读取视频时长，文件可能已损坏，请重新导出后重试";
  if (m.includes("照片加载") || m.includes("photo"))
    return "球员照片无法加载，请换一张清晰的全身照重试";
  if (m.includes("服务端") || (m.includes("500") && !m.includes("mb")) || (m.includes("server") && !m.includes("supabase")))
    return "服务端暂时不可用，已自动切换到本地处理模式，请重新点击「开始生成」";
  if (m.includes("连接中断") || m.includes("network") || (m.includes("fetch") && !m.includes("fetchfile")))
    return "网络连接中断，请检查网络后重试";
  if (m.includes("处理超时"))
    return "处理时间过长（>3分钟），视频可能过长，建议剪短后重试";
  if (m.includes("cancelled") || m.includes("abort"))
    return "处理已取消";
  if (m.includes("存储失败") || m.includes("storage"))
    return "视频上传云端失败，请检查网络连接后重试";
  if (m.includes("supabase") || m.includes("upload"))
    return "文件上传失败，请检查网络后点击「重试」";
  return msg;
}
