import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as { role: string; name: string };
  if (!["coach", "parent", "org_admin"].includes(body.role)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  const { data, error } = await supabase.from("profiles").upsert({
    id: user.id,
    role: body.role,
    name: body.name?.trim() ?? "",
    phone: user.phone ?? "",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
