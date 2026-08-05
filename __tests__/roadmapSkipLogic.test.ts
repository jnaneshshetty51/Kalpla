import { describe, it, expect } from "vitest";
import {
  isNodeSkippable,
  getSkippableNodes,
  evaluateRoadmapSkips,
} from "../lib/skillGraph/roadmapSkipLogic";

describe("Skill Node Skip Logic", () => {
  it("should mark scores >= 80 as skippable by default", () => {
    expect(isNodeSkippable(80.0)).toBe(true);
    expect(isNodeSkippable(95.5)).toBe(true);
    expect(isNodeSkippable(100.0)).toBe(true);
  });

  it("should mark scores < 80 as non-skippable by default", () => {
    expect(isNodeSkippable(79.9)).toBe(false);
    expect(isNodeSkippable(50.0)).toBe(false);
    expect(isNodeSkippable(0)).toBe(false);
    expect(isNodeSkippable(null)).toBe(false);
    expect(isNodeSkippable(undefined)).toBe(false);
  });

  it("should support custom threshold parameters", () => {
    expect(isNodeSkippable(75.0, 70.0)).toBe(true);
    expect(isNodeSkippable(75.0, 90.0)).toBe(false);
  });

  it("should filter skippable node IDs correctly from a score map", () => {
    const scoresMap = {
      "node-tokenization": 92.0,
      "node-embeddings": 85.0,
      "node-rag": 72.0,
      "node-agents": 40.0,
      "node-evals": null,
    };

    const skippable = getSkippableNodes(scoresMap, 80.0);

    expect(skippable).toEqual(["node-tokenization", "node-embeddings"]);
  });

  it("should partition a roadmap's nodes into skip vs. full-cycle", () => {
    const scoresMap = {
      "node-tokenization": 92.0, // Rahul already knows this
      "node-embeddings": 85.0, // and this
      "node-rag": 72.0, // needs practice
      "node-agents": 40.0, // needs the full cycle
      // node-evals: no diagnostic score at all
    };
    const nodeIds = [
      "node-tokenization",
      "node-embeddings",
      "node-rag",
      "node-agents",
      "node-evals",
    ];

    const { skip, fullCycle } = evaluateRoadmapSkips(scoresMap, nodeIds, 80.0);

    expect(skip).toEqual(["node-tokenization", "node-embeddings"]);
    expect(fullCycle).toEqual(["node-rag", "node-agents", "node-evals"]);
  });
});
