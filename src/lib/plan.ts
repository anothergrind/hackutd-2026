import type { SupabaseClient } from "@supabase/supabase-js";
import { decide } from "@/lib/approvals";
import { agentMode, chat } from "@/lib/nemotron";
import { scenarioByLabel, scenarioForProperty } from "@/lib/scenarios";
import type { Approval, Risk } from "@/lib/types";

// Tonight's plan: several buildings need a repair at once, but there are only so many technicians and so
// much budget. The choice is deterministic (most urgent first, then most money saved per dollar, tenant-paid
// repairs don't use the landlord's budget); Nemotron writes the explanation.

export type Payer = { party: "tenant" | "landlord"; name: string; ref: string; text: string };
export type Candidate = {
  run_id: string; building: string; title: string; problem: string; risk: Risk;
  work_order: Approval; mitigation: Approval | null; notices: Approval[]; payer: Payer | null;
};
export type PlanItem = {
  run_id: string; building: string; title: string; problem: string; decision: "fix_tonight" | "mitigate" | "defer";
  reason: string; wait_usd: number; fix_usd: number; hours_left: number | null; landlord_cost: number; payer: string; rank: number;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export async function candidates(db: SupabaseClient): Promise<Candidate[]> {
  const { data: runs } = await db.from("agent_runs").select("id, title, property_id, risk, properties(name)").eq("status", "awaiting_approval");
  if (!runs?.length) return [];
  const ids = runs.map((r) => r.id as string);
  const [{ data: approvals }, { data: steps }] = await Promise.all([
    db.from("approvals").select("*").in("run_id", ids).eq("status", "pending"),
    db.from("agent_steps").select("run_id, content").in("run_id", ids).eq("kind", "tool"),
  ]);
  const out: Candidate[] = [];
  for (const r of runs) {
    const mine = ((approvals ?? []) as Approval[]).filter((a) => a.run_id === r.id);
    const wo = mine.find((a) => a.kind === "work_order");
    if (!wo || !r.risk) continue;
    const lease = (steps ?? []).filter((x) => x.run_id === r.id && (x.content as { name?: string }).name === "lease_responsibility").pop();
    const sc = scenarioByLabel(r.title as string) ?? scenarioForProperty(r.property_id as string);
    out.push({
      run_id: r.id as string, building: (r.properties as unknown as { name: string } | null)?.name ?? "", title: r.title as string,
      problem: sc?.plain.problem ?? (r.title as string), risk: r.risk as Risk, work_order: wo,
      mitigation: mine.find((a) => a.kind === "schedule_change") ?? null, notices: mine.filter((a) => a.kind === "tenant_notice"),
      payer: ((lease?.content as { result?: { payer?: Payer } })?.result?.payer) ?? null,
    });
  }
  return out;
}

export function choose(items: Candidate[], technicians: number, budget: number) {
  const urgency = (c: Candidate) => c.risk.hours_until_failure ?? 999;
  const sorted = [...items].sort((a, b) =>
    (urgency(a) <= 24 ? 0 : 1) - (urgency(b) <= 24 ? 0 : 1) || (b.risk.wait_usd - b.risk.fix_usd) / Math.max(1, b.risk.fix_usd) - (a.risk.wait_usd - a.risk.fix_usd) / Math.max(1, a.risk.fix_usd));
  let techs = technicians, left = budget;
  const plan: PlanItem[] = sorted.map((c, i) => {
    const tenantPays = c.payer?.party === "tenant";
    const landlordCost = tenantPays ? 0 : c.work_order.cost_usd;
    const base = { run_id: c.run_id, building: c.building, title: c.title, problem: c.problem, wait_usd: c.risk.wait_usd, fix_usd: c.work_order.cost_usd, hours_left: c.risk.hours_until_failure, landlord_cost: 0, payer: c.payer?.name ?? "Landlord", rank: i + 1 };
    const hrs = c.risk.hours_until_failure == null ? "no failure deadline yet" : `fails in about ${Math.round(c.risk.hours_until_failure)} hours`;
    if (techs > 0 && landlordCost <= left) {
      techs -= 1; left -= landlordCost;
      return { ...base, decision: "fix_tonight", landlord_cost: landlordCost, reason: `${hrs}; delay could cost ${money(c.risk.wait_usd)} against a ${money(c.work_order.cost_usd)} repair${tenantPays ? `, billed to ${c.payer!.name} under their lease` : ""}.` };
    }
    const why = techs <= 0 ? "no technician left tonight" : `over the remaining budget (${money(left)})`;
    return c.mitigation
      ? { ...base, decision: "mitigate", reason: `${why}; a temporary change keeps it safe until morning.` }
      : { ...base, decision: "defer", reason: `${why}; lowest cost of delay tonight (${money(c.risk.wait_usd)}).` };
  });
  const fixed = plan.filter((p) => p.decision === "fix_tonight");
  const summary = {
    technicians_used: fixed.length, technicians, budget, landlord_spend: fixed.reduce((s, p) => s + p.landlord_cost, 0),
    billed_to_tenants: fixed.reduce((s, p) => s + (p.landlord_cost === 0 ? p.fix_usd : 0), 0),
    protected_usd: fixed.reduce((s, p) => s + p.wait_usd, 0),
    deferred_risk_usd: plan.filter((p) => p.decision !== "fix_tonight").reduce((s, p) => s + p.wait_usd, 0),
  };
  return { items: plan, summary };
}

async function explain(items: PlanItem[], summary: ReturnType<typeof choose>["summary"]) {
  const fallback = () => {
    const fix = items.filter((i) => i.decision === "fix_tonight"), rest = items.filter((i) => i.decision !== "fix_tonight");
    return [
      `With ${summary.technicians} technician${summary.technicians === 1 ? "" : "s"} and ${money(summary.budget)}, fix ${fix.map((f) => f.building).join(" and ") || "nothing"} tonight: together they protect ${money(summary.protected_usd)}.`,
      summary.billed_to_tenants ? `${money(summary.billed_to_tenants)} of repairs are billed to tenants under their leases, so they don't use the landlord budget.` : "",
      rest.length ? `${rest.map((r) => r.building).join(" and ")} ${rest.length === 1 ? "waits" : "wait"} until morning${rest.some((r) => r.decision === "mitigate") ? " with a temporary safety change" : ""}, because ${rest[0].reason.split(";")[0]}.` : "Every problem gets fixed tonight.",
    ].filter(Boolean).join(" ");
  };
  if (agentMode() !== "live") return fallback();
  try {
    const reply = await chat([
      { role: "system", content: "You are the Canary portfolio planner. Explain tonight's repair plan to a facility director in 3 short sentences of plain English. Use only the numbers given. No lists." },
      { role: "user", content: JSON.stringify({ summary, items: items.map(({ building, decision, reason, wait_usd, fix_usd, payer }) => ({ building, decision, reason, wait_usd, fix_usd, payer })) }) },
    ], []);
    return reply.content?.trim() || fallback();
  } catch {
    return fallback();
  }
}

export async function makePlan(db: SupabaseClient, technicians: number, budget: number) {
  const cands = await candidates(db);
  if (!cands.length) throw new Error("No open incidents waiting for approval. Run Storm night first.");
  const { items, summary } = choose(cands, technicians, budget);
  const explanation = await explain(items, summary);
  const { data, error } = await db.from("triage_plans").insert({ technicians, budget_usd: budget, items, summary, explanation }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

/** Fix-tonight runs: approve everything. Mitigate/defer runs: approve the safety change and tenant notices, keep the repair for tomorrow. */
export async function applyPlan(db: SupabaseClient, planId: string, by: string) {
  const { data: plan } = await db.from("triage_plans").select("*").eq("id", planId).single();
  if (!plan) throw new Error("Plan not found");
  if (plan.status === "applied") throw new Error("Plan already applied");
  for (const item of plan.items as PlanItem[]) {
    const { data: pending } = await db.from("approvals").select("id, kind").eq("run_id", item.run_id).eq("status", "pending");
    for (const a of pending ?? []) {
      if (item.decision === "fix_tonight" || a.kind !== "work_order") {
        await decide(db, a.id as string, { decision: "approve", by, note: `Tonight's plan: ${item.decision}` }).catch(() => undefined);
      }
    }
  }
  await db.from("triage_plans").update({ status: "applied" }).eq("id", planId);
  return { applied: planId };
}
