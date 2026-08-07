"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/ai-cost", label: "💰 AI Unit Economics", desc: "Cost per active user & model metrics" },
  { href: "/admin/skill-graph-health", label: "📊 Skill Graph Health", desc: "Node completion & bottleneck alerts" },
  { href: "/admin/grading-review", label: "✅ Grading Review Queue", desc: "Rubric score override & AI QA" },
  { href: "/admin/users", label: "👥 User Directory", desc: "Fast search & student readiness lookup" },
  { href: "/admin/content", label: "📝 Content Management", desc: "Curriculum & skill graph nodes" },
  { href: "/admin/live-sessions", label: "🎥 Live Sessions", desc: "Schedule & manage cohort sessions" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 flex font-mono">
      {/* Distinct Admin Internal Ops Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-steel-800 bg-observatory-panel/90 backdrop-blur-md shrink-0">
        {/* Unmistakable Admin Internal Shell Header */}
        <div className="px-5 py-4 border-b border-steel-800 bg-observatory-base">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-calibrated-amber animate-ping" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-calibrated-amber">
              Internal Ops Console
            </span>
          </div>
          <h2 className="text-xs font-bold text-white mt-1">Kalpla System Admin</h2>
          <p className="text-[10px] text-steel-400 font-sans mt-0.5">High-density administrative interface</p>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col px-3 py-2.5 rounded-xl text-xs transition border ${
                  active
                    ? "bg-telemetry-cyan/10 border-telemetry-cyan/40 text-white shadow-telemetry-cyan"
                    : "border-transparent text-steel-400 hover:bg-observatory-base hover:text-white"
                }`}
              >
                <span className="font-bold">{item.label}</span>
                <span className={`text-[10px] font-sans mt-0.5 ${active ? "text-telemetry-cyan" : "text-steel-400"}`}>
                  {item.desc}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-steel-800 bg-observatory-base/50">
          <Link
            href="/dashboard"
            className="text-[11px] font-mono text-steel-400 hover:text-telemetry-cyan transition flex items-center gap-1.5"
          >
            <span>← Exit Admin Console</span>
          </Link>
        </div>
      </aside>

      {/* Main Administrative Workspace */}
      <div className="flex-1 overflow-auto bg-observatory-base telemetry-grid-bg">{children}</div>
    </div>
  );
}
