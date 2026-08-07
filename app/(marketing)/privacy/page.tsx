import type { Metadata } from "next";
import Post, { metadata as postMetadata } from "@/content/legal/privacy.mdx";

export const metadata: Metadata = {
  title: `${postMetadata.title} — Kalpla`,
  description: postMetadata.description,
};

export default function PrivacyPage() {
  return (
    <>
      <section className="border-b border-steel-800 bg-observatory-base px-4 sm:px-6 py-16 sm:py-20 text-center telemetry-grid-bg">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-telemetry-cyan">Legal</span>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl font-mono font-bold text-white">
          {postMetadata.title}
        </h1>
        <p className="mt-3 font-mono text-xs text-steel-400">Effective {postMetadata.effectiveDate}</p>
      </section>

      <article className="px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Post />
        </div>
      </article>
    </>
  );
}
