import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewSubmission } from "@/lib/grading/reviewSubmission";
import { flagSubmissionForReview } from "@/lib/grading/reviewQueue";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Maps the qualitative confidence enum to a numeric value so it can share
 * the same 0.70 threshold used for assessment attempts (Prompt 25).
 */
function confidenceToScore(level: "high" | "medium" | "low"): number {
  if (level === "high") return 0.95;
  if (level === "medium") return 0.8;
  return 0.5;
}

export async function POST(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    if (checkRateLimit(user.id, "submission_create", 5, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    let body: {
      project_id?: string;
      code?: string;
      reflection?: string;
      test_results?: Array<{ function: string; passed: boolean; error?: string | null }>;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { project_id, code, reflection, test_results } = body;
    if (!project_id || typeof project_id !== "string") {
      return NextResponse.json({ error: "Missing 'project_id'" }, { status: 400 });
    }
    if (typeof code !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'code'" }, { status: 400 });
    }
    // Prompt 71: a short written reflection is a required part of every
    // project submission, not optional metadata.
    if (!reflection || !reflection.trim()) {
      return NextResponse.json(
        { error: "A written reflection is required: what was hardest about this project, what would you do differently?" },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();

    const { data: project, error: projectErr } = await adminSupabase
      .from("projects")
      .select("id, name, spec")
      .eq("id", project_id)
      .maybeSingle();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { count: hintsUsedTotal } = await adminSupabase
      .from("workspace_hints")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("project_id", project_id);

    const testsAllPassed =
      Array.isArray(test_results) && test_results.length > 0
        ? test_results.every((t) => t.passed)
        : false;

    // Every "Submit" writes a brand-new row — submission history (Prompt
    // 59) matters for tracking improvement across attempts, so this never
    // overwrites a prior submission for this user/project.
    const { data: submission, error: insertErr } = await adminSupabase
      .from("submissions")
      .insert({
        user_id: user.id,
        project_id,
        code,
        reflection: reflection.trim(),
        status: "pending",
        metadata: {
          hints_used: hintsUsedTotal || 0,
          test_results: test_results || [],
        },
      })
      .select()
      .single();

    if (insertErr || !submission) {
      return NextResponse.json(
        { error: insertErr?.message || "Failed to create submission" },
        { status: 500 },
      );
    }

    const review = await reviewSubmission({
      userId: user.id,
      project: { id: project.id, name: project.name, spec: project.spec },
      code,
      reflection: reflection.trim(),
      testResults: test_results,
    });

    const finalStatus = testsAllPassed ? "passed" : "failed";

    await adminSupabase
      .from("submissions")
      .update({
        status: finalStatus,
        ai_review: review,
      })
      .eq("id", submission.id);

    // Prompt 63: wire into the same confidence-flagging pipeline as
    // assessment attempts (Prompt 25) — low confidence or an explicit
    // ambiguity flag from the reviewer goes to human spot-check.
    if (review.failedValidationAfterRetry) {
      await flagSubmissionForReview({
        submissionId: submission.id,
        reason: "schema_validation_failed",
        details: { project_id, overall_score: review.overall_score },
      });
    } else if (
      review.is_ambiguous ||
      confidenceToScore(review.confidence) <= LOW_CONFIDENCE_THRESHOLD
    ) {
      await flagSubmissionForReview({
        submissionId: submission.id,
        reason: "low_confidence",
        details: {
          project_id,
          overall_score: review.overall_score,
          confidence: review.confidence,
          is_ambiguous: review.is_ambiguous,
        },
      });
    }

    return NextResponse.json({
      submission: { id: submission.id, status: finalStatus, ai_review: review },
    });
  } catch (err) {
    if (err instanceof UsageCapExceededError) {
      return NextResponse.json(err.details, { status: 429 });
    }
    console.error("Error in POST /api/submissions:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
