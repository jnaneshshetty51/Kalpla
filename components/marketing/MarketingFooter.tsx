import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing & Tiers" },
  { href: "/assessment", label: "Skill Diagnostic" },
  { href: "/projects", label: "Project Ladder" },
];

const RESOURCE_LINKS = [
  { href: "/blog", label: "Engineering Blog" },
  { href: "/faq", label: "FAQ & Help" },
  { href: "/about", label: "About Kalpla" },
  { href: "/design-system", label: "Design Tokens" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund", label: "Refund Policy" },
  { href: "/faq", label: "Security Overview" },
  { href: "/api/health", label: "System Status" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-steel-800 bg-observatory-base px-4 sm:px-6 py-12 text-steel-400 font-mono">
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-steel-800/80">
        {/* Brand Summary */}
        <div className="flex flex-col gap-3 md:col-span-1">
          <div className="flex items-center gap-2 font-black text-sm text-white">
            <span className="h-2 w-2 rounded-full bg-telemetry-cyan shadow-telemetry-cyan" />
            <span>KALPLA</span>
          </div>
          <p className="text-xs text-steel-400 font-sans leading-relaxed">
            The verified career-readiness telemetry platform for GenAI Engineers. Measure your benchmark, build real projects, and close the gap.
          </p>
        </div>

        {/* Product Column */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Platform</h4>
          {PRODUCT_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs text-steel-400 hover:text-telemetry-cyan transition"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Resources Column */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Resources</h4>
          {RESOURCE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs text-steel-400 hover:text-telemetry-cyan transition"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Trust & Legal Column */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Trust & Legal</h4>
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-xs text-steel-400 hover:text-telemetry-cyan transition"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Copyright Bar */}
      <div className="mx-auto max-w-7xl pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <p>&copy; {new Date().getFullYear()} Kalpla Platform. All rights reserved.</p>
        <p className="text-[11px] text-steel-400">
          Engineered for GenAI Mastery • Benchmark 70% Production Ready
        </p>
      </div>
    </footer>
  );
}
