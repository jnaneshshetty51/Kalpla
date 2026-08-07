/**
 * Absolute site origin for sitemap.ts, robots.ts, JSON-LD, and canonical/OG
 * URLs (Prompt 90). These all render statically at build time with no
 * incoming request to derive an origin from (unlike the Route Handlers
 * elsewhere in this app that read `new URL(request.url).origin`), so this
 * needs an explicit env var instead. Falls back to localhost for local
 * dev/preview builds where NEXT_PUBLIC_SITE_URL isn't set.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
