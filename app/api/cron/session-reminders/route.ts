import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSessionReminderEmail } from "@/lib/email/sendSessionReminderEmail";

/**
 * Fires session reminder emails ~10-20 minutes before a live session
 * starts. Requires per-minute cron precision (Vercel Pro or higher) — the
 * Hobby plan's once-daily cron cannot support this. Same CRON_SECRET auth
 * block as app/api/cron/daily-coach/route.ts.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[api/cron/session-reminders] CRON_SECRET is not configured in production — refusing to run unauthenticated.");
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET is required in production" },
      { status: 500 },
    );
  } else {
    console.warn("[api/cron/session-reminders] CRON_SECRET not configured — running unauthenticated (dev only).");
  }

  const adminSupabase = createAdminClient();
  const baseUrl = new URL(request.url).origin;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 20 * 60 * 1000).toISOString();

  const { data: sessions, error: sessionsErr } = await adminSupabase
    .from("live_sessions")
    .select("id, title, session_type, starts_at, assigned_user_id")
    .is("cancelled_at", null)
    .is("reminder_sent_at", null)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  if (sessionsErr) {
    return NextResponse.json({ error: sessionsErr.message }, { status: 500 });
  }

  let sessionsProcessed = 0;
  let emailed = 0;
  let failed = 0;

  for (const session of sessions || []) {
    try {
      // Conditional update, not upsert — whichever request's update
      // actually affects a row "owns" the send, safe even under a
      // concurrent duplicate cron invocation, no separate lock needed.
      const { data: claimed } = await adminSupabase
        .from("live_sessions")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", session.id)
        .is("reminder_sent_at", null)
        .select("id")
        .maybeSingle();

      if (!claimed) continue; // another invocation already claimed this session
      sessionsProcessed++;

      let recipientIds: string[];
      if (session.session_type === "mock_interview") {
        recipientIds = session.assigned_user_id ? [session.assigned_user_id] : [];
      } else {
        const { data: optedInUsers } = await adminSupabase
          .from("users")
          .select("id")
          .eq("email_notifications_enabled", true);
        recipientIds = (optedInUsers || []).map((u) => u.id);
      }

      for (const userId of recipientIds) {
        try {
          const { data: profile } = await adminSupabase.from("users").select("name").eq("id", userId).maybeSingle();
          const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId);
          const email = authUser?.user?.email;
          if (!email) continue;

          const sent = await sendSessionReminderEmail({
            userId,
            email,
            userName: profile?.name || "there",
            sessionTitle: session.title,
            sessionType: session.session_type,
            startsAt: session.starts_at,
            baseUrl,
          });
          if (sent) emailed++;
        } catch (err) {
          console.error(`[api/cron/session-reminders] Failed to email user ${userId} for session ${session.id}:`, err);
          failed++;
        }
      }
    } catch (err) {
      console.error(`[api/cron/session-reminders] Failed processing session ${session.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ sessions_processed: sessionsProcessed, emailed, failed });
}
