import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error monitoring — a safe no-op until SENTRY_DSN is actually
 * set (no Sentry project exists for this deployment yet). Deliberately not
 * wrapping next.config.ts with withSentryConfig: that adds source-map
 * upload via SENTRY_AUTH_TOKEN, which isn't configured either, and its
 * webpack-plugin-based approach has had uneven Turbopack support — this
 * app's real, working build uses Turbopack (`next build` — see the build
 * output), so skipping the wrapper avoids risking that over source maps
 * that are a nice-to-have, not a requirement for error capture to work.
 */
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
