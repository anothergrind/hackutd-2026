import type { Approval, Run } from "@/lib/types";
import type { AgentView, CrewMember } from "@/lib/view";
import type { Verification } from "@/lib/verify";

export type PStatus = "pending" | "running" | "done" | "waiting" | "skipped" | "failed";

/** The eight steps of an incident, as shown in "What the AI Did" and on the Agent Map. */
export const STEP_TITLES = ["Report Received", "History Review", "Agent Analysis", "Cost Analysis", "Repair Plan", "Approve Actions", "Execution", "Verification"] as const;

const agentStatus = (v?: AgentView): PStatus => (!v || v.st === "PENDING" ? "pending" : v.st === "RUNNING" ? "running" : v.st === "FAILED" ? "failed" : "done");

/** Status of each step, worked out from what the agents have done so far. */
export function stepStatuses({ run, approvals, crew, agents, verification }: {
  run: Run; approvals: Approval[]; crew: CrewMember[]; agents: Record<string, AgentView>; verification?: Verification | null;
}): PStatus[] {
  const lead = agents.lead;
  const specs = crew.filter((a) => a.kind === "specialist");
  const dispatch = crew.find((a) => a.kind === "dispatch");
  const memory = (lead?.tools ?? []).some((x) => x.content.name === "read_building_memory");
  const finished = run.status !== "running";
  const pending = approvals.filter((a) => a.status === "pending");
  const sent = approvals.filter((a) => a.status === "sent");
  const inv = specs.map((a) => agents[a.id]);
  const invSt: PStatus = !specs.length ? "skipped" : inv.every((v) => v?.st === "SUCCEEDED") ? "done" : inv.some((v) => v?.st === "FAILED") ? "failed" : inv.some((v) => v && v.st !== "PENDING") ? "running" : "pending";
  const dv = dispatch ? agents[dispatch.id] : undefined;
  const dispSt: PStatus = !dispatch ? "skipped" : dv?.st === "PENDING" || !dv ? (finished ? "skipped" : "pending") : agentStatus(dv);
  const apprSt: PStatus = pending.length ? "waiting" : approvals.length ? "done" : finished ? "skipped" : "pending";
  const fixedSt: PStatus = approvals.length && !pending.length && sent.length ? "done" : finished && !approvals.length ? "skipped" : "pending";
  return [
    "done",
    memory ? "done" : lead?.st === "RUNNING" ? "running" : "pending",
    invSt,
    run.risk ? "done" : invSt === "done" && !finished ? "running" : finished ? "skipped" : "pending",
    dispSt, apprSt, fixedSt,
    verification?.status === "passed" ? "done" : verification?.status === "failed" ? "failed" : verification ? "running" : fixedSt === "skipped" ? "skipped" : "pending",
  ];
}

/** The step happening now: the first one working or waiting, else the last one finished. */
export function currentStep(st: PStatus[]) {
  const i = st.findIndex((x) => x === "running" || x === "waiting");
  if (i >= 0) return i;
  let last = 0;
  st.forEach((x, j) => { if (x === "done" || x === "failed") last = j; });
  return last;
}
