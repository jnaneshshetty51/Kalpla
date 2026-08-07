import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/server";
import { createJoinToken, isVideoProviderConfigured } from "@/lib/liveSessions";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { user, profile } = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: No active session" }, { status: 401 });
    }

    if (checkRateLimit(user.id, "live_session_join", 10, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    if (!isVideoProviderConfigured()) {
      return NextResponse.json(
        { error: "Video provider is not configured on this deployment (DAILY_API_KEY missing)" },
        { status: 503 },
      );
    }

    const { id } = await params;
    const adminSupabase = createAdminClient();

    const { data: session, error: fetchErr } = await adminSupabase
      .from("live_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      console.error("Error fetching live session for join:", fetchErr);
      return NextResponse.json({ error: "Failed to load the session" }, { status: 500 });
    }
    if (!session || session.cancelled_at) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const isAdmin = profile?.role === "admin";
    const isAssignedToMe = session.session_type === "mock_interview" && session.assigned_user_id === user.id;
    const isCohortWide = session.session_type !== "mock_interview";
    const authorized = isAdmin || isCohortWide || isAssignedToMe;

    if (!authorized) {
      return NextResponse.json({ error: "Forbidden: you are not part of this session" }, { status: 403 });
    }

    const startsAtMs = new Date(session.starts_at).getTime();
    const tokenExpiresAt = Math.floor(startsAtMs / 1000) + session.duration_minutes * 60 + 15 * 60;

    let token: string;
    try {
      token = await createJoinToken({
        roomName: session.daily_room_name,
        userId: user.id,
        userName: profile?.name || user.email || "Kalpla User",
        isOwner: isAdmin,
        expiresAt: tokenExpiresAt,
      });
    } catch (err) {
      console.error("Error creating join token:", err);
      return NextResponse.json({ error: "Failed to create a join token for this session" }, { status: 502 });
    }

    // Written server-side only, after authorization + token issuance
    // succeed — never client-reported. ignoreDuplicates preserves the
    // first joined_at on reconnects.
    const { error: attendanceErr } = await adminSupabase.from("live_session_attendance").upsert(
      { session_id: id, user_id: user.id, role_at_join: isAdmin ? "admin" : "student" },
      { onConflict: "session_id,user_id", ignoreDuplicates: true },
    );
    if (attendanceErr) {
      // Non-fatal: don't block the user from joining their session over an
      // attendance-logging failure.
      console.error("Error writing attendance row:", attendanceErr);
    }

    return NextResponse.json({ roomUrl: session.daily_room_url, token });
  } catch (err) {
    console.error("Error in POST /api/live-sessions/[id]/join:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
