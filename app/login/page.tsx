"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmail, signInWithGoogle } from "@/lib/supabase/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time inline email validation
  const isEmailValid = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (!isEmailValid) {
      setError("Please enter a valid email address format.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await signInWithEmail({ email, password });
      if (signInError) {
        const msg = signInError.message.toLowerCase();
        if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
          setError("Invalid email or password. Double-check your credentials or reset your password.");
        } else if (msg.includes("email not confirmed")) {
          setError("Email address not confirmed. Please check your inbox for the verification link.");
        } else {
          setError(signInError.message);
        }
        return;
      }
      router.push(redirectTo);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Authentication request failed. Please check your network connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      const { error: oauthError } = await signInWithGoogle({ redirectTo });
      if (oauthError) {
        setError(`Google sign-in failed: ${oauthError.message}`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Google sign-in failed. Please try signing in with email and password.",
      );
    }
  };

  return (
    <>
      <div className="mb-6">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
          Developer Access
        </span>
        <h1 className="text-xl font-mono font-black text-white mt-1">Log in to Kalpla Console</h1>
        <p className="mt-1 text-xs text-steel-400 font-sans">
          Access your competency roadmap, AI tutor, and project telemetry.
        </p>
      </div>

      {/* Primary Action Path: Email & Password Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email Address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="engineer@company.com"
          error={!isEmailValid && email.length > 0 ? "Invalid email address format" : undefined}
        />

        <div>
          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
          />
          <Link
            href="/forgot-password"
            className="mt-1.5 inline-block font-mono text-[11px] text-steel-400 hover:text-telemetry-cyan hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-vulnerability-crimson/40 bg-vulnerability-crimson/10 p-3 font-mono text-xs text-rose-300 leading-relaxed">
            <span className="font-bold">Access Error: </span>
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="mt-1 w-full">
          {submitting ? "Authenticating console session…" : "Log In to Console →"}
        </Button>
      </form>

      {/* Visual Divider */}
      <div className="my-6 flex items-center gap-3 font-mono text-[10px] uppercase text-steel-400">
        <div className="h-px flex-1 bg-steel-800" />
        <span>OR CONTINUE WITH SSO</span>
        <div className="h-px flex-1 bg-steel-800" />
      </div>

      {/* Secondary Action Path: OAuth */}
      <Button
        type="button"
        variant="secondary"
        onClick={handleGoogle}
        className="w-full justify-center text-steel-300 hover:text-white"
        leftIcon={
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        }
      >
        Sign In with Google
      </Button>

      {/* Cross Navigation Link */}
      <div className="mt-8 pt-4 border-t border-steel-800/80 text-center font-mono text-xs text-steel-400">
        Don&apos;t have an active profile yet?{" "}
        <Link
          href={`/signup?redirectTo=${encodeURIComponent(redirectTo)}`}
          className="font-bold text-telemetry-cyan hover:underline"
        >
          Take the free skill assessment
        </Link>
      </div>
    </>
  );
}

export default function LoginPage() {
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
          <Suspense fallback={<div className="font-mono text-xs text-steel-400 p-4">Loading login form…</div>}>
            <LoginForm />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
