import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCaseStudy } from "@/lib/portfolio/generateCaseStudy";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    if (checkRateLimit(user.id, "portfolio_casestudy", 3, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    let body: { submission_id?: string; force?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { submission_id, force } = body;
    if (!submission_id || typeof submission_id !== "string") {
      return NextResponse.json({ error: "Missing 'submission_id'" }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data: submission } = await adminSupabase
      .from("submissions")
      .select("user_id")
      .eq("id", submission_id)
      .maybeSingle();

    if (!submission || submission.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await generateCaseStudy({ submissionId: submission_id, force: !!force });
    return NextResponse.json({ case_study: result });
  } catch (err) {
    if (err instanceof UsageCapExceededError) {
      return NextResponse.json(err.details, { status: 429 });
    }
    console.error("Error in POST /api/portfolio/case-study:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
