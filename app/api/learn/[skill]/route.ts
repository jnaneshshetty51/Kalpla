import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ skill: string }> },
) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const { skill } = await params;
    const decodedSkill = decodeURIComponent(skill);

    const adminSupabase = createAdminClient();

    // 1. Fetch skill node details from database
    let { data: node } = await adminSupabase
      .from("skill_nodes")
      .select("id, name, category, difficulty, order_index, description, prerequisite_ids")
      .or(`id.eq.${decodedSkill},name.ilike.${decodedSkill}`)
      .maybeSingle();

    if (!node) {
      node = {
        id: decodedSkill,
        name: decodedSkill.replace(/[-_]/g, " "),
        category: "GenAI Engineering",
        difficulty: 2,
        order_index: 1,
        description: `Comprehensive module covering ${decodedSkill}.`,
        prerequisite_ids: [],
      };
    }

    // 2. Fetch existing tutor conversation history for this user & node
    const { data: dbConversation } = await adminSupabase
      .from("tutor_conversations")
      .select("messages")
      .eq("user_id", user.id)
      .eq("skill_node_id", node.id)
      .maybeSingle();

    const conversation_history =
      dbConversation && Array.isArray(dbConversation.messages)
        ? dbConversation.messages
        : [];

    // 3. Query public.lessons table for the latest versioned lesson row
    const { data: dbLesson } = await adminSupabase
      .from("lessons")
      .select("version, title, content_markdown, code_example, discussion_questions")
      .eq("skill_node_id", node.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lessonTitle = dbLesson?.title || node.name;
    const markdownBody =
      dbLesson?.content_markdown ||
      `# Core Concept: ${node.name}\n\nIn modern GenAI engineering, ${node.name} serves as a foundational component for production-grade AI systems. Understanding its internal operational flow allows engineers to minimize latency, optimize token utilization, and improve response accuracy.`;

    const codeExample =
      dbLesson?.code_example ||
      `// Practical ${node.name} Implementation\nimport { executeLLMCall } from "@/lib/llm/providers";\n\nexport async function runModule(inputPrompt: string) {\n  const response = await executeLLMCall({\n    model: "claude-3-5-sonnet",\n    systemPrompt: "You are an expert AI engineering assistant.",\n    userPrompt: inputPrompt,\n  });\n  return response.content;\n}`;

    const discussionQuestions: string[] = Array.isArray(dbLesson?.discussion_questions)
      ? (dbLesson.discussion_questions as string[])
      : [
          `How does ${node.name} impact latency and context window optimization in production?`,
          `What fallback strategies would you implement if a ${node.name} step fails during streaming?`,
        ];

    const lesson = {
      title: lessonTitle,
      category: node.category,
      difficulty: node.difficulty,
      version: dbLesson?.version || 1,
      summary: `Master fundamental principles, system design, and practical implementations of ${node.name}.`,
      sections: [
        {
          heading: "1. Core Conceptual Architecture",
          content: markdownBody,
        },
        {
          heading: "2. Practical Worked Code Example",
          code: codeExample,
          language: "typescript",
        },
        {
          heading: "3. AI Tutor Discussion & Comprehension Check",
          bullets: discussionQuestions,
        },
      ],
    };

    return NextResponse.json({
      node,
      lesson,
      conversation_history,
    });
  } catch (err) {
    console.error("Error in GET /api/learn/[skill]:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
