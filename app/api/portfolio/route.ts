import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function slugFromName(name: string, fallback: string): string {
  const base = (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

/**
 * GET: auto-populates a draft portfolio from the user's passing project
 * submissions (Prompt 72) — title, code, and case-study summary (falling
 * back to a generation placeholder if none has been generated yet; the
 * caller can trigger generation via POST /api/portfolio/case-study).
 */
export async function GET() {
  try {
    const { user, profile } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const adminSupabase = createAdminClient();

    let { data: portfolio } = await adminSupabase
      .from("portfolios")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!portfolio) {
      const { data: created, error: createErr } = await adminSupabase
        .from("portfolios")
        .insert({
          user_id: user.id,
          slug: slugFromName(profile?.name || user.email || "user", user.id.slice(0, 8)),
          is_public: false,
        })
        .select()
        .single();

      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 500 });
      }
      portfolio = created;
    }

    // Draft candidates: every passing submission, most recent per project.
    interface PassingSubmissionRow {
      id: string;
      project_id: string | null;
      code: string;
      reflection: string | null;
      status: string;
      metadata: { case_study?: { summary: string } } | null;
      created_at: string;
    }

    const { data: passingSubmissions } = await adminSupabase
      .from("submissions")
      .select("id, project_id, code, reflection, status, metadata, created_at")
      .eq("user_id", user.id)
      .eq("status", "passed")
      .order("created_at", { ascending: false })
      .returns<PassingSubmissionRow[]>();

    const latestPassingByProject = new Map<string, PassingSubmissionRow>();
    for (const s of passingSubmissions || []) {
      if (!s.project_id) continue;
      if (!latestPassingByProject.has(s.project_id)) {
        latestPassingByProject.set(s.project_id, s);
      }
    }

    const projectIds = Array.from(latestPassingByProject.keys());
    const { data: projects } = projectIds.length
      ? await adminSupabase.from("projects").select("id, name").in("id", projectIds)
      : { data: [] };
    const projectNameById = new Map((projects || []).map((p) => [p.id, p.name]));

    const overrides = (portfolio.custom_content?.case_study_overrides || {}) as Record<string, string>;

    const draftProjects = Array.from(latestPassingByProject.values()).map((s) => ({
      submission_id: s.id,
      project_id: s.project_id,
      project_name: projectNameById.get(s.project_id!) || "Untitled Project",
      code: s.code,
      case_study: overrides[s.id] ?? s.metadata?.case_study?.summary ?? null,
      is_published: (portfolio!.published_projects || []).includes(s.id),
    }));

    return NextResponse.json({ portfolio, draft_projects: draftProjects });
  } catch (err) {
    console.error("Error in GET /api/portfolio:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH: edit bio, per-project case-study text overrides, and which
 * submissions are included — all editable before publishing (Prompt 72).
 */
export async function PATCH(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    let body: {
      bio?: string;
      case_study_overrides?: Record<string, string>;
      published_projects?: string[];
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: existing } = await adminSupabase
      .from("portfolios")
      .select("custom_content, published_projects")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Portfolio not found — load it first" }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {};

    if (typeof body.bio === "string") {
      updatePayload.bio = body.bio;
    }
    if (body.case_study_overrides && typeof body.case_study_overrides === "object") {
      updatePayload.custom_content = {
        ...existing.custom_content,
        case_study_overrides: {
          ...(existing.custom_content?.case_study_overrides || {}),
          ...body.case_study_overrides,
        },
      };
    }
    if (Array.isArray(body.published_projects)) {
      updatePayload.published_projects = body.published_projects;
    }

    const { data: updated, error: updateErr } = await adminSupabase
      .from("portfolios")
      .update(updatePayload)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ portfolio: updated });
  } catch (err) {
    console.error("Error in PATCH /api/portfolio:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
