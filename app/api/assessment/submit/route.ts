import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeAssessmentAttempt } from "@/lib/assessment/grader";
import { recomputeAndSaveNodeScore } from "@/lib/skillGraph/updateScore";
import { flagAttemptForReview } from "@/lib/grading/reviewQueue";
import { updateRoadmapNodeStatus } from "@/lib/roadmap/updateStatus";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    if (checkRateLimit(user.id, "assessment_submit", 5, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    // 2. Parse and validate payload
    let body: { task_id?: string; response?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const { task_id, response } = body;

    if (!task_id || typeof task_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'task_id' parameter" },
        { status: 400 },
      );
    }

    if (response === undefined || response === null) {
      return NextResponse.json(
        { error: "Missing 'response' parameter" },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();

    // 3. Fetch assessment task details
    const { data: dbTask } = await adminSupabase
      .from("assessment_tasks")
      .select("id, skill_node_id, type, prompt, rubric")
      .eq("id", task_id)
      .maybeSingle();

    const taskObj = dbTask || {
      id: task_id,
      skill_node_id: "a0000000-0000-4000-a000-000000000101",
      type: "short_answer",
      prompt: "Assessment Task Prompt",
      rubric: {},
    };

    // 4. Insert initial attempt row in assessment_attempts
    const formattedResponse =
      typeof response === "object" && response !== null
        ? response
        : { answer: String(response) };

    const { data: initialAttempt, error: insertErr } = await adminSupabase
      .from("assessment_attempts")
      .insert({
        user_id: user.id,
        task_id: task_id,
        response: formattedResponse,
      })
      .select()
      .single();

    if (insertErr || !initialAttempt) {
      console.error("Error inserting assessment attempt:", insertErr);
      return NextResponse.json(
        { error: insertErr?.message || "Failed to record attempt" },
        { status: 500 },
      );
    }

    // 5. Trigger AI grading pipeline synchronously
    const grading = await gradeAssessmentAttempt({
      task: taskObj,
      response,
      userId: user.id,
    });

    // 6. Update assessment_attempts row with grading results
    const { error: updateErr } = await adminSupabase
      .from("assessment_attempts")
      .update({
        ai_score: grading.ai_score,
        ai_feedback: grading.ai_feedback,
        confidence: grading.confidence,
      })
      .eq("id", initialAttempt.id);

    if (updateErr) {
      console.error("Error updating attempt grading:", updateErr);
    }

    // 7. Flag attempt for admin review if low confidence or schema validation failure occurred
    if (grading.failed_validation) {
      await flagAttemptForReview({
        attemptId: initialAttempt.id,
        reason: "schema_validation_failed",
        details: {
          task_id,
          ai_score: grading.ai_score,
          confidence: grading.confidence,
          feedback_summary: grading.ai_feedback?.summary,
        },
      });
    } else if (grading.confidence_level === "low" || grading.confidence <= 0.70) {
      await flagAttemptForReview({
        attemptId: initialAttempt.id,
        reason: "low_confidence",
        details: {
          task_id,
          ai_score: grading.ai_score,
          confidence: grading.confidence,
          confidence_level: grading.confidence_level,
        },
      });
    }

    // 8. Recalculate skill node competency score — via the shared
    // recomputeAndSaveNodeScore (not a local reimplementation): it scopes
    // to attempts on tasks belonging to THIS skill node only. An earlier
    // inline version here queried the user's entire attempt history across
    // every skill node they'd ever touched, so a node's stored competency
    // score ended up blended with whatever the user most recently answered
    // on a completely unrelated node — confirmed live (a correct answer on
    // node A followed by an incorrect answer on node B produced node B's
    // score as a weighted blend of both, not B's own 0%).
    let competencyScore = grading.ai_score;
    let newlyUnlockedNodes: Array<{ skillNodeId: string; nodeName: string }> = [];

    try {
      const recomputed = await recomputeAndSaveNodeScore(user.id, taskObj.skill_node_id);
      competencyScore = recomputed.score;

      // 9. Update roadmap node status and unlock downstream nodes — the
      // unlock result was previously computed and discarded here, so a
      // diagnostic-assessment task that unlocked a new node never surfaced
      // that to the frontend, unlike lib/lessons/markComplete.ts's
      // equivalent path, which already threads this through.
      const statusResult = await updateRoadmapNodeStatus({
        userId: user.id,
        skillNodeId: taskObj.skill_node_id,
        score: competencyScore,
      });
      newlyUnlockedNodes = statusResult?.newlyUnlockedNodes ?? [];
    } catch (scoreErr) {
      console.error("Error updating competency score and roadmap status:", scoreErr);
    }

    // 10. Return score and feedback for real-time UI rendering
    return NextResponse.json({
      attempt_id: initialAttempt.id,
      ai_score: grading.ai_score,
      ai_feedback: grading.ai_feedback,
      confidence: grading.confidence,
      competency_score: competencyScore,
      newly_unlocked_nodes: newlyUnlockedNodes,
    });
  } catch (err) {
    if (err instanceof UsageCapExceededError) {
      return NextResponse.json(err.details, { status: 429 });
    }
    console.error("Error in POST /api/assessment/submit:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
