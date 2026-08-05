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
