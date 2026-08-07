"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/**
 * The recovery session is established entirely client-side (see
 * lib/supabase/auth.ts's requestPasswordReset comment) — but confirmed
 * live, this can't be left to the SDK's own automatic URL detection:
 * @supabase/ssr's createBrowserClient hardcodes flowType: "pkce", and a
 * PKCE-configured client's auto-detection only looks for a ?code= query
 * param — it does NOT parse the #access_token=...&type=recovery hash
 * fragment this project's real recovery links actually carry (verified via
 * a live generateLink + page load; the hash sat there unprocessed and the
 * session never appeared). So this parses the hash and calls setSession()
 * directly rather than trusting auto-detection, while still checking for a
 * ?code= param first in case a future project setting switches recovery
 * links to the PKCE format — either path lands on the same "ready" state.
 */
function useRecoverySessionReady() {
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    async function tryEstablishSession() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session && !settled) {
          settled = true;
          setStatus("ready");
          return;
        }
      }

      const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const hashParams = new URLSearchParams(rawHash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!error && data.session && !settled) {
          settled = true;
          setStatus("ready");
        }
      }
    }

    tryEstablishSession();

    // Belt-and-suspenders: if a valid session already exists for some
    // other reason (e.g. the SDK's own detection did fire), accept it too.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        settled = true;
        setStatus("ready");
      }
    });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setStatus("invalid");
      }
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return status;
}

function ResetPasswordForm() {
  const router = useRouter();
  const sessionStatus = useRecoverySessionReady();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isPasswordMinLength = password.length >= 6;
  const hasSpecialOrDigit = /[0-9!@#$%^&*()]/.test(password);
  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordMinLength) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { error: updateError } = await updatePassword({ password });
      if (updateError) {
        // A missing/expired recovery session lands here with a real
        // Supabase error — surfaced as-is rather than a generic message,
        // since "your reset link expired, request a new one" is the
        // actionable thing to tell someone in this specific state.
        setError(updateError.message);
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Password update failed. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center font-mono py-8 flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-telemetry-cyan border-t-transparent" />
        <div>
          <h2 className="text-sm font-bold text-white">Password Updated</h2>
          <p className="text-xs text-steel-400 mt-1 font-sans">Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === "checking") {
    return (
      <div className="text-center font-mono py-8 flex flex-col items-center gap-4" role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-telemetry-cyan border-t-transparent" />
        <p className="text-xs text-steel-400 font-sans">Verifying your reset link…</p>
      </div>
    );
  }

  if (sessionStatus === "invalid") {
    return (
      <div className="text-center font-mono py-4">
        <div className="text-3xl mb-3">⚠</div>
        <h1 className="text-lg font-bold text-white">Link Invalid or Expired</h1>
        <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">
          This password reset link is no longer valid. Request a new one to continue.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block rounded-xl bg-telemetry-cyan px-6 py-3 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
        >
          Request a New Link →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
          Account Recovery
        </span>
        <h1 className="text-xl font-mono font-black text-white mt-1">Set a New Password</h1>
        <p className="mt-1 text-xs text-steel-400 font-sans">Choose a new password for your Kalpla account.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Input
            label="New Password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
          />
          {password.length > 0 && (
            <div className="mt-2 flex items-center gap-2 flex-wrap font-mono text-[10px]">
              <Badge variant={isPasswordMinLength ? "mastery" : "vulnerability"} size="sm" dot={false}>
                {isPasswordMinLength ? "✓ 6+ chars" : "✗ Min 6 chars"}
              </Badge>
              <Badge variant={hasSpecialOrDigit ? "mastery" : "neutral"} size="sm" dot={false}>
                {hasSpecialOrDigit ? "✓ Symbol/Digit" : "○ Add number/symbol"}
              </Badge>
            </div>
          )}
        </div>

        <Input
          label="Confirm New Password"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
          error={!passwordsMatch ? "Passwords don't match" : undefined}
        />

        {error && (
          <div className="rounded-xl border border-vulnerability-crimson/40 bg-vulnerability-crimson/10 p-3 font-mono text-xs text-rose-300 leading-relaxed">
            <span className="font-bold">Error: </span>
            {error}
            {error.toLowerCase().includes("session") || error.toLowerCase().includes("expired") ? (
              <>
                {" "}
                <Link href="/forgot-password" className="underline font-bold">
                  Request a new reset link
                </Link>
                .
              </>
            ) : null}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="mt-1 w-full">
          {submitting ? "Updating password…" : "Update Password →"}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-observatory-base px-4 py-16 text-steel-50 telemetry-grid-bg">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 font-mono text-xs font-semibold text-steel-400 hover:text-telemetry-cyan transition"
        >
          ← Back to Kalpla
        </Link>
        <Card variant="bordered" padding="lg" className="shadow-2xl">
          <ResetPasswordForm />
        </Card>
      </div>
    </div>
  );
}
