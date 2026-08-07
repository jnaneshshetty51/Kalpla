import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveModelConfig } from "@/lib/llm/models";
import { executeLLMCallWithCap, UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

const REFERENCE_SOLUTION_SYSTEM_PROMPT = `You are a senior GenAI engineer writing a reference solution for a coding project used in a training curriculum.

Write a clean, well-commented, idiomatic Python implementation. Comments should explain WHY choices were made (e.g. algorithmic trade-offs), not just restate what each line does. Output ONLY the Python code — no markdown fences, no prose before or after.`;

export async function POST(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    let body: { project_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { project_id } = body;
    if (!project_id || typeof project_id !== "string") {
      return NextResponse.json({ error: "Missing 'project_id'" }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: project, error: projectErr } = await adminSupabase
      .from("projects")
      .select("id, name, spec, starter_template, reference_solution")
      .eq("id", project_id)
      .maybeSingle();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // The workspace UI only shows the "Unlock Reference Solution" button
    // after the user's own client-side test run passes, but that's a
    // transient, client-held signal never sent to the server — this
    // endpoint itself had no gate at all, so any authenticated caller could
    // fetch (or trigger generating) the reference solution with zero
    // submitted code. Require a real, persisted passing submission on
    // record instead — a stronger bar than the frontend's "ran tests once"
    // check, and one the server can actually verify.
    const { data: passingSubmission } = await adminSupabase
      .from("submissions")
      .select("id")
      .eq("user_id", user.id)
      .eq("project_id", project_id)
      .eq("status", "passed")
      .limit(1)
      .maybeSingle();

    if (!passingSubmission) {
      return NextResponse.json(
        { error: "Submit a passing solution for this project before unlocking the reference solution" },
        { status: 403 },
      );
    }

    // Cache hit: this is deliberately not user-specific, so the first
    // request generates it once (expensive tier) and every later request —
    // from any user — reuses the same cached reference solution. Checked
    // *before* any usage-cap enforcement below: a cached read costs the
    // platform nothing, so it shouldn't count against anyone's cap either.
    if (project.reference_solution) {
      return NextResponse.json({
        reference_solution: project.reference_solution,
        cached: true,
      });
    }

    const userPrompt = `Project: ${project.name}

Description: ${project.spec?.description || "N/A"}

Requirements:
${(project.spec?.requirements || []).map((r: string) => `- ${r}`).join("\n")}

Starter template given to students:
\`\`\`python
${project.starter_template || ""}
\`\`\`

Write the reference solution implementing this starter template's function signatures.`;

    const resolvedConfig = resolveModelConfig("expensive");
    const llmResponse = await executeLLMCallWithCap({
      userId: user.id,
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature: "workspace_reference_solution",
      messages: [
        { role: "system", content: REFERENCE_SOLUTION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.4,
    });

    const solutionText = llmResponse.content.trim();

    await adminSupabase
      .from("projects")
      .update({
        reference_solution: solutionText,
        reference_solution_generated_at: new Date().toISOString(),
      })
      .eq("id", project_id);

    return NextResponse.json({
      reference_solution: solutionText,
      cached: false,
      usageWarning: llmResponse.usageWarning,
    });
  } catch (err) {
    if (err instanceof UsageCapExceededError) {
      return NextResponse.json(err.details, { status: 429 });
    }
    console.error("Error in POST /api/workspace/reference-solution:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
