"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function JoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const [status, setStatus] = useState<"checking" | "ready" | "done" | "error">("checking");
  const [studentName, setStudentName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch(`/api/invite/${params.code}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          const msgs: Record<string, string> = {
            not_found: "邀请链接无效或已失效",
            used: "此邀请链接已被使用",
            expired: "邀请链接已过期",
          };
          setErrorMsg(msgs[body.error] ?? "邀请链接无效");
          setStatus("error");
          return;
        }
        setStudentName(body.studentName);

        // If already logged in, check for pending invite and auto-link
        const pending = typeof window !== "undefined" ? localStorage.getItem("pending_invite") : null;
        if (pending === params.code) {
          localStorage.removeItem("pending_invite");
          await redeem(params.code);
        } else {
          setStatus("ready");
        }
      })
      .catch(() => {
        setErrorMsg("网络错误，请重试");
        setStatus("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code]);

  async function redeem(code: string) {
    const res = await fetch(`/api/invite/${code}`, { method: "POST" });
    if (res.ok) {
      setStatus("done");
      setTimeout(() => router.push("/parent"), 1500);
    } else {
      const body = await res.json().catch(() => ({}));
      if (body.error === "unauthorized") {
        localStorage.setItem("pending_invite", code);
        router.push("/login");
      } else {
        setErrorMsg("绑定失败，请重试");
        setStatus("error");
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="text-5xl">🏀</div>
        {status === "checking" && <p className="text-muted-foreground">验证邀请链接…</p>}
        {status === "ready" && (
          <>
            <h1 className="text-xl font-bold">查看 {studentName} 的成长</h1>
            <p className="text-sm text-muted-foreground">你收到了一个家长邀请，点击下方绑定孩子账号</p>
            <button
              onClick={() => redeem(params.code)}
              className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm active:scale-95 transition-all"
            >
              绑定 {studentName} →
            </button>
          </>
        )}
        {status === "done" && (
          <>
            <p className="text-lg font-semibold text-green-600">绑定成功！</p>
            <p className="text-sm text-muted-foreground">正在跳转…</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-red-500 font-medium">{errorMsg}</p>
            <button onClick={() => router.push("/")} className="text-sm text-muted-foreground underline">
              返回首页
            </button>
          </>
        )}
      </div>
    </div>
  );
}
