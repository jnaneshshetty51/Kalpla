import { describe, it, expect, vi, beforeEach } from "vitest";

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { checkUsageCap, incrementUsage } from "@/lib/llm/usageCap";

describe("lib/llm/usageCap.ts — real subscription-tier cap enforcement (billing-critical)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  describe("checkUsageCap", () => {
    it("allows the call and reports usage/limit when under the cap", async () => {
      mockFrom.mockReturnValue(
        makeChainable({ data: { tier: "free", status: "active", usage_this_period: { tutor: 5 } }, error: null }),
      );

      const result = await checkUsageCap("usr-1", "tutor_chat");
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.tier).toBe("free");
        expect(result.currentUsage).toBe(5);
        expect(result.limit).toBe(30);
      }
    });

    it("blocks with usage_cap_exceeded once currentUsage reaches the tier limit, including a resetDate", async () => {
      mockFrom.mockReturnValue(
        makeChainable({ data: { tier: "free", status: "active", usage_this_period: { tutor: 30 } }, error: null }),
      );

      const result = await checkUsageCap("usr-1", "tutor_chat");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.error).toBe("usage_cap_exceeded");
        expect(result.limit).toBe(30);
        expect(result.currentUsage).toBe(30);
        expect(result.resetDate).toBeDefined();
      }
    });

    it("a user with NO subscription row at all defaults to the free tier, not an error", async () => {
      mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));

      const result = await checkUsageCap("usr-new", "tutor_chat");
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.tier).toBe("free");
        expect(result.currentUsage).toBe(0);
      }
    });

    it("a category with no usage_this_period entry yet defaults to 0, not undefined/NaN", async () => {
      mockFrom.mockReturnValue(
        makeChainable({ data: { tier: "pro", status: "active", usage_this_period: {} }, error: null }),
      );

      const result = await checkUsageCap("usr-1", "roadmap_generation");
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.currentUsage).toBe(0);
        expect(result.limit).toBe(50); // pro roadmap limit
      }
    });

    it("premium tier (Infinity limit) is always allowed regardless of currentUsage", async () => {
      mockFrom.mockReturnValue(
        makeChainable({ data: { tier: "premium", status: "active", usage_this_period: { tutor: 999999 } }, error: null }),
      );

      const result = await checkUsageCap("usr-1", "tutor_chat");
      expect(result.allowed).toBe(true);
    });

    it("fails OPEN (allows the request) on an unexpected DB error, rather than blocking every user during an outage", async () => {
      mockFrom.mockImplementation(() => {
        throw new Error("connection refused");
      });

      const result = await checkUsageCap("usr-1", "tutor_chat");
      expect(result.allowed).toBe(true);
    });
  });

  describe("incrementUsage", () => {
    it("calls the increment_subscription_usage RPC with the resolved feature category, not the raw feature tag", async () => {
      await incrementUsage("usr-1", "tutor_chat_cache_lookup");
      expect(mockRpc).toHaveBeenCalledWith("increment_subscription_usage", {
        p_user_id: "usr-1",
        p_feature_key: "tutor", // category, not the raw "tutor_chat_cache_lookup" tag
      });
    });

    it("swallows an RPC error rather than throwing — a failed increment shouldn't break the response that already succeeded", async () => {
      mockRpc.mockResolvedValue({ error: { message: "rpc failed" } });
      await expect(incrementUsage("usr-1", "tutor_chat")).resolves.toBeUndefined();
    });
  });
});
