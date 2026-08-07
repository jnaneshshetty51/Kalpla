import { z } from "zod";
import { topologicalSort } from "@/lib/skillGraph/traverse";
import { evaluateRoadmapSkips } from "@/lib/skillGraph/roadmapSkipLogic";
import { executeLLMCallWithCap } from "@/lib/llm/executeLLMCallWithCap";
import { resolveModelConfig } from "@/lib/llm/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { SkillNode } from "@/types/skillGraph";

export const RoadmapNodeItemSchema = z.object({
  skill_node_id: z.string(),
  node_name: z.string(),
  order: z.number(),
  estimated_days: z.number().min(1).max(30),
  status: z.enum(["available", "locked", "in_progress", "completed", "skipped"]),
  learning_objective: z.string().optional(),
});

export const RoadmapOutputSchema = z.object({
  nodes: z.array(RoadmapNodeItemSchema),
});

export type RoadmapNodeItem = z.infer<typeof RoadmapNodeItemSchema>;

export interface GenerateRoadmapParams {
  userId: string;
  competencyScores?: Record<string, number>;
  goal?: string;
  timeBudgetHoursPerWeek?: number;
  skipThreshold?: number;
}

export interface GeneratedRoadmapRecord {
  id: string;
  user_id: string;
  generated_at: string;
  nodes: RoadmapNodeItem[];
}

const ROADMAP_SYSTEM_PROMPT = `You are a world-class AI Curriculum Architect designing custom GenAI engineering learning paths.

Your primary duty is to assign realistic estimated learning days and actionable learning objectives to an ordered sequence of skill nodes.

HARD CONSTRAINTS:
1. You MUST strictly preserve the exact topological node sequence provided in the prompt. Do NOT re-order nodes.
2. Do NOT add new skill nodes or re-include pre-skipped mastered nodes.
3. You MUST respond ONLY with a valid, single JSON object conforming strictly to this schema:
{
  "nodes": [
    {
      "skill_node_id": "<exact node ID>",
      "node_name": "<exact node name>",
      "order": <1-based sequence index>,
      "estimated_days": <number between 1 and 14 based on node difficulty and user time budget>,
      "status": "available",
      "learning_objective": "<1-sentence practical outcome>"
    }
  ]
}

DO NOT enclose your response in markdown code blocks (\`\`\`json). Output RAW JSON ONLY.`;

/**
 * Generates a personalized learning roadmap for a user.
 * Enforces topological sorting as a hard constraint and skips pre-mastered nodes (score >= threshold).
 * Calls the expensive LLM proxy model tier and persists the output into public.roadmaps.
 */
export async function generateUserRoadmap({
  userId,
  competencyScores,
  goal = "Become a full-stack GenAI Systems Engineer",
  timeBudgetHoursPerWeek = 10,
  skipThreshold = 80.0,
}: GenerateRoadmapParams): Promise<GeneratedRoadmapRecord> {
  const adminSupabase = createAdminClient();

  // 1. Fetch all skill nodes from database
  const { data: dbNodes, error: nodesErr } = await adminSupabase
    .from("skill_nodes")
    .select("id, name, category, difficulty, prerequisite_ids, order_index")
    .order("order_index", { ascending: true });

  if (nodesErr || !dbNodes || dbNodes.length === 0) {
    throw new Error(
      `Failed to fetch skill nodes for roadmap generation: ${nodesErr?.message || "No nodes found"}`,
    );
  }

  // Convert to SkillNode interface for topological sort
  const skillNodes: SkillNode[] = dbNodes.map((n) => ({
    id: n.id,
    name: n.name,
    category: n.category,
    difficulty: n.difficulty,
    order_index: typeof n.order_index === "number" ? n.order_index : 100,
    prerequisite_ids: Array.isArray(n.prerequisite_ids)
      ? (n.prerequisite_ids as string[])
      : [],
  }));

  // 2. Perform topological sort over skill nodes
  const sortedNodes = topologicalSort(skillNodes);

  // 2b. Fetch the user's most recent existing roadmap (if any) so real
  // progress survives regeneration. Regeneration used to be a pure INSERT
  // with no read of prior state, so a node a user had actually completed
  // could come back "available"/"locked" (or coincidentally "skipped",
  // masking the loss under default thresholds) after any regeneration —
  // confirmed live. "completed" is the one status that must never regress:
  // it reflects real graded progress (Prompt 33's updateRoadmapNodeStatus),
  // not something a fresh generation is entitled to recompute from scratch.
  const { data: priorRoadmap } = await adminSupabase
    .from("roadmaps")
    .select("nodes")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const priorNodes = Array.isArray(priorRoadmap?.nodes)
    ? (priorRoadmap?.nodes as RoadmapNodeItem[])
    : [];
  const previouslyCompletedIds = new Set<string>(
    priorNodes.filter((n) => n.status === "completed").map((n) => n.skill_node_id),
  );

  // 3. Fetch or resolve competency scores
  let scoresMap = competencyScores;
  if (!scoresMap) {
    const { data: dbScores } = await adminSupabase
      .from("competency_scores")
      .select("skill_node_id, score")
      .eq("user_id", userId);

    scoresMap = {};
    if (dbScores) {
      for (const s of dbScores) {
        scoresMap[s.skill_node_id] = Number(s.score);
      }
    }
  }

  // 4. Evaluate skip logic (nodes >= threshold are marked skip)
  const allNodeIds = sortedNodes.map((n) => n.id);
  const { skip: skipNodeIds } = evaluateRoadmapSkips(
    scoresMap,
    allNodeIds,
    skipThreshold,
  );
  const skipSet = new Set(skipNodeIds);

  // Separate active study nodes (non-skipped) while preserving exact topological order
  const activeStudyNodes = sortedNodes.filter((n) => !skipSet.has(n.id));
  const skippedNodes = sortedNodes.filter((n) => skipSet.has(n.id));

  // 5. Build prompt context for LLM proxy (expensive tier)
  const activeNodeContext = activeStudyNodes.map((n, idx) => ({
    sequence_order: idx + 1,
    id: n.id,
    name: n.name,
    category: n.category,
    difficulty: n.difficulty,
  }));

  const userPrompt = `
CANDIDATE LEARNING GOAL:
${goal}

WEEKLY TIME BUDGET:
${timeBudgetHoursPerWeek} hours per week

MANDATORY TOPOLOGICAL SKILL SEQUENCE (STRICT ORDER REQUIRED):
${JSON.stringify(activeNodeContext, null, 2)}

PRE-SKIPPED MASTERED NODES (DO NOT INCLUDE IN STUDY SEQUENCE):
${JSON.stringify(skippedNodes.map((n) => n.name), null, 2)}

Assign estimated learning days (1 to 14 days) and concise learning objectives for each node in the mandatory sequence. Preserve the exact order. Return JSON ONLY.
`;

  const resolvedConfig = resolveModelConfig("expensive");

  let parsedActiveNodes: RoadmapNodeItem[] = [];

  try {
    // Cap-checked (Prompt 81/84): a roadmap is required for the app to
    // function post-assessment, unlike auxiliary features (tutor/hints), so
    // a capped user degrades gracefully to the deterministic estimate below
    // rather than being hard-blocked from ever getting a roadmap at all —
    // this reuses the exact same catch-and-degrade path as any other LLM
    // failure, it just also now genuinely respects the tier cap first.
    const llmResponse = await executeLLMCallWithCap({
      userId,
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature: "roadmap_generation",
      messages: [
        { role: "system", content: ROADMAP_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2048,
      temperature: 0.2,
    });

    parsedActiveNodes = parseAndValidateRoadmapOutput(
      llmResponse.content,
      activeStudyNodes,
    );
  } catch (err) {
    console.warn(
      "[lib/roadmap/generate] LLM proxy roadmap call failed, unparseable, or usage-capped. Falling back to deterministic estimation:",
      err,
    );
    parsedActiveNodes = generateDeterministicRoadmapNodes(activeStudyNodes);
  }

  // 6. Assemble final roadmap nodes array (skipped nodes + ordered active study nodes)
  const finalNodes: RoadmapNodeItem[] = [];

  // Add pre-skipped nodes marked as 'skipped' — unless the node was already
  // genuinely completed in the prior roadmap, which takes priority over a
  // fresh skip-threshold classification.
  skippedNodes.forEach((n) => {
    finalNodes.push({
      skill_node_id: n.id,
      node_name: n.name,
      order: 0,
      estimated_days: 0,
      status: previouslyCompletedIds.has(n.id) ? "completed" : "skipped",
      learning_objective: "Pre-mastered during diagnostic assessment.",
    });
  });

  // Add active study nodes with initial statuses: 1st node 'available', rest
  // 'locked' — except nodes already completed in the prior roadmap, which
  // must not regress back to available/locked on regeneration.
  parsedActiveNodes.forEach((node, idx) => {
    finalNodes.push({
      skill_node_id: node.skill_node_id,
      node_name: node.node_name,
      order: idx + 1,
      estimated_days: node.estimated_days,
      status: previouslyCompletedIds.has(node.skill_node_id)
        ? "completed"
        : idx === 0
          ? "available"
          : "locked",
      learning_objective:
        node.learning_objective || `Master ${node.node_name} concepts and applications.`,
    });
  });

  // Preserving completed status on the first node(s) can leave nothing
  // actionable (every remaining node still "locked") — same safety net
  // updateRoadmapNodeStatus already applies after an incremental update,
  // needed here now that generation itself can produce an all-locked set.
  const hasActiveFocus = finalNodes.some(
    (n) => n.status === "available" || n.status === "in_progress",
  );
  if (!hasActiveFocus) {
    const firstLockedIdx = finalNodes.findIndex((n) => n.status === "locked");
    if (firstLockedIdx !== -1) {
      finalNodes[firstLockedIdx] = { ...finalNodes[firstLockedIdx], status: "available" };
    }
  }

  // 7. Persist into public.roadmaps database table
  const { data: insertedRecord, error: insertErr } = await adminSupabase
    .from("roadmaps")
    .insert({
      user_id: userId,
      nodes: finalNodes,
    })
    .select()
    .single();

  if (insertErr || !insertedRecord) {
    throw new Error(
      `Failed to persist roadmap to database: ${insertErr?.message || "Insert failed"}`,
    );
  }

  return {
    id: insertedRecord.id,
    user_id: insertedRecord.user_id,
    generated_at: insertedRecord.generated_at,
    nodes: insertedRecord.nodes as RoadmapNodeItem[],
  };
}

/**
 * Parses raw LLM text into JSON and validates against Zod schema.
 * Re-aligns node IDs to guarantee topological ordering constraint is strictly preserved.
 */
function parseAndValidateRoadmapOutput(
  rawContent: string,
  expectedNodes: SkillNode[],
): RoadmapNodeItem[] {
  let cleaned = rawContent.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  const parsedJson = JSON.parse(cleaned);
  const validation = RoadmapOutputSchema.safeParse(parsedJson);

  if (validation.success && validation.data.nodes.length > 0) {
    // Map validated output while enforcing exact topological sequence order
    return expectedNodes.map((expected, idx) => {
      const match = validation.data.nodes.find(
        (n) => n.skill_node_id === expected.id || n.node_name === expected.name,
      );

      return {
        skill_node_id: expected.id,
        node_name: expected.name,
        order: idx + 1,
        estimated_days: match?.estimated_days || Math.max(2, expected.difficulty * 2),
        status: "locked",
        learning_objective:
          match?.learning_objective || `Master ${expected.name} concepts and practice.`,
      };
    });
  }

  throw new Error("Invalid roadmap JSON structure");
}

/**
 * Fallback deterministic node array generator if LLM output fails.
 */
function generateDeterministicRoadmapNodes(
  expectedNodes: SkillNode[],
): RoadmapNodeItem[] {
  return expectedNodes.map((node, idx) => ({
    skill_node_id: node.id,
    node_name: node.name,
    order: idx + 1,
    estimated_days: Math.max(2, node.difficulty * 2),
    status: idx === 0 ? "available" : "locked",
    learning_objective: `Master ${node.name} core concepts and implementation patterns.`,
  }));
}
