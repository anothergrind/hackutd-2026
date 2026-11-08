"use client";

import { useMemo } from "react";
import FlowCanvas, { type EdgeState, type NodeState } from "@/components/flow/FlowCanvas";
import { nowDoing } from "@/components/run/LiveActivity";
import { plainText } from "@/lib/plain";
import { buildFlow, type FEdge, type FNode } from "@/lib/flow";
import type { Approval, Risk, Run } from "@/lib/types";
import { approvalCounts, type AgentView, type CrewMember } from "@/lib/view";
import s from "./CrewGraph.module.css";

/** The run drawn exactly as the crew is wired on the Agents page, with each agent's live state.
 *  Read-only: pan, zoom, and click an agent to open what it did. */
export default function CrewGraph({ run, crew, agents, approvals, risk, onSelect, selected }: {
  run: Run; crew: CrewMember[]; agents: Record<string, AgentView>; approvals: Approval[]; risk: Risk | null;
  onSelect: (id: string) => void; selected: string | null;
}) {
  // Runs from before the canvas existed have no connections saved: every specialist then ran straight after the Lead.
  const wired = useMemo(() => crew.map((a) => (a.kind === "specialist" && !a.after ? { ...a, after: ["lead"] } : a)), [crew]);
  const flow = useMemo(() => buildFlow(wired), [wired]);
  const counts = approvalCounts(approvals);
  const specs = wired.filter((a) => a.kind === "specialist");
  const allIn = specs.every((a) => agents[a.id]?.st === "SUCCEEDED");
  const dispatch = wired.find((a) => a.kind === "dispatch");

  const agentState = (id: string): NodeState => {
    const st = agents[id]?.st;
    return st === "RUNNING" ? "running" : st === "SUCCEEDED" ? "done" : st === "FAILED" ? "failed" : "idle";
  };
  const nodeState = (n: FNode): NodeState => {
    if (n.kind === "agent") return agentState(n.id);
    if (n.kind === "report") return "done";
    if (n.kind === "decide") return risk ? "done" : allIn && run.status === "running" ? "running" : "idle";
    return counts.pending ? "waiting" : counts.sent ? "done" : "idle";
  };
  const nodeSub = (n: FNode) => {
    if (n.kind === "decide") return risk ? (dispatch && agents[dispatch.id]?.st !== "PENDING" ? "Repair recommended" : "Decided") : "Prices the risk";
    if (n.kind === "approve") return counts.pending ? `${counts.pending} waiting for you` : counts.sent ? `${counts.sent} approved` : "Facility manager";
    if (n.kind !== "agent") return undefined;
    const v = agents[n.id];
    if (!v || v.st === "PENDING") return n.agent?.role;
    if (v.st === "RUNNING") { const d = nowDoing(v, 0); return d.verb === "Just did" ? d.text : `${d.verb}${d.text ? `: ${plainText(d.text)}` : ""}`; }
    return v.st === "FAILED" ? "Failed" : "Done";
  };
  const edgeState = (e: FEdge): EdgeState => {
    const to = flow.nodes.find((n) => n.id === e.to);
    if (!to) return "";
    const st = nodeState(to);
    if (e.to === "approve") return counts.pending ? "wait" : counts.sent ? "done" : "";
    return st === "running" ? "on" : st === "done" || st === "waiting" ? "done" : "";
  };

  return (
    <div className={s.wrap}>
      <FlowCanvas
        className={s.stage}
        nodes={flow.nodes}
        edges={flow.edges}
        sel={selected ? { kind: "node", id: selected } : null}
        onSelect={(x) => { if (x?.kind === "node" && flow.nodes.find((n) => n.id === x.id)?.kind === "agent") onSelect(x.id); }}
        nodeState={nodeState}
        nodeSub={nodeSub}
        edgeState={edgeState}
        fitKey={wired.length}
      />
      <p className={s.note}>Wired as on the Agents page. Drag to move around, pinch or Ctrl + scroll to zoom, and click an agent for details.</p>
    </div>
  );
}
