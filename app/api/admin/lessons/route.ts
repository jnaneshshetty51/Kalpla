import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAuth } from "@/lib/admin/verifyAdminAuth";

export async function GET() {
  try {
    const auth = await verifyAdminAuth();
    if (!auth.authorized) return auth.response;

    const adminSupabase = createAdminClient();

    // 1. Fetch all skill nodes
    const { data: dbNodes, error: nodeErr } = await adminSupabase
      .from("skill_nodes")
      .select("id, name, category, difficulty, order_index, description")
      .order("order_index", { ascending: true });

    if (nodeErr) {
      console.error("Error fetching skill nodes:", nodeErr);
      return NextResponse.json(
        { error: "Failed to fetch skill nodes" },
        { status: 500 },
      );
    }

    // 2. Fetch all lesson versions from public.lessons
    const { data: dbLessons } = await adminSupabase
      .from("lessons")
      .select("id, skill_node_id, version, title, content_markdown, code_example, discussion_questions, created_at")
      .order("version", { ascending: false });

    interface DbLessonItem {
      id: string;
      skill_node_id: string;
      version: number;
      title: string;
      content_markdown: string;
      code_example?: string | null;
      discussion_questions?: string[] | null;
      created_at: string;
    }

    const lessonsMap = new Map<string, DbLessonItem[]>();
    if (dbLessons) {
      for (const les of dbLessons) {
        const existing = lessonsMap.get(les.skill_node_id) || [];
        existing.push(les as DbLessonItem);
        lessonsMap.set(les.skill_node_id, existing);
      }
    }

    const formattedNodes = (dbNodes || []).map((node) => {
      const versions = lessonsMap.get(node.id) || [];
      const latestLesson = versions[0] || null;

      return {
        id: node.id,
        name: node.name,
        category: node.category,
        difficulty: node.difficulty,
        order_index: node.order_index,
        description: node.description,
        current_version: latestLesson?.version || 1,
        latest_lesson: latestLesson
          ? {
              id: latestLesson.id,
              version: latestLesson.version,
              title: latestLesson.title,
              content_markdown: latestLesson.content_markdown,
              code_example: latestLesson.code_example,
              discussion_questions: latestLesson.discussion_questions,
              created_at: latestLesson.created_at,
            }
          : {
              version: 1,
              title: node.name,
              content_markdown: `# Core Concept: ${node.name}\n\nIn modern GenAI engineering, ${node.name} serves as a foundational component for production-grade AI systems.`,
              code_example: `// Worked code example for ${node.name}\nconsole.log("Module initialized");`,
              discussion_questions: [
                `How does ${node.name} impact latency and context window optimization in production?`,
                `What fallback mechanisms would you put in place for ${node.name}?`,
              ],
            },
        all_versions: versions.map((v) => ({
          version: v.version,
          title: v.title,
          created_at: v.created_at,
        })),
      };
    });

    return NextResponse.json({ nodes: formattedNodes });
  } catch (err) {
    console.error("Error in GET /api/admin/lessons:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAdminAuth();
    if (!auth.authorized) return auth.response;

    let body: {
      skill_node_id?: string;
      title?: string;
      content_markdown?: string;
      code_example?: string;
      discussion_questions?: string[];
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const { skill_node_id, title, content_markdown, code_example, discussion_questions } = body;

    if (!skill_node_id || typeof skill_node_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'skill_node_id' parameter" },
        { status: 400 },
      );
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Missing or empty 'title' parameter" },
        { status: 400 },
      );
    }

    if (!content_markdown || typeof content_markdown !== "string" || !content_markdown.trim()) {
      return NextResponse.json(
        { error: "Missing or empty 'content_markdown' parameter" },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();

    // Query current max version for skill_node_id
    const { data: existingVersions } = await adminSupabase
      .from("lessons")
      .select("version")
      .eq("skill_node_id", skill_node_id)
      .order("version", { ascending: false })
      .limit(1);

    const currentMaxVersion = existingVersions && existingVersions[0] ? existingVersions[0].version : 0;
    const nextVersion = currentMaxVersion + 1;

    // Insert new version row without overwriting prior rows
    const { data: newLesson, error: insertErr } = await adminSupabase
      .from("lessons")
      .insert({
        skill_node_id: skill_node_id,
        version: nextVersion,
        title: title.trim(),
        content_markdown: content_markdown.trim(),
        code_example: code_example ? code_example.trim() : null,
        discussion_questions: Array.isArray(discussion_questions) ? discussion_questions : [],
      })
      .select()
      .single();

    if (insertErr || !newLesson) {
      console.error("Error inserting new lesson version:", insertErr);
      return NextResponse.json(
        { error: insertErr?.message || "Failed to save new lesson version" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      version: nextVersion,
      lesson: newLesson,
    });
  } catch (err) {
    console.error("Error in POST /api/admin/lessons:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
