import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ project: string }> },
) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const { project: projectId } = await params;
    const adminSupabase = createAdminClient();

    const { data: project, error: projectErr } = await adminSupabase
      .from("projects")
      .select("id, name, tier, spec, starter_template, reference_solution")
      .eq("id", projectId)
      .maybeSingle();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Free projects are open to everyone; anything else requires a
    // subscription at or above that tier. This was previously unenforced
    // here — the frontend project list hid pro-tier projects from free
    // users, but this endpoint itself returned the full spec/starter
    // template to any authenticated caller who knew or guessed the ID.
    if (project.tier !== "free") {
      const { data: subscription } = await adminSupabase
        .from("subscriptions")
        .select("tier")
        .eq("user_id", user.id)
        .maybeSingle();

      const tierRank: Record<string, number> = { free: 0, pro: 1, premium: 2 };
      const userTier = subscription?.tier || "free";
      if ((tierRank[userTier] ?? 0) < (tierRank[project.tier] ?? 0)) {
        return NextResponse.json(
          { error: `This project requires a ${project.tier} subscription` },
          { status: 403 },
        );
      }
    }

    // Resume from the user's most recent submission for this project, if
    // any, so returning to the workspace doesn't lose prior work.
    const { data: latestSubmission } = await adminSupabase
      .from("submissions")
      .select("id, code, status, ai_review, metadata, created_at")
      .eq("user_id", user.id)
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: hintsUsedTotal } = await adminSupabase
      .from("workspace_hints")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("project_id", project.id);

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        tier: project.tier,
        spec: project.spec,
        starter_template: project.starter_template,
        has_reference_solution: !!project.reference_solution,
      },
      resume_code: latestSubmission?.code || project.starter_template || "",
      latest_submission: latestSubmission || null,
      hints_used_total: hintsUsedTotal || 0,
    });
  } catch (err) {
    console.error("Error in GET /api/workspace/[project]:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
