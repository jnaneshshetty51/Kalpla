import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";

/**
 * Shared server-side admin auth guard for all admin API routes.
 * Returns { user, profile } if the caller is an authenticated admin.
 * Returns a 403 NextResponse if not — callers should return this immediately.
 *
 * NEVER rely on client-side route protection alone. Every admin API route
 * must call this independently.
 */
export async function verifyAdminAuth(): Promise<
  | {
      authorized: true;
      user: import("@supabase/supabase-js").User;
      profile: import("@/types/user").UserProfile;
    }
  | { authorized: false; response: NextResponse }
> {
  const { user, profile } = await getServerUser();

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized: No active session" },
        { status: 401 },
      ),
    };
  }

  if (!profile || profile.role !== "admin") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 },
      ),
    };
  }

  return { authorized: true, user, profile };
}
