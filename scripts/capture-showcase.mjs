import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Rich domain seed data for mock API endpoints
const mockDashboardData = {
  dashboard: {
    overallScore: 88.5,
    readinessBadge: "Staff GenAI & Agent Architect",
    isAssessmentPending: false,
    streak: {
      current_streak_days: 9,
      total_active_days: 34,
      last_activity_at: new Date().toISOString(),
    },
    next_step: {
      skill_node_id: "node-agent-mem",
      node_name: "Agent Memory & State Persistence",
      category: "Agent Architectures",
      status: "in_progress",
      estimated_days: 3,
      learning_objective: "Architect episodic and semantic memory systems using vector stores, Redis, and LangGraph checkpoints.",
      action_type: "continue_exercise",
      action_label: "Continue Exercise →",
      action_description: "Build state persistence and self-healing memory loops for autonomous agent graphs.",
      target_url: "/learn/agent-architectures",
    },
    recent_submissions: [
      {
        id: "sub-101",
        task_id: "node-hybrid-rag",
        task_name: "Sub-Second Hybrid RAG Pipeline",
        category: "Embeddings & Retrieval",
        ai_score: 95,
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: "sub-102",
        task_id: "node-tool-use",
        task_name: "Autonomous Travel Research Agent",
        category: "Agent Architectures",
        ai_score: 92,
        created_at: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: "sub-103",
        task_id: "node-eval-harness",
        task_name: "LLM-as-a-Judge Evaluation Suite",
        category: "Evaluation & Alignment",
        ai_score: 89,
        created_at: new Date(Date.now() - 259200000).toISOString(),
      },
    ],
    categories: [
      {
        category: "LLM Fundamentals",
        averageScore: 94,
        nodes: [
          { id: "n1", name: "Tokenization & Embeddings", category: "LLM Fundamentals", difficulty: 1, score: 96, status: "mastered" },
          { id: "n2", name: "Attention Mechanisms & KV Caching", category: "LLM Fundamentals", difficulty: 2, score: 92, status: "mastered" },
        ],
      },
      {
        category: "Agent Architectures",
        averageScore: 89,
        nodes: [
          { id: "n3", name: "Tool Use & Function Calling", category: "Agent Architectures", difficulty: 2, score: 94, status: "mastered" },
          { id: "n4", name: "Multi-Agent Orchestration & Consensus", category: "Agent Architectures", difficulty: 3, score: 85, status: "in_progress" },
          { id: "n5", name: "State Persistence & Memory", category: "Agent Architectures", difficulty: 3, score: 88, status: "in_progress" },
        ],
      },
      {
        category: "Retrieval & RAG",
        averageScore: 91,
        nodes: [
          { id: "n6", name: "Chunking & Hybrid Search", category: "Retrieval & RAG", difficulty: 2, score: 93, status: "mastered" },
          { id: "n7", name: "ColBERT Cross-Encoder Re-ranking", category: "Retrieval & RAG", difficulty: 3, score: 89, status: "mastered" },
        ],
      },
      {
        category: "Production & Alignment",
        averageScore: 82,
        nodes: [
          { id: "n8", name: "Prompt Injection & Safety Guardrails", category: "Production & Alignment", difficulty: 2, score: 84, status: "mastered" },
          { id: "n9", name: "LLM-as-a-Judge Eval Harness", category: "Production & Alignment", difficulty: 3, score: 80, status: "needs_focus" },
        ],
      },
    ],
    nodeCounts: {
      mastered: 22,
      in_progress: 5,
      needs_focus: 2,
      total: 29,
    },
  },
};

const mockCoachTasks = {
  log: {
    id: "log-101",
    date: new Date().toISOString().split("T")[0],
    completed: false,
    tasks: [
      { id: "ct-1", title: "Complete 1 practice quiz on Agent Memory Loops", category: "Agent Architectures", done: true, estimatedMinutes: 10 },
      { id: "ct-2", title: "Refactor Travel Agent tool schema to handle structured validation errors", category: "Projects", done: false, estimatedMinutes: 25 },
      { id: "ct-3", title: "Review AI critique on ColBERT cross-encoder latency trade-offs", category: "Review", done: false, estimatedMinutes: 15 },
    ],
  },
};

const mockRoadmap = {
  roadmap: {
    id: "roadmap-101",
    user_id: "showcase-user-id",
    generated_at: new Date().toISOString(),
    nodes: [
      {
        skill_node_id: "node-llm-1",
        node_name: "Tokenization & Embeddings",
        category: "LLM Fundamentals",
        status: "mastered",
        estimated_days: 2,
        learning_objective: "Understand Byte-Pair Encoding and vector distance representations.",
      },
      {
        skill_node_id: "node-rag-1",
        node_name: "Chunking & Hybrid Search",
        category: "Retrieval & RAG",
        status: "mastered",
        estimated_days: 3,
        learning_objective: "Build lexical BM25 and pgvector hybrid retrieval pipelines.",
      },
      {
        skill_node_id: "node-agent-1",
        node_name: "Function Calling & Tool Schema",
        category: "Agent Architectures",
        status: "mastered",
        estimated_days: 3,
        learning_objective: "Implement resilient function calling schemas with Pydantic validation.",
      },
      {
        skill_node_id: "node-agent-2",
        node_name: "State Persistence & Memory",
        category: "Agent Architectures",
        status: "in_progress",
        estimated_days: 4,
        learning_objective: "Design episodic memory with vector indexing and Redis caching.",
      },
      {
        skill_node_id: "node-agent-3",
        node_name: "Multi-Agent Workflows & Supervisor Patterns",
        category: "Agent Architectures",
        status: "locked",
        estimated_days: 5,
        learning_objective: "Build supervisor-directed agent teams with consensus routing.",
      },
      {
        skill_node_id: "node-eval-1",
        node_name: "Automated Evaluation with LLM Judges",
        category: "Production & Alignment",
        status: "locked",
        estimated_days: 4,
        learning_objective: "Develop CI/CD evals measuring faithfulness and answer relevance.",
      },
    ],
  },
  overallScore: 88.5,
};

const mockProjects = {
  projects: [
    {
      id: "travel-planner",
      name: "Autonomous Travel Research Agent",
      ladder_position: 1,
      spec: {
        type: "agent",
        description: "Build an autonomous travel planning agent equipped with flight search, hotel lookup, and itinerary synthesis tools with self-correcting validation.",
      },
      unlocked: true,
      missing_prerequisites: [],
      best_submission_status: "approved",
    },
    {
      id: "rag-hybrid",
      name: "Sub-Second Production Hybrid RAG",
      ladder_position: 2,
      spec: {
        type: "rag",
        description: "Engineer an enterprise question-answering pipeline combining sparse BM25 indexing with dense vector embeddings and ColBERT cross-encoder re-ranking.",
      },
      unlocked: true,
      missing_prerequisites: [],
      best_submission_status: "approved",
    },
    {
      id: "eval-harness",
      name: "Autonomous Model Evaluation & Red-Teaming Harness",
      ladder_position: 3,
      spec: {
        type: "general",
        description: "Construct an end-to-end evaluation suite testing agent resilience against prompt injections, hallucination benchmarks, and schema drift.",
      },
      unlocked: true,
      missing_prerequisites: [],
      best_submission_status: "pending_review",
    },
  ],
};

const mockWorkspace = {
  project: {
    id: "travel-planner",
    name: "Autonomous Travel Research Agent",
    tier: "Tier 1 — Core Project",
    starter_template: `import json
from typing import List, Dict, Any

class TravelPlannerAgent:
    """
    Autonomous multi-turn agent capable of coordinating flight search,
    hotel recommendations, and itinerary synthesis with validation loops.
    """
    def __init__(self, api_key: str = None):
        self.memory: List[Dict[str, Any]] = []
        self.tools = ["flight_search", "hotel_search", "budget_calculator"]

    def execute_plan(self, query: str) -> Dict[str, Any]:
        # Step 1: Decompose query into sub-intents
        print(f"[*] Analyzing query: {query}")
        
        # Step 2: Invoke tool orchestration
        itinerary = {
            "destination": "Kyoto, Japan",
            "duration_days": 7,
            "estimated_cost_usd": 2450,
            "status": "confirmed"
        }
        return itinerary

# Initialize agent instance
agent = TravelPlannerAgent()
print(json.dumps(agent.execute_plan("Plan a 7-day cultural trip to Kyoto with $3000 budget"), indent=2))
`,
    spec: {
      type: "agent",
      description: "Design an autonomous agent that can decompose travel requests into structured search steps, evaluate tool responses, and build a validated itinerary.",
      requirements: [
        "Parse complex user constraints (budget, destination, dates, travel style)",
        "Invoke tools in logical dependency order (flights -> hotels -> activities)",
        "Implement self-correcting schema validation on tool outputs",
        "Maintain conversational memory across multi-step planning loops",
      ],
      test_cases: [
        { function: "execute_plan", input: ["7-day Kyoto trip"], expected_output: "confirmed" },
        { function: "validate_budget", input: [2450, 3000], expected_output: true },
      ],
    },
    has_reference_solution: true,
  },
};

const mockAssessmentResults = {
  overallScore: 88.5,
  aiSummary: "Candidate demonstrates advanced architectural competency across LLM tokenization, RAG vector search, and agent tool execution. Key growth focus is multi-agent consensus protocols and automated eval harnesses.",
  categories: [
    {
      category: "LLM Fundamentals",
      averageScore: 94,
      nodes: [
        { id: "n1", name: "Tokenization & Vector Embeddings", category: "LLM Fundamentals", difficulty: 1, score: 96, status: "mastered" },
        { id: "n2", name: "Attention Mechanisms & KV Caching", category: "LLM Fundamentals", difficulty: 2, score: 92, status: "mastered" },
      ],
    },
    {
      category: "Agent Architectures",
      averageScore: 89,
      nodes: [
        { id: "n3", name: "Function Calling & Tool Schema", category: "Agent Architectures", difficulty: 2, score: 94, status: "mastered" },
        { id: "n4", name: "State Persistence & Memory", category: "Agent Architectures", difficulty: 3, score: 88, status: "in_progress" },
        { id: "n5", name: "Multi-Agent Consensus", category: "Agent Architectures", difficulty: 3, score: 85, status: "in_progress" },
      ],
    },
    {
      category: "Retrieval & RAG",
      averageScore: 91,
      nodes: [
        { id: "n6", name: "Hybrid Search (BM25 + Dense)", category: "Retrieval & RAG", difficulty: 2, score: 93, status: "mastered" },
        { id: "n7", name: "Cross-Encoder Re-Ranking", category: "Retrieval & RAG", difficulty: 3, score: 89, status: "mastered" },
      ],
    },
    {
      category: "Evaluation & Alignment",
      averageScore: 82,
      nodes: [
        { id: "n8", name: "Safety Guardrails & Jailbreak Defense", category: "Evaluation & Alignment", difficulty: 2, score: 84, status: "mastered" },
        { id: "n9", name: "LLM-as-a-Judge Eval Harness", category: "Evaluation & Alignment", difficulty: 3, score: 80, status: "needs_focus" },
      ],
    },
  ],
};

const mockSubmission = {
  submission: {
    id: "sub-101",
    project_id: "travel-planner",
    project_name: "Autonomous Travel Research Agent",
    code: `# Autonomous Travel Agent Implementation
class TravelPlannerAgent:
    def __init__(self):
        self.state = {}

    def plan(self, prompt):
        return {"status": "success", "dest": "Kyoto"}
`,
    reflection: "Focused on deterministic tool failure fallback routines when external flight APIs encounter rate limits or bad schemas.",
    status: "approved",
    metadata: {
      hints_used: 1,
      test_results: [{ name: "budget_check", passed: true }, { name: "itinerary_schema", passed: true }],
    },
    ai_review: {
      overall_score: 94,
      confidence: "high",
      is_ambiguous: false,
      logic_correctness: { score: 96, summary: "Exceptional separation of intent parsing from execution loops. Tool call arguments strictly comply with Pydantic contracts." },
      readability: { score: 92, summary: "Clean modular architecture with descriptive type annotations and detailed docstrings throughout." },
      optimization_opportunities: { score: 88, summary: "Consider parallelizing independent flight and hotel queries with asyncio.gather to shave ~400ms off total planning latency." },
      edge_case_handling: { score: 94, summary: "Robust fallback mechanisms catch malformed JSON and retry tool generation with constrained prompt cues." },
      architecture_quality: { score: 95, summary: "Idiomatic agentic loop design with durable state serialization and zero state leakage across planning turns." },
      genai_specific_criteria: [
        { name: "Deterministic tool schema validation", met: true, note: "Pydantic validator strictly rejects out-of-range budget numbers." },
        { name: "Context window token economy", met: true, note: "Summarizes previous turn memories before appending new search documents." },
        { name: "Hallucination mitigation via source citation", met: true, note: "Tool outputs are directly grounded in parsed search records." },
      ],
      reflection_flag: null,
    },
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  project: {
    id: "travel-planner",
    name: "Autonomous Travel Research Agent",
    spec: { type: "agent" },
  },
};

const mockBilling = {
  tier: "premium",
  status: "active",
  stripe_configured: true,
  meters: [
    { category: "tutor", used: 42, limit: 200, percentUsed: 21 },
    { category: "assessment", used: 3, limit: 10, percentUsed: 30 },
    { category: "roadmap", used: 12, limit: 50, percentUsed: 24 },
    { category: "mock_interview", used: 2, limit: 5, percentUsed: 40 },
    { category: "default", used: 85, limit: null, percentUsed: 0 },
  ],
};

const mockLiveSessions = {
  sessions: [
    {
      id: "sess-1",
      title: "Building Production Multi-Agent Systems with LangGraph",
      description: "Live architecture review and hands-on debugging of supervisor-worker agent loops with state persistence.",
      session_type: "live_class",
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      duration_minutes: 90,
      assigned_user_id: null,
    },
    {
      id: "sess-2",
      title: "Sub-Second Hybrid Search & ColBERT Re-ranking Masterclass",
      description: "Optimizing retrieval performance for large-scale enterprise vector catalogs with pgvector and Cohere/ColBERT.",
      session_type: "architecture_session",
      starts_at: new Date(Date.now() + 259200000).toISOString(),
      duration_minutes: 60,
      assigned_user_id: null,
    },
    {
      id: "sess-3",
      title: "1-on-1 Staff GenAI Portfolio & Architecture Review",
      description: "Personalized deep-dive into your published project ladder and technical readiness credential.",
      session_type: "mock_interview",
      starts_at: new Date(Date.now() + 432000000).toISOString(),
      duration_minutes: 45,
      assigned_user_id: "showcase-user-id",
    },
  ],
};

const mockAdminUsers = {
  users: [
    { id: "u-1", email: "arjun.mehta@kalpla.io", full_name: "Arjun Mehta", role: "admin", tier: "premium", readinessPct: 88, last_active_at: new Date().toISOString(), onboarding_completed: true },
    { id: "u-2", email: "priya.sharma@techcorp.in", full_name: "Priya Sharma", role: "user", tier: "pro", readinessPct: 76, last_active_at: new Date(Date.now() - 3600000).toISOString(), onboarding_completed: true },
    { id: "u-3", email: "rahul.verma@ai-labs.com", full_name: "Rahul Verma", role: "user", tier: "free", readinessPct: 62, last_active_at: new Date(Date.now() - 7200000).toISOString(), onboarding_completed: true },
    { id: "u-4", email: "sneha.patel@startup.io", full_name: "Sneha Patel", role: "user", tier: "pro", readinessPct: 91, last_active_at: new Date(Date.now() - 14400000).toISOString(), onboarding_completed: true },
    { id: "u-5", email: "vikram.singh@enterprise.co", full_name: "Vikram Singh", role: "user", tier: "premium", readinessPct: 84, last_active_at: new Date(Date.now() - 28800000).toISOString(), onboarding_completed: true },
  ],
};

const mockAdminSkillHealth = {
  nodes: [
    { id: "n1", name: "Tokenization & Embeddings", category: "LLM Fundamentals", completionRate: 94.2, dropOffRate: 2.1, avgAttempts: 1.2, totalUsers: 145, startedUsers: 142 },
    { id: "n2", name: "Attention Mechanisms & KV Caching", category: "LLM Fundamentals", completionRate: 88.5, dropOffRate: 4.8, avgAttempts: 1.6, totalUsers: 142, startedUsers: 135 },
    { id: "n3", name: "Tool Use & Function Calling", category: "Agent Architectures", completionRate: 86.4, dropOffRate: 5.2, avgAttempts: 1.8, totalUsers: 130, startedUsers: 122 },
    { id: "n4", name: "State Persistence & Memory", category: "Agent Architectures", completionRate: 78.1, dropOffRate: 9.3, avgAttempts: 2.4, totalUsers: 115, startedUsers: 98 },
    { id: "n5", name: "Multi-Agent Workflows", category: "Agent Architectures", completionRate: 71.5, dropOffRate: 14.2, avgAttempts: 2.9, totalUsers: 95, startedUsers: 82 },
    { id: "n6", name: "Hybrid Search (BM25 + Dense)", category: "Retrieval & RAG", completionRate: 89.0, dropOffRate: 3.9, avgAttempts: 1.4, totalUsers: 120, startedUsers: 114 },
    { id: "n7", name: "ColBERT Cross-Encoder Re-ranking", category: "Retrieval & RAG", completionRate: 82.3, dropOffRate: 7.5, avgAttempts: 2.1, totalUsers: 108, startedUsers: 96 },
    { id: "n8", name: "Safety Guardrails & Jailbreak Defense", category: "Production & Alignment", completionRate: 85.1, dropOffRate: 6.0, avgAttempts: 1.7, totalUsers: 92, startedUsers: 85 },
  ],
};

const mockAdminCost = {
  days: 30,
  totalCost: 142.85,
  totalCalls: 18450,
  activeUsers: 84,
  costPerActiveUser: 1.70,
  cacheHitCount: 6820,
  timeSeries: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    cost: Number((8 + Math.random() * 5).toFixed(2)),
  })),
  featureBreakdown: [
    { feature: "AI Tutor Chat (Streaming)", cost: 68.40, calls: 9200, cacheHits: 3400 },
    { feature: "Automated Code Review Rubric", cost: 44.15, calls: 4100, cacheHits: 1200 },
    { feature: "Adaptive Assessment Engine", cost: 18.20, calls: 2800, cacheHits: 1100 },
    { feature: "Personalized Roadmap Generation", cost: 12.10, calls: 2350, cacheHits: 1120 },
  ],
  modelBreakdown: [
    { model: "claude-3-5-sonnet-20241022", cost: 88.50, tokens: 4250000, calls: 5800 },
    { model: "claude-3-haiku-20240307", cost: 36.20, tokens: 6800000, calls: 9800 },
    { model: "text-embedding-3-small", cost: 18.15, tokens: 18200000, calls: 2850 },
  ],
};

const mockAdminGrading = {
  queue: [
    {
      id: "gq-101",
      user_id: "u-2",
      ai_score: 72,
      confidence: 0.61,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      response: { answer: "Implemented fallback with exponential backoff on tool validation exceptions." },
      ai_feedback: {
        summary: "Ambiguous error classification: fallback logic masks unexpected exceptions without re-raising system errors.",
        criteriaBreakdown: [
          { criterion: "Recovers gracefully from API error", met: true },
          { criterion: "Preserves original error traceback for logging", met: false },
        ],
      },
      tasks: {
        prompt: "Implement robust tool calling exception handler for autonomous travel agent.",
        type: "code",
        skill_node_id: "node-agent-1",
      },
    },
    {
      id: "gq-102",
      user_id: "u-3",
      ai_score: 68,
      confidence: 0.58,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      response: { answer: "BM25 score threshold is set dynamically based on mean token frequencies." },
      ai_feedback: {
        summary: "Heuristic thresholding may prematurely discard relevant tail documents.",
        criteriaBreakdown: [
          { criterion: "Normalizes BM25 and vector cosine scores", met: true },
          { criterion: "Applies Reciprocal Rank Fusion", met: false },
        ],
      },
      tasks: {
        prompt: "Combine lexical BM25 scores with dense vector similarities using RRF.",
        type: "code",
        skill_node_id: "node-rag-1",
      },
    },
  ],
};

const mockAdminLessons = {
  lessons: [
    { id: "les-1", skill_node_id: "node-llm-1", title: "Tokenization, Vocabularies & Embedding Spaces", version: 3, created_at: "2026-08-01" },
    { id: "les-2", skill_node_id: "node-agent-1", title: "Function Calling & Structured Output Schemas", version: 2, created_at: "2026-08-05" },
    { id: "les-3", skill_node_id: "node-rag-1", title: "Hybrid Search & ColBERT Cross-Encoder Re-ranking", version: 4, created_at: "2026-08-07" },
  ],
  nodes: [
    { id: "node-llm-1", name: "Tokenization & Embeddings", category: "LLM Fundamentals" },
    { id: "node-agent-1", name: "Function Calling & Tool Schema", category: "Agent Architectures" },
    { id: "node-rag-1", name: "Hybrid Search & Re-ranking", category: "Retrieval & RAG" },
  ],
};

const mockSkillLearn = {
  node: {
    id: "agent-architectures",
    name: "Agent Architectures & Tool Use",
    category: "Agent Architectures",
    difficulty: 2,
    description: "Master autonomous multi-step reasoning, deterministic tool execution, and durable state handling in AI agents.",
  },
  lesson: {
    title: "Autonomous Agent Tool Orchestration & Pydantic Validation",
    category: "Agent Architectures",
    difficulty: 2,
    summary: "How to construct robust agent execution loops that decompose complex multi-step user intents, invoke tool APIs with strict Pydantic validation, and recover from runtime tool failures without crashing the session.",
    sections: [
      {
        heading: "01. The Agent Reasoning & Tool Invocation Loop",
        content: "Modern AI agents transition from passive text generators to active systems by maintaining an iterative reasoning cycle: Plan -> Select Tool -> Execute -> Observe -> Synthesize. Ensuring that tool arguments conform strictly to structured schemas is the foundational boundary that prevents agent hallucinations from corrupting external APIs.",
        bullets: [
          "Constrain output tokens using JSON Schema or Pydantic models",
          "Isolate tool execution environments with timeout caps and rate limits",
          "Inject structured execution feedback back into the agent context window",
        ],
      },
      {
        heading: "02. Implementing Self-Correcting Execution Loops",
        content: "When a tool fails—due to missing keys, invalid types, or downstream rate limits—the agent must receive the exact validator error message to perform self-correction on the subsequent reasoning turn.",
        language: "python",
        code: `from pydantic import BaseModel, Field, ValidationError

class SearchHotelsInput(BaseModel):
    city: str = Field(description="Destination city name")
    max_price_usd: int = Field(gt=0, le=5000, description="Nightly ceiling")
    rating_min: float = Field(ge=1.0, le=5.0, default=4.0)

def handle_agent_tool_call(raw_json: dict):
    try:
        validated = SearchHotelsInput(**raw_json)
        return execute_hotel_search(validated)
    except ValidationError as err:
        # Return structured error directly to agent prompt
        return {"error": "ValidationError", "details": err.errors()}
`,
      },
    ],
  },
};

const mockAssessmentTasks = {
  tasks: [
    {
      id: "task-1",
      skill_node_id: "node-agent-1",
      skill_node: { name: "Agent Architectures & Tool Use" },
      type: "multiple_choice",
      prompt: "When designing an autonomous agent loop that calls external APIs, which strategy best mitigates cascading tool failure when an external flight API returns a 503 Service Unavailable?",
      options: [
        "Immediately terminate the session and discard conversation memory",
        "Intercept the 503 status, append a structured error message to the agent context, and prompt the agent to select an alternative provider or notify the user",
        "Blindly retry the tool call in an infinite while loop until the status returns 200",
        "Mask the error and hallucinate plausible flight numbers",
      ],
      difficulty: 2,
      category: "Agent Architectures",
    },
  ],
};

const mockPortfolioData = {
  publishedProjects: [
    {
      submission_id: "sub-101",
      project_id: "travel-planner",
      project_name: "Autonomous Travel Research Agent",
      code: "...",
      case_study: "Architected a dual-agent travel planner utilizing LangGraph state persistence and Pydantic validator fallbacks.",
      created_at: "2026-10-10",
    },
  ],
  bio: "Staff AI Engineer specializing in multi-agent orchestration, speculative decoding, and production RAG systems.",
  is_public: true,
  slug: "demo",
};

async function setupPageRoutes(page) {
  // Set showcase cookie
  await page.context().addCookies([
    {
      name: "kalpla_showcase",
      value: "true",
      domain: "localhost",
      path: "/",
    },
  ]);

  // Set default extra headers
  await page.setExtraHTTPHeaders({
    "x-showcase-mode": "true",
  });

  // Intercept and mock API calls
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDashboardData) })
  );

  await page.route("**/api/dashboard/coach-tasks", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCoachTasks) })
  );

  await page.route("**/api/roadmap", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRoadmap) })
  );

  await page.route("**/api/projects", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProjects) })
  );

  await page.route("**/api/workspace/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockWorkspace) })
  );

  await page.route("**/api/assessment/results", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAssessmentResults) })
  );

  await page.route("**/api/assessment/tasks", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAssessmentTasks) })
  );

  await page.route("**/api/assessment/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session: { id: "sess-101", current_task_index: 0, answers: {} } }),
    })
  );

  await page.route("**/api/submissions/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSubmission) })
  );

  await page.route("**/api/portfolio", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPortfolioData) })
  );

  await page.route("**/api/billing/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockBilling) })
  );

  await page.route("**/api/live-sessions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLiveSessions) })
  );

  await page.route("**/api/learn/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSkillLearn) })
  );

  await page.route("**/api/admin/users*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAdminUsers) })
  );

  await page.route("**/api/admin/skill-graph-health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAdminSkillHealth) })
  );

  await page.route("**/api/admin/cost-analytics*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAdminCost) })
  );

  await page.route("**/api/admin/grading-review", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAdminGrading) })
  );

  await page.route("**/api/admin/lessons", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAdminLessons) })
  );

  await page.route("**/api/admin/skill-nodes", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAdminLessons.nodes) })
  );

  await page.route("**/api/admin/live-sessions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLiveSessions) })
  );
}

const targets = [
  // 1. Marketing & Conversion
  { name: "01_landing_hero.png", path: "/", selector: "body", fullPage: false },
  { name: "02_landing_full.png", path: "/", selector: "body", fullPage: true },
  { name: "03_pricing_plans.png", path: "/pricing", selector: "body", fullPage: true },
  { name: "04_how_it_works.png", path: "/how-it-works", selector: "body", fullPage: true },
  { name: "05_about_platform.png", path: "/about", selector: "body", fullPage: true },
  { name: "06_faq.png", path: "/faq", selector: "body", fullPage: true },
  { name: "07_blog_index.png", path: "/blog", selector: "body", fullPage: true },
  { name: "08_blog_post.png", path: "/blog/welcome-to-the-kalpla-blog", selector: "body", fullPage: true },
  { name: "09_terms_legal.png", path: "/terms", selector: "body", fullPage: true },

  // 2. Authentication & Onboarding
  { name: "10_login_screen.png", path: "/login", selector: "body", fullPage: false },
  { name: "11_signup_screen.png", path: "/signup", selector: "body", fullPage: false },
  { name: "12_forgot_password.png", path: "/forgot-password", selector: "body", fullPage: false },
  { name: "13_reset_password.png", path: "/reset-password", selector: "body", fullPage: false },
  { name: "14_onboarding_flow.png", path: "/onboarding", selector: "body", fullPage: false },

  // 3. Learner Core Console & Platform
  { name: "15_learner_dashboard.png", path: "/dashboard", selector: "body", fullPage: true },
  { name: "16_skill_learning_lesson.png", path: "/learn/agent-architectures", selector: "body", fullPage: true },
  { name: "17_visual_roadmap.png", path: "/roadmap", selector: "body", fullPage: true },
  { name: "18_projects_browser.png", path: "/projects", selector: "body", fullPage: true },
  { name: "19_monaco_workspace.png", path: "/workspace/travel-planner", selector: "body", fullPage: false },
  { name: "20_skill_assessment.png", path: "/assessment", selector: "body", fullPage: false },
  { name: "21_assessment_results.png", path: "/assessment/results", selector: "body", fullPage: true },
  { name: "22_peer_review_queue.png", path: "/review/sub-101", selector: "body", fullPage: true },
  { name: "23_portfolio_builder.png", path: "/portfolio", selector: "body", fullPage: true },
  { name: "24_public_verified_portfolio.png", path: "/portfolio/demo", selector: "body", fullPage: true },
  { name: "25_live_sessions_portal.png", path: "/live-sessions", selector: "body", fullPage: true },
  { name: "26_billing_subscription.png", path: "/billing", selector: "body", fullPage: true },
  { name: "27_design_system_tokens.png", path: "/design-system", selector: "body", fullPage: true },

  // 4. Admin & Operational Controls
  { name: "28_admin_users.png", path: "/admin/users", selector: "body", fullPage: true },
  { name: "29_admin_content.png", path: "/admin/content", selector: "body", fullPage: true },
  { name: "30_admin_skill_graph_health.png", path: "/admin/skill-graph-health", selector: "body", fullPage: true },
  { name: "31_admin_live_sessions.png", path: "/admin/live-sessions", selector: "body", fullPage: true },
  { name: "32_admin_ai_cost_analytics.png", path: "/admin/ai-cost", selector: "body", fullPage: true },
  { name: "33_admin_grading_review.png", path: "/admin/grading-review", selector: "body", fullPage: true },
];

async function main() {
  console.log("🚀 Launching Playwright browser for Kalpla screenshot capture...");
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // High resolution retina capture
  });

  const page = await context.newPage();
  await setupPageRoutes(page);

  console.log(`📸 Capturing ${targets.length} screens across Kalpla platform...`);

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const fullUrl = `${BASE_URL}${item.path}`;
    const outputPath = path.join(SCREENSHOT_DIR, item.name);

    try {
      console.log(`[${i + 1}/${targets.length}] Navigating to: ${item.path}`);
      await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 15000 });
      // Short delay for client state hydration and CSS animations
      await page.waitForTimeout(800);

      await page.screenshot({
        path: outputPath,
        fullPage: item.fullPage,
      });
      console.log(`   ✓ Saved: docs/screenshots/${item.name}`);
    } catch (err) {
      console.error(`   ✗ Error on ${item.path}:`, err.message);
      // Fallback simple screenshot on error
      try {
        await page.screenshot({ path: outputPath });
        console.log(`   ✓ Saved fallback: docs/screenshots/${item.name}`);
      } catch {}
    }
  }

  await browser.close();
  console.log("🎉 All screenshots successfully generated!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
