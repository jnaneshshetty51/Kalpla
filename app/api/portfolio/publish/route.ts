import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
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

    let body: { action?: "publish" | "unpublish"; custom_slug?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { action, custom_slug } = body;
    const adminSupabase = createAdminClient();

    if (action === "unpublish") {
      // Just flips visibility — does not delete published_projects, bio,
      // or any other portfolio data.
      const { data: updated, error } = await adminSupabase
        .from("portfolios")
        .update({ is_public: false })
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ portfolio: updated });
    }

    if (action === "publish") {
      const { data: portfolio, error: fetchErr } = await adminSupabase
        .from("portfolios")
        .select("user_id, slug, published_projects")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchErr || !portfolio) {
        return NextResponse.json({ error: "Portfolio not found — load it first" }, { status: 404 });
      }

      if (!portfolio.published_projects || portfolio.published_projects.length === 0) {
        return NextResponse.json(
          { error: "Select at least one project to publish before going live." },
          { status: 400 },
        );
      }

      let slugToUse = portfolio.slug;

      if (custom_slug) {
        const normalized = normalizeSlug(custom_slug);
        if (!SLUG_PATTERN.test(normalized)) {
          return NextResponse.json(
            {
              error:
                "Slug must be 3-40 characters, lowercase letters/numbers/hyphens only, and can't start or end with a hyphen.",
            },
            { status: 400 },
          );
        }

        const { data: taken } = await adminSupabase
          .from("portfolios")
          .select("user_id")
          .eq("slug", normalized)
          .neq("user_id", user.id)
          .maybeSingle();

        if (taken) {
          return NextResponse.json({ error: "That slug is already taken." }, { status: 409 });
        }

        slugToUse = normalized;
      }

      const { data: updated, error: updateErr } = await adminSupabase
        .from("portfolios")
        .update({ slug: slugToUse, is_public: true })
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateErr) {
        // Unique constraint race: another user grabbed the slug between
        // our check and this write.
        if (updateErr.message.includes("duplicate key")) {
          return NextResponse.json({ error: "That slug is already taken." }, { status: 409 });
        }
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ portfolio: updated });
    }

    return NextResponse.json({ error: "Invalid 'action': expected 'publish' or 'unpublish'" }, { status: 400 });
  } catch (err) {
    console.error("Error in POST /api/portfolio/publish:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
