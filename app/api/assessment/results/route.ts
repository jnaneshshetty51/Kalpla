import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveModelConfig } from "@/lib/llm/models";
import { executeLLMCallWithCap } from "@/lib/llm/executeLLMCallWithCap";
import { CategoryResultGroup, NodeResultItem } from "@/types/results";

const TOP_LEVEL_CATEGORIES = [
  "LLM Fundamentals",
  "Prompt Engineering",
  "API Integration",
  "Embeddings & Retrieval",
  "Agentic Systems",
  "Evaluation",
  "Fine-Tuning Basics",
  "Deployment",
];

export async function GET() {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const adminSupabase = createAdminClient();

    // 1. Fetch all skill nodes
    const { data: dbNodes, error: nodesErr } = await adminSupabase
      .from("skill_nodes")
      .select("id, name, category, difficulty, order_index")
      .order("order_index", { ascending: true });

    if (nodesErr || !dbNodes) {
      console.error("Error fetching skill nodes:", nodesErr);
      return NextResponse.json(
        { error: nodesErr?.message || "Failed to fetch skill nodes" },
        { status: 500 },
      );
    }

    // 2. Fetch user's competency scores
    const { data: dbScores } = await adminSupabase
      .from("competency_scores")
      .select("skill_node_id, score")
      .eq("user_id", user.id);

    const scoreMap = new Map<string, number>();
    if (dbScores) {
      for (const s of dbScores) {
        scoreMap.set(s.skill_node_id, Number(s.score));
      }
    }

    // 3. Group skill nodes by category
    const categories: CategoryResultGroup[] = [];
    let totalScoreSum = 0;
    let totalNodesCount = 0;

    for (const cat of TOP_LEVEL_CATEGORIES) {
      const catNodes = dbNodes.filter((n) => n.category === cat);
      let catScoreSum = 0;

      const nodeItems: NodeResultItem[] = catNodes.map((n) => {
        const rawScore = scoreMap.get(n.id) ?? 0;
        const score = Math.round(rawScore * 10) / 10;
        catScoreSum += score;
        totalScoreSum += score;
        totalNodesCount++;

        let status: NodeResultItem["status"] = "needs_focus";
        if (score >= 80) status = "mastered";
        else if (score >= 40) status = "in_progress";

        return {
          id: n.id,
          name: n.name,
          category: n.category,
          difficulty: n.difficulty,
          score,
          status,
        };
      });

      const avg =
        catNodes.length > 0
          ? Math.round((catScoreSum / catNodes.length) * 10) / 10
          : 0;

      categories.push({
        category: cat,
        averageScore: avg,
        nodes: nodeItems,
      });
    }

    const overallScore =
      totalNodesCount > 0
        ? Math.round((totalScoreSum / totalNodesCount) * 10) / 10
        : 0;

    // 4. Generate AI Diagnostic Summary via LLM proxy (cheap tier)
    const categorySummaryString = categories
      .map((c) => `${c.category}: ${c.averageScore}%`)
      .join(", ");

    const resolvedConfig = resolveModelConfig("cheap");

    let aiSummary =
      "You demonstrate solid foundational potential across AI engineering concepts. Your learning path will prioritize strengthening your core capabilities before moving on to advanced agent architectures.";

    try {
      const llmResponse = await executeLLMCallWithCap({
        userId: user.id,
        provider: resolvedConfig.provider,
        modelId: resolvedConfig.modelId,
        feature: "assessment_summary",
        messages: [
          {
            role: "system",
            content:
              "You are an encouraging, expert AI engineering career coach. Generate a concise 2-3 sentence personalized diagnostic summary paragraph contextualizing the candidate's scores in plain language. Highlight strong areas and state where their personalized learning roadmap will start. Do NOT use bullet points or Markdown titles.",
          },
          {
            role: "user",
            content: `Candidate Diagnostic Category Scores: ${categorySummaryString}. Overall Average: ${overallScore}%. Provide a 2-3 sentence summary paragraph.`,
          },
        ],
        maxTokens: 300,
        temperature: 0.3,
      });

      if (llmResponse.content && llmResponse.content.trim()) {
        aiSummary = llmResponse.content.trim();
      }
    } catch (llmErr) {
      console.warn("LLM summary generation fallback used:", llmErr);
    }

    return NextResponse.json({
      overallScore,
      aiSummary,
      categories,
    });
  } catch (err) {
    console.error("Error in GET /api/assessment/results:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
