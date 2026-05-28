import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ user: { id: user.id, phone: user.phone }, profile });
}
