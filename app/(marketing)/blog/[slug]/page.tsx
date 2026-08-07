import type { Metadata } from "next";
import Link from "next/link";
import { getBlogSlugs, getBlogPostMetadata } from "@/lib/blog/posts";
import { SITE_URL } from "@/lib/marketing/siteConfig";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

// Any slug not returned by generateStaticParams 404s outright instead of
// attempting a dynamic import of a file that doesn't exist.
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const metadata = await getBlogPostMetadata(slug);
  return {
    title: `${metadata.title} — Kalpla Blog`,
    description: metadata.description,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      type: "article",
      publishedTime: metadata.publishedDate,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const { default: Post, metadata } = await import(`@/content/blog/${slug}.mdx`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: metadata.title,
    description: metadata.description,
    datePublished: metadata.publishedDate,
    url: `${SITE_URL}/blog/${slug}`,
    author: { "@type": "Organization", name: "Kalpla" },
  };

  return (
    <article className="px-4 sm:px-6 py-16">
      {/* JSON-LD requires raw script injection; payload is our own build-time content, sanitized against `<` per Next's JSON-LD guide. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <div className="mx-auto max-w-2xl">
        <Link
          href="/blog"
          className="font-mono text-xs font-bold uppercase tracking-widest text-telemetry-cyan hover:underline"
        >
          ← Blog
        </Link>
        <p className="mt-4 font-mono text-xs text-steel-400">
          {new Date(metadata.publishedDate).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <Post />
      </div>
    </article>
  );
}
