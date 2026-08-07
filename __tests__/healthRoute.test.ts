import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

import { GET } from "@/app/api/health/route";

describe("app/api/health/route.ts — connectivity check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({
      from: () => ({ select: mockSelect }),
    });
  });

  it("returns 200 ok/reachable when the query succeeds with no error", async () => {
    mockSelect.mockResolvedValue({ error: null });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.supabase).toBe("reachable");
    expect(json.timestamp).toBeDefined();
    expect(json.error).toBeUndefined();
  });

  it("treats a PGRST205 'relation not found' error as still connected (no tables provisioned yet is expected)", async () => {
    mockSelect.mockResolvedValue({ error: { code: "PGRST205", message: "relation not found" } });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.error).toBeUndefined();
  });

  it("returns 503 with the error message for any other error (real connectivity failure)", async () => {
    mockSelect.mockResolvedValue({ error: { code: "ECONNREFUSED", message: "network unreachable" } });

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("error");
    expect(json.supabase).toBe("unreachable");
    expect(json.error).toBe("network unreachable");
  });
});
