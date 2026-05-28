"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function JoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const [status, setStatus] = useState<"checking" | "ready" | "done" | "error">("checking");
  const [studentName, setStudentName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function check() {
      const supabase = getSupabaseBrowser();
      const { data: invite } = await supabase
        .from("student_invites")
        .select("code, student:students(name), used_at, expires_at")
        .eq("code", params.code)
        .single();

      if (!invite) { setErrorMsg("邀请链接无效或已失效"); setStatus("error"); return; }
      if (invite.used_at) { setErrorMsg("此邀请链接已被使用"); setStatus("error"); return; }
      if (new Date(invite.expires_at) < new Date()) { setErrorMsg("邀请链接已过期"); setStatus("error"); return; }

      const student = invite.student as { name: string } | null;
      setStudentName(student?.name ?? "");
      setStatus("ready");
    }
    check();
  }, [params.code]);

  async function accept() {
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Store code in localStorage, redirect to login
      localStorage.setItem("pending_invite", params.code);
      router.push("/login");
      return;
    }

    await linkInvite(user.id);
  }

  async function linkInvite(userId: string) {
    const supabase = getSupabaseBrowser();

    const { data: invite } = await supabase
      .from("student_invites")
      .select("student_id")
      .eq("code", params.code)
      .single();

    if (!invite) { setErrorMsg("邀请链接已失效"); setStatus("error"); return; }

    await supabase.from("parent_student").insert({
      parent_id: userId,
      student_id: invite.student_id,
    });

    await supabase.from("student_invites").update({ used_at: new Date().toISOString() }).eq("code", params.code);

    setStatus("done");
    setTimeout(() => router.push("/parent"), 1500);
  }

  // Handle pending invite after login redirect
  useEffect(() => {
    const pending = localStorage.getItem("pending_invite");
    if (!pending) return;
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: import("@supabase/supabase-js").User | null } }) => {
      if (user && pending === params.code) {
        localStorage.removeItem("pending_invite");
        linkInvite(user.id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              onClick={accept}
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
