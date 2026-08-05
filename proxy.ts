import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not write logic between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // List of public routes accessible without authentication
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/health");

  // `(app)` and `(admin)` are Next.js route groups: the parentheses mean
  // they're stripped from the URL entirely, so a page at
  // app/(app)/dashboard/page.tsx serves /dashboard, not /app/dashboard.
  // There is no reliable way to tell from a pathname alone which route
  // group produced it, so "protected" here means "deny by default, allow
  // only the explicit public routes above" rather than matching a prefix.
  const isProtectedPath = !isPublicRoute;

  // Unauthenticated user attempting to access a protected route.
  if (!user && isProtectedPath) {
    // API routes should get a 401 they can handle programmatically, not an
    // HTML redirect that breaks fetch()/curl callers.
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin gating by URL prefix has the same route-group limitation noted
  // above: this only fires for pages actually served at a literal /admin/*
  // URL, so admin pages must live at a real /admin path (e.g.
  // app/(admin)/admin/page.tsx -> /admin) regardless of which route group
  // organizes them. This check is a UX convenience (redirect people away
  // from a page they can't use) — RLS's is_admin() policies are the actual
  // security boundary for admin-only data, independent of what middleware
  // does or doesn't catch here.
  if (user && pathname.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Authenticated user attempting to access auth pages -> redirect to /dashboard
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
