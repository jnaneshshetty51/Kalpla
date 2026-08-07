import { describe, it, expect } from "vitest";
import { evaluateRoadmapSkips } from "@/lib/skillGraph/roadmapSkipLogic";
import { topologicalSort } from "@/lib/skillGraph/traverse";
import { SkillNode } from "@/types/skillGraph";

describe("Roadmap Generation & Constraint Integration", () => {
  const sampleNodes: SkillNode[] = [
    {
      id: "node-llm-basics",
      name: "LLM Basics",
      category: "LLM Fundamentals",
      difficulty: 1,
      order_index: 10,
      prerequisite_ids: [],
    },
    {
      id: "node-prompt-eng",
      name: "Prompt Engineering",
      category: "Prompt Engineering",
      difficulty: 1,
      order_index: 20,
      prerequisite_ids: ["node-llm-basics"],
    },
    {
      id: "node-vector-search",
      name: "Vector Search",
      category: "Embeddings & Retrieval",
      difficulty: 2,
      order_index: 30,
      prerequisite_ids: ["node-llm-basics"],
    },
    {
      id: "node-rag-pipeline",
      name: "RAG Pipeline Design",
      category: "Embeddings & Retrieval",
      difficulty: 3,
      order_index: 40,
      prerequisite_ids: ["node-vector-search", "node-prompt-eng"],
    },
  ];

  it("should compute topological sort respecting prerequisite ordering", () => {
    const sorted = topologicalSort(sampleNodes);
    const idOrder = sorted.map((n) => n.id);

    expect(idOrder.indexOf("node-llm-basics")).toBeLessThan(
      idOrder.indexOf("node-prompt-eng"),
    );
    expect(idOrder.indexOf("node-vector-search")).toBeLessThan(
      idOrder.indexOf("node-rag-pipeline"),
    );
    expect(idOrder.indexOf("node-prompt-eng")).toBeLessThan(
      idOrder.indexOf("node-rag-pipeline"),
    );
  });

  it("should evaluate skip logic pre-filtering for scores >= 80", () => {
    const scoresMap = {
      "node-llm-basics": 95.0, // Pre-mastered -> skip
      "node-prompt-eng": 85.0, // Pre-mastered -> skip
      "node-vector-search": 40.0, // Active study
      "node-rag-pipeline": 0.0, // Active study
    };

    const nodeIds = sampleNodes.map((n) => n.id);
    const { skip, fullCycle } = evaluateRoadmapSkips(scoresMap, nodeIds, 80.0);

    expect(skip).toEqual(["node-llm-basics", "node-prompt-eng"]);
    expect(fullCycle).toEqual(["node-vector-search", "node-rag-pipeline"]);
  });
});
