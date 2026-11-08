import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConfig } from "@/lib/crew";
import { crewSnapshot, loadCrew } from "@/lib/crewStore";
import { agentMode } from "@/lib/nemotron";
import type { AgentId } from "@/lib/roster";
import type { Hints } from "@/lib/scenarios";
import { runAgent } from "./run";
import type { Facts, RunCtx, Signal } from "./tools";

type Start = { signal: Signal; propertyId: string | null; hints: Hints; trigger: "incident" | "sweep" | "manual"; title: string; mode?: "scripted" };

/**
 * Records the signal and the run, then returns `execute`, which the route hands to `after()`
 * so the HTTP response returns immediately and the agents keep working.
 */
export async function startRun(db: SupabaseClient, input: Start) {
  // "scripted" can be forced per run (bulk demo data); otherwise live when a key is set.
  const mode = input.mode ?? agentMode();
  const { data: event, error } = await db.from("telemetry_events")
    .insert({ asset_id: input.signal.asset_id, source: input.signal.source, metric: input.signal.metric, value: input.signal.value, message: input.signal.message.slice(0, 1000) })
    .select("id, asset_id, source, metric, value, message").single();
  if (error) throw new Error(error.message);
  await db.from("assets").update({ status: "degraded" }).eq("id", input.signal.asset_id);

  // The crew is read once per run, so editing agents mid-run does not change a run in flight.
  const crew = await loadCrew(db);
  const row = { event_id: event.id, trigger: input.trigger, title: input.title, property_id: input.propertyId, mode };
  let { data: run, error: runError } = await db.from("agent_runs").insert({ ...row, crew: crewSnapshot(crew) }).select("id").single();
  if (runError && /crew/.test(runError.message)) ({ data: run, error: runError } = await db.from("agent_runs").insert(row).select("id").single()); // before migration 006
  if (runError || !run) throw new Error(runError?.message ?? "Could not create run");

  const runId = run.id as string;
  return { runId, execute: () => executeRun(db, runId, { ...input, signal: event as Signal }, mode, crew) };
}

async function executeRun(db: SupabaseClient, runId: string, input: Start, mode: "live" | "scripted", crew: AgentConfig[]) {
  const facts: Facts = { drafts: 0 };
  const ctx: RunCtx = {
    db, runId, propertyId: input.propertyId, signal: input.signal, hints: input.hints, facts, crew,
    async log(agent: AgentId, kind: string, content: unknown) {
      const { error } = await db.from("agent_steps").insert({ run_id: runId, agent, kind, content });
      if (error) console.error("agent_steps insert failed", error.message);
    },
  };

  const { data: property } = input.propertyId
    ? await db.from("properties").select("name, building_type").eq("id", input.propertyId).single()
    : { data: null };
  const h = input.hints;
  const task = [
    `New signal at ${property ? `${property.name} (${property.building_type})` : "an unknown property"}:`,
    JSON.stringify(input.signal),
    `Site team context (may be incomplete): likely root asset ${h.root}; tenants first affected via ${h.impacted}; price the blast radius of ${h.price_asset}; expected outage if ignored ~${h.outage_hours} h.`,
    h.trend ? `Watch ${h.trend.asset_id} ${h.trend.metric} against its ${h.trend.limit} limit.` : "",
  ].filter(Boolean).join("\n");

  try {
    const brief = await runAgent("lead", task, ctx, mode);
    const { count } = await db.from("approvals").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "pending");
    const waiting = (count ?? 0) > 0;
    await db.from("agent_runs").update({
      status: waiting ? "awaiting_approval" : "done", summary: brief, finished_at: waiting ? null : new Date().toISOString(),
    }).eq("id", runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.log("lead", "error", { text: message });
    await db.from("agent_runs").update({ status: "error", summary: message, finished_at: new Date().toISOString() }).eq("id", runId);
  }
}
