import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAuth } from "@/lib/admin/verifyAdminAuth";
import { LiveSessionType } from "@/types/liveSession";

const SESSION_TYPES: LiveSessionType[] = ["live_class", "architecture_session", "office_hours", "mock_interview"];

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Fields a client is allowed to change. daily_room_name/daily_room_url/
// reminder_sent_at are system-managed and deliberately not editable here.
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const auth = await verifyAdminAuth();
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    let body: {
      title?: string;
      description?: string | null;
      session_type?: string;
      starts_at?: string;
      duration_minutes?: number;
      assigned_user_id?: string | null;
      cancelled_at?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data: existing, error: fetchErr } = await adminSupabase
      .from("live_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      console.error("Error fetching live session for update:", fetchErr);
      return NextResponse.json({ error: "Failed to load the session" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ error: "'title' cannot be empty" }, { status: 400 });
      }
      update.title = body.title.trim();
    }
    if (body.description !== undefined) update.description = body.description?.trim() || null;
    if (body.starts_at !== undefined) {
      if (typeof body.starts_at !== "string" || Number.isNaN(Date.parse(body.starts_at))) {
        return NextResponse.json({ error: "Invalid 'starts_at' (expected an ISO timestamp)" }, { status: 400 });
      }
      update.starts_at = body.starts_at;
    }
    if (body.duration_minutes !== undefined) {
      if (typeof body.duration_minutes !== "number" || body.duration_minutes <= 0) {
        return NextResponse.json({ error: "Invalid 'duration_minutes' (must be a positive number)" }, { status: 400 });
      }
      update.duration_minutes = body.duration_minutes;
    }
    if (body.cancelled_at !== undefined) update.cancelled_at = body.cancelled_at;

    // Resolve the effective session_type/assigned_user_id (existing row
    // values unless this request changes them) to re-validate the same
    // mock_interview <-> assigned_user_id invariant the DB constraint
    // enforces, so a bad combination is caught here with a clear 400
    // rather than surfacing as an opaque Postgres constraint error.
    if (body.session_type !== undefined) {
      if (!SESSION_TYPES.includes(body.session_type as LiveSessionType)) {
        return NextResponse.json({ error: `'session_type' must be one of: ${SESSION_TYPES.join(", ")}` }, { status: 400 });
      }
      update.session_type = body.session_type;
    }
    if (body.assigned_user_id !== undefined) update.assigned_user_id = body.assigned_user_id;

    const effectiveType = (update.session_type as string) ?? existing.session_type;
    const effectiveAssignedId = "assigned_user_id" in update ? update.assigned_user_id : existing.assigned_user_id;
    const isMockInterview = effectiveType === "mock_interview";
    if (isMockInterview && !effectiveAssignedId) {
      return NextResponse.json({ error: "'assigned_user_id' is required for mock_interview sessions" }, { status: 400 });
    }
    if (!isMockInterview && effectiveAssignedId) {
      return NextResponse.json({ error: "'assigned_user_id' is only valid for mock_interview sessions" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await adminSupabase
      .from("live_sessions")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updateErr || !updated) {
      console.error("Error updating live session:", updateErr);
      return NextResponse.json({ error: updateErr?.message || "Failed to update the session" }, { status: 500 });
    }

    return NextResponse.json({ success: true, session: updated });
  } catch (err) {
    console.error("Error in PATCH /api/admin/live-sessions/[id]:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
