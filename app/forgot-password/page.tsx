"use client";

import React, { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/supabase/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const isEmailValid = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !isEmailValid) {
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { error: resetError } = await requestPasswordReset({ email });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      // Always show the same confirmation regardless of whether the email
      // is actually registered — don't leak account existence.
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Reset request failed. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center font-mono py-4">
        <div className="text-3xl mb-3">📬</div>
        <h1 className="text-lg font-bold text-white">Check Your Email</h1>
        <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">
          If an account exists for <span className="text-telemetry-cyan font-mono font-bold">{email}</span>, we&apos;ve
          sent a link to reset your password.
        </p>
        <Link href="/login" className="mt-6 inline-block font-mono text-xs font-bold text-telemetry-cyan hover:underline">
          ← Back to login
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
        <h1 className="text-xl font-mono font-black text-white mt-1">Reset Your Password</h1>
        <p className="mt-1 text-xs text-steel-400 font-sans">
          Enter your account email and we&apos;ll send you a link to set a new password.
        </p>
      </div>

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

        {error && (
          <div className="rounded-xl border border-vulnerability-crimson/40 bg-vulnerability-crimson/10 p-3 font-mono text-xs text-rose-300 leading-relaxed">
            <span className="font-bold">Error: </span>
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="mt-1 w-full">
          {submitting ? "Sending reset link…" : "Send Reset Link →"}
        </Button>
      </form>

      <div className="mt-8 pt-4 border-t border-steel-800/80 text-center font-mono text-xs text-steel-400">
        Remembered your password?{" "}
        <Link href="/login" className="font-bold text-telemetry-cyan hover:underline">
          Log in
        </Link>
      </div>
    </>
  );
}

export default function ForgotPasswordPage() {
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
          <ForgotPasswordForm />
        </Card>
      </div>
    </div>
  );
}
