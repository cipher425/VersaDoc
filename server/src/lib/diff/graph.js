/**
 * Commit graph helpers. Commits form a DAG (directed acyclic graph): each commit points to its
 * parent(s) - one parent normally, two for a merge commit.
 *
 * graph: Map<commitId, { parents: string[], generation: number }>
 * generation = 1 + max(parent generations): a cheap "depth" used to pick the best ancestor.
 */

export function ancestors(graph, startId) {
  const seen = new Set();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const p of graph.get(id)?.parents || []) stack.push(p);
  }
  return seen;
}

/**
 * Merge base = the best common ancestor of two commits (what Git calls `git merge-base`).
 * BFS from B; the first ancestors of B that are also ancestors of A are candidates, and the
 * one with the highest generation (the most recent) wins.
 */
export function mergeBase(graph, aId, bId) {
  const ancA = ancestors(graph, aId);
  if (ancA.has(bId)) return bId;
  let best = null;
  const seen = new Set([bId]);
  const queue = [bId];
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    if (ancA.has(id)) {
      if (!best || graph.get(id).generation > graph.get(best).generation) best = id;
      continue; // don't look further back than a common ancestor
    }
    for (const p of graph.get(id)?.parents || []) {
      if (!seen.has(p)) {
        seen.add(p);
        queue.push(p);
      }
    }
  }
  return best;
}

/** How many commits are reachable from `a` but not from `b` ("a is N commits ahead of b"). */
export function countAhead(graph, aId, bId) {
  const fromB = ancestors(graph, bId);
  let count = 0;
  for (const id of ancestors(graph, aId)) if (!fromB.has(id)) count++;
  return count;
}

export const isAncestor = (graph, maybeAncestor, of) => ancestors(graph, of).has(maybeAncestor);
