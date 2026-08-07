"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/Button";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}

/**
 * Shared error fallback UI used by all route-segment error.tsx files.
 * Matches the app's dark design system.
 */
export default function RouteError({
  error,
  reset,
  title = "Something went wrong",
}: ErrorBoundaryProps) {
  useEffect(() => {
    console.error("[RouteError]", error);
    // No-ops if NEXT_PUBLIC_SENTRY_DSN isn't configured (see instrumentation-client.ts).
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="rounded-3xl border border-vulnerability-crimson/30 bg-vulnerability-crimson/10 p-10 max-w-md w-full">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-vulnerability-crimson">{title}</h2>
        <p className="mt-2 text-sm text-steel-400 leading-relaxed">
          {error.message || "An unexpected error occurred. We've been notified."}
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-steel-400">
            Error ID: {error.digest}
          </p>
        )}
        <Button variant="danger" onClick={reset} className="mt-6">
          Try again
        </Button>
      </div>
    </div>
  );
}
