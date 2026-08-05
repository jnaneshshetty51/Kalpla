import "server-only";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * Server-side hook fallback to ensure a user profile exists in `public.users`.
 * Can be called after signup or in callback handler if DB trigger is delayed.
 *
 * Kept out of lib/supabase/auth.ts: that module is imported by AuthProvider
 * (a Client Component), and this function depends on the cookie-based
 * server client (next/headers), which can't be bundled into client code.
 */
export async function ensureUserProfileExists(
  userId: string,
  metadata?: { name?: string | null; email?: string | null },
) {
  try {
    const supabase = await createServerClient();

    const { data: existingProfile } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existingProfile) {
      const name = metadata?.name || metadata?.email?.split("@")[0] || null;

      await supabase.from("users").insert({
        id: userId,
        name,
        role: "user",
      });
    }
  } catch (err) {
    console.error("Error in ensureUserProfileExists hook:", err);
  }
}
