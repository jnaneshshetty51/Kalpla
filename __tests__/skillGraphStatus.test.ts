import { describe, it, expect } from "vitest";
import { computeNodeStatus, COMPLETED_THRESHOLD } from "@/lib/skillGraph/status";

describe("lib/skillGraph/status.ts — computeNodeStatus (shared by GET skill-graph and update-score, must not drift)", () => {
  it("score >= threshold is always completed, regardless of prerequisites", () => {
    expect(computeNodeStatus(COMPLETED_THRESHOLD, false)).toBe("completed");
    expect(computeNodeStatus(100, true)).toBe("completed");
  });

  it("a positive score below threshold is in_progress even without prerequisites met", () => {
    expect(computeNodeStatus(1, false)).toBe("in_progress");
    expect(computeNodeStatus(79.9, false)).toBe("in_progress");
  });

  it("zero score with prerequisites met is available", () => {
    expect(computeNodeStatus(0, true)).toBe("available");
  });

  it("zero score with prerequisites NOT met is locked", () => {
    expect(computeNodeStatus(0, false)).toBe("locked");
  });

  it("COMPLETED_THRESHOLD is exactly 80, matching the rest of the platform's completion bar", () => {
    expect(COMPLETED_THRESHOLD).toBe(80);
  });
});
