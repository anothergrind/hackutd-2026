import { ROSTER, type AgentKind, type IconKey } from "@/lib/roster";
import type { Approval, Run, Step } from "@/lib/types";

export type AgentState = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type AgentView = { st: AgentState; now: string; start?: number; end?: number; tools: Step[]; steps: Step[]; final?: string; task?: string };
export type CrewMember = { id: string; name: string; role: string; color: string; icon: IconKey; kind: AgentKind };

const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const money = (n: unknown) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

/** The crew a run used (snapshot), or the built-in roster for older runs. */
export const crewOfRun = (run?: Run | null): CrewMember[] =>
  run?.crew?.length ? run.crew : ROSTER.map(({ id, name, role, color, icon, kind }) => ({ id, name, role, color, icon, kind }));

/** One short line for a tool call result, used on the graph and in the log. */
export function summarize(step: Step): string {
  const r = (step.content.result ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (r.error) return `error: ${clip(String(r.error), 60)}`;
  switch (step.content.name) {
    case "read_building_memory": return `${r.notes?.length ?? 0} past notes`;
    case "search_tickets": return `${r.count ?? 0} open tickets`;
    case "link_tickets": return `${r.linked?.length ?? 0} linked → ${r.root_asset_id}`;
    case "get_dependencies": return `${r.feeds?.length ?? 0} downstream`;
    case "get_readings": return `${r.count ?? 0} readings`;
    case "detect_trend": return r.hours_to_limit == null ? "no crossing" : `limit in ${Math.round(r.hours_to_limit)} h`;
    case "tenants_at_risk": return `${r.tenants?.length ?? 0} tenants · ${money(r.penalty_per_hour_usd)}/hr`;
    case "get_weather": return r.summary?.max_f != null ? `high ${Math.round(r.summary.max_f)}°F` : "forecast";
    case "get_weather_alerts": return r.count ? `${r.count} NWS alert(s)` : "no alerts";
    case "get_energy": return r.readings?.[0] ? `${r.readings[0].equipment} +${r.readings[0].over_baseline_pct}%` : "no anomaly";
    case "past_incidents": return r.repeat ? `${r.work_orders.length} past repair(s)` : "no past repairs";
    case "price_risk": return `${money(r.wait_usd)} vs ${money(r.fix_usd)}`;
    case "find_vendor": return r.vendors?.[0] ? r.vendors[0].name : "no vendor";
    case "check_parts": return `${(r.parts ?? []).filter((p: { on_hand: number }) => p.on_hand > 0).length} parts on hand`;
    case "draft_work_order": case "draft_schedule_change": case "draft_tenant_notice": return "drafted";
    case "save_memory": return "saved";
    default: return step.content.name?.startsWith("ask_") ? "report back" : "done";
  }
}

export function deriveAgents(run: Run | undefined, steps: Step[], crew: CrewMember[]) {
  const out: Record<string, AgentView> = {};
  const blank = (): AgentView => ({ st: "PENDING", now: "Waiting", tools: [], steps: [] });
  for (const a of crew) out[a.id] = blank();
  for (const s of steps) {
    const v = (out[s.agent] ??= blank());
    v.steps.push(s);
    const t = Date.parse(s.created_at);
    if (s.kind === "start") { v.st = "RUNNING"; v.start ??= t; v.task = s.content.task; v.now = "Working"; }
    else if (s.kind === "thought") v.now = clip(s.content.text ?? "");
    else if (s.kind === "tool") { v.tools.push(s); if (!s.content.name?.startsWith("ask_")) v.now = `${s.content.name} → ${summarize(s)}`; }
    else if (s.kind === "final") { v.st = "SUCCEEDED"; v.end = t; v.final = s.content.text; v.now = clip(s.content.text ?? "Done"); }
    else if (s.kind === "error") v.now = clip(s.content.text ?? "Error");
  }
  if (run?.status === "error") for (const v of Object.values(out)) if (v.st === "RUNNING") { v.st = "FAILED"; v.end = Date.now(); }
  return out;
}

export function approvalCounts(approvals: Approval[]) {
  return {
    pending: approvals.filter((a) => a.status === "pending").length,
    sent: approvals.filter((a) => a.status === "sent").length,
    rejected: approvals.filter((a) => a.status === "rejected").length,
  };
}

export const STATUS: Record<Run["status"], { label: string; tone: string }> = {
  running: { label: "RUNNING", tone: "accent" },
  awaiting_approval: { label: "NEEDS APPROVAL", tone: "warn" },
  done: { label: "DONE", tone: "ok" },
  error: { label: "FAILED", tone: "err" },
};

// ---------- Plain-English story of a run ----------

export type Phase = "idle" | "active" | "done" | "waiting";
export type Finding = { key: string; agent: string; label: string; value: string; detail: string; phase: Phase };
export type Stage = { key: "signal" | "investigate" | "price" | "approve" | "fixed"; title: string; idle: string; live: string; phase: Phase };

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const lastResult = (steps: Step[], name: string): R | undefined => {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].kind === "tool" && steps[i].content.name === name) return (steps[i].content.result ?? {}) as R;
  return undefined;
};
const hrsText = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const short$ = (n: number) => (n >= 10_000 ? `$${Math.round(n / 1000)}k` : money(n));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function storyOf(run: Run | undefined, steps: Step[], approvals: Approval[], crew = crewOfRun(run)) {
  const agents = deriveAgents(run, steps, crew);
  const phaseOf = (id: string): Phase => (agents[id]?.st === "SUCCEEDED" ? "done" : agents[id]?.st === "RUNNING" ? "active" : "idle");
  const of = (id: string) => steps.filter((s) => s.agent === id);

  const builtin: Record<string, () => Omit<Finding, "key" | "agent" | "label" | "phase">> = {
    triage: () => {
      const linked = lastResult(of("triage"), "link_tickets"), tickets = lastResult(of("triage"), "search_tickets");
      return linked && !linked.error ? { value: `${linked.linked?.length ?? 0} tickets → 1 problem`, detail: String(linked.problem) } : { value: tickets ? plural(tickets.count ?? 0, "open ticket") : "…", detail: "" };
    },
    sensor: () => {
      const tr = lastResult(of("sensor"), "detect_trend");
      return tr && tr.hours_to_limit != null ? { value: `fails in ${hrsText(tr.hours_to_limit)}`, detail: `${tr.asset_id} at ${tr.latest}, limit ${tr.limit}` } : { value: agents.sensor?.st === "SUCCEEDED" ? "no trend" : "…", detail: "" };
    },
    lease: () => {
      const tn = lastResult(of("lease"), "tenants_at_risk");
      return tn ? { value: `${money(tn.penalty_per_hour_usd ?? 0)}/hr`, detail: (tn.tenants ?? []).map((t: R) => t.name).join(", ") } : { value: "…", detail: "" };
    },
  };
  const memory = lastResult(of("lead"), "read_building_memory");
  const findings: Finding[] = [
    { key: "history", agent: "lead", label: "History", value: memory ? plural(memory.notes?.length ?? 0, "past note") : "…", detail: memory?.notes?.[0]?.note ?? "", phase: memory ? "done" : phaseOf("lead") },
    ...crew.filter((a) => a.kind === "specialist").map((a) => {
      const b = builtin[a.id]?.();
      const fin = agents[a.id]?.final?.replace(new RegExp(`^${a.name}:\\s*`), "") ?? "";
      return { key: a.id, agent: a.id, label: a.name, value: b?.value ?? (fin ? clip(fin.split(/[;,.]/)[0], 34) : "…"), detail: b?.detail ?? fin, phase: phaseOf(a.id) };
    }),
  ];

  const counts = approvalCounts(approvals);
  const checkers = crew.filter((a) => a.kind === "specialist").map((a) => a.id);
  const invDone = checkers.length > 0 && checkers.every((a) => agents[a]?.st === "SUCCEEDED");
  const invActive = Boolean(run) && (checkers.some((a) => agents[a]?.st === "RUNNING") || agents.lead?.st === "RUNNING");
  const risk = run?.risk ?? null;
  const allDecided = approvals.length > 0 && counts.pending === 0;
  const finished = run && run.status !== "running";

  const stages: Stage[] = [
    { key: "signal", title: "Signal", idle: "Something small gets flagged", live: "Received", phase: run ? "done" : "idle" },
    { key: "investigate", title: "Investigate", idle: "Agents check every data source", live: invDone ? `${checkers.length} agents reported` : "Agents working…", phase: invDone ? "done" : invActive ? "active" : "idle" },
    { key: "price", title: "Price it", idle: "Cost of waiting vs fixing", live: risk ? `${short$(risk.wait_usd)} vs ${short$(risk.fix_usd)}` : "Pricing…", phase: risk ? "done" : invDone ? "active" : "idle" },
    {
      key: "approve", title: "Approve", idle: "You OK the fix",
      live: counts.pending ? `${counts.pending} waiting for you` : allDecided ? `${counts.sent} approved` : finished ? "Nothing to approve" : "Drafting…",
      phase: counts.pending ? "waiting" : allDecided || (finished && !approvals.length) ? "done" : agents.dispatch?.st === "RUNNING" ? "active" : "idle",
    },
    { key: "fixed", title: "Fixed", idle: "Sent before it breaks", live: counts.sent ? "Sent" : finished && !approvals.length ? "Brief only" : "Not yet", phase: (allDecided && counts.sent) || (finished && !approvals.length) ? "done" : "idle" },
  ];

  return { agents, findings, stages, counts, risk, crew, brief: finished ? run.summary : null };
}
