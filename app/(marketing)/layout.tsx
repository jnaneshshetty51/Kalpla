import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

/**
 * Prompt 91 — marketing pages don't need per-request personalization (the
 * one piece of UI that does, the CTA's signed-in/signed-out state, is
 * handled client-side by AuthAwareCTA reading AuthProvider after
 * hydration, not by this route group reading cookies). Forcing this whole
 * group static means it's prerendered once at build time and served from
 * cache/CDN, independent of the (app) group — which stays dynamic because
 * every one of its routes calls getServerUser()/cookies() directly.
 */
export const dynamic = "force-static";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-observatory-base text-steel-50">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
