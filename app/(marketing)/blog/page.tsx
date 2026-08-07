import Link from "next/link";
import type { Metadata } from "next";
import { getAllBlogPosts } from "@/lib/blog/posts";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Blog — Kalpla",
  description: "Notes on GenAI engineering skills, how Kalpla is built, and what we're seeing from people going through the program.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogIndexPage() {
  const posts = await getAllBlogPosts();

  return (
    <>
      <section className="border-b border-steel-800 bg-observatory-base px-4 sm:px-6 py-16 sm:py-20 text-center telemetry-grid-bg">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-telemetry-cyan">Blog</span>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl font-mono font-bold text-white">
          Notes on GenAI engineering
        </h1>
      </section>

      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {posts.length === 0 ? (
            <p className="text-center text-sm text-steel-400 font-sans">No posts yet — check back soon.</p>
          ) : (
            posts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="block">
                <Card className="transition hover:border-telemetry-cyan/40 hover:bg-observatory-hover">
                  <span className="font-mono text-xs text-steel-400">{formatDate(post.publishedDate)}</span>
                  <h2 className="mt-1.5 font-mono text-lg font-bold text-white">{post.title}</h2>
                  <p className="mt-1.5 text-sm text-steel-400 font-sans">{post.description}</p>
                </Card>
              </Link>
            ))
          )}
        </div>
      </section>
    </>
  );
}
