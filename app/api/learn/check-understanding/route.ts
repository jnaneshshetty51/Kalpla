import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { gradeAssessmentAttempt } from "@/lib/assessment/grader";
import { markLessonComplete } from "@/lib/lessons/markComplete";
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

    if (checkRateLimit(user.id, "check_understanding", 10, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    // 2. Parse and validate payload
    let body: { skill_node_id?: string; question?: string; response?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const { skill_node_id, question, response } = body;

    if (!skill_node_id || typeof skill_node_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'skill_node_id' parameter" },
        { status: 400 },
      );
    }

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'question' parameter" },
        { status: 400 },
      );
    }

    if (!response || typeof response !== "string" || !response.trim()) {
      return NextResponse.json(
        { error: "Missing or empty 'response' parameter" },
        { status: 400 },
      );
    }

    // 3. Construct mock task object with lightweight rubric for inline comprehension check
    const mockTask = {
      id: `check-${skill_node_id}`,
      skill_node_id: skill_node_id,
      type: "short_answer",
      prompt: question,
      rubric: {
        criteria: [
          {
            id: "comprehension",
            name: "Concept Comprehension",
            description: "Candidate demonstrates clear understanding of the core concept.",
          },
          {
            id: "relevance",
            name: "Technical Relevance",
            description: "Answer directly addresses the discussion question.",
          },
        ],
      },
    };

    // 4. Grade attempt using lighter rubric pipeline
    const grading = await gradeAssessmentAttempt({
      task: mockTask,
      response: { answer: response.trim() },
      userId: user.id,
    });

    const passed = grading.ai_score >= 70;

    // 5. Trigger unified lesson completion if passed
    if (passed) {
      try {
        await markLessonComplete({
          userId: user.id,
          skillNodeId: skill_node_id,
          score: grading.ai_score,
          source: "check_understanding",
        });
      } catch (statusErr) {
        console.error("Error marking lesson complete from check-understanding:", statusErr);
      }
    }

    return NextResponse.json({
      grading: {
        score: grading.ai_score,
        feedback: grading.ai_feedback,
        confidence: grading.confidence,
        passed,
      },
    });
  } catch (err) {
    if (err instanceof UsageCapExceededError) {
      return NextResponse.json(err.details, { status: 429 });
    }
    console.error("Error in POST /api/learn/check-understanding:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
