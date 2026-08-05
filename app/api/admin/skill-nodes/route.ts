import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { topologicalSort } from "@/lib/skillGraph/traverse";
import { SkillNodeInput } from "@/types/skillGraph";

/**
 * Helper to verify that the calling user is authenticated and possesses admin role privileges.
 */
async function verifyAdminAuth() {
  const { user, profile } = await getServerUser();
  if (!user || profile?.role !== "admin") {
    return null;
  }
  return { user, profile };
}

/**
 * GET /api/admin/skill-nodes
 * Returns all skill nodes ordered by order_index.
 */
export async function GET() {
  const auth = await verifyAdminAuth();
  if (!auth) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 },
    );
  }

  try {
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("skill_nodes")
      .select("*")
      .order("order_index", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data as SkillNodeInput[] });
  } catch (err) {
    console.error("Error in GET /api/admin/skill-nodes:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/skill-nodes
 * Creates a new skill node after validating that adding it will not introduce a cycle.
 */
export async function POST(request: Request) {
  const auth = await verifyAdminAuth();
  if (!auth) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 },
    );
  }

  try {
    let body: Partial<SkillNodeInput>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const {
      name,
      category,
      description,
      difficulty,
      order_index,
      prerequisite_ids,
    } = body;

    if (
      !name ||
      !category ||
      typeof difficulty !== "number" ||
      typeof order_index !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: 'name', 'category', 'difficulty' (1-5), 'order_index'",
        },
        { status: 400 },
      );
    }

    if (difficulty < 1 || difficulty > 5) {
      return NextResponse.json(
        { error: "Difficulty must be an integer between 1 and 5" },
        { status: 400 },
      );
    }

    const prereqs: string[] = Array.isArray(prerequisite_ids)
      ? prerequisite_ids
      : [];

    const adminSupabase = createAdminClient();
    const { data: existingNodes, error: fetchErr } = await adminSupabase
      .from("skill_nodes")
      .select("*");

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    // Simulate graph state with prospective node to validate cycle safety
    const tempId = "00000000-0000-0000-0000-000000000000";
    const simulatedNewNode: SkillNodeInput = {
      id: tempId,
      name,
      category,
      description: description || null,
      difficulty,
      order_index,
      prerequisite_ids: prereqs,
    };

    const simulatedGraph = [
      ...((existingNodes as SkillNodeInput[]) || []),
      simulatedNewNode,
    ];

    try {
      topologicalSort(simulatedGraph);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Cycle validation failed: ${msg}` },
        { status: 400 },
      );
    }

    // Insert new node into database
    const { data: newNode, error: insertErr } = await adminSupabase
      .from("skill_nodes")
      .insert({
        name,
        category,
        description: description || null,
        difficulty,
        order_index,
        prerequisite_ids: prereqs,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json(
      { data: newNode as SkillNodeInput },
      { status: 201 },
    );
  } catch (err) {
    console.error("Error in POST /api/admin/skill-nodes:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/skill-nodes
 * Updates fields of an existing skill node (including prerequisite_ids),
 * running topological sort validation before committing to prevent cycles.
 */
export async function PATCH(request: Request) {
  const auth = await verifyAdminAuth();
  if (!auth) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 },
    );
  }

  try {
    let body: Partial<SkillNodeInput> & { id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const {
      id,
      name,
      category,
      description,
      difficulty,
      order_index,
      prerequisite_ids,
    } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Missing required field: 'id'" },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();
    const { data: existingNodes, error: fetchErr } = await adminSupabase
      .from("skill_nodes")
      .select("*");

    if (fetchErr || !existingNodes) {
      return NextResponse.json(
        { error: fetchErr?.message || "Failed to fetch skill nodes" },
        { status: 500 },
      );
    }

    const typedNodes = existingNodes as SkillNodeInput[];
    const targetNode = typedNodes.find((n) => n.id === id);

    if (!targetNode) {
      return NextResponse.json(
        { error: `Skill node with ID '${id}' not found` },
        { status: 404 },
      );
    }

    const updatedNode: SkillNodeInput = {
      ...targetNode,
      name: name !== undefined ? name : targetNode.name,
      category: category !== undefined ? category : targetNode.category,
      description:
        description !== undefined ? description : targetNode.description,
      difficulty: difficulty !== undefined ? difficulty : targetNode.difficulty,
      order_index:
        order_index !== undefined ? order_index : targetNode.order_index,
      prerequisite_ids: Array.isArray(prerequisite_ids)
        ? prerequisite_ids
        : targetNode.prerequisite_ids,
    };

    if (updatedNode.difficulty < 1 || updatedNode.difficulty > 5) {
      return NextResponse.json(
        { error: "Difficulty must be an integer between 1 and 5" },
        { status: 400 },
      );
    }

    // Simulate updated graph state to validate topological cycle safety
    const simulatedGraph = typedNodes.map((n) =>
      n.id === id ? updatedNode : n,
    );

    try {
      topologicalSort(simulatedGraph);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Cycle validation failed: ${msg}` },
        { status: 400 },
      );
    }

    // Commit changes to database
    const { data: savedNode, error: updateErr } = await adminSupabase
      .from("skill_nodes")
      .update({
        name: updatedNode.name,
        category: updatedNode.category,
        description: updatedNode.description,
        difficulty: updatedNode.difficulty,
        order_index: updatedNode.order_index,
        prerequisite_ids: updatedNode.prerequisite_ids,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: savedNode as SkillNodeInput });
  } catch (err) {
    console.error("Error in PATCH /api/admin/skill-nodes:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/skill-nodes?id=...
 * Deletes a skill node if no other skill nodes depend on it as a prerequisite.
 */
export async function DELETE(request: Request) {
  const auth = await verifyAdminAuth();
  if (!auth) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing required query parameter: 'id'" },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();

    // Check if any other node lists this node in its prerequisite_ids array
    const { data: dependentNodes } = await adminSupabase
      .from("skill_nodes")
      .select("id, name")
      .contains("prerequisite_ids", [id]);

    if (dependentNodes && dependentNodes.length > 0) {
      const depNames = dependentNodes.map((n) => n.name).join(", ");
      return NextResponse.json(
        {
          error: `Cannot delete skill node: dependent skill nodes rely on it as a prerequisite (${depNames})`,
        },
        { status: 400 },
      );
    }

    const { error: deleteErr } = await adminSupabase
      .from("skill_nodes")
      .delete()
      .eq("id", id);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Skill node '${id}' deleted successfully`,
    });
  } catch (err) {
    console.error("Error in DELETE /api/admin/skill-nodes:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
