"use client";

import Link from "next/link";
import { useUser } from "@/components/providers/AuthProvider";

export interface AuthAwareCTAProps {
  /** Where signed-out visitors go — defaults to the signup/assessment funnel. */
  signedOutHref?: string;
  signedOutLabel: string;
  /** Where an already-authenticated visitor goes instead (Prompt 92) — never
   * back through signup. */
  signedInHref?: string;
  signedInLabel?: string;
  className?: string;
}

/**
 * Marketing pages are static (Prompt 91) and must not read cookies to
 * check auth state — that would force them dynamic. Instead this client
 * component checks auth after hydration via the same AuthProvider context
 * used app-wide, and swaps the CTA once it knows: a returning, already
 * logged-in visitor is offered "Go to dashboard" instead of being pushed
 * through signup again (Prompt 92). Briefly shows the signed-out CTA while
 * auth is still loading — an acceptable tradeoff for keeping the page
 * itself static rather than blocking the whole shell on a session check.
 */
export function AuthAwareCTA({
  signedOutHref = "/signup",
  signedOutLabel,
  signedInHref = "/dashboard",
  signedInLabel = "Go to dashboard →",
  className,
}: AuthAwareCTAProps) {
  const { user, loading } = useUser();
  const signedIn = !loading && !!user;

  return (
    <Link href={signedIn ? signedInHref : signedOutHref} className={className}>
      {signedIn ? signedInLabel : signedOutLabel}
    </Link>
  );
}
