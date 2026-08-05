import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a server-side Supabase client using the SUPABASE_SERVICE_ROLE_KEY.
 * Bypasses Row Level Security (RLS) for trusted backend operations such as audit log insertion.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  }

  // Deliberately no fallback to the anon key here: cost_logs and the usage
  // RPC have no RLS/grant path for the authenticated role by design (see
  // their migrations), so an anon-key client would just fail every write
  // silently (caught and logged, not thrown, by the callers). Fail loudly
  // at client construction instead of degrading into silent no-op logging.
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
