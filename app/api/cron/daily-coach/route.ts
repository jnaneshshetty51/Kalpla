import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDailyTasks } from "@/lib/coach/generateDailyTasks";
import { sendDailyCoachEmail } from "@/lib/email/sendDailyCoachEmail";

/**
 * Daily scheduled job (Prompt 77) — Vercel Cron hits this once a day (see
 * vercel.json). Generates today's task list for every user, stores it in
 * daily_coach_logs (the single source of truth the dashboard reads from,
 * Prompt 78), and emails opted-in users (Prompt 79).
 */
export async function GET(request: Request) {
  // Vercel Cron has no user session — verify the shared secret instead.
  // A missing CRON_SECRET is a graceful no-auth fallback in local dev only;
  // in production this endpoint would otherwise run unauthenticated (mass
  // task generation + emails to every user, triggerable by anyone who finds
  // the URL) — a deploy-config mistake, not something to silently allow.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[api/cron/daily-coach] CRON_SECRET is not configured in production — refusing to run unauthenticated.");
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET is required in production" },
      { status: 500 },
    );
  } else {
    console.warn("[api/cron/daily-coach] CRON_SECRET not configured — running unauthenticated (dev only).");
  }

  const adminSupabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const baseUrl = new URL(request.url).origin;

  const { data: users, error: usersErr } = await adminSupabase
    .from("users")
    .select("id, name, email_notifications_enabled");

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  let generated = 0;
  let emailed = 0;
  let failed = 0;

  for (const user of users || []) {
    try {
      const { tasks, user_state } = await generateDailyTasks(user.id);

      await adminSupabase.from("daily_coach_logs").upsert(
        {
          user_id: user.id,
          date: today,
          tasks,
          completed: false,
        },
        { onConflict: "user_id,date" },
      );
      generated++;

      if (user.email_notifications_enabled) {
        const { data: authUser } = await adminSupabase.auth.admin.getUserById(user.id);
        const email = authUser?.user?.email;
        if (email) {
          const sent = await sendDailyCoachEmail({
            userId: user.id,
            email,
            userName: user.name || "there",
            tasks,
            baseUrl,
          });
          if (sent) emailed++;
        }
      }

      void user_state; // available for logging/telemetry if needed later
    } catch (err) {
      console.error(`[api/cron/daily-coach] Failed for user ${user.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ date: today, users_processed: (users || []).length, generated, emailed, failed });
}
