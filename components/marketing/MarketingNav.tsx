"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AuthAwareCTA } from "./AuthAwareCTA";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it Works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
];

export function MarketingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 font-mono font-black text-sm tracking-tight text-white group">
          <span className="h-2 w-2 rounded-full bg-telemetry-cyan shadow-telemetry-cyan group-hover:scale-125 transition" />
          <span>KALPLA</span>
          <span className="text-[10px] font-bold text-steel-400 bg-steel-800/60 px-1.5 py-0.5 rounded border border-steel-700">
            GenAI Readiness
          </span>
        </Link>

        {/* Desktop Wayfinding Navigation */}
        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-mono text-xs font-semibold text-steel-400 transition hover:text-telemetry-cyan"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3 sm:gap-4">
          <AuthAwareCTA
            signedOutHref="/login"
            signedOutLabel="Log In"
            signedInHref="/dashboard"
            signedInLabel="Dashboard →"
            className="hidden font-mono text-xs font-semibold text-steel-300 transition hover:text-white sm:inline-block"
          />
          <AuthAwareCTA
            signedOutHref="/signup"
            signedOutLabel="Start Readiness Test →"
            signedInHref="/dashboard"
            signedInLabel="Console Dashboard →"
            className="rounded-xl bg-telemetry-cyan px-4 py-2 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
          />

          {/* Mobile Hamburger Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
            className="md:hidden flex items-center justify-center p-2 rounded-xl border border-steel-800 bg-observatory-base text-steel-300 hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-steel-800 bg-observatory-panel px-4 py-6 flex flex-col gap-4 motion-slide-down">
          <div className="flex flex-col gap-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-xl font-mono text-xs text-steel-300 hover:bg-steel-800/60 hover:text-telemetry-cyan transition"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="pt-4 border-t border-steel-800 flex flex-col gap-3">
            <AuthAwareCTA
              signedOutHref="/login"
              signedOutLabel="Log In"
              signedInHref="/dashboard"
              signedInLabel="Console Dashboard →"
              className="w-full text-center py-2.5 rounded-xl border border-steel-800 bg-observatory-base font-mono text-xs text-steel-300"
            />
          </div>
        </div>
      )}
    </header>
  );
}
