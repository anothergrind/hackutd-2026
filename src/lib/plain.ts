// Plain-English wording so non-technical viewers can follow a run: equipment names instead of tags,
// actions instead of tool names, and full sentences for each finding and the final recommendation.

import { scenarioByLabel } from "@/lib/scenarios";
import type { Approval, Run, Step } from "@/lib/types";
import type { Verification } from "@/lib/verify";
import { summarize, type AgentView, type CrewMember } from "@/lib/view";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ASSETS: Record<string, string> = {
  "CRAH-A1": "the cooling unit in Data hall A", "CRAH-B1": "the cooling unit in Data hall B",
  "CHILLER-1": "the main chiller", "CW-LOOP-1": "the chilled-water pipes", "HALL-A": "Data hall A", "HALL-B": "Data hall B",
  "BMS-1": "the building control system", "UTIL-FEED-1": "the main power line", "SWGR-1": "the main electrical panel",
  "GEN-1": "the backup generator", "UPS-A": "backup battery A", "UPS-B": "backup battery B",
  "AHU-04": "air handler 4", "FLOOR-4-EAST": "the Floor 4 east offices", "PANEL-12B": "electrical panel 12B",
  "HVAC-12": "the Floor 12 air conditioning", "FLOOR-12": "the Floor 12 offices",
};
export const assetName = (id?: string | null) => (id ? ASSETS[id] ?? id : "the equipment");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TOOL: Record<string, string> = {
  read_building_memory: "Read the building's history", search_tickets: "Looked through maintenance tickets", link_tickets: "Grouped related complaints",
  past_incidents: "Looked up past repairs", get_dependencies: "Mapped what this equipment affects", get_readings: "Read the sensor data",
  detect_trend: "Checked the temperature trend", get_energy: "Checked energy use", tenants_at_risk: "Found the tenants affected", lease_responsibility: "Checked the lease for who pays",
  get_weather: "Checked the weather forecast", price_risk: "Calculated the cost", find_vendor: "Found a repair company",
  check_parts: "Checked spare parts", draft_work_order: "Wrote a repair order", draft_schedule_change: "Planned a temporary change",
  draft_tenant_notice: "Wrote a tenant email", save_memory: "Saved a note for next time",
};
export const toolVerb = (name?: string) => (name?.startsWith("ask_") ? "Asked a teammate for help" : TOOL[name ?? ""] ?? name ?? "Worked");
/** "Checked the temperature trend → limit in 18 h" */
export const plainCall = (step: Step) => `${toolVerb(step.content.name)} → ${summarize(step)}`;

/** Swap equipment tags for names inside any sentence. */
export const plainText = (text: string) => text.replace(/\b[A-Z]+(?:-[A-Z0-9]+)+\b/g, (tag) => ASSETS[tag] ?? tag);

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const hrs = (h: number) => (h < 48 ? `about ${Math.round(h)} hours` : `about ${Math.round(h / 24)} days`);
const tool = (v: AgentView | undefined, name: string): R | undefined => {
  const t = [...(v?.tools ?? [])].reverse().find((x) => x.content.name === name);
  return t ? ((t.content.result ?? {}) as R) : undefined;
};

export const METRIC_LABEL: Record<string, { label: string; unit: string }> = {
  supply_temp_f: { label: "water temperature", unit: "°F" }, health_pct: { label: "health", unit: "%" }, panel_temp_f: { label: "temperature", unit: "°F" },
};
export const metricLabel = (m: string) => METRIC_LABEL[m] ?? { label: m.replace(/_/g, " "), unit: "" };

export type PayerInfo = { party: "tenant" | "landlord"; name: string; ref: string; text: string };
/** Who pays for the repair, from the Lease agent's lease_responsibility call. */
export function payerOf(v: AgentView | undefined): PayerInfo | null {
  return (tool(v, "lease_responsibility")?.payer as PayerInfo | undefined) ?? null;
}
export const payerSentence = (p: PayerInfo) =>
  p.party === "tenant" ? `${p.name} pays for this repair under their lease (${p.ref}), not the landlord.` : `The landlord pays for this repair (${p.ref}).`;

/** One plain sentence per investigating agent. */
export function plainFinding(id: string, v: AgentView | undefined, name: string): string {
  if (!v || v.st === "PENDING") return "Waiting to start.";
  if (v.st === "RUNNING") return "Working on it…";
  if (id === "triage") {
    const l = tool(v, "link_tickets");
    return l && !l.error ? `${l.linked?.length} separate complaints all point to one problem with ${assetName(l.root_asset_id)}.` : `Found ${tool(v, "search_tickets")?.count ?? 0} open complaints, none clearly related.`;
  }
  if (id === "sensor") {
    const t = tool(v, "detect_trend");
    return t && t.hours_to_limit != null ? `${cap(assetName(t.asset_id))} is getting warmer every day and will hit its safe limit in ${hrs(t.hours_to_limit)}.` : "No warning trend in the sensor data.";
  }
  if (id === "lease") {
    const t = tool(v, "tenants_at_risk"), w = tool(v, "get_weather");
    if (!t) return "Checked the leases.";
    const names = (t.tenants ?? []).map((x: R) => x.name).join(" and ");
    const pay = payerOf(v);
    return `If it fails, ${names || "no tenants"} lose service. Their contracts charge ${money(t.penalty_per_hour_usd ?? 0)} for every hour of outage.${pay ? ` ${payerSentence(pay)}` : ""}${w?.summary?.max_f != null ? ` Forecast high ${Math.round(w.summary.max_f)}°F.` : ""}`;
  }
  const e = tool(v, "get_energy"), p = tool(v, "past_incidents");
  if (e?.readings?.[0]) return `${cap(assetName(e.readings[0].equipment))} is using ${e.readings[0].over_baseline_pct}% more power than normal.`;
  if (p) return p.repeat ? `This has broken before: "${plainText(p.work_orders[0].title)}" ${p.work_orders[0].days_ago} days ago.` : "No earlier repairs on this equipment.";
  return plainText((v.final ?? "").replace(new RegExp(`^${name}:\\s*`), ""));
}

/** The final decision in plain words: verdict, reasons, and what approving does. */
export function recommendation(run: Run, approvals: Approval[], agents: Record<string, AgentView>, crew: CrewMember[], verification?: Verification | null) {
  const risk = run.risk;
  const sc = scenarioByLabel(run.title);
  const reasons: string[] = [];
  // Reasons add facts not already on screen: time left, costs, the problem, who pays and the
  // tenants (named in Cost Responsibility and the Action Plan emails) are shown elsewhere.
  const tri = tool(agents.triage, "link_tickets");
  if (tri && !tri.error) { const n = tri.linked?.length ?? 0; reasons.push(n === 1 ? "A recent complaint points to the same equipment." : `${n} recent complaints all point to the same equipment.`); }
  // Custom agents can overlap (two agents checking energy, or one that only counts readings), so
  // keep each finding once and skip ones that state a count or a non-result instead of a reason.
  const weak = /^(\d+ recent readings?|checked\b|no earlier repairs|no warning trend|waiting to start|working on it)/i;
  for (const a of crew.filter((c) => c.kind === "specialist" && !["triage", "sensor", "lease"].includes(c.id))) {
    if (agents[a.id]?.st !== "SUCCEEDED") continue;
    const f = plainFinding(a.id, agents[a.id], a.name).trim();
    if (f && !weak.test(f) && !reasons.some((r) => r.toLowerCase() === f.toLowerCase())) reasons.push(f);
  }
  const memory = tool(agents.lead, "read_building_memory");
  if (memory?.notes?.[0] && reasons.length < 4) reasons.push(`Building history: ${plainText(memory.notes[0].note)}`);

  const ifApproved = approvals.filter((a) => a.kind !== "tenant_notice").map((a) => {
    const p = a.payload as R;
    if (a.kind === "work_order") return `${p.vendor_name} comes ${new Date(p.scheduled_for).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })} to fix it (${money(a.cost_usd)}).`;
    return `${cap(plainText(String(p.change)))} (for ${p.hours} hours).`;
  });
  // One line for all tenant emails instead of one near-identical line per tenant.
  const notified = approvals.filter((a) => a.kind === "tenant_notice").map((a) => String((a.payload as R).tenant_name));
  if (notified.length) ifApproved.push(`${notified.length === 1 ? notified[0] : `${notified.slice(0, -1).join(", ")} and ${notified[notified.length - 1]}`} ${notified.length === 1 ? "gets" : "get"} a heads-up email.`);

  const pending = approvals.filter((a) => a.status === "pending").length;
  const sent = approvals.filter((a) => a.status === "sent").length;
  let verdict: string;
  let tone: "act" | "bad" | "done" | "wait" | "info";
  if (verification?.status === "passed") { verdict = "Resolved and Verified"; tone = "done"; }
  else if (verification?.status === "failed") { verdict = "Repair Failed Verification"; tone = "bad"; }
  else if (run.status === "running") { verdict = "Analysis in Progress"; tone = "wait"; }
  else if (!risk) { verdict = "No Action Required"; tone = "info"; }
  else if (approvals.length && !pending) { verdict = sent ? "Resolved" : "Declined"; tone = sent ? "done" : "info"; }
  else if (approvals.length) { verdict = "Immediate Repair"; tone = "act"; }
  else { verdict = risk.wait_usd > risk.fix_usd ? "Schedule Repair" : "Monitor"; tone = "info"; }

  const why = run.status === "running"
    ? "The AI agents are still gathering information. The decision appears here when they finish."
    : risk
    ? "" // the cost and time are already shown as numbers above, so no sentence repeating them
    : "The agents are still gathering information.";
  const payer = payerOf(agents.lease);
  let whyText = why;
  if (verification?.status === "passed") whyText = `The repair was approved, and the AI checked the sensors afterwards: ${assetName(verification.asset_id)} is back to normal.`;
  if (verification?.status === "failed") whyText = `The AI checked the sensors after the repair and ${assetName(verification.asset_id)} is still getting worse. Start a follow-up.`;
  if (run.status === "running") reasons.length = 0; // show reasoning only once the agents have finished
  return { verdict, tone, why: whyText, problem: sc?.plain.problem, reported: sc?.plain.reported, reasons, ifApproved, pending, sent, payer };
}

const SMALL = new Set(["a", "an", "the", "and", "or", "but", "nor", "of", "to", "in", "on", "for", "at", "by", "with", "if", "as", "vs"]);
/** Title Case for headings: capitalise every word except short joining words (unless first or last). */
export function titleCase(text: string): string {
  const words = text.split(" ");
  return words.map((w, i) => {
    const lower = w.toLowerCase();
    if (i > 0 && i < words.length - 1 && SMALL.has(lower)) return lower;
    if (/^[A-Z0-9]{2,}/.test(w) || /[A-Z]/.test(w.slice(1))) return w; // keep acronyms (AI, OK, DC1) and mixed case
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}
