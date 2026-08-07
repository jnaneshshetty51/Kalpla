import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
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

    const dashboardData = await getDashboardAggregateData(user.id);
    return NextResponse.json({ dashboard: dashboardData });
  } catch (err) {
    console.error("Error in GET /api/dashboard:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
