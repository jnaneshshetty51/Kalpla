import { SkillNodeInput } from "@/types/skillGraph";

/**
 * Performs a topological sort over an array of skill nodes based on their `prerequisite_ids`.
 * Returns a valid learning sequence where every prerequisite node appears before
 * any node that depends on it.
 *
 * Handles cycles defensively: if a cyclic dependency exists in the input graph,
 * throws an explicit Error identifying the nodes involved instead of infinite-looping.
 *
 * Pure function — no database or API calls.
 *
 * @param nodes Array of skill nodes
 * @returns Array of skill nodes in valid topological learning order
 */
export function topologicalSort<T extends SkillNodeInput>(nodes: T[]): T[] {
  if (!nodes || nodes.length === 0) {
    return [];
  }

  // Map node ID -> Node object
  const nodeMap = new Map<string, T>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // In-degree tracker (counts how many internal prerequisites remain unsatisfied for each node)
  const inDegree = new Map<string, number>();
  // Adjacency list: prereqId -> list of node IDs that depend on prereqId
  const dependents = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    dependents.set(node.id, []);
  }

  for (const node of nodes) {
    let validPrereqCount = 0;

    for (const prereqId of node.prerequisite_ids) {
      // Only count prerequisites that are present in the provided nodes list
      if (nodeMap.has(prereqId)) {
        validPrereqCount++;
        const currentDependents = dependents.get(prereqId) || [];
        currentDependents.push(node.id);
        dependents.set(prereqId, currentDependents);
      }
    }

    inDegree.set(node.id, validPrereqCount);
  }

  // Queue of nodes with in-degree 0 (no remaining internal prerequisites)
  const zeroInDegreeQueue: T[] = [];

  for (const node of nodes) {
    if (inDegree.get(node.id) === 0) {
      zeroInDegreeQueue.push(node);
    }
  }

  // Sort initial 0-indegree nodes by order_index for deterministic output
  zeroInDegreeQueue.sort((a, b) => a.order_index - b.order_index);

  const result: T[] = [];

  while (zeroInDegreeQueue.length > 0) {
    // Pick node with lowest order_index
    const currentNode = zeroInDegreeQueue.shift()!;
    result.push(currentNode);

    const childIds = dependents.get(currentNode.id) || [];
    const newlyReady: T[] = [];

    for (const childId of childIds) {
      const currentInDegree = (inDegree.get(childId) || 1) - 1;
      inDegree.set(childId, currentInDegree);

      if (currentInDegree === 0) {
        const childNode = nodeMap.get(childId);
        if (childNode) {
          newlyReady.push(childNode);
        }
      }
    }

    // Insert newly ready nodes and keep queue sorted by order_index
    if (newlyReady.length > 0) {
      zeroInDegreeQueue.push(...newlyReady);
      zeroInDegreeQueue.sort((a, b) => a.order_index - b.order_index);
    }
  }

  // Defensive Cycle Check: if result count != input nodes count, a cycle exists!
  if (result.length !== nodes.length) {
    const unresolvedNodes = nodes
      .filter((n) => (inDegree.get(n.id) || 0) > 0)
      .map((n) => `${n.name} (${n.id})`);

    throw new Error(
      `Cyclic dependency detected in skill nodes graph. Unresolved cyclic nodes: ${unresolvedNodes.join(
        ", ",
      )}`,
    );
  }

  return result;
}

/**
 * Returns nodes whose prerequisite_ids are all satisfied by completedNodeIds,
 * excluding nodes that have already been completed.
 */
export function getUnlockableNodes<T extends SkillNodeInput>(
  nodes: T[],
  completedNodeIds: Iterable<string> | Set<string>,
): T[] {
  const completedSet =
    completedNodeIds instanceof Set
      ? completedNodeIds
      : new Set(completedNodeIds);

  const unlockable = nodes.filter((node) => {
    if (completedSet.has(node.id)) {
      return false; // Already completed
    }

    // Check if every prerequisite is in completedSet
    return node.prerequisite_ids.every((prereqId) =>
      completedSet.has(prereqId),
    );
  });

  return unlockable.sort((a, b) => a.order_index - b.order_index);
}

/**
 * Traverses backward to collect all transitive prerequisite nodes required for a target node,
 * returned in valid topological execution order.
 */
export function getPrerequisiteTree<T extends SkillNodeInput>(
  nodes: T[],
  targetNodeId: string,
): T[] {
  const nodeMap = new Map<string, T>(nodes.map((n) => [n.id, n]));
  const requiredNodeIds = new Set<string>();

  function collectPrereqs(id: string) {
    const node = nodeMap.get(id);
    if (!node) return;

    for (const prereqId of node.prerequisite_ids) {
      if (!requiredNodeIds.has(prereqId)) {
        requiredNodeIds.add(prereqId);
        collectPrereqs(prereqId);
      }
    }
  }

  collectPrereqs(targetNodeId);

  const requiredNodes = nodes.filter((n) => requiredNodeIds.has(n.id));
  return topologicalSort(requiredNodes);
}
