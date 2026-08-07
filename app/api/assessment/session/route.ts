import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const { data: sessionData, error } = await adminSupabase
      .from("assessment_sessions")
      .select("user_id, current_index, answers, completed, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching assessment session:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session: sessionData || null });
  } catch (err) {
    console.error("Error in GET /api/assessment/session:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
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

    let body: {
      current_index?: number;
      answers?: Record<string, unknown>;
      completed?: boolean;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const currentIndex =
      typeof body.current_index === "number" ? body.current_index : 0;
    const answers = (body.answers as Record<string, unknown>) || {};
    const completed = !!body.completed;

    const adminSupabase = createAdminClient();

    const { data: updatedSession, error: upsertErr } = await adminSupabase
      .from("assessment_sessions")
      .upsert(
        {
          user_id: user.id,
          current_index: currentIndex,
          answers,
          completed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    if (upsertErr) {
      console.error("Error saving assessment session:", upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ session: updatedSession });
  } catch (err) {
    console.error("Error in POST /api/assessment/session:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
