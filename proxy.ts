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

  // Local showcase preview mode: allow rendering protected pages for screenshots
  if (
    process.env.NODE_ENV !== "production" &&
    (request.cookies.get("kalpla_showcase")?.value === "true" ||
      request.headers.get("x-showcase-mode") === "true")
  ) {
    return NextResponse.next();
  }

  // List of public routes accessible without authentication
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    // Forgot-password must be reachable by a logged-out (locked-out) visitor
    // by definition. reset-password also has to be public here even though
    // it's conceptually an authenticated page: Supabase's recovery links
    // carry the session as a #access_token=... URL hash fragment (confirmed
    // live), which browsers never send to the server — so proxy.ts (running
    // server-side, before any client JS executes) can't see that session
    // yet. The page itself establishes the recovery session client-side on
    // mount and shows its own "invalid or expired link" state if none
    // materializes, rather than relying on middleware-level auth gating.
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/health") ||
    // /portfolio/[username] is the public showcase page (Prompt 74) — note
    // the trailing slash so bare /portfolio (the private editable draft)
    // stays behind auth.
    pathname.startsWith("/portfolio/") ||
    // Vercel Cron has no user session; the daily-coach job authenticates
    // itself via CRON_SECRET inside the route handler instead (Prompt 77).
    pathname.startsWith("/api/cron/") ||
    // Clicked straight from an email with no session — authenticated by a
    // signed per-user token instead (Prompt 79).
    pathname.startsWith("/api/email/unsubscribe") ||
    // Stripe calls this with no user session; authenticated by webhook
    // signature verification inside the route handler instead (Prompt 82).
    pathname.startsWith("/api/billing/webhook") ||
    // Marketing site (Section L / Prompt 85-90) — pre-signup visitors with
    // no session by definition. Static/SEO-facing conventions (sitemap,
    // robots) live at the true app root, not under /marketing, so they're
    // listed individually rather than via the (marketing) route group.
    pathname === "/how-it-works" ||
    pathname === "/pricing" ||
    pathname === "/faq" ||
    pathname === "/about" ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    // Legal pages (Terms, Privacy, Refund) — publicly readable by definition,
    // including by prospective/unauthenticated visitors and unauthenticated
    // Pilot Cohort applicants who haven't created an account yet.
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/refund" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt";

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
