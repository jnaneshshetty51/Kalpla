import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { markLessonComplete } from "@/lib/lessons/markComplete";

export async function POST(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    let body: { skill_node_id?: string; score?: number; source?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const { skill_node_id, score, source } = body;

    if (!skill_node_id || typeof skill_node_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'skill_node_id' parameter" },
        { status: 400 },
      );
    }

    const result = await markLessonComplete({
      userId: user.id,
      skillNodeId: skill_node_id,
      score: typeof score === "number" ? score : 85.0,
      source: (source as "check_understanding" | "manual_button" | "tutor_interaction") || "manual_button",
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("Error in POST /api/learn/mark-complete:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
