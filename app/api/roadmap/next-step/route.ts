import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { getRecommendedNextStep } from "@/lib/roadmap/nextStep";

export async function GET() {
  try {
    const { user } = await getServerUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const nextStep = await getRecommendedNextStep(user.id);
    return NextResponse.json({ next_step: nextStep });
  } catch (err) {
    console.error("Error in GET /api/roadmap/next-step:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
