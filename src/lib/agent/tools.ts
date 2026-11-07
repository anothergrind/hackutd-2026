import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolSpec } from "@/lib/nemotron";
import { blastRadius, type Edge } from "./graph";

export type ToolContext = { db: SupabaseClient; runId: string };
type Args = Record<string, unknown>;

// Tool arguments come from the LLM: validate them like any other untrusted input.
function str(args: Args, key: string, max = 500) {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`"${key}" must be a non-empty string`);
  return v.trim().slice(0, max);
}
function int(args: Args, key: string, min: number, max: number) {
  const v = Number(args[key]);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`"${key}" must be an integer ${min}-${max}`);
  return v;
}
function must<T>({ data, error }: { data: T | null; error: { message: string } | null }) {
  if (error) throw new Error(error.message);
  return data as T;
}

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolSpec => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});
const assetId = { asset_id: { type: "string", description: "Asset tag, e.g. CHILLER-1" } };

export const toolSpecs: ToolSpec[] = [
  fn("inspect_asset", "Everything known about one asset across systems: status, direct up/downstream links, recent telemetry, open maintenance tickets, energy readings.", assetId, ["asset_id"]),
  fn("blast_radius", "Walk the dependency graph downstream of an asset. Returns every at-risk asset, affected tenants and SLA exposure in dollars for an outage of the given hours.", { ...assetId, outage_hours: { type: "integer", description: "Estimated outage duration in hours (1-72)" } }, ["asset_id", "outage_hours"]),
  fn("get_weather", "Live weather and 2-day forecast at the asset's property (heat raises cooling load; storms threaten power).", assetId, ["asset_id"]),
  fn("create_work_order", "Dispatch a technician. This EXECUTES an action.", { ...assetId, priority: { type: "integer", description: "1 = lowest, 5 = emergency" }, title: { type: "string" }, steps: { type: "array", items: { type: "string" } } }, ["asset_id", "priority", "title", "steps"]),
  fn("notify_tenant", "Send a proactive notice to an affected tenant. This EXECUTES an action.", { tenant_id: { type: "string", description: "Tenant uuid from blast_radius" }, message: { type: "string" } }, ["tenant_id", "message"]),
];

async function getAsset(db: SupabaseClient, id: string) {
  const rows = must(await db.from("assets").select("*, properties(name, lat, lon)").eq("id", id).limit(1));
  if (!rows?.length) throw new Error(`Unknown asset "${id}"`);
  return rows[0] as { id: string; name: string; status: string; properties: { name: string; lat: number | null; lon: number | null } };
}

export const tools: Record<string, (args: Args, ctx: ToolContext) => Promise<unknown>> = {
  async inspect_asset(args, { db }) {
    const id = str(args, "asset_id", 50);
    const asset = await getAsset(db, id);
    const [edges, telemetry, tickets, energy] = await Promise.all([
      db.from("dependencies").select("*").or(`upstream.eq.${id},downstream.eq.${id}`),
      db.from("telemetry_events").select("source, metric, value, message, created_at").eq("asset_id", id).order("created_at", { ascending: false }).limit(10),
      db.from("maintenance_tickets").select("title, notes, status, urgency, reported_at").eq("equipment", id).neq("status", "resolved"),
      db.from("energy_readings").select("reading_date, usage_kwh, baseline_kwh, anomaly_score").eq("equipment", id).limit(5),
    ]);
    const deps = must(edges) as Edge[];
    return {
      asset,
      depends_on: deps.filter((e) => e.downstream === id).map((e) => `${e.upstream} (${e.relation})`),
      feeds: deps.filter((e) => e.upstream === id).map((e) => `${e.downstream} (${e.relation})`),
      telemetry: must(telemetry),
      open_tickets: must(tickets),
      energy: must(energy),
    };
  },

  async blast_radius(args, { db }) {
    const id = str(args, "asset_id", 50);
    const hours = int(args, "outage_hours", 1, 72);
    await getAsset(db, id);
    const edges = must(await db.from("dependencies").select("*")) as Edge[];
    const reached = blastRadius(edges, id);
    const ids = [...reached.keys()];
    const tenants = must(await db.from("tenants").select("id, name, asset_id, sla_penalty_per_hour").in("asset_id", [id, ...ids])) as { id: string; name: string; asset_id: string; sla_penalty_per_hour: number }[];
    return {
      at_risk: ids.map((a) => ({ asset_id: a, ...reached.get(a) })),
      tenants: tenants.map((t) => ({ ...t, exposure_usd: t.sla_penalty_per_hour * hours })),
      total_exposure_usd: tenants.reduce((sum, t) => sum + t.sla_penalty_per_hour * hours, 0),
      outage_hours: hours,
    };
  },

  async get_weather(args, { db }) {
    const { properties: p } = await getAsset(db, str(args, "asset_id", 50));
    if (p.lat == null || p.lon == null) return { error: "Property has no coordinates" };
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,wind_speed_10m,precipitation&daily=temperature_2m_max,precipitation_probability_max,wind_gusts_10m_max&forecast_days=2&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Weather API ${response.status}`);
    const data = await response.json();
    return { property: p.name, current: data.current, daily: data.daily };
  },

  async create_work_order(args, { db, runId }) {
    const id = str(args, "asset_id", 50);
    await getAsset(db, id);
    const steps = Array.isArray(args.steps) ? args.steps.filter((s): s is string => typeof s === "string").slice(0, 10).map((s) => s.slice(0, 300)) : [];
    const row = must(await db.from("work_orders").insert({
      run_id: runId, asset_id: id, priority: int(args, "priority", 1, 5), title: str(args, "title", 200), steps,
    }).select("id, asset_id, priority, title").single());
    return { created: row };
  },

  async notify_tenant(args, { db, runId }) {
    const row = must(await db.from("tenant_notices").insert({
      run_id: runId, tenant_id: str(args, "tenant_id", 50), message: str(args, "message", 1000),
    }).select("id, tenant_id").single());
    return { sent: row };
  },
};
