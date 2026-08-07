import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssessmentTaskItem, AssessmentTaskType } from "@/types/assessment";

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

// Fallback task generator for offline / un-seeded development environments
const FALLBACK_TASKS: AssessmentTaskItem[] = [
  {
    id: "b0000000-0000-4000-a000-000000000101",
    skill_node_id: "a0000000-0000-4000-a000-000000000101",
    type: "multiple_choice",
    prompt:
      "What happens when an input prompt exceeds an LLM context window limit?",
    rubric: {
      options: [
        "A) The prompt is automatically compressed without information loss",
        "B) The input is truncated or causes a context length validation error",
        "C) The model switches to infinite memory mode",
        "D) Token embeddings are converted back to raw ASCII text",
      ],
      correct_answer: "B",
    },
    category: "LLM Fundamentals",
    skill_node: {
      id: "a0000000-0000-4000-a000-000000000101",
      name: "Tokenization & Context Windows",
      category: "LLM Fundamentals",
      difficulty: 1,
    },
  },
  {
    id: "b0000000-0000-4000-a000-000000000201",
    skill_node_id: "a0000000-0000-4000-a000-000000000201",
    type: "short_answer",
    prompt:
      "Explain the key structural difference between zero-shot prompting and few-shot in-context learning.",
    rubric: {
      key_points: [
        "Zero-shot provides only instructions without examples",
        "Few-shot includes input-output pair demonstrations in prompt context",
      ],
    },
    category: "Prompt Engineering",
    skill_node: {
      id: "a0000000-0000-4000-a000-000000000201",
      name: "Zero-Shot & Few-Shot Prompting",
      category: "Prompt Engineering",
      difficulty: 1,
    },
  },
  {
    id: "b0000000-0000-4000-a000-000000000301",
    skill_node_id: "a0000000-0000-4000-a000-000000000301",
    type: "code",
    prompt:
      "Write a Python snippet using an LLM SDK configuring temperature = 0.2 and max_tokens = 150.",
    rubric: {
      expected_parameters: ["temperature=0.2", "max_tokens=150"],
      language: "python",
    },
    category: "API Integration",
    skill_node: {
      id: "a0000000-0000-4000-a000-000000000301",
      name: "LLM Client SDKs & Parameters",
      category: "API Integration",
      difficulty: 2,
    },
  },
  {
    id: "b0000000-0000-4000-a000-000000000401",
    skill_node_id: "a0000000-0000-4000-a000-000000000401",
    type: "multiple_choice",
    prompt:
      "Which vector distance metric measures the angle between two embedding vectors regardless of magnitude?",
    rubric: {
      options: [
        "A) Euclidean distance (L2)",
        "B) Cosine Similarity",
        "C) Manhattan distance (L1)",
        "D) Hamming distance",
      ],
      correct_answer: "B",
    },
    category: "Embeddings & Retrieval",
    skill_node: {
      id: "a0000000-0000-4000-a000-000000000401",
      name: "Vector Embeddings & High-Dimensional Spaces",
      category: "Embeddings & Retrieval",
      difficulty: 2,
    },
  },
  {
    id: "b0000000-0000-4000-a000-000000000501",
    skill_node_id: "a0000000-0000-4000-a000-000000000501",
    type: "short_answer",
    prompt:
      "Describe the core Thought-Action-Observation cycle in the ReAct agent framework.",
    rubric: {
      key_points: [
        "Thought reasoning step",
        "Action execution step",
        "Observation feedback step",
      ],
    },
    category: "Agentic Systems",
    skill_node: {
      id: "a0000000-0000-4000-a000-000000000501",
      name: "Agent Loops & ReAct Framework",
      category: "Agentic Systems",
      difficulty: 3,
    },
  },
  {
    id: "b0000000-0000-4000-a000-000000000601",
    skill_node_id: "a0000000-0000-4000-a000-000000000601",
    type: "multiple_choice",
    prompt:
      "What is a primary advantage of LLM-as-a-Judge evaluation over surface n-gram metrics (BLEU/ROUGE)?",
    rubric: {
      options: [
        "A) Zero compute cost",
        "B) Evaluates semantic correctness and reasoning quality beyond exact keyword match",
        "C) 100% output determinism",
        "D) Requires no evaluation prompt",
      ],
      correct_answer: "B",
    },
    category: "Evaluation",
    skill_node: {
      id: "a0000000-0000-4000-a000-000000000601",
      name: "LLM-as-a-Judge & Automated Evals",
      category: "Evaluation",
      difficulty: 3,
    },
  },
  {
    id: "b0000000-0000-4000-a000-000000000701",
    skill_node_id: "a0000000-0000-4000-a000-000000000701",
    type: "short_answer",
    prompt:
      "What dataset structure is required for Supervised Fine-Tuning (SFT)?",
    rubric: {
      key_points: ["Instruction prompt and target response pairs"],
    },
    category: "Fine-Tuning Basics",
    skill_node: {
      id: "a0000000-0000-4000-a000-000000000701",
      name: "Supervised Fine-Tuning (SFT) & Dataset Formatting",
      category: "Fine-Tuning Basics",
      difficulty: 3,
    },
  },
  {
    id: "b0000000-0000-4000-a000-000000000801",
    skill_node_id: "a0000000-0000-4000-a000-000000000801",
    type: "multiple_choice",
    prompt:
      "Which optimization technique reduces Time-To-First-Token (TTFT) by reusing pre-computed key-value states?",
    rubric: {
      options: [
        "A) Quantization",
        "B) KV Cache & Prompt Caching",
        "C) Speculative Decoding",
        "D) Batch Normalization",
      ],
      correct_answer: "B",
    },
    category: "Deployment",
    skill_node: {
      id: "a0000000-0000-4000-a000-000000000801",
      name: "Model Serving & Inference Engines",
      category: "Deployment",
      difficulty: 3,
    },
  },
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

    // Query skill nodes grouped by category
    const { data: skillNodes } = await adminSupabase
      .from("skill_nodes")
      .select("id, name, category, difficulty, order_index")
      .order("difficulty", { ascending: true })
      .order("order_index", { ascending: true });

    // Query assessment tasks with skill node relations
    const { data: dbTasks } = await adminSupabase
      .from("assessment_tasks")
      .select("id, skill_node_id, type, prompt, rubric");

    const categoryTaskMap = new Map<string, AssessmentTaskItem>();

    if (skillNodes && dbTasks) {
      const taskMapBySkillNode = new Map<string, (typeof dbTasks)[0]>();
      for (const t of dbTasks) {
        if (!taskMapBySkillNode.has(t.skill_node_id)) {
          taskMapBySkillNode.set(t.skill_node_id, t);
        }
      }

      for (const cat of TOP_LEVEL_CATEGORIES) {
        const catNodes = skillNodes.filter((n) => n.category === cat);
        for (const node of catNodes) {
          const task = taskMapBySkillNode.get(node.id);
          if (task) {
            categoryTaskMap.set(cat, {
              id: task.id,
              skill_node_id: task.skill_node_id,
              type: task.type as AssessmentTaskType,
              prompt: task.prompt,
              rubric: (task.rubric as Record<string, unknown>) || {},
              category: cat,
              skill_node: {
                id: node.id,
                name: node.name,
                category: node.category,
                difficulty: node.difficulty,
              },
            });
            break;
          }
        }
      }
    }

    // Assemble final 8 ordered tasks matching the 8 top-level categories
    const resultTasks: AssessmentTaskItem[] = [];

    for (const cat of TOP_LEVEL_CATEGORIES) {
      const dbItem = categoryTaskMap.get(cat);
      if (dbItem) {
        resultTasks.push(dbItem);
      } else {
        // Fallback item if database row was missing
        const fallbackItem = FALLBACK_TASKS.find((t) => t.category === cat);
        if (fallbackItem) {
          resultTasks.push(fallbackItem);
        }
      }
    }

    return NextResponse.json({ tasks: resultTasks });
  } catch (error) {
    console.error("Error fetching assessment tasks:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
