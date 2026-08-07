import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDailyTasks, DailyTask } from "@/lib/coach/generateDailyTasks";

/**
 * GET: reads today's task list from daily_coach_logs — the daily cron job
 * (Prompt 77) is the intended single source of truth. If no row exists yet
 * for today (cron hasn't run, or first login of the day before it fires),
 * generates once and stores it, so every subsequent read this same day is
 * a pure read, not a fresh generation (Prompt 78).
 */
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
    const today = new Date().toISOString().split("T")[0];

    const { data: existing } = await adminSupabase
      .from("daily_coach_logs")
      .select("id, date, tasks, completed")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ log: existing, generated_fresh: false });
    }

    const { tasks } = await generateDailyTasks(user.id);

    const { data: created, error: insertErr } = await adminSupabase
      .from("daily_coach_logs")
      .insert({ user_id: user.id, date: today, tasks, completed: false })
      .select("id, date, tasks, completed")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ log: created, generated_fresh: true });
  } catch (err) {
    console.error("Error in GET /api/dashboard/coach-tasks:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH: check off (or un-check) an individual task by index within
 * today's stored task list, and mark the whole log completed once every
 * task is checked.
 */
export async function PATCH(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    let body: { task_index?: number; done?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { task_index, done } = body;
    if (typeof task_index !== "number" || typeof done !== "boolean") {
      return NextResponse.json({ error: "Missing 'task_index' or 'done'" }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    const { data: log } = await adminSupabase
      .from("daily_coach_logs")
      .select("id, tasks")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle();

    if (!log) {
      return NextResponse.json({ error: "No task list found for today" }, { status: 404 });
    }

    const tasks = (log.tasks as (DailyTask & { done?: boolean })[]) || [];
    if (task_index < 0 || task_index >= tasks.length) {
      return NextResponse.json({ error: "Invalid task_index" }, { status: 400 });
    }

    tasks[task_index] = { ...tasks[task_index], done };
    const allDone = tasks.every((t) => t.done);

    const { data: updated, error: updateErr } = await adminSupabase
      .from("daily_coach_logs")
      .update({ tasks, completed: allDone })
      .eq("id", log.id)
      .select("id, date, tasks, completed")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ log: updated });
  } catch (err) {
    console.error("Error in PATCH /api/dashboard/coach-tasks:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
