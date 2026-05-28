"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Step = "phone" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const e164 = "+86" + phone.trim();

  async function sendOtp() {
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      setError("请输入正确的11位手机号");
      return;
    }
    setError("");
    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setLoading(false);
    if (err) {
      setError("发送失败：" + err.message);
      return;
    }
    setStep("otp");
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      setError("请输入6位验证码");
      return;
    }
    setError("");
    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { data, error: err } = await supabase.auth.verifyOtp({
      phone: e164,
      token: otp,
      type: "sms",
    });
    setLoading(false);
    if (err || !data.session) {
      setError("验证码错误或已过期");
      return;
    }

    // If coming from an invite link, return to it first
    const pendingInvite = localStorage.getItem("pending_invite");
    if (pendingInvite) {
      router.push(`/join/${pendingInvite}`);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.session.user.id)
      .single();

    if (!profile) {
      router.push("/onboarding");
    } else {
      const roleHome: Record<string, string> = {
        coach: "/coach",
        parent: "/parent",
        org_admin: "/org",
      };
      router.push(roleHome[profile.role] ?? "/");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-5xl mb-3">🏀</div>
          <h1 className="text-2xl font-bold text-foreground">我耀成长</h1>
          <p className="text-muted-foreground text-sm mt-2">让每一次成长，都有证据</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {step === "phone" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden focus-within:border-orange-400 transition-colors">
                  <span className="flex items-center px-3 bg-gray-50 text-gray-500 text-sm border-r border-gray-200 select-none">
                    +86
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="请输入手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                    className="flex-1 px-3 py-3 text-sm outline-none bg-white"
                    autoFocus
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={sendOtp}
                disabled={loading || phone.length < 11}
                className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 active:scale-95 transition-all"
              >
                {loading ? "发送中…" : "获取验证码"}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">验证码</label>
                <p className="text-xs text-muted-foreground mb-3">已发送至 +86 {phone}</p>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="请输入6位验证码"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                  className="w-full px-3 py-3 text-sm rounded-xl border border-gray-200 outline-none focus:border-orange-400 transition-colors tracking-widest text-center text-lg"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={verifyOtp}
                disabled={loading || otp.length < 6}
                className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-40 active:scale-95 transition-all"
              >
                {loading ? "验证中…" : "登录"}
              </button>
              <button
                onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
                className="w-full py-2 text-sm text-muted-foreground"
              >
                重新获取验证码
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          登录即代表同意用户协议和隐私政策
        </p>
      </div>
    </div>
  );
}
