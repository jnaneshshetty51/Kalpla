import { createAdminClient } from "@/lib/supabase/admin";

export interface PublicPortfolioData {
  name: string;
  slug: string;
  bio: string | null;
  categories: Array<{ category: string; average: number; nodes: Array<{ name: string; score: number }> }>;
  publishedProjects: Array<{ id: string; name: string; case_study: string | null }>;
}

/**
 * Fetches everything the public portfolio page (Prompt 74) needs, always
 * reading competency_scores live from the database rather than any cached
 * snapshot — the portfolio must stay accurate as the user keeps improving.
 * Extracted out of the page component so it's directly unit-testable.
 */
export async function getPublicPortfolioData(slug: string): Promise<PublicPortfolioData | null> {
  if (
    process.env.NODE_ENV !== "production" &&
    (slug === "demo" || slug === "arjun-mehta")
  ) {
    return {
      name: "Arjun Mehta",
      slug,
      bio: "Staff AI Engineer specializing in multi-agent orchestration, speculative decoding, and production RAG systems.",
      categories: [
        {
          category: "LLM Fundamentals",
          average: 94,
          nodes: [
            { name: "Tokenization & Embeddings", score: 96 },
            { name: "Attention Mechanisms", score: 92 },
          ],
        },
        {
          category: "RAG & Retrieval",
          average: 89,
          nodes: [
            { name: "Hybrid Search & Re-ranking", score: 91 },
            { name: "Chunking Strategies", score: 87 },
          ],
        },
        {
          category: "Agent Architectures",
          average: 92,
          nodes: [
            { name: "Tool Use & Function Calling", score: 95 },
            { name: "Memory & State Persistence", score: 89 },
          ],
        },
      ],
      publishedProjects: [
        {
          id: "proj-1",
          name: "Autonomous Travel Research Agent",
          case_study:
            "Architected a dual-agent planner using LangGraph with vector-backed memory cache and self-correcting schema validation.",
        },
        {
          id: "proj-2",
          name: "Sub-Second Production RAG Pipeline",
          case_study:
            "Built a high-throughput hybrid retrieval engine combining BM25 lexical search with pgvector cosine similarity and Colbert re-ranking.",
        },
      ],
    };
  }

  const adminSupabase = createAdminClient();

  const { data: portfolio } = await adminSupabase
    .from("portfolios")
    .select("user_id, slug, bio, published_projects, is_public, custom_content")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (!portfolio) return null;

  const { data: profile } = await adminSupabase
    .from("users")
    .select("name")
    .eq("id", portfolio.user_id)
    .maybeSingle();

  const [{ data: scores }, { data: skillNodes }] = await Promise.all([
    adminSupabase.from("competency_scores").select("skill_node_id, score").eq("user_id", portfolio.user_id),
    adminSupabase.from("skill_nodes").select("id, name, category").order("order_index"),
  ]);

  const scoreByNode = new Map((scores || []).map((s) => [s.skill_node_id, Number(s.score)]));
  const categoriesMap = new Map<string, { name: string; score: number }[]>();
  for (const node of skillNodes || []) {
    const score = scoreByNode.get(node.id);
    if (score === undefined) continue;
    const list = categoriesMap.get(node.category) || [];
    list.push({ name: node.name, score: Math.round(score * 10) / 10 });
    categoriesMap.set(node.category, list);
  }
  const categories = Array.from(categoriesMap.entries()).map(([category, nodes]) => ({
    category,
    average: Math.round((nodes.reduce((sum, n) => sum + n.score, 0) / nodes.length) * 10) / 10,
    nodes,
  }));

  const publishedIds: string[] = portfolio.published_projects || [];
  const { data: submissions } = publishedIds.length
    ? await adminSupabase.from("submissions").select("id, project_id, metadata").in("id", publishedIds)
    : { data: [] };

  const projectIds = (submissions || []).map((s) => s.project_id).filter(Boolean) as string[];
  const { data: projects } = projectIds.length
    ? await adminSupabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] };
  const projectNameById = new Map((projects || []).map((p) => [p.id, p.name]));
  const overrides: Record<string, string> = portfolio.custom_content?.case_study_overrides || {};

  const publishedProjects = (submissions || []).map((s) => ({
    id: s.id,
    name: projectNameById.get(s.project_id!) || "Project",
    case_study: overrides[s.id] || s.metadata?.case_study?.summary || null,
  }));

  return {
    name: profile?.name || slug,
    slug: portfolio.slug,
    bio: portfolio.bio,
    categories,
    publishedProjects,
  };
}
