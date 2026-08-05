import { describe, it, expect } from "vitest";
import {
  topologicalSort,
  getUnlockableNodes,
} from "../lib/skillGraph/traverse";
import { SkillNodeInput } from "../types/skillGraph";

describe("Skill Graph Traversal & Topological Sort", () => {
  it("should correctly sort a valid Directed Acyclic Graph (DAG)", () => {
    const nodes: SkillNodeInput[] = [
      {
        id: "node-c",
        name: "RAG Pipeline Design",
        category: "Embeddings",
        prerequisite_ids: ["node-b"],
        difficulty: 3,
        order_index: 30,
      },
      {
        id: "node-a",
        name: "Tokenization",
        category: "Fundamentals",
        prerequisite_ids: [],
        difficulty: 1,
        order_index: 10,
      },
      {
        id: "node-b",
        name: "Vector Search",
        category: "Embeddings",
        prerequisite_ids: ["node-a"],
        difficulty: 2,
        order_index: 20,
      },
    ];

    const sorted = topologicalSort(nodes);

    expect(sorted.map((n) => n.id)).toEqual(["node-a", "node-b", "node-c"]);
  });

  it("should order independent nodes deterministically by order_index", () => {
    const nodes: SkillNodeInput[] = [
      {
        id: "node-2",
        name: "Prompt Engineering",
        category: "Prompts",
        prerequisite_ids: [],
        difficulty: 1,
        order_index: 20,
      },
      {
        id: "node-1",
        name: "Tokenization",
        category: "Fundamentals",
        prerequisite_ids: [],
        difficulty: 1,
        order_index: 10,
      },
      {
        id: "node-3",
        name: "API Integration",
        category: "API",
        prerequisite_ids: [],
        difficulty: 1,
        order_index: 30,
      },
    ];

    const sorted = topologicalSort(nodes);

    expect(sorted.map((n) => n.id)).toEqual(["node-1", "node-2", "node-3"]);
  });

  it("should defensively reject a cyclic graph and throw a clear Error", () => {
    const cyclicNodes: SkillNodeInput[] = [
      {
        id: "node-1",
        name: "Node One",
        category: "Test",
        prerequisite_ids: ["node-3"], // Cycle: 1 -> 3 -> 2 -> 1
        difficulty: 1,
        order_index: 10,
      },
      {
        id: "node-2",
        name: "Node Two",
        category: "Test",
        prerequisite_ids: ["node-1"],
        difficulty: 1,
        order_index: 20,
      },
      {
        id: "node-3",
        name: "Node Three",
        category: "Test",
        prerequisite_ids: ["node-2"],
        difficulty: 1,
        order_index: 30,
      },
    ];

    expect(() => topologicalSort(cyclicNodes)).toThrowError(
      /Cyclic dependency detected in skill nodes graph/i,
    );
  });

  it("should correctly identify unlockable nodes based on completed prerequisites", () => {
    const nodes: SkillNodeInput[] = [
      {
        id: "node-1",
        name: "Fundamentals",
        category: "Core",
        prerequisite_ids: [],
        difficulty: 1,
        order_index: 10,
      },
      {
        id: "node-2",
        name: "Intermediate SDKs",
        category: "Core",
        prerequisite_ids: ["node-1"],
        difficulty: 2,
        order_index: 20,
      },
      {
        id: "node-3",
        name: "Advanced Agents",
        category: "Agents",
        prerequisite_ids: ["node-1", "node-2"],
        difficulty: 4,
        order_index: 30,
      },
    ];

    // Case A: Nothing completed -> node-1 is unlockable
    const unlockableInitial = getUnlockableNodes(nodes, []);
    expect(unlockableInitial.map((n) => n.id)).toEqual(["node-1"]);

    // Case B: node-1 completed -> node-2 is unlockable (node-3 still requires node-2)
    const unlockableAfterNode1 = getUnlockableNodes(nodes, ["node-1"]);
    expect(unlockableAfterNode1.map((n) => n.id)).toEqual(["node-2"]);

    // Case C: node-1 and node-2 completed -> node-3 is unlockable
    const unlockableAfterNode2 = getUnlockableNodes(nodes, [
      "node-1",
      "node-2",
    ]);
    expect(unlockableAfterNode2.map((n) => n.id)).toEqual(["node-3"]);
  });
});
