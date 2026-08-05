import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfileExists } from "@/lib/supabase/auth-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  // Only allow same-origin relative paths. `origin` is always prepended
  // below, but a value like "//evil.com" or "https://evil.com" would still
  // be worth rejecting outright rather than relying on that alone.
  const next =
    requestedNext &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Server-side hook: guarantee user profile exists in public.users
      await ensureUserProfileExists(data.user.id, {
        name:
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          null,
        email: data.user.email,
      });

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Return the user to an error page or login if auth exchange fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
