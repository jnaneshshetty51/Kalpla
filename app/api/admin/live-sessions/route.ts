import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAuth } from "@/lib/admin/verifyAdminAuth";
import { createRoom, isVideoProviderConfigured } from "@/lib/liveSessions";
import { LiveSessionType } from "@/types/liveSession";

const SESSION_TYPES: LiveSessionType[] = ["live_class", "architecture_session", "office_hours", "mock_interview"];

// Explicit per-type participant cap. Verified live against a real Daily
// account (this project's default pay-as-you-go plan, not a paid tier):
// values above 20 are hard-rejected ("cannot be set to that value with
// your current plan") — Daily's docs advertise 200 as the room default,
// but that ceiling doesn't apply to this account's actual plan. 20 is the
// verified maximum this plan allows, which is also the top of the
// documented ~10-20 student pilot cohort — tight if literally every
// student plus the admin attends the same session at once, but that's a
// "upgrade the Daily plan" conversation for later, not a v1 blocker.
// mock_interview stays tight (exactly one assigned student is ever
// authorized, + the admin, + a small margin for an observing admin).
const MAX_PARTICIPANTS_BY_TYPE: Record<LiveSessionType, number> = {
  live_class: 20,
  architecture_session: 20,
  office_hours: 20,
  mock_interview: 4,
};

export async function GET() {
  try {
    const auth = await verifyAdminAuth();
    if (!auth.authorized) return auth.response;

    const adminSupabase = createAdminClient();

    const { data: sessions, error: sessionsErr } = await adminSupabase
      .from("live_sessions")
      .select("*")
      .order("starts_at", { ascending: true });

    if (sessionsErr) {
      console.error("Error fetching live sessions:", sessionsErr);
      return NextResponse.json({ error: "Failed to fetch live sessions" }, { status: 500 });
    }

    // Map assigned_user_id -> {name, email} for mock_interview rows, same
    // two-query-then-map pattern used elsewhere (e.g. lib/dashboard/aggregate.ts).
    const assignedIds = [...new Set((sessions || []).map((s) => s.assigned_user_id).filter(Boolean))];
    let assignedUsersMap: Record<string, { name: string | null }> = {};
    if (assignedIds.length > 0) {
      const { data: assignedUsers } = await adminSupabase
        .from("users")
        .select("id, name")
        .in("id", assignedIds);
      assignedUsersMap = Object.fromEntries((assignedUsers || []).map((u) => [u.id, { name: u.name }]));
    }

    const formatted = (sessions || []).map((s) => ({
      ...s,
      assigned_user: s.assigned_user_id ? assignedUsersMap[s.assigned_user_id] || null : null,
    }));

    return NextResponse.json({ sessions: formatted });
  } catch (err) {
    console.error("Error in GET /api/admin/live-sessions:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAdminAuth();
    if (!auth.authorized) return auth.response;

    if (!isVideoProviderConfigured()) {
      return NextResponse.json(
        { error: "Video provider is not configured on this deployment (DAILY_API_KEY missing)" },
        { status: 503 },
      );
    }

    let body: {
      title?: string;
      description?: string;
      session_type?: string;
      starts_at?: string;
      duration_minutes?: number;
      assigned_user_id?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { title, description, session_type, starts_at, duration_minutes, assigned_user_id } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Missing or empty 'title'" }, { status: 400 });
    }
    if (!session_type || !SESSION_TYPES.includes(session_type as LiveSessionType)) {
      return NextResponse.json(
        { error: `'session_type' must be one of: ${SESSION_TYPES.join(", ")}` },
        { status: 400 },
      );
    }
    if (!starts_at || typeof starts_at !== "string" || Number.isNaN(Date.parse(starts_at))) {
      return NextResponse.json({ error: "Missing or invalid 'starts_at' (expected an ISO timestamp)" }, { status: 400 });
    }
    if (!duration_minutes || typeof duration_minutes !== "number" || duration_minutes <= 0) {
      return NextResponse.json({ error: "Missing or invalid 'duration_minutes' (must be a positive number)" }, { status: 400 });
    }

    const isMockInterview = session_type === "mock_interview";
    if (isMockInterview && (!assigned_user_id || typeof assigned_user_id !== "string")) {
      return NextResponse.json({ error: "'assigned_user_id' is required for mock_interview sessions" }, { status: 400 });
    }
    if (!isMockInterview && assigned_user_id) {
      return NextResponse.json({ error: "'assigned_user_id' is only valid for mock_interview sessions" }, { status: 400 });
    }

    // Generous join cutoff — session end + 1 hour — so a room isn't
    // orphaned by an expiry that's tight against an admin running late.
    const startsAtMs = Date.parse(starts_at);
    const roomExpiresAt = Math.floor(startsAtMs / 1000) + duration_minutes * 60 + 60 * 60;

    let room;
    try {
      room = await createRoom({
        expiresAt: roomExpiresAt,
        maxParticipants: MAX_PARTICIPANTS_BY_TYPE[session_type as LiveSessionType],
      });
    } catch (err) {
      console.error("Error creating video room:", err);
      return NextResponse.json({ error: "Failed to create the video room for this session" }, { status: 502 });
    }

    const adminSupabase = createAdminClient();
    const { data: session, error: insertErr } = await adminSupabase
      .from("live_sessions")
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        session_type,
        starts_at,
        duration_minutes,
        assigned_user_id: isMockInterview ? assigned_user_id : null,
        daily_room_name: room.name,
        daily_room_url: room.url,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (insertErr || !session) {
      console.error("Error inserting live session:", insertErr);
      return NextResponse.json({ error: insertErr?.message || "Failed to save the session" }, { status: 500 });
    }

    return NextResponse.json({ success: true, session });
  } catch (err) {
    console.error("Error in POST /api/admin/live-sessions:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
