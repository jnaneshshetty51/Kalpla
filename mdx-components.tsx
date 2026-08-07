import type { MDXComponents } from "mdx/types";
import Link from "next/link";

/**
 * Required by @next/mdx for the App Router (Prompt 89) — maps markdown's
 * native HTML output to components styled consistently with the rest of
 * the (marketing) route group's dark theme, rather than unstyled browser
 * defaults.
 */
const components: MDXComponents = {
  h1: ({ children }) => <h1 className="mt-2 text-3xl font-extrabold text-white">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-10 text-xl font-bold text-white">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 text-lg font-bold text-white">{children}</h3>,
  p: ({ children }) => <p className="mt-4 text-sm leading-relaxed text-steel-300 font-sans">{children}</p>,
  a: ({ href, children }) => (
    <Link href={href || "#"} className="text-telemetry-cyan underline underline-offset-2 hover:text-telemetry-cyan-dim">
      {children}
    </Link>
  ),
  ul: ({ children }) => <ul className="mt-4 flex flex-col gap-2 pl-5 text-sm text-steel-300 font-sans">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 flex flex-col gap-2 pl-5 text-sm text-steel-300 font-sans">{children}</ol>,
  li: ({ children }) => <li className="list-disc leading-relaxed marker:text-telemetry-cyan">{children}</li>,
  code: ({ children }) => (
    <code className="rounded bg-observatory-panel px-1.5 py-0.5 font-mono text-xs text-telemetry-cyan">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mt-4 overflow-x-auto rounded-xl border border-steel-800 bg-observatory-base p-4 text-xs text-steel-200 font-mono">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-2 border-telemetry-cyan/50 pl-4 text-sm italic text-steel-400 font-sans">
      {children}
    </blockquote>
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
