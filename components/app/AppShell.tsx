"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/components/providers/AuthProvider";
import { AppHeaderStat } from "./AppHeaderStat";
import { AppBottomNav } from "./AppBottomNav";

const DESKTOP_NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/live-sessions", label: "Live Sessions" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/projects", label: "Projects" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/billing", label: "Billing" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profile, signOut } = useUser();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="flex min-h-screen flex-col bg-observatory-base text-steel-50">
      {/* App Shell Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
          {/* Left: Brand Logo & Desktop Navigation */}
          <div className="flex items-center gap-6 md:gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 font-mono font-black text-sm tracking-tight text-white group">
              <span className="h-2 w-2 rounded-full bg-telemetry-cyan shadow-telemetry-cyan group-hover:scale-125 transition" />
              <span className="text-white">KALPLA</span>
              <span className="text-[10px] font-bold text-telemetry-cyan bg-telemetry-cyan/10 px-1.5 py-0.5 rounded border border-telemetry-cyan/20">
                CONSOLE
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-5">
              {DESKTOP_NAV_LINKS.map((link) => {
                const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname?.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`font-mono text-xs transition ${
                      isActive
                        ? "text-telemetry-cyan font-bold"
                        : "text-steel-400 hover:text-steel-200"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {isAdmin && (
                <Link
                  href="/admin/ai-cost"
                  className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border transition ${
                    pathname?.startsWith("/admin")
                      ? "bg-calibrated-amber/20 text-calibrated-amber border-calibrated-amber/40"
                      : "text-steel-400 border-steel-800 hover:text-steel-200"
                  }`}
                >
                  ⚙️ Admin
                </Link>
              )}
            </nav>
          </div>

          {/* Right: Persistent Glanceable Stat + User Menu */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Glanceable Readiness Telemetry Badge */}
            <AppHeaderStat />

            {/* User Account Menu / Drawer Toggle */}
            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-steel-800 bg-observatory-base p-1 pr-2.5 text-xs font-mono text-steel-300 hover:border-steel-700 transition"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-telemetry-cyan/20 font-mono font-bold text-[11px] text-telemetry-cyan">
                  {(user?.email?.[0] || "U").toUpperCase()}
                </div>
                <span className="hidden sm:inline text-[11px] truncate max-w-[100px]">
                  {profile?.name?.split(" ")[0] || user?.email?.split("@")[0] || "Account"}
                </span>
                <span className="text-steel-400 text-[10px]">▼</span>
              </button>

              {/* Account Dropdown Menu */}
              {accountMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setAccountMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 z-50 w-56 rounded-2xl border border-steel-700 bg-observatory-panel p-2 shadow-2xl backdrop-blur-md">
                    <div className="px-3 py-2 border-b border-steel-800">
                      <p className="font-mono text-xs font-bold text-white truncate">
                        {profile?.name || "GenAI Engineer"}
                      </p>
                      <p className="font-mono text-[11px] text-steel-400 truncate">
                        {user?.email}
                      </p>
                    </div>

                    <div className="py-1 flex flex-col gap-0.5">
                      <Link
                        href="/portfolio"
                        onClick={() => setAccountMenuOpen(false)}
                        className="px-3 py-2 rounded-xl text-xs font-mono text-steel-300 hover:bg-steel-800/60 hover:text-white transition flex items-center justify-between"
                      >
                        <span>My Public Portfolio</span>
                        <span className="text-[10px] text-telemetry-cyan">View →</span>
                      </Link>

                      <Link
                        href="/billing"
                        onClick={() => setAccountMenuOpen(false)}
                        className="px-3 py-2 rounded-xl text-xs font-mono text-steel-300 hover:bg-steel-800/60 hover:text-white transition flex items-center justify-between"
                      >
                        <span>Subscription & Plan</span>
                        <span className="text-[10px] text-steel-400">Plan Settings</span>
                      </Link>

                      <Link
                        href="/design-system"
                        onClick={() => setAccountMenuOpen(false)}
                        className="px-3 py-2 rounded-xl text-xs font-mono text-steel-400 hover:bg-steel-800/60 hover:text-white transition flex items-center justify-between"
                      >
                        <span>Design System</span>
                        <span className="text-[10px] text-steel-400">Docs</span>
                      </Link>

                      {isAdmin && (
                        <Link
                          href="/admin/ai-cost"
                          onClick={() => setAccountMenuOpen(false)}
                          className="px-3 py-2 rounded-xl text-xs font-mono text-calibrated-amber hover:bg-calibrated-amber/10 transition flex items-center justify-between"
                        >
                          <span>Admin Console</span>
                          <span className="text-[10px]">⚙️</span>
                        </Link>
                      )}
                    </div>

                    <div className="pt-1 border-t border-steel-800">
                      <button
                        onClick={() => {
                          setAccountMenuOpen(false);
                          signOut();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-mono text-vulnerability-crimson hover:bg-vulnerability-crimson/10 transition"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main App Content Area */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>

      {/* Mobile Bottom Navigation */}
      <AppBottomNav />
    </div>
  );
}
