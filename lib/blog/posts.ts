import { readdirSync } from "fs";
import path from "path";

const BLOG_CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export interface BlogPostMetadata {
  title: string;
  description: string;
  /** ISO date string, e.g. "2026-08-06". */
  publishedDate: string;
}

/** Slugs are derived from filenames under content/blog/ — no separate index to keep in sync. */
export function getBlogSlugs(): string[] {
  return readdirSync(BLOG_CONTENT_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

/**
 * Each .mdx file exports `metadata` directly (Prompt 89) rather than using
 * YAML frontmatter — @next/mdx doesn't parse frontmatter by default, and a
 * plain JS export needs no extra remark plugin/dependency.
 */
export async function getBlogPostMetadata(slug: string): Promise<BlogPostMetadata> {
  const mod = await import(`@/content/blog/${slug}.mdx`);
  return mod.metadata as BlogPostMetadata;
}

export async function getAllBlogPosts(): Promise<Array<BlogPostMetadata & { slug: string }>> {
  const slugs = getBlogSlugs();
  const posts = await Promise.all(
    slugs.map(async (slug) => ({ slug, ...(await getBlogPostMetadata(slug)) })),
  );
  return posts.sort((a, b) => (a.publishedDate < b.publishedDate ? 1 : -1));
}
