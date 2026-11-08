// The crew as a graph: Report → Lead → specialists (in stages) → Lead decides → Dispatch → Approval.
// Used by the Agents canvas (editable), the Agent Map on Live Incident (read-only) and the runtime (run order).
//
// A specialist connected straight from the Lead runs in stage 1. A specialist connected from another
// specialist runs after it, in the next stage, and is told what the earlier one found. Specialists in the
// same stage run at the same time. A specialist with no incoming connection is switched off.

import type { AgentKind, IconKey } from "@/lib/roster";

export type FlowAgent = { id: string; name: string; role: string; color: string; icon: IconKey; kind: AgentKind; after?: string[]; x?: number; y?: number; enabled?: boolean; pins?: Record<string, { x: number; y: number }> };
export type NodeKind = "report" | "decide" | "approve" | "agent";
export type FNode = { id: string; kind: NodeKind; agent?: FlowAgent; x: number; y: number; w: number; h: number };
export type FEdge = { id: string; from: string; to: string; locked?: boolean };

export const SIZE = { agent: { w: 230, h: 66 }, pill: { w: 168, h: 52 } };
export const PINS = ["report", "decide", "approve"] as const;

const specsOf = (agents: FlowAgent[]) => agents.filter((a) => a.kind === "specialist");

/** Stage number per specialist (1 = straight after the Lead). 0 = not connected or part of a loop. */
export function levels(agents: FlowAgent[]): Map<string, number> {
  const specs = new Map(specsOf(agents).map((a) => [a.id, a]));
  const memo = new Map<string, number>();
  const visit = (id: string, path: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (path.has(id)) return 0;
    const a = specs.get(id);
    if (!a) return 0;
    path.add(id);
    let best = 0;
    for (const u of a.after ?? []) {
      if (u === "lead") best = Math.max(best, 1);
      else { const l = visit(u, path); if (l > 0) best = Math.max(best, l + 1); }
    }
    path.delete(id);
    memo.set(id, best);
    return best;
  };
  for (const id of specs.keys()) visit(id, new Set());
  return memo;
}

/** Connected specialists grouped by stage, in run order. */
export function stagesOf<T extends FlowAgent>(agents: T[]): T[][] {
  const lv = levels(agents);
  const out: T[][] = [];
  for (const a of agents) {
    const l = lv.get(a.id) ?? 0;
    if (a.kind !== "specialist" || l === 0) continue;
    (out[l - 1] ??= []).push(a);
  }
  return out.filter(Boolean);
}

/** Why a connection is not allowed, or "" if it is. */
export function canConnect(agents: FlowAgent[], from: string, to: string): string {
  if (from === to) return "An agent cannot connect to itself.";
  const target = agents.find((a) => a.id === to);
  if (from === "decide") return target?.kind === "dispatch" ? "" : "After the decision, connect to Dispatch.";
  if (to === "decide") return "Every connected specialist reports back to the Lead automatically.";
  if (to === "report" || to === "lead") return "Nothing can run before the Lead.";
  if (!target || target.kind !== "specialist") return target?.kind === "dispatch" ? "Dispatch runs after the Lead decides. Connect it from the decision." : "Connect to a specialist.";
  const source = from === "lead" ? null : agents.find((a) => a.id === from);
  if (from !== "lead" && source?.kind !== "specialist") return "Only the Lead or a specialist can hand work to a specialist.";
  if (target.after?.includes(from)) return "Already connected.";
  // Adding from → to must not create a loop: `to` cannot already sit upstream of `from`.
  const up = new Set<string>();
  const walk = (id: string) => { for (const u of agents.find((a) => a.id === id)?.after ?? []) if (!up.has(u)) { up.add(u); walk(u); } };
  walk(from);
  if (up.has(to)) return "That would make a loop.";
  return "";
}

/** Tidy positions, top to bottom: Report, Lead, one row per stage, Lead Decides, Dispatch, Approval.
 *  Agents in the same stage sit side by side; unconnected ones wait in a column on the right. */
export function autoLayout(agents: FlowAgent[]): { agents: Record<string, { x: number; y: number }>; pins: Record<string, { x: number; y: number }> } {
  const PER_ROW = 4; // a wide stage wraps onto extra rows so the canvas stays readable
  const stages = stagesOf(agents);
  const lv = levels(agents);
  const loose = specsOf(agents).filter((a) => !lv.get(a.id));
  const gapX = 30, rowH = SIZE.agent.h + 40;
  const rowX = (n: number, j: number) => -(n * SIZE.agent.w + (n - 1) * gapX) / 2 + j * (SIZE.agent.w + gapX);
  const pos: Record<string, { x: number; y: number }> = {};
  const pin = (row: number) => ({ x: -SIZE.pill.w / 2, y: row * rowH + (SIZE.agent.h - SIZE.pill.h) / 2 });
  const lead = agents.find((a) => a.kind === "lead");
  if (lead) pos[lead.id] = { x: rowX(1, 0), y: rowH };
  let row = 2;
  for (const g of stages) {
    for (let start = 0; start < g.length; start += PER_ROW) {
      const chunk = g.slice(start, start + PER_ROW);
      chunk.forEach((a, j) => { pos[a.id] = { x: rowX(chunk.length, j), y: row * rowH }; });
      row++;
    }
  }
  const decideRow = row;
  const dispatch = agents.find((a) => a.kind === "dispatch");
  if (dispatch) pos[dispatch.id] = { x: rowX(1, 0), y: (decideRow + 1) * rowH };
  const widest = Math.min(PER_ROW, Math.max(1, ...stages.map((g) => g.length)));
  const sideX = (widest * SIZE.agent.w + (widest - 1) * gapX) / 2 + 90;
  loose.forEach((a, j) => { pos[a.id] = { x: sideX, y: rowH + j * (SIZE.agent.h + 24) }; });
  return { agents: pos, pins: { report: pin(0), decide: pin(decideRow), approve: pin(decideRow + (dispatch ? 2 : 1)) } };
}

/** Nodes and connections to draw. Saved positions win; anything without one gets the tidy layout. */
export function buildFlow(agents: FlowAgent[]): { nodes: FNode[]; edges: FEdge[] } {
  const auto = autoLayout(agents);
  const lead = agents.find((a) => a.kind === "lead");
  const pins = { ...auto.pins, ...(lead?.pins ?? {}) };
  const nodes: FNode[] = [];
  const pill = (id: NodeKind) => nodes.push({ id, kind: id, ...pins[id], ...SIZE.pill });
  pill("report");
  for (const a of agents) {
    const p = a.x != null && a.y != null ? { x: a.x, y: a.y } : auto.agents[a.id] ?? { x: 0, y: 0 };
    nodes.push({ id: a.id, kind: "agent", agent: a, ...p, ...SIZE.agent });
  }
  pill("decide");
  pill("approve");

  const lv = levels(agents);
  const edges: FEdge[] = [];
  if (lead) edges.push({ id: "report>lead", from: "report", to: lead.id, locked: true });
  const specs = specsOf(agents);
  for (const a of specs) for (const u of a.after ?? []) edges.push({ id: `${u}>${a.id}`, from: u, to: a.id });
  const connected = specs.filter((a) => (lv.get(a.id) ?? 0) > 0);
  const leaves = connected.filter((a) => !connected.some((b) => b.after?.includes(a.id)));
  if (leaves.length) leaves.forEach((a) => edges.push({ id: `${a.id}>decide`, from: a.id, to: "decide", locked: true }));
  else if (lead) edges.push({ id: "lead>decide", from: lead.id, to: "decide", locked: true });
  const dispatch = agents.find((a) => a.kind === "dispatch");
  if (dispatch && dispatch.enabled !== false) {
    edges.push({ id: `decide>${dispatch.id}`, from: "decide", to: dispatch.id });
    edges.push({ id: `${dispatch.id}>approve`, from: dispatch.id, to: "approve", locked: true });
  } else {
    edges.push({ id: "decide>approve", from: "decide", to: "approve", locked: true });
  }
  return { nodes, edges };
}
