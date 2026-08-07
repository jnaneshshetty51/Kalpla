import { createClient as createBrowserClient } from "@/lib/supabase/client";

export interface SignUpParams {
  email: string;
  password: string;
  name?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface OAuthParams {
  redirectTo?: string;
}

/**
 * Sign up a user with email and password.
 * Passes the user's name in raw_user_meta_data so the Postgres handle_new_user()
 * trigger can populate the `name` column in public.users automatically.
 */
export async function signUpWithEmail({ email, password, name }: SignUpParams) {
  const supabase = createBrowserClient();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const response = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        full_name: name || undefined,
      },
    },
  });

  return response;
}

/**
 * Sign in an existing user with email and password.
 */
export async function signInWithEmail({ email, password }: SignInParams) {
  const supabase = createBrowserClient();
  return await supabase.auth.signInWithPassword({
    email,
    password,
  });
}

/**
 * Sign in using Google OAuth.
 * Initiates the PKCE flow and redirects to Google login, returning to /auth/callback.
 */
export async function signInWithGoogle({ redirectTo }: OAuthParams = {}) {
  const supabase = createBrowserClient();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl = new URL("/auth/callback", origin);

  if (redirectTo) {
    callbackUrl.searchParams.set("next", redirectTo);
  }

  return await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
}

/**
 * Sign out the currently authenticated user.
 */
export async function signOut() {
  const supabase = createBrowserClient();
  return await supabase.auth.signOut();
}

export interface RequestPasswordResetParams {
  email: string;
}

/**
 * Sends a password-reset email. Confirmed live: unlike signup confirmation
 * and Google OAuth (both PKCE, ?code=... on the query string), Supabase's
 * recovery links carry the session as a #access_token=...&type=recovery
 * URL hash fragment — fragments are never sent to the server at all, so
 * routing this through the server-side /auth/callback route (which only
 * reads searchParams) can never work. redirectTo instead points straight
 * at /reset-password, whose client-side Supabase browser client
 * auto-detects the hash on load (detectSessionInUrl defaults to true) and
 * establishes the recovery session itself — no server involvement.
 */
export async function requestPasswordReset({ email }: RequestPasswordResetParams) {
  const supabase = createBrowserClient();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
}

export interface UpdatePasswordParams {
  password: string;
}

/**
 * Sets a new password for the currently-authenticated user — used both by
 * the post-reset-email flow (a fresh recovery session established via
 * /auth/callback) and could be reused later for a "change password"
 * settings action.
 */
export async function updatePassword({ password }: UpdatePasswordParams) {
  const supabase = createBrowserClient();
  return await supabase.auth.updateUser({ password });
}
