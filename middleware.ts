import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — do NOT remove this call
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isOnboarding = path === "/onboarding";
  const isLogin = path === "/login";

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    // Check if profile is set up
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    const roleHome: Record<string, string> = {
      coach: "/coach",
      parent: "/parent",
      org_admin: "/org",
    };
    const url = request.nextUrl.clone();
    url.pathname = roleHome[profile.role] ?? "/";
    return NextResponse.redirect(url);
  }

  if (user && !isOnboarding) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/login",
    "/onboarding",
    "/parent/:path*",
    "/coach/:path*",
    "/org/:path*",
    "/gc/:path*",
  ],
};
