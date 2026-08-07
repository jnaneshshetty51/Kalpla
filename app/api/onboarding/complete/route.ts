import { NextResponse } from "next/server";
import { getServerUser, createClient } from "@/lib/supabase/server";

const VALID_EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];

/**
 * POST /api/onboarding/complete
 *
 * Writes onboarding answers to the caller's own public.users row. Uses the
 * regular per-request session client (not the admin client) so this goes
 * through RLS's "Users can update own profile" policy rather than bypassing
 * it — there's no reason to reach for service-role privileges for a user
 * updating their own profile fields.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    goal?: string;
    experience_level?: string;
    time_budget_minutes_per_day?: number | string;
    timeline_days?: number | string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const experienceLevel = body.experience_level;
  const timeBudget = Number(body.time_budget_minutes_per_day);
  const timeline = Number(body.timeline_days);

  if (!name) {
    return NextResponse.json(
      { error: "Missing or invalid 'name'" },
      { status: 400 },
    );
  }
  if (!goal) {
    return NextResponse.json(
      { error: "Missing or invalid 'goal'" },
      { status: 400 },
    );
  }
  if (
    typeof experienceLevel !== "string" ||
    !VALID_EXPERIENCE_LEVELS.includes(experienceLevel)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid 'experience_level': must be beginner, intermediate, or advanced",
      },
      { status: 400 },
    );
  }
  if (!Number.isFinite(timeBudget) || timeBudget <= 0) {
    return NextResponse.json(
      {
        error:
          "Invalid 'time_budget_minutes_per_day': must be a positive number",
      },
      { status: 400 },
    );
  }
  if (!Number.isFinite(timeline) || timeline <= 0) {
    return NextResponse.json(
      { error: "Invalid 'timeline_days': must be a positive number" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update({
      name,
      goal,
      experience_level: experienceLevel,
      time_budget_minutes_per_day: timeBudget,
      timeline_days: timeline,
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
