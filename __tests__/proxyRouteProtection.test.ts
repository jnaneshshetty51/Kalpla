import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockFrom = vi.fn((table: string) => {
  if (table !== "users") throw new Error(`Unexpected table access in proxy test: "${table}"`);
  return { select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }) };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => mockFrom(table),
  }),
}));

import { proxy } from "@/proxy";

function makeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("proxy.ts — Supabase-session-based route protection (Prompt 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
  });

  const PUBLIC_ROUTES = [
    "/",
    "/login",
    "/signup",
    "/auth/callback",
    "/api/health",
    "/portfolio/some-student",
    "/api/cron/daily-coach",
    "/api/email/unsubscribe",
    "/api/billing/webhook",
    "/how-it-works",
    "/pricing",
    "/faq",
    "/about",
    "/blog",
    "/blog/welcome-to-the-kalpla-blog",
    "/terms",
    "/privacy",
    "/refund",
    "/sitemap.xml",
    "/robots.txt",
  ];

  it.each(PUBLIC_ROUTES)("lets an unauthenticated visitor through to public route %s", async (path) => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(makeRequest(path));
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(401);
  });

  it("redirects an unauthenticated visitor away from a protected page route to /login with a redirectTo param", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fdashboard");
  });

  it("returns a plain 401 JSON response (not an HTML redirect) for an unauthenticated request to a protected API route", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(makeRequest("/api/dashboard"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("lets an authenticated user through to a protected page route", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "usr-1" } } });
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).not.toBe(307);
  });

  it("redirects an authenticated user away from /login and /signup to /dashboard", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "usr-1" } } });

    const loginRes = await proxy(makeRequest("/login"));
    expect(loginRes.status).toBe(307);
    expect(loginRes.headers.get("location")).toContain("/dashboard");

    const signupRes = await proxy(makeRequest("/signup"));
    expect(signupRes.status).toBe(307);
    expect(signupRes.headers.get("location")).toContain("/dashboard");
  });

  it("redirects a non-admin authenticated user away from /admin/* to /dashboard, without ever exposing the page", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "usr-1" } } });
    mockMaybeSingle.mockResolvedValue({ data: { role: "user" } });

    const res = await proxy(makeRequest("/admin/users"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(mockFrom).toHaveBeenCalledWith("users");
  });

  it("lets an admin user through to /admin/* routes", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    mockMaybeSingle.mockResolvedValue({ data: { role: "admin" } });

    const res = await proxy(makeRequest("/admin/users"));
    expect(res.status).not.toBe(307);
  });
});
