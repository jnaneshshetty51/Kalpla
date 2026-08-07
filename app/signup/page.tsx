"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signUpWithEmail, signInWithGoogle } from "@/lib/supabase/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/onboarding";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  // Real-time inline validations
  const isEmailValid = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordMinLength = password.length >= 6;
  const hasSpecialOrDigit = /[0-9!@#$%^&*()]/.test(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!isEmailValid) {
      setError("Please enter a valid email address format.");
      return;
    }
    if (!isPasswordMinLength) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { data, error: signUpError } = await signUpWithEmail({ email, password, name });
      if (signUpError) {
        const msg = signUpError.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("user_already_exists")) {
          setError("An account with this email address already exists. Try logging in instead.");
        } else if (msg.includes("weak_password") || msg.includes("password")) {
          setError("Password does not meet minimum security criteria. Use at least 6 characters.");
        } else {
          setError(signUpError.message);
        }
        return;
      }

      if (data.session) {
        // Live session acquired — show seamless telemetry transition banner before router push
        setRedirecting(true);
        setTimeout(() => {
          router.push(redirectTo);
        }, 800);
      } else {
        setCheckEmail(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Account creation request failed. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
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

  if (checkEmail) {
    return (
      <div className="text-center font-mono py-4">
        <div className="text-3xl mb-3">📬</div>
        <h1 className="text-lg font-bold text-white">Confirmation Sent</h1>
        <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">
          We sent a verification link to <span className="text-telemetry-cyan font-mono font-bold">{email}</span>. Click the link to confirm your identity and launch your skill assessment.
        </p>
      </div>
    );
  }

  if (redirecting) {
    return (
      <div className="text-center font-mono py-8 flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-telemetry-cyan border-t-transparent" />
        <div>
          <h2 className="text-sm font-bold text-white">Initializing Competency Profile…</h2>
          <p className="text-xs text-steel-400 mt-1 font-sans">
            Redirecting to diagnostic setup in 1 second.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
          Free Diagnostic Setup
        </span>
        <h1 className="text-xl font-mono font-black text-white mt-1">Create Your Kalpla Account</h1>
        <p className="mt-1 text-xs text-steel-400 font-sans">
          Start your 90-day GenAI engineering assessment — 100% free, no credit card required.
        </p>
      </div>

      {/* Primary Action Path: Form with Real-time Inline Validation */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Full Name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rahul Sharma"
        />

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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
          />
          {/* As-you-type Password Strength Checklist */}
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

        <label className="flex items-start gap-2.5 font-mono text-[11px] text-steel-400 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-telemetry-cyan"
          />
          <span>
            I agree to Kalpla&apos;s{" "}
            <Link href="/terms" target="_blank" className="text-telemetry-cyan hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="text-telemetry-cyan hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {error && (
          <div className="rounded-xl border border-vulnerability-crimson/40 bg-vulnerability-crimson/10 p-3 font-mono text-xs text-rose-300 leading-relaxed">
            <span className="font-bold">Account Error: </span>
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="mt-1 w-full">
          {submitting ? "Creating profile…" : "Take Free Skill Assessment →"}
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
        Sign Up with Google
      </Button>

      {/* Cross Navigation Link */}
      <div className="mt-8 pt-4 border-t border-steel-800/80 text-center font-mono text-xs text-steel-400">
        Already have a console account?{" "}
        <Link
          href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}
          className="font-bold text-telemetry-cyan hover:underline"
        >
          Log in
        </Link>
      </div>
    </>
  );
}

export default function SignupPage() {
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
          <Suspense fallback={<div className="font-mono text-xs text-steel-400 p-4">Loading signup form…</div>}>
            <SignupForm />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
