import type { NextConfig } from "next";
import createMDX from "@next/mdx";

/**
 * Content-Security-Policy is scoped to the real external dependencies this
 * app actually loads client-side — verified against source, not guessed:
 * - cdn.jsdelivr.net: both Pyodide (lib/pyodide/loader.ts, lib/sandbox/pyodide.worker.ts)
 *   and @monaco-editor/react's default CDN loader fetch from here.
 * - 'wasm-unsafe-eval': required for Pyodide's WebAssembly.instantiate — the
 *   narrower WASM-only grant, not the broader 'unsafe-eval'.
 * - *.supabase.co (https/wss): auth + realtime + REST.
 * - *.daily.co (https/wss) + api.daily.co: embedded live-session video calls.
 * - checkout.stripe.com, accounts.google.com: full-page redirect targets
 *   (billing checkout, Google OAuth) — frame-src/form-action, not script-src,
 *   since neither is embedded as a script or iframe today.
 * 'unsafe-inline' stays in script-src only for the JSON-LD <script> blocks
 * (dangerouslySetInnerHTML) on marketing/blog pages — replacing those with a
 * nonce-based approach is a real follow-up, not attempted blind here.
 *
 * script-src also grants 'unsafe-eval' outside production only — confirmed
 * live (see the diagnostic run this was found with) that React's dev-mode
 * debugging (call-stack reconstruction, Fast Refresh) calls eval(), which
 * 'wasm-unsafe-eval' alone doesn't cover. React's own runtime guarantees it
 * "will never use eval() in production mode," so this stays dev-only rather
 * than weakening the policy actually served to real users.
 */
const isProd = process.env.NODE_ENV === "production";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isProd ? "" : " 'unsafe-eval'"} https://cdn.jsdelivr.net`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self' https://cdn.jsdelivr.net https://*.supabase.co wss://*.supabase.co https://*.daily.co wss://*.daily.co https://api.daily.co",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "frame-src 'self' https://*.daily.co https://checkout.stripe.com https://accounts.google.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Prompt 89 — lets .mdx files under content/blog/ act as importable
  // modules (via the dynamic import in app/(marketing)/blog/[slug]/page.tsx)
  // even though no .mdx file is itself used as a page/route file directly.
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera/microphone stay open to self only — the embedded Daily
          // call UI needs both, but it's mounted at our own origin (the
          // room page embeds Daily via an iframe pointed at a daily.co
          // subdomain; the *page* requesting the permission is same-origin).
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
