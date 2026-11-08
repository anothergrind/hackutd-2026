import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConfig } from "@/lib/crew";
import type { ToolSpec } from "@/lib/nemotron";
import type { AgentId } from "@/lib/roster";
import type { Hints } from "@/lib/scenarios";
import { blastRadius, upstreamOf, type Edge } from "./graph";
import { activeAlerts } from "@/lib/nws";
import { hoursToLimit, linearTrend, priceRisk } from "./math";

export type Signal = { id?: string; asset_id: string; source: string; metric: string; value: number | null; message: string };

/** What tools learned during a run. Scripted mode reads it to pick the next call; the UI never sees it. */
export type Facts = {
  memory?: { asset_id: string | null; note: string }[];
  tickets?: { id: string; equipment: string; title: string; urgency: number }[];
  linked?: { ticket_ids: string[]; problem: string; root_asset_id: string };
  trend?: { asset_id: string; metric: string; slope_per_day: number; latest: number; limit: number; hours_to_limit: number | null; r2: number };
  deps?: { upstream: string[]; downstream: string[] };
  tenants?: { id: string; name: string; asset_id: string; sla_penalty_per_hour: number; exposure_usd: number }[];
  penaltyPerHour?: number;
  weather?: { max_f: number | null; rain_pct: number | null; gust_mph: number | null };
  alerts?: string[];
  payer?: { party: "tenant" | "landlord"; name: string; ref: string; text: string };
  vendors?: { id: string; name: string; est_cost_usd: number; next_available: string }[];
  parts?: { part: string; on_hand: number; unit_cost: number; lead_days: number }[];
  risk?: ReturnType<typeof priceRisk> & { asset_id: string; outage_hours: number; penalty_per_hour: number };
  drafts: number;
  /** Tool results per agent, used to write scripted reports for custom specialists. */
  byAgent?: Record<string, { name: string; result: unknown }[]>;
};

export type RunCtx = {
  db: SupabaseClient;
  runId: string;
  propertyId: string | null;
  signal: Signal;
  hints: Hints;
  facts: Facts;
  crew: AgentConfig[];
  log: (agent: AgentId, kind: string, content: unknown) => Promise<void>;
};

type Args = Record<string, unknown>;
export type Tool = { spec: ToolSpec; run: (args: Args, ctx: RunCtx) => Promise<unknown> };

// Tool arguments come from the LLM: validate them like any other untrusted input.
function str(args: Args, key: string, max = 500) {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`"${key}" must be a non-empty string`);
  return v.trim().slice(0, max);
}
function optStr(args: Args, key: string, max = 500) {
  return typeof args[key] === "string" && (args[key] as string).trim() ? (args[key] as string).trim().slice(0, max) : undefined;
}
function num(args: Args, key: string, min: number, max: number, fallback?: number) {
  const raw = args[key];
  if ((raw === undefined || raw === null || raw === "") && fallback !== undefined) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`"${key}" must be a number ${min}-${max}`);
  return v;
}
function strList(args: Args, key: string, maxItems = 12, maxLen = 300) {
  const v = args[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, maxItems).map((x) => x.trim().slice(0, maxLen));
}
function must<T>({ data, error }: { data: T | null; error: { message: string } | null }) {
  if (error) throw new Error(error.message);
  return data as T;
}
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolSpec => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});
const assetProp = { asset_id: { type: "string", description: "Asset tag, e.g. CHILLER-1" } };

type Asset = { id: string; name: string; kind: string; status: string; property_id: string; properties: { name: string; lat: number | null; lon: number | null } };
async function getAsset(db: SupabaseClient, id: string): Promise<Asset> {
  const rows = must(await db.from("assets").select("id, name, kind, status, property_id, properties(name, lat, lon)").eq("id", id).limit(1));
  if (!rows?.length) throw new Error(`Unknown asset "${id}". Use an asset id returned by another tool.`);
  return rows[0] as unknown as Asset;
}
async function allEdges(db: SupabaseClient) {
  return must(await db.from("dependencies").select("upstream, downstream, relation")) as Edge[];
}
async function tenantsDownstream(db: SupabaseClient, assetId: string, outageHours: number) {
  const reached = blastRadius(await allEdges(db), assetId);
  const ids = [assetId, ...reached.keys()];
  const rows = must(await db.from("tenants").select("id, name, asset_id, sla_penalty_per_hour, contact_email").in("asset_id", ids)) as
    { id: string; name: string; asset_id: string; sla_penalty_per_hour: number; contact_email: string }[];
  const tenants = rows.map((t) => ({ ...t, sla_penalty_per_hour: Number(t.sla_penalty_per_hour), exposure_usd: Number(t.sla_penalty_per_hour) * outageHours }));
  return { reached, tenants, penaltyPerHour: tenants.reduce((s, t) => s + t.sla_penalty_per_hour, 0) };
}
async function draft(ctx: RunCtx, row: { kind: string; title: string; payload: unknown; protects_usd: number; cost_usd: number }) {
  const created = must(await ctx.db.from("approvals").insert({ run_id: ctx.runId, ...row }).select("id, kind, title, status").single());
  ctx.facts.drafts += 1;
  return { drafted: created, note: "Waiting in the approval queue. Nothing is sent until a manager approves." };
}

// ---------------- Lead (non-delegation) ----------------

export const leadTools: Record<string, Tool> = {
  read_building_memory: {
    spec: fn("read_building_memory", "Notes saved by past runs and managers for this building: past failures, repairs, quirks. Read this first.", { asset_id: { type: "string", description: "Optional: only notes about this asset" } }),
    async run(args, ctx) {
      let q = ctx.db.from("building_memory").select("asset_id, note, source, created_at").order("created_at", { ascending: false }).limit(8);
      if (ctx.propertyId) q = q.eq("property_id", ctx.propertyId);
      const asset = optStr(args, "asset_id", 50);
      if (asset) q = q.eq("asset_id", asset);
      const rows = must(await q) as { asset_id: string | null; note: string; source: string; created_at: string }[];
      ctx.facts.memory = rows;
      return { notes: rows };
    },
  },
  price_risk: {
    spec: fn("price_risk", "Deterministic cost model. wait = SLA penalties downstream of the asset for the outage + the repair done as an emergency (2.5x). fix = planned repair. Saves the result on the run.", {
      ...assetProp,
      outage_hours: { type: "number", description: "Expected outage if nothing is done (1-72)" },
      hours_until_failure: { type: "number", description: "From Sensor Watch; omit if unknown" },
      repair_cost_usd: { type: "number", description: "Planned repair cost estimate" },
    }, ["asset_id", "outage_hours", "repair_cost_usd"]),
    async run(args, ctx) {
      const assetId = str(args, "asset_id", 50);
      await getAsset(ctx.db, assetId);
      const outage = num(args, "outage_hours", 0.5, 72);
      const repair = num(args, "repair_cost_usd", 0, 1_000_000);
      const hours = args.hours_until_failure == null || args.hours_until_failure === "" ? null : num(args, "hours_until_failure", 0, 10_000);
      const { tenants, penaltyPerHour } = await tenantsDownstream(ctx.db, assetId, outage);
      const risk = { ...priceRisk({ penaltyPerHour, outageHours: outage, repairCostUsd: repair, hoursUntilFailure: hours }), asset_id: assetId, outage_hours: outage, penalty_per_hour: penaltyPerHour };
      ctx.facts.risk = risk;
      await ctx.db.from("agent_runs").update({ risk }).eq("id", ctx.runId);
      return { ...risk, tenants: tenants.map((t) => ({ name: t.name, sla_penalty_per_hour: t.sla_penalty_per_hour })) };
    },
  },
  save_memory: {
    spec: fn("save_memory", "Save one short lesson about this building for future runs (root cause, what fixed it).", { asset_id: { type: "string" }, note: { type: "string", description: "One or two sentences" } }, ["note"]),
    async run(args, ctx) {
      if (!ctx.propertyId) return { error: "This run has no property." };
      const assetId = optStr(args, "asset_id", 50);
      if (assetId) await getAsset(ctx.db, assetId);
      const row = must(await ctx.db.from("building_memory").insert({ property_id: ctx.propertyId, asset_id: assetId ?? null, note: str(args, "note", 600), source: "agent", run_id: ctx.runId }).select("id").single());
      return { saved: row };
    },
  },
};

// ---------------- Ticket Triage ----------------

export const triageTools: Record<string, Tool> = {
  search_tickets: {
    spec: fn("search_tickets", "Open maintenance tickets in this building, newest first.", {
      equipment: { type: "array", items: { type: "string" }, description: "Optional asset ids to filter on" },
      days: { type: "number", description: "How far back to look (default 30)" },
    }),
    async run(args, ctx) {
      const days = num(args, "days", 1, 365, 30);
      let q = ctx.db.from("maintenance_tickets").select("id, equipment, floor, title, notes, urgency, reported_at")
        .neq("status", "resolved").gte("reported_at", new Date(Date.now() - days * 86_400_000).toISOString()).order("reported_at", { ascending: false }).limit(25);
      if (ctx.propertyId) q = q.eq("property_id", ctx.propertyId);
      const equipment = strList(args, "equipment", 10, 50);
      if (equipment.length) q = q.in("equipment", equipment);
      const rows = must(await q) as { id: string; equipment: string; floor: string; title: string; notes: string; urgency: number; reported_at: string }[];
      ctx.facts.tickets = rows;
      return { count: rows.length, tickets: rows.map((t) => ({ ...t, notes: t.notes.slice(0, 200) })) };
    },
  },
  link_tickets: {
    spec: fn("link_tickets", "Record that several tickets share one root cause.", {
      ticket_ids: { type: "array", items: { type: "string" }, description: "Ids from search_tickets" },
      problem: { type: "string", description: "The single underlying problem, one sentence" },
      root_asset_id: { type: "string", description: "Asset most likely at fault" },
    }, ["ticket_ids", "problem", "root_asset_id"]),
    async run(args, ctx) {
      const ids = strList(args, "ticket_ids", 20, 60);
      if (!ids.length) throw new Error('"ticket_ids" must list at least one id from search_tickets');
      const found = must(await ctx.db.from("maintenance_tickets").select("id, title").in("id", ids)) as { id: string; title: string }[];
      if (found.length !== ids.length) throw new Error("Some ticket ids do not exist. Use ids from search_tickets.");
      const root = str(args, "root_asset_id", 50);
      await getAsset(ctx.db, root);
      ctx.facts.linked = { ticket_ids: ids, problem: str(args, "problem", 400), root_asset_id: root };
      return { linked: found.map((t) => t.title), ...ctx.facts.linked };
    },
  },
};

// ---------------- Sensor Watch ----------------

export const sensorTools: Record<string, Tool> = {
  get_dependencies: {
    spec: fn("get_dependencies", "What this asset depends on (upstream) and what fails if it fails (downstream).", assetProp, ["asset_id"]),
    async run(args, ctx) {
      const id = str(args, "asset_id", 50);
      const asset = await getAsset(ctx.db, id);
      const edges = await allEdges(ctx.db);
      const up = [...upstreamOf(edges, id).entries()].map(([a, v]) => ({ asset_id: a, hops: v.depth, relation: v.relation }));
      const down = [...blastRadius(edges, id).entries()].map(([a, v]) => ({ asset_id: a, hops: v.depth, relation: v.relation }));
      ctx.facts.deps = { upstream: up.map((x) => x.asset_id), downstream: down.map((x) => x.asset_id) };
      return { asset: { id: asset.id, name: asset.name, kind: asset.kind, status: asset.status }, depends_on: up, feeds: down };
    },
  },
  get_readings: {
    spec: fn("get_readings", "Recent telemetry for an asset, oldest first.", { ...assetProp, metric: { type: "string" }, days: { type: "number", description: "Default 14" } }, ["asset_id"]),
    async run(args, ctx) {
      const id = str(args, "asset_id", 50);
      await getAsset(ctx.db, id);
      let q = ctx.db.from("telemetry_events").select("metric, value, message, source, created_at").eq("asset_id", id)
        .gte("created_at", new Date(Date.now() - num(args, "days", 1, 90, 14) * 86_400_000).toISOString()).order("created_at").limit(60);
      const metric = optStr(args, "metric", 60);
      if (metric) q = q.eq("metric", metric);
      const rows = must(await q) as unknown[];
      return { count: rows.length, readings: rows };
    },
  },
  detect_trend: {
    spec: fn("detect_trend", "Fit a straight line to a metric and estimate hours until it crosses a limit.", {
      ...assetProp, metric: { type: "string", description: "e.g. supply_temp_f" }, limit: { type: "number", description: "The failure or alarm threshold" },
    }, ["asset_id", "metric", "limit"]),
    async run(args, ctx) {
      const id = str(args, "asset_id", 50), metric = str(args, "metric", 60), limit = num(args, "limit", -1e6, 1e6);
      const rows = must(await ctx.db.from("telemetry_events").select("value, created_at").eq("asset_id", id).eq("metric", metric).not("value", "is", null).order("created_at").limit(200)) as { value: number; created_at: string }[];
      const fit = linearTrend(rows.map((r) => ({ t: Date.parse(r.created_at), value: Number(r.value) })));
      if (!fit) return { asset_id: id, metric, error: `Only ${rows.length} readings; need 3 or more for a trend.` };
      const hours = hoursToLimit(fit.latest, fit.slopePerHour, limit);
      const out = { asset_id: id, metric, slope_per_day: Math.round(fit.slopePerDay * 1000) / 1000, latest: fit.latest, limit, hours_to_limit: hours == null ? null : Math.round(hours * 10) / 10, r2: Math.round(fit.r2 * 1000) / 1000, readings: rows.length };
      ctx.facts.trend = out;
      return out;
    },
  },
};

// ---------------- Lease / SLA ----------------

export const leaseTools: Record<string, Tool> = {
  lease_responsibility: {
    spec: fn("lease_responsibility", "Reads the leases of tenants served by an asset and says who must pay to repair it (landlord or a tenant), quoting the clause.", assetProp, ["asset_id"]),
    async run(args, ctx) {
      const asset = await getAsset(ctx.db, str(args, "asset_id", 50));
      const { tenants } = await tenantsDownstream(ctx.db, asset.id, 1);
      const leases = tenants.length
        ? (must(await ctx.db.from("leases").select("tenant_id, lease_ref, clauses").in("tenant_id", tenants.map((t) => t.id))) as { tenant_id: string; lease_ref: string; clauses: { assets?: string[]; kinds?: string[]; party: "tenant" | "landlord"; ref: string; text: string }[] }[])
        : [];
      // An asset-specific clause beats a general one; a tenant-pays clause names that tenant as payer.
      const matches = leases.flatMap((l) => {
        const t = tenants.find((x) => x.id === l.tenant_id)!;
        const exact = l.clauses.find((c) => c.assets?.includes(asset.id));
        const general = l.clauses.find((c) => c.kinds?.includes(asset.kind));
        const c = exact ?? general;
        return c ? [{ tenant: t.name, lease_ref: l.lease_ref, specific: Boolean(exact), ...c }] : [];
      });
      const tenantPays = matches.find((m) => m.party === "tenant" && m.specific) ?? matches.find((m) => m.party === "tenant");
      const pick = tenantPays ?? matches.find((m) => m.specific) ?? matches[0];
      const payer = pick
        ? { party: pick.party, name: pick.party === "tenant" ? pick.tenant : "Landlord", ref: `${pick.lease_ref} ${pick.ref}`, text: pick.text }
        : { party: "landlord" as const, name: "Landlord", ref: "no lease clause", text: "No tenant lease covers this equipment, so it is a base-building cost." };
      ctx.facts.payer = payer;
      return { asset_id: asset.id, asset_kind: asset.kind, payer, clauses_checked: matches.map((m) => ({ tenant: m.tenant, ref: m.ref, party: m.party })) };
    },
  },
  tenants_at_risk: {
    spec: fn("tenants_at_risk", "Tenants downstream of an asset and their SLA exposure for an outage.", { ...assetProp, outage_hours: { type: "number", description: "1-72" } }, ["asset_id", "outage_hours"]),
    async run(args, ctx) {
      const id = str(args, "asset_id", 50), hours = num(args, "outage_hours", 0.5, 72);
      await getAsset(ctx.db, id);
      const { reached, tenants, penaltyPerHour } = await tenantsDownstream(ctx.db, id, hours);
      ctx.facts.tenants = tenants;
      ctx.facts.penaltyPerHour = penaltyPerHour;
      return { assets_at_risk: [...reached.keys()], tenants: tenants.map(({ contact_email: _e, ...t }) => t), penalty_per_hour_usd: penaltyPerHour, exposure_usd: penaltyPerHour * hours, outage_hours: hours };
    },
  },
  get_weather: {
    spec: fn("get_weather", "Live weather and 2-day forecast at the asset's property (heat raises cooling load; storms threaten power).", assetProp, ["asset_id"]),
    async run(args, ctx) {
      const { properties: p } = await getAsset(ctx.db, str(args, "asset_id", 50));
      if (p.lat == null || p.lon == null) return { error: "Property has no coordinates" };
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,wind_speed_10m,precipitation&daily=temperature_2m_max,precipitation_probability_max,wind_gusts_10m_max&forecast_days=2&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago`;
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`Weather API ${response.status}`);
      const data = await response.json();
      const max = (xs?: number[]) => (xs?.length ? Math.max(...xs) : null);
      ctx.facts.weather = { max_f: max(data.daily?.temperature_2m_max), rain_pct: max(data.daily?.precipitation_probability_max), gust_mph: max(data.daily?.wind_gusts_10m_max) };
      return { property: p.name, current: data.current, daily: data.daily, summary: ctx.facts.weather };
    },
  },
  get_weather_alerts: {
    spec: fn(
      "get_weather_alerts",
      "Active National Weather Service watches, warnings and advisories at the asset's property (heat advisories, severe storms, floods).",
      assetProp,
      ["asset_id"],
    ),
    async run(args, ctx) {
      const { properties: p } = await getAsset(ctx.db, str(args, "asset_id", 50));
      if (p.lat == null || p.lon == null) return { error: "Property has no coordinates" };

      const alerts = (await activeAlerts(p.lat, p.lon)).slice(0, 5);
      ctx.facts.alerts = alerts.map((a) => a.event);
      return { property: p.name, count: alerts.length, alerts };
    },
  },
};

// ---------------- Dispatch ----------------

export const dispatchTools: Record<string, Tool> = {
  find_vendor: {
    spec: fn("find_vendor", "Vendors certified for this kind of asset, soonest available first, with a cost estimate.", { ...assetProp, est_hours: { type: "number", description: "Labor hours, default 4" } }, ["asset_id"]),
    async run(args, ctx) {
      const asset = await getAsset(ctx.db, str(args, "asset_id", 50));
      const hours = num(args, "est_hours", 0.5, 80, ctx.hints.repair_hours || 4);
      const rows = must(await ctx.db.from("vendors").select("*").contains("certified_kinds", [asset.kind]).order("next_available").limit(5)) as
        { id: string; name: string; trade: string; response_hours: number; hourly_rate: number; callout_fee: number; next_available: string; rating: number }[];
      const vendors = rows.map((v) => ({ id: v.id, name: v.name, trade: v.trade, rating: Number(v.rating), next_available: v.next_available, response_hours: v.response_hours, est_cost_usd: Math.round(Number(v.callout_fee) + Number(v.hourly_rate) * hours) }));
      ctx.facts.vendors = vendors;
      return { asset_kind: asset.kind, est_hours: hours, vendors };
    },
  },
  check_parts: {
    spec: fn("check_parts", "Spare parts on hand for an asset and lead time for the rest.", assetProp, ["asset_id"]),
    async run(args, ctx) {
      const rows = must(await ctx.db.from("parts").select("part, on_hand, unit_cost, lead_days").eq("asset_id", str(args, "asset_id", 50))) as { part: string; on_hand: number; unit_cost: number; lead_days: number }[];
      ctx.facts.parts = rows.map((p) => ({ ...p, unit_cost: Number(p.unit_cost) }));
      return { parts: ctx.facts.parts };
    },
  },
  draft_work_order: {
    spec: fn("draft_work_order", "Draft a work order for a vendor. It waits in the approval queue; nothing is sent until approved.", {
      ...assetProp, vendor_id: { type: "string", description: "Id from find_vendor" }, priority: { type: "number", description: "1 lowest - 5 emergency" },
      title: { type: "string" }, steps: { type: "array", items: { type: "string" } }, est_hours: { type: "number" },
      protects_usd: { type: "number", description: "Dollars at risk this prevents (from the lead's price_risk)" },
    }, ["asset_id", "vendor_id", "priority", "title", "steps"]),
    async run(args, ctx) {
      const assetId = str(args, "asset_id", 50);
      await getAsset(ctx.db, assetId);
      const vendorRows = must(await ctx.db.from("vendors").select("id, name, hourly_rate, callout_fee, next_available").eq("id", str(args, "vendor_id", 60)).limit(1)) as { id: string; name: string; hourly_rate: number; callout_fee: number; next_available: string }[];
      if (!vendorRows.length) throw new Error("Unknown vendor_id. Use an id from find_vendor.");
      const v = vendorRows[0];
      const hours = num(args, "est_hours", 0.5, 80, ctx.hints.repair_hours || 4);
      const cost = Math.round(Number(v.callout_fee) + Number(v.hourly_rate) * hours);
      return draft(ctx, {
        kind: "work_order", title: str(args, "title", 200),
        payload: { asset_id: assetId, vendor_id: v.id, vendor_name: v.name, priority: Math.round(num(args, "priority", 1, 5)), steps: strList(args, "steps", 10), est_hours: hours, scheduled_for: v.next_available },
        protects_usd: num(args, "protects_usd", 0, 1e9, ctx.facts.risk?.wait_usd ?? 0), cost_usd: cost,
      });
    },
  },
  draft_schedule_change: {
    spec: fn("draft_schedule_change", "Draft a temporary building schedule or setpoint change (pre-cool, shift load, pre-start generator). Waits for approval.", {
      ...assetProp, change: { type: "string", description: "What to change, in one sentence" }, hours: { type: "number", description: "How long it lasts" }, protects_usd: { type: "number" },
    }, ["asset_id", "change", "hours"]),
    async run(args, ctx) {
      const assetId = str(args, "asset_id", 50);
      await getAsset(ctx.db, assetId);
      const change = str(args, "change", 400);
      return draft(ctx, {
        kind: "schedule_change", title: change.length > 70 ? change.slice(0, 67) + "..." : change,
        payload: { asset_id: assetId, change, hours: num(args, "hours", 0.5, 168) },
        protects_usd: num(args, "protects_usd", 0, 1e9, 0), cost_usd: 0,
      });
    },
  },
  draft_tenant_notice: {
    spec: fn("draft_tenant_notice", "Draft an email to an affected tenant. Waits for approval.", {
      tenant_id: { type: "string", description: "Tenant id from tenants_at_risk" }, subject: { type: "string" }, message: { type: "string" }, protects_usd: { type: "number" },
    }, ["tenant_id", "subject", "message"]),
    async run(args, ctx) {
      const rows = must(await ctx.db.from("tenants").select("id, name, contact_email, sla_penalty_per_hour").eq("id", str(args, "tenant_id", 60)).limit(1)) as { id: string; name: string; contact_email: string; sla_penalty_per_hour: number }[];
      if (!rows.length) throw new Error("Unknown tenant_id. Use an id from tenants_at_risk.");
      const t = rows[0];
      return draft(ctx, {
        kind: "tenant_notice", title: `Notice to ${t.name}`,
        payload: { tenant_id: t.id, tenant_name: t.name, to: t.contact_email, subject: str(args, "subject", 200), message: str(args, "message", 2000) },
        protects_usd: num(args, "protects_usd", 0, 1e9, 0), cost_usd: 0,
      });
    },
  },
};

// ---------------- Extra tools for custom specialists ----------------

export const extraTools: Record<string, Tool> = {
  get_energy: {
    spec: fn("get_energy", "Energy use vs baseline for an asset (or every meter in this building if omitted), with an anomaly score 0-100.", { asset_id: { type: "string", description: "Optional asset tag" } }),
    async run(args, ctx) {
      let q = ctx.db.from("energy_readings").select("equipment, zone, reading_date, usage_kwh, baseline_kwh, anomaly_score").order("anomaly_score", { ascending: false }).limit(12);
      if (ctx.propertyId) q = q.eq("property_id", ctx.propertyId);
      const asset = optStr(args, "asset_id", 50);
      if (asset) q = q.eq("equipment", asset);
      const rows = must(await q) as { equipment: string; zone: string; usage_kwh: number; baseline_kwh: number; anomaly_score: number }[];
      return {
        count: rows.length,
        readings: rows.map((r) => ({ ...r, over_baseline_pct: Math.round(((Number(r.usage_kwh) - Number(r.baseline_kwh)) / Number(r.baseline_kwh)) * 100) })),
      };
    },
  },
  past_incidents: {
    spec: fn("past_incidents", "Earlier work orders and memory notes on an asset and the equipment directly feeding it: is this a repeat failure?", assetProp, ["asset_id"]),
    async run(args, ctx) {
      const id = str(args, "asset_id", 50);
      await getAsset(ctx.db, id);
      const upstream = [...upstreamOf(await allEdges(ctx.db), id).entries()].filter(([, v]) => v.depth === 1).map(([a]) => a);
      const ids = [id, ...upstream];
      const [orders, notes] = await Promise.all([
        ctx.db.from("work_orders").select("asset_id, title, status, created_at").in("asset_id", ids).order("created_at", { ascending: false }).limit(10),
        ctx.db.from("building_memory").select("asset_id, note, created_at").in("asset_id", ids).order("created_at", { ascending: false }).limit(10),
      ]);
      const wo = (must(orders) as { asset_id: string; title: string; status: string; created_at: string }[]).filter((w) => w.created_at < new Date(Date.now() - 3_600_000).toISOString());
      const days = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / 86_400_000);
      return {
        checked: ids,
        work_orders: wo.map((w) => ({ ...w, days_ago: days(w.created_at) })),
        notes: (must(notes) as { asset_id: string; note: string; created_at: string }[]).map((n) => ({ ...n, days_ago: days(n.created_at) })),
        repeat: wo.length > 0,
      };
    },
  },
};

/** Every tool by name. ask_* tools are added per run in run.ts. */
export const ALL_TOOLS: Record<string, Tool> = { ...leadTools, ...triageTools, ...sensorTools, ...leaseTools, ...dispatchTools, ...extraTools };
