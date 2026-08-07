import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveModelConfig } from "@/lib/llm/models";
import { executeLLMCallWithCap, UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

const HINT_LEVEL_GUIDANCE: Record<number, string> = {
  1: "Give a LEVEL 1 hint: a gentle nudge toward which requirement or area of the problem the student should focus on next. Do NOT name specific functions, algorithms, or syntax. Keep it to one short sentence.",
  2: "Give a LEVEL 2 hint: a more specific pointer — name the general technique or approach involved (e.g. 'you'll need a loop that steps forward by a fixed amount each iteration'), but do NOT write actual code. 2-3 sentences.",
  3: "Give a LEVEL 3 hint: near-complete guidance. You may describe the exact logic step-by-step and even show a short illustrative code fragment for ONE small part, but do not hand over the full working solution.",
};

export async function POST(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    if (checkRateLimit(user.id, "workspace_hint", 10, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    let body: { project_id?: string; code?: string; level?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { project_id, code } = body;
    if (!project_id || typeof project_id !== "string") {
      return NextResponse.json({ error: "Missing 'project_id'" }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: project, error: projectErr } = await adminSupabase
      .from("projects")
      .select("id, name, spec")
      .eq("id", project_id)
      .maybeSingle();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Compute the next level server-side from actual hint history, rather
    // than trusting a client-supplied level — keeps escalation consistent
    // even if the client's local state is stale.
    const { count: priorHints } = await adminSupabase
      .from("workspace_hints")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("project_id", project_id);

    const level = Math.min((priorHints || 0) + 1, 3);

    const systemPrompt = `You are a supportive coding mentor for the GenAI engineering project "${project.name}".

Project description: ${project.spec?.description || "N/A"}
Requirements:
${(project.spec?.requirements || []).map((r: string) => `- ${r}`).join("\n")}

${HINT_LEVEL_GUIDANCE[level]}

Respond with ONLY the hint text — no preamble, no "Hint:" prefix, no markdown headers.`;

    const userPrompt = `The student's current code:
\`\`\`python
${code || "(empty — student hasn't started yet)"}
\`\`\`

Give the level ${level} hint now.`;

    const resolvedConfig = resolveModelConfig("cheap");
    const llmResponse = await executeLLMCallWithCap({
      userId: user.id,
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature: "workspace_hint",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 300,
      temperature: 0.5,
    });

    await adminSupabase.from("workspace_hints").insert({
      user_id: user.id,
      project_id,
      level,
      code_snapshot: code || "",
    });

    return NextResponse.json({
      hint: llmResponse.content.trim(),
      level,
      usageWarning: llmResponse.usageWarning,
    });
  } catch (err) {
    if (err instanceof UsageCapExceededError) {
      return NextResponse.json(err.details, { status: 429 });
    }
    console.error("Error in POST /api/workspace/hint:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
