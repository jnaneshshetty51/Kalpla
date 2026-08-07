/**
 * The coding workspace is a full-viewport IDE (`h-screen`, internally
 * scrolling panes, no page-level scroll by design) — it was getting
 * double-wrapped by (app)/layout.tsx's AppShell, which stacks its own
 * sticky header above it. That ate 63px of vertical space on mobile,
 * pushed the workspace's own h-screen layout past the real viewport
 * height, and forced an unwanted page-level scrollbar the IDE was never
 * designed to have. Same route (/workspace/[project]) since route groups
 * don't affect the URL, just opted out of the shared app chrome.
 */
export const dynamic = "force-dynamic";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
