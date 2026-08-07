import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribeToken";

/**
 * One-click unsubscribe (Prompt 79) — deliberately unauthenticated, works
 * straight from the email link. Protected by a signed per-user token
 * rather than a session, since the person clicking it has no session.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const token = searchParams.get("token");

  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return new Response("Invalid or expired unsubscribe link.", { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("users")
    .update({ email_notifications_enabled: false })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new Response(
    `<!doctype html><html><body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
      <h2>You've been unsubscribed</h2>
      <p>You won't receive any more daily coach emails. You can re-enable them any time from your account settings.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
