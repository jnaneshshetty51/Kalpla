import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewSubmission, SubmissionReview } from "@/lib/grading/reviewSubmission";
import { flagSubmissionForReview } from "@/lib/grading/reviewQueue";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

const MAX_RE_REVIEWS_PER_SUBMISSION = 2;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    if (checkRateLimit(user.id, "submission_re_review", 3, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    let body: { clarification?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { clarification } = body;
    if (!clarification || !clarification.trim()) {
      return NextResponse.json({ error: "Missing 'clarification'" }, { status: 400 });
    }

    const { id } = await params;
    const adminSupabase = createAdminClient();

    const { data: submission, error: subErr } = await adminSupabase
      .from("submissions")
      .select("id, user_id, project_id, code, reflection, ai_review, metadata")
      .eq("id", id)
      .maybeSingle();

    if (subErr || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const priorRequests: Array<{ clarification: string; created_at: string }> =
      submission.metadata?.re_review_requests || [];

    if (priorRequests.length >= MAX_RE_REVIEWS_PER_SUBMISSION) {
      return NextResponse.json(
        {
          error: `Re-review limit reached (${MAX_RE_REVIEWS_PER_SUBMISSION} per submission).`,
        },
        { status: 429 },
      );
    }

    const { data: project, error: projectErr } = await adminSupabase
      .from("projects")
      .select("id, name, spec")
      .eq("id", submission.project_id)
      .maybeSingle();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const newReview = await reviewSubmission({
      userId: user.id,
      project: { id: project.id, name: project.name, spec: project.spec },
      code: submission.code,
      reflection: submission.reflection || undefined,
      clarification: clarification.trim(),
      priorReview: submission.ai_review as SubmissionReview,
    });

    const updatedRequests = [
      ...priorRequests,
      { clarification: clarification.trim(), created_at: new Date().toISOString() },
    ];

    await adminSupabase
      .from("submissions")
      .update({
        ai_review: newReview,
        metadata: { ...submission.metadata, re_review_requests: updatedRequests },
      })
      .eq("id", id);

    if (
      newReview.is_ambiguous ||
      newReview.confidence === "low" ||
      newReview.failedValidationAfterRetry
    ) {
      await flagSubmissionForReview({
        submissionId: id,
        reason: newReview.failedValidationAfterRetry ? "schema_validation_failed" : "low_confidence",
        details: { re_review: true, clarification: clarification.trim() },
      });
    }

    return NextResponse.json({
      review: newReview,
      re_reviews_used: updatedRequests.length,
      re_reviews_remaining: MAX_RE_REVIEWS_PER_SUBMISSION - updatedRequests.length,
    });
  } catch (err) {
    if (err instanceof UsageCapExceededError) {
      return NextResponse.json(err.details, { status: 429 });
    }
    console.error("Error in POST /api/submissions/[id]/re-review:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
