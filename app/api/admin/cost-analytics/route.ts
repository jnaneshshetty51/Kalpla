import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAuth } from "@/lib/admin/verifyAdminAuth";

export async function GET(request: Request) {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get("days") || "30"), 90);

  const adminSupabase = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  // Fetch cost_logs for the selected window. cost_logs has no `provider`,
  // `total_tokens`, or `details` columns (this query 500'd unconditionally
  // before this fix) — total tokens is tokens_in+tokens_out, cache hits are
  // identified by model === "cache-hit" (lib/tutor/qaCache.ts's marker,
  // the only place a cache-hit gets logged), and provider isn't tracked
  // anywhere in the cost-logging pipeline so it's dropped rather than
  // invented.
  const { data: logs, error } = await adminSupabase
    .from("cost_logs")
    .select("user_id, feature, model, tokens_in, tokens_out, cost_usd, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = logs || [];

  // --- Time-series: cost aggregated per day ---
  const dayMap = new Map<string, number>();
  for (const row of rows) {
    const day = new Date(row.created_at).toISOString().substring(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + (row.cost_usd || 0));
  }
  const timeSeries = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost: Math.round(cost * 100000) / 100000 }));

  // --- Feature breakdown ---
  const featureMap = new Map<string, { cost: number; calls: number; cacheHits: number }>();
  for (const row of rows) {
    const f = row.feature || "unknown";
    const entry = featureMap.get(f) || { cost: 0, calls: 0, cacheHits: 0 };
    entry.cost += row.cost_usd || 0;
    entry.calls += 1;
    if (row.model === "cache-hit") entry.cacheHits += 1;
    featureMap.set(f, entry);
  }
  const featureBreakdown = Array.from(featureMap.entries())
    .map(([feature, d]) => ({
      feature,
      cost: Math.round(d.cost * 100000) / 100000,
      calls: d.calls,
      cacheHits: d.cacheHits,
    }))
    .sort((a, b) => b.cost - a.cost);

  // --- Model breakdown ---
  const modelMap = new Map<string, { cost: number; tokens: number; calls: number }>();
  for (const row of rows) {
    const m = row.model || "unknown";
    const entry = modelMap.get(m) || { cost: 0, tokens: 0, calls: 0 };
    entry.cost += row.cost_usd || 0;
    entry.tokens += (row.tokens_in || 0) + (row.tokens_out || 0);
    entry.calls += 1;
    modelMap.set(m, entry);
  }
  const modelBreakdown = Array.from(modelMap.entries())
    .map(([model, d]) => ({
      model,
      cost: Math.round(d.cost * 100000) / 100000,
      tokens: d.tokens,
      calls: d.calls,
    }))
    .sort((a, b) => b.cost - a.cost);

  // --- Cost per active user ---
  const activeUserIds = new Set(rows.filter((r) => r.user_id).map((r) => r.user_id));
  const totalCost = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);
  const costPerActiveUser =
    activeUserIds.size > 0
      ? Math.round((totalCost / activeUserIds.size) * 100000) / 100000
      : 0;

  // --- Total savings from cache hits ---
  const cacheHitRows = rows.filter((r) => r.model === "cache-hit");
  const totalSaved = cacheHitRows.length; // each cache hit = one avoided LLM call

  return NextResponse.json({
    days,
    since: sinceIso,
    totalCost: Math.round(totalCost * 100000) / 100000,
    totalCalls: rows.length,
    activeUsers: activeUserIds.size,
    costPerActiveUser,
    cacheHitCount: totalSaved,
    timeSeries,
    featureBreakdown,
    modelBreakdown,
  });
}
