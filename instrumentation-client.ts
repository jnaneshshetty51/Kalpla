import * as Sentry from "@sentry/nextjs";

/**
 * Client-side error monitoring — same safe-no-op-without-a-DSN reasoning
 * as sentry.server.config.ts. Uses the NEXT_PUBLIC_ prefixed var since this
 * file runs in the browser.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
