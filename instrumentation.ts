/**
 * Next.js's instrumentation hook — runs once per server/edge runtime
 * startup. Loads the matching Sentry config file, which itself no-ops if
 * SENTRY_DSN isn't set.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
