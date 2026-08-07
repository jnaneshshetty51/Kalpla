import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateUserRoadmap } from "@/lib/roadmap/generate";
import { getDashboardAggregateData } from "@/lib/dashboard/aggregate";

export async function GET() {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const adminSupabase = createAdminClient();

    // Same overall readiness computation the dashboard uses (Prompt 1's
    // signature ReadinessGauge reads this everywhere it appears) — reused
    // here rather than re-derived, so the number can't drift between pages.
    const { overallScore } = await getDashboardAggregateData(user.id);

    // 1. Strictly query latest stored roadmap from database cache
    const { data: dbRoadmap, error } = await adminSupabase
      .from("roadmaps")
      .select("id, user_id, generated_at, nodes")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error querying cached roadmap:", error);
    }

    // 2. Return cached DB record immediately without invoking LLM proxy
    if (dbRoadmap) {
      return NextResponse.json({
        roadmap: dbRoadmap,
        cached: true,
        overallScore,
      });
    }

    // 3. First-time initialization: generate and persist roadmap if no record exists
    const newRoadmap = await generateUserRoadmap({ userId: user.id });
    return NextResponse.json({
      roadmap: newRoadmap,
      cached: false,
      overallScore,
    });
  } catch (err) {
    console.error("Error in GET /api/roadmap:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
