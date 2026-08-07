import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllBlogPosts } from "@/lib/blog/posts";
import { SITE_URL } from "@/lib/marketing/siteConfig";

// Prompt 90 — published portfolios change independently of a redeploy, so
// this route regenerates periodically rather than being baked in once at
// build time (the marketing routes it also lists are static regardless).
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketingRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
  ];

  const posts = await getAllBlogPosts();
  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.publishedDate,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const adminSupabase = createAdminClient();
  const { data: portfolios } = await adminSupabase
    .from("portfolios")
    .select("slug, updated_at")
    .eq("is_public", true);

  const portfolioRoutes: MetadataRoute.Sitemap = (portfolios || []).map((p) => ({
    url: `${SITE_URL}/portfolio/${p.slug}`,
    lastModified: p.updated_at,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...marketingRoutes, ...blogRoutes, ...portfolioRoutes];
}
