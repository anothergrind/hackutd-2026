export type Edge = { upstream: string; downstream: string; relation: string };

/** Everything downstream of `start`, with hop distance and the edge that reached it (BFS, cycle-safe). */
export function blastRadius(edges: Edge[], start: string) {
  const reached = new Map<string, { depth: number; via: string; relation: string }>();
  const queue = [start];
  const depth = new Map([[start, 0]]);

  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.upstream !== current || depth.has(edge.downstream)) continue;
      const d = depth.get(current)! + 1;
      depth.set(edge.downstream, d);
      reached.set(edge.downstream, { depth: d, via: current, relation: edge.relation });
      queue.push(edge.downstream);
    }
  }
  return reached;
}
