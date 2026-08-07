import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, profile } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const adminSupabase = createAdminClient();

    const { data: submission, error } = await adminSupabase
      .from("submissions")
      .select("id, user_id, project_id, code, reflection, ai_review, status, metadata, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Owner or admin only — mirrors the RLS policy on submissions
    // (users can view own; admins have full access) so the service-role
    // read here doesn't leak other users' reviews.
    if (submission.user_id !== user.id && profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: project } = await adminSupabase
      .from("projects")
      .select("id, name, spec")
      .eq("id", submission.project_id)
      .maybeSingle();

    return NextResponse.json({ submission, project });
  } catch (err) {
    console.error("Error in GET /api/submissions/[id]:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
