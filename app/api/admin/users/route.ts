import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAuth } from "@/lib/admin/verifyAdminAuth";

export async function GET(request: Request) {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const userId = searchParams.get("userId");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = 20;

  const adminSupabase = createAdminClient();

  // --- Single user detail view ---
  if (userId) {
    const { data: profile } = await adminSupabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    const { data: scores } = await adminSupabase
      .from("competency_scores")
      .select("skill_node_id, score, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    const { data: roadmap } = await adminSupabase
      .from("roadmaps")
      .select("nodes, generated_at")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: submissions } = await adminSupabase
      .from("assessment_attempts")
      .select("id, task_id, ai_score, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    const scoreArr = scores || [];
    const avgReadiness =
      scoreArr.length > 0
        ? Math.round(scoreArr.reduce((s, r) => s + (r.score || 0), 0) / scoreArr.length)
        : 0;

    return NextResponse.json({
      profile,
      readinessPct: avgReadiness,
      competencyScores: scoreArr,
      roadmap: roadmap || null,
      recentSubmissions: submissions || [],
    });
  }

  // --- Paginated user list with search ---
  // public.users has no email/full_name/tier/onboarding_completed/
  // last_active_at columns (this query 500'd unconditionally before this
  // fix). email lives in auth.users (Admin API only, not the data API);
  // tier lives in subscriptions; there's no dedicated activity-tracking
  // column at all, so "last active" is approximated from the most recent
  // real signal available per user (a cost_logs row, an assessment
  // attempt, or their profile's updated_at) rather than fabricated.
  const { data: profiles, error: profilesErr } = await adminSupabase
    .from("users")
    .select("id, name, role, created_at, updated_at");

  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 });

  const { data: authList, error: authErr } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  const emailById = new Map(authList.users.map((u) => [u.id, u.email || ""]));

  const { data: subs } = await adminSupabase.from("subscriptions").select("user_id, tier");
  const tierById = new Map((subs || []).map((s) => [s.user_id, s.tier as string]));

  const { data: costActivity } = await adminSupabase
    .from("cost_logs")
    .select("user_id, created_at")
    .order("created_at", { ascending: false });
  const lastCostByUser = new Map<string, string>();
  for (const row of costActivity || []) {
    if (!lastCostByUser.has(row.user_id)) lastCostByUser.set(row.user_id, row.created_at);
  }

  const { data: attemptActivity } = await adminSupabase
    .from("assessment_attempts")
    .select("user_id, created_at")
    .order("created_at", { ascending: false });
  const lastAttemptByUser = new Map<string, string>();
  for (const row of attemptActivity || []) {
    if (!lastAttemptByUser.has(row.user_id)) lastAttemptByUser.set(row.user_id, row.created_at);
  }

  const { data: allScores } = await adminSupabase.from("competency_scores").select("user_id, score");
  const scoresByUser = new Map<string, number[]>();
  for (const s of allScores || []) {
    const arr = scoresByUser.get(s.user_id) || [];
    arr.push(s.score);
    scoresByUser.set(s.user_id, arr);
  }

  let merged = (profiles || []).map((p) => {
    const candidates = [p.updated_at, lastCostByUser.get(p.id), lastAttemptByUser.get(p.id)].filter(
      (v): v is string => !!v,
    );
    const last_active_at = candidates.length
      ? candidates.reduce((a, b) => (a > b ? a : b))
      : p.created_at;
    const sc = scoresByUser.get(p.id) || [];
    const readinessPct = sc.length > 0 ? Math.round(sc.reduce((s, v) => s + v, 0) / sc.length) : 0;

    return {
      id: p.id,
      email: emailById.get(p.id) || "",
      full_name: p.name,
      role: p.role,
      tier: tierById.get(p.id) || "free",
      last_active_at,
      created_at: p.created_at,
      readinessPct,
    };
  });

  if (search) {
    const needle = search.toLowerCase();
    merged = merged.filter(
      (u) => u.email.toLowerCase().includes(needle) || (u.full_name || "").toLowerCase().includes(needle),
    );
  }

  merged.sort((a, b) => (a.last_active_at < b.last_active_at ? 1 : -1));

  const total = merged.length;
  const paged = merged.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    users: paged,
    total,
    page,
    pageSize,
  });
}
