import { NextResponse } from "next/server";
import { createClient, getServerUser } from "@/lib/supabase/server";

/**
 * Deliberately uses the request-scoped client (not createAdminClient), so
 * Postgres RLS itself performs the cohort-wide-OR-assigned-to-me filtering
 * via live_sessions' two select policies — avoids duplicating that filter
 * logic in application code where it could drift from the RLS policy.
 */
export async function GET() {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: No active session" }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: sessions, error } = await supabase
      .from("live_sessions")
      .select("id, title, description, session_type, starts_at, duration_minutes, assigned_user_id")
      .is("cancelled_at", null)
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Error fetching live sessions:", error);
      return NextResponse.json({ error: "Failed to fetch live sessions" }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions || [] });
  } catch (err) {
    console.error("Error in GET /api/live-sessions:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
