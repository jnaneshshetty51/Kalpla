import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { generateUserRoadmap } from "@/lib/roadmap/generate";
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

    if (checkRateLimit(user.id, "roadmap_generate", 3, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    let body: {
      goal?: string;
      timeBudgetHoursPerWeek?: number;
      skipThreshold?: number;
    } = {};

    try {
      body = await request.json();
    } catch {
      // Optional body parameters
    }

    const roadmap = await generateUserRoadmap({
      userId: user.id,
      goal: body.goal,
      timeBudgetHoursPerWeek: body.timeBudgetHoursPerWeek,
      skipThreshold: body.skipThreshold,
    });

    return NextResponse.json({ roadmap });
  } catch (err) {
    console.error("Error in POST /api/roadmap/generate:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
