import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // No tables exist yet, so a "relation not found" (PGRST205) response
  // still proves we reached Supabase's Data API and authenticated
  // successfully — that's what "connected" means at this stage. Any other
  // error (network failure, invalid key, etc.) means the connection itself
  // is broken.
  const { error } = await supabase
    .from("_health_check")
    .select("*", { head: true, count: "exact" });

  const connected = !error || error.code === "PGRST205";

  return NextResponse.json(
    {
      status: connected ? "ok" : "error",
      supabase: connected ? "reachable" : "unreachable",
      timestamp: new Date().toISOString(),
      ...(error && error.code !== "PGRST205" ? { error: error.message } : {}),
    },
    { status: connected ? 200 : 503 },
  );
}
