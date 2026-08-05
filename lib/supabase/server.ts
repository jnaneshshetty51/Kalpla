import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { UserProfile } from "@/types/user";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore because
            // middleware refreshes the session on every request.
          }
        },
      },
    },
  );
}

/**
 * Server-side helper to retrieve the authenticated Supabase user
 * along with their corresponding profile from the `users` table.
 */
export async function getServerUser(): Promise<{
  user: import("@supabase/supabase-js").User | null;
  profile: UserProfile | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { user: null, profile: null };
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching user profile:", profileError);
    }

    // If profile row doesn't exist yet (e.g. edge case or trigger delay), return minimal fallback object
    if (!profile && user) {
      const fallbackProfile: UserProfile = {
        id: user.id,
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          null,
        goal: null,
        experience_level: null,
        time_budget_minutes_per_day: null,
        timeline_days: null,
        role: "user",
        created_at: user.created_at,
        updated_at: user.created_at,
      };
      return { user, profile: fallbackProfile };
    }

    return { user, profile: profile as UserProfile | null };
  } catch (error) {
    console.error("Unexpected error in getServerUser:", error);
    return { user: null, profile: null };
  }
}
