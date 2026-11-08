"use client";

import { useMemo } from "react";
import FlowCanvas, { type EdgeState, type NodeState } from "@/components/flow/FlowCanvas";
import { nowDoing } from "@/components/run/LiveActivity";
import { plainText } from "@/lib/plain";
import { buildFlow, type FEdge, type FNode } from "@/lib/flow";
import type { Approval, Risk, Run } from "@/lib/types";
import { approvalCounts, type AgentView, type CrewMember } from "@/lib/view";
import { STEP_TITLES, currentStep, stepStatuses, type PStatus } from "@/lib/steps";
import { StatusIcon } from "@/components/pipeline/Pipeline";
import type { Verification } from "@/lib/verify";
import s from "./CrewGraph.module.css";

/** The run drawn exactly as the crew is wired on the Agents page, with each agent's live state.
 *  Read-only: pan, zoom, and click an agent to open what it did. */
export default function CrewGraph({ run, crew, agents, approvals, risk, onSelect, selected, verification }: {
  run: Run; crew: CrewMember[]; agents: Record<string, AgentView>; approvals: Approval[]; risk: Risk | null;
  onSelect: (id: string) => void; selected: string | null; verification?: Verification | null;
}) {
  // Runs from before the canvas existed have no connections saved: every specialist then ran straight after the Lead.
  const wired = useMemo(() => crew.map((a) => (a.kind === "specialist" && !a.after ? { ...a, after: ["lead"] } : a)), [crew]);
  const flow = useMemo(() => buildFlow(wired), [wired]);
  const counts = approvalCounts(approvals);
  const dispatch = wired.find((a) => a.kind === "dispatch");

  // The map follows the same eight steps as "What the AI Did": each step lights up the boxes doing it.
  const steps = stepStatuses({ run, approvals, crew: wired, agents, verification });
  const now = currentStep(steps);
  const asNode = (st: PStatus): NodeState => (st === "running" ? "running" : st === "waiting" ? "waiting" : st === "done" ? "done" : st === "failed" ? "failed" : "idle");
  const agentState = (id: string): NodeState => {
    const st = agents[id]?.st;
    return st === "RUNNING" ? "running" : st === "SUCCEEDED" ? "done" : st === "FAILED" ? "failed" : "idle";
  };
  const nodeState = (n: FNode): NodeState => {
    if (n.kind === "report") return "done";
    if (n.kind === "decide") return asNode(steps[3]) === "idle" && risk ? "done" : asNode(steps[3]);
    if (n.kind === "approve") return counts.pending ? "waiting" : counts.sent ? "done" : "idle";
    const a = n.agent;
    if (a?.kind === "lead") return steps[1] === "running" || steps[3] === "running" ? "running" : agentState(n.id);
    if (a?.kind === "dispatch") return asNode(steps[4]);
    return agentState(n.id);
  };
  const working = wired.filter((a) => agents[a.id]?.st === "RUNNING").map((a) => a.name);
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
      <ol className={s.strip} aria-label="Steps">
        {STEP_TITLES.map((t, i) => (
          <li key={t} data-st={steps[i]} data-now={i === now || undefined}>
            <StatusIcon st={steps[i]} small /><span className={s.sn}>{i + 1}</span><span className={s.st}>{t}</span>
          </li>
        ))}
      </ol>
      <p className={s.nowLine}>
        <b>Step {now + 1}: {STEP_TITLES[now]}</b>
        {", "}{steps[now] === "running" && working.length ? `${working.join(", ")} working now` : steps[now] === "waiting" ? "waiting for your approval" : steps[now] === "running" ? "working now" : "done"}
      </p>
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
