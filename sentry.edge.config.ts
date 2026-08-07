import * as Sentry from "@sentry/nextjs";

// Same safe-no-op-without-a-DSN reasoning as sentry.server.config.ts —
// covers proxy.ts and any other edge-runtime code paths.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
