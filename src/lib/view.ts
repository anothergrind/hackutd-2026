import { ROSTER, type AgentId } from "@/lib/roster";
import type { Approval, Run, Step } from "@/lib/types";

export type AgentState = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type AgentView = { st: AgentState; now: string; start?: number; end?: number; tools: Step[]; final?: string };

const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const money = (n: unknown) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

/** One short line for a tool call result, used on graph chips and in the log. */
export function summarize(step: Step): string {
  const r = (step.content.result ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (r.error) return `error: ${clip(String(r.error), 60)}`;
  switch (step.content.name) {
    case "read_building_memory": return `${r.notes?.length ?? 0} notes`;
    case "search_tickets": return `${r.count ?? 0} open tickets`;
    case "link_tickets": return `${r.linked?.length ?? 0} linked → ${r.root_asset_id}`;
    case "get_dependencies": return `${r.depends_on?.length ?? 0} up · ${r.feeds?.length ?? 0} downstream`;
    case "get_readings": return `${r.count ?? 0} readings`;
    case "detect_trend": return `${r.slope_per_day > 0 ? "+" : ""}${r.slope_per_day}/day · ${r.hours_to_limit == null ? "no crossing" : `${Math.round(r.hours_to_limit)} h to limit`}`;
    case "tenants_at_risk": return `${r.tenants?.length ?? 0} tenants · ${money(r.penalty_per_hour_usd)}/hr`;
    case "get_weather": return r.summary?.max_f != null ? `high ${Math.round(r.summary.max_f)}°F · rain ${r.summary.rain_pct ?? 0}%` : "forecast";
    case "price_risk": return `wait ${money(r.wait_usd)} vs fix ${money(r.fix_usd)}`;
    case "find_vendor": return r.vendors?.[0] ? `${r.vendors[0].name} · ${money(r.vendors[0].est_cost_usd)}` : "no vendor";
    case "check_parts": return `${(r.parts ?? []).filter((p: { on_hand: number }) => p.on_hand > 0).length}/${r.parts?.length ?? 0} parts on hand`;
    case "draft_work_order": case "draft_schedule_change": case "draft_tenant_notice": return "drafted · awaiting approval";
    case "save_memory": return "saved";
    default: return step.content.name?.startsWith("ask_") ? clip(String(r.report ?? "report"), 60) : "done";
  }
}

export function deriveAgents(run: Run | undefined, steps: Step[]) {
  const out = {} as Record<AgentId, AgentView>;
  for (const a of ROSTER) out[a.id] = { st: "PENDING", now: "Waiting", tools: [] };
  for (const s of steps) {
    const v = out[s.agent as AgentId];
    if (!v) continue;
    const t = Date.parse(s.created_at);
    if (s.kind === "start") { v.st = "RUNNING"; v.start ??= t; v.now = clip(s.content.task ?? "Working"); }
    else if (s.kind === "thought") v.now = clip(s.content.text ?? "");
    else if (s.kind === "tool") { v.tools.push(s); if (!s.content.name?.startsWith("ask_")) v.now = `${s.content.name} → ${summarize(s)}`; }
    else if (s.kind === "final") { v.st = "SUCCEEDED"; v.end = t; v.final = s.content.text; v.now = clip(s.content.text ?? "Done"); }
    else if (s.kind === "error") v.now = clip(s.content.text ?? "Error");
  }
  if (run?.status === "error") {
    for (const a of ROSTER) if (out[a.id].st === "RUNNING") { out[a.id].st = "FAILED"; out[a.id].end = Date.now(); }
  }
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

// ---------- Plain-English story of a run (what the home page shows) ----------

export type Phase = "idle" | "active" | "done" | "waiting";
export type Finding = { key: string; agent: AgentId; label: string; value: string; detail: string; phase: Phase };
export type Stage = { key: string; title: string; idle: string; live: string; phase: Phase };

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const lastResult = (steps: Step[], name: string): R | undefined => {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].kind === "tool" && steps[i].content.name === name) return (steps[i].content.result ?? {}) as R;
  return undefined;
};
const hrsText = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short$ = (n: number) => (n >= 10_000 ? `$${Math.round(n / 1000)}k` : money0(n));
const METRIC: Record<string, { label: string; unit: string }> = {
  supply_temp_f: { label: "supply water", unit: "°F" },
  inlet_temp_f: { label: "rack inlet", unit: "°F" },
  vibration_mm_s: { label: "vibration", unit: " mm/s" },
  voltage_pct: { label: "voltage", unit: "%" },
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function storyOf(run: Run | undefined, steps: Step[], approvals: Approval[]) {
  const agents = deriveAgents(run, steps);
  const phaseOf = (id: AgentId): Phase => (agents[id].st === "SUCCEEDED" ? "done" : agents[id].st === "RUNNING" ? "active" : "idle");

  const memory = lastResult(steps, "read_building_memory");
  const linked = lastResult(steps, "link_tickets");
  const tickets = lastResult(steps, "search_tickets");
  const trend = lastResult(steps, "detect_trend");
  const deps = lastResult(steps, "get_dependencies");
  const tenants = lastResult(steps, "tenants_at_risk");
  const weather = lastResult(steps, "get_weather");
  const vendor = lastResult(steps, "find_vendor")?.vendors?.[0] as { name: string; est_cost_usd: number; next_available: string } | undefined;

  const findings: Finding[] = [
    {
      key: "history", agent: "lead", label: "Building history",
      value: memory ? plural(memory.notes?.length ?? 0, "past note") : "…",
      detail: memory?.notes?.[0]?.note ?? "Reads what past runs and managers learned about this building.",
      phase: memory ? "done" : agents.lead.st === "RUNNING" ? "active" : "idle",
    },
    {
      key: "tickets", agent: "triage", label: "Maintenance tickets",
      value: linked && !linked.error ? `${plural(linked.linked?.length ?? 0, "ticket")} → 1 problem` : tickets ? plural(tickets.count ?? 0, "open ticket") : "…",
      detail: linked && !linked.error ? String(linked.problem) : "Links small complaints that share one root cause.",
      phase: phaseOf("triage"),
    },
    {
      key: "sensors", agent: "sensor", label: "Sensor trend",
      value: trend && trend.hours_to_limit != null ? `fails in ${hrsText(trend.hours_to_limit)}` : deps ? plural(deps.feeds?.length ?? 0, "system") + " downstream" : "…",
      detail: trend && !trend.error
        ? (() => {
            const m = METRIC[String(trend.metric)] ?? { label: String(trend.metric).replace(/_/g, " "), unit: "" };
            return `${trend.asset_id} ${m.label} is ${trend.latest}${m.unit}, rising ${Math.round(trend.slope_per_day * 100) / 100}${m.unit}/day toward its ${trend.limit}${m.unit} limit.`;
          })()
        : "Fits a trend on the sensor history to estimate time until the limit.",
      phase: phaseOf("sensor"),
    },
    {
      key: "tenants", agent: "lease", label: "Tenants at risk",
      value: tenants ? `${money0(tenants.penalty_per_hour_usd ?? 0)}/hr` : "…",
      detail: tenants
        ? `${plural(tenants.tenants?.length ?? 0, "tenant")}: ${(tenants.tenants ?? []).map((t: R) => t.name).join(", ") || "none"}.${weather?.summary?.max_f != null ? ` Forecast high ${Math.round(weather.summary.max_f)}°F.` : ""}`
        : "Finds who loses service and their lease penalty per hour.",
      phase: phaseOf("lease"),
    },
  ];

  const counts = approvalCounts(approvals);
  const checks = ["triage", "sensor", "lease"] as const;
  const invDone = checks.every((a) => agents[a].st === "SUCCEEDED");
  const invActive = checks.some((a) => agents[a].st === "RUNNING") || (Boolean(run) && agents.lead.st === "RUNNING");
  const risk = run?.risk ?? null;
  const allDecided = approvals.length > 0 && counts.pending === 0;
  const sentOf = (kind: Approval["kind"]) => approvals.filter((a) => a.kind === kind && a.status === "sent").length;

  const stages: Stage[] = [
    { key: "signal", title: "Signal", idle: "A ticket, sensor alarm or the nightly sweep flags something small.", live: "Signal received", phase: run ? "done" : "idle" },
    {
      key: "investigate", title: "Investigate", idle: "AI agents check tickets, sensors, leases and history at the same time.",
      live: invDone ? [findings[1].value, findings[2].value].filter((v) => v !== "…").join(" · ") : "Agents checking tickets, sensors and leases…",
      phase: invDone ? "done" : invActive ? "active" : "idle",
    },
    {
      key: "price", title: "Price it", idle: "What waiting would cost vs what fixing now costs, in dollars.",
      live: risk ? `${short$(risk.wait_usd)} if we wait · ${short$(risk.fix_usd)} to fix` : "Pricing the risk…",
      phase: risk ? "done" : invDone ? "active" : "idle",
    },
    {
      key: "approve", title: "You approve", idle: "Agents draft the fix. Nothing is sent until a manager approves.",
      live: counts.pending ? `${plural(counts.pending, "action")} waiting for you` : allDecided ? `${counts.sent} approved${counts.rejected ? `, ${counts.rejected} rejected` : ""}` : "Drafting the fix…",
      phase: counts.pending ? "waiting" : allDecided ? "done" : agents.dispatch.st === "RUNNING" ? "active" : "idle",
    },
    {
      key: "fixed", title: "Fixed early", idle: "Vendor booked and tenants told, before anything breaks.",
      live: counts.sent ? [sentOf("work_order") ? "vendor booked" : "", sentOf("tenant_notice") ? plural(sentOf("tenant_notice"), "tenant") + " told" : "", sentOf("schedule_change") ? "schedule changed" : ""].filter(Boolean).join(" · ") : "Not yet",
      phase: allDecided && counts.sent ? "done" : "idle",
    },
  ];

  return { agents, findings, stages, counts, risk, vendor, brief: run && run.status !== "running" ? run.summary : null };
}
