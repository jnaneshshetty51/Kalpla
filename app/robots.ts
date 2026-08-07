import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/marketing/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/how-it-works", "/pricing", "/faq", "/about", "/blog", "/portfolio/"],
        // Everything else (dashboard, workspace, assessment, billing, admin,
        // API routes) requires a session anyway (proxy.ts) — disallowing it
        // here just saves crawl budget on pages that would 401/redirect.
        disallow: ["/dashboard", "/workspace/", "/assessment", "/roadmap", "/projects", "/billing", "/admin", "/api/", "/onboarding", "/review/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
