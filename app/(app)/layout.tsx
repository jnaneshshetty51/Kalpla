import { AppShell } from "@/components/app/AppShell";

/**
 * Prompt 91 — every route under (app) already calls getServerUser()/
 * cookies() directly and is therefore dynamic under the default 'auto'
 * behavior; this makes that explicit and intentional rather than
 * incidental, so the static/dynamic split between (marketing) and (app)
 * is a visible decision in the config, not something that could silently
 * regress if a future (app) page happened not to touch a Request-time API.
 */
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
