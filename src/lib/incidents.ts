import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startRun } from "@/lib/agent/orchestrate";
import { SCENARIOS, variedHints, type Scenario } from "@/lib/scenarios";
import { readSeries, seedSeries } from "@/lib/sensors";
import { BASE_NAMES, SITES, remap, scenarioAt, sitesFor, type Site } from "@/lib/sites";

type Row = Record<string, unknown>;
const g = globalThis as unknown as { __opscrewSites?: Promise<void>; __opscrewSitesN?: number };

async function rows(db: SupabaseClient, q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  void db;
  return (data ?? []) as Row[];
}
async function put(db: SupabaseClient, table: string, list: Row[]) {
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await db.from(table).insert(list.slice(i, i + 200));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/** Copies one original building into a new one: equipment, wiring, tenants, leases, parts, history and tickets. */
async function cloneSite(db: SupabaseClient, site: Site) {
  const assets = await rows(db, db.from("assets").select("*").eq("property_id", site.from));
  const ids = assets.map((a) => String(a.id));
  if (!ids.length) return;
  const map = <T,>(v: T) => remap(v, site, ids);
  const { lat, lon, id, name, address, building_type } = site;
  const prop = await db.from("properties").insert({ id, name, address, building_type, lat, lon });
  if (prop.error) { if (/duplicate|already exists/i.test(prop.error.message)) return; throw new Error(prop.error.message); }
  await put(db, "assets", assets.map((a) => map({ ...a, property_id: id, status: "ok" })));
  await put(db, "dependencies", map(await rows(db, db.from("dependencies").select("*").in("upstream", ids))));

  const tenants = await rows(db, db.from("tenants").select("*").eq("property_id", site.from));
  const newId = new Map(tenants.map((t) => [String(t.id), randomUUID()]));
  await put(db, "tenants", tenants.map((t) => map({ ...t, id: newId.get(String(t.id)), property_id: id })));
  if (tenants.length) {
    const leases = await rows(db, db.from("leases").select("*").in("tenant_id", [...newId.keys()]));
    await put(db, "leases", leases.map(({ id: _id, ...l }) => map({ ...l, tenant_id: newId.get(String(l.tenant_id)), lease_ref: `${site.code}-${String(l.lease_ref).replace(/^[A-Z0-9]+-/, "")}` })));
  }
  const strip = ({ id: _id, ...r }: Row) => r;
  await put(db, "parts", (await rows(db, db.from("parts").select("*").in("asset_id", ids))).map((r) => map(strip(r))));
  await put(db, "work_orders", (await rows(db, db.from("work_orders").select("*").in("asset_id", ids))).filter((r) => r.run_id == null).map((r) => map(strip(r))));
  await put(db, "building_memory", (await rows(db, db.from("building_memory").select("*").eq("property_id", site.from).eq("source", "seed"))).map((r) => map({ ...strip(r), property_id: id })));
  if (site.quiet) return; // a healthy building: no open tickets or energy anomalies
  await put(db, "maintenance_tickets", (await rows(db, db.from("maintenance_tickets").select("*").eq("property_id", site.from))).map((r) => map({ ...strip(r), property_id: id, building: name })));
  await put(db, "energy_readings", (await rows(db, db.from("energy_readings").select("*").eq("property_id", site.from))).map((r) => map({ ...strip(r), property_id: id })));
  void BASE_NAMES;
}

/** Makes sure the extra demo buildings exist (once per server process; safe to call often). */
export function ensureSites(db: SupabaseClient) {
  // Re-check when the list of buildings changes (the cache survives hot reloads).
  if (g.__opscrewSitesN !== SITES.length) { g.__opscrewSites = undefined; g.__opscrewSitesN = SITES.length; }
  return (g.__opscrewSites ??= (async () => {
    const { data } = await db.from("properties").select("id").in("id", SITES.map((s) => s.id));
    const have = new Set(((data ?? []) as Row[]).map((r) => String(r.id)));
    for (const s of SITES) if (!have.has(s.id)) await cloneSite(db, s);
  })().catch((e) => { g.__opscrewSites = undefined; throw e; }));
}

/** Starts a demo incident with fresh numbers: a new sensor history, and outage and repair hours varied for this run.
 *  `site` picks the building (index into the scenario's buildings); by default a random one. */
export async function startScenario(db: SupabaseClient, base: Scenario, opts: { mode?: "scripted"; site?: number } = {}) {
  await ensureSites(db).catch((e) => console.error("[sites]", e));
  const options = sitesFor(base.property_id);
  // Each building gets each kind of incident once: prefer a building that doesn't have this one yet
  // (or, if all do, the one whose last one is oldest; the newest replaces it in the lists).
  const { data: had } = await db.from("agent_runs").select("property_id, created_at").eq("title", base.label).order("created_at", { ascending: false }).limit(500);
  const lastAt = new Map<string, number>();
  for (const r of (had ?? []) as { property_id: string; created_at: string }[]) if (!lastAt.has(r.property_id)) lastAt.set(r.property_id, Date.parse(r.created_at));
  const start = opts.site ?? Math.floor(Math.random() * options.length);
  const order = options.map((_, i) => options[(start + i) % options.length]);
  const idOf = (o: Site | null) => o?.id ?? base.property_id;
  const pick = order.find((o) => !lastAt.has(idOf(o))) ?? [...order].sort((a, b) => (lastAt.get(idOf(a)) ?? 0) - (lastAt.get(idOf(b)) ?? 0))[0];
  const { data: ok } = pick ? await db.from("properties").select("id").eq("id", pick.id).limit(1) : { data: [1] };
  const sc = ok?.length ? scenarioAt(base, pick) : base;
  let value = sc.signal.value;
  if (sc.sim) {
    await seedSeries(db, sc.sim);
    if (sc.signal.asset_id === sc.sim.asset_id && sc.signal.metric === sc.sim.metric) {
      const pts = await readSeries(db, sc.sim.asset_id, sc.sim.metric, 1);
      value = pts.length ? pts[pts.length - 1].v : value;
    }
  }
  return startRun(db, { signal: { ...sc.signal, value }, propertyId: sc.property_id, hints: variedHints(sc.hints), trigger: "incident", title: sc.label, mode: opts.mode });
}

/** One random problem in each building, for Storm Night. */
export function stormPicks(): Scenario[] {
  const byBuilding = new Map<string, Scenario[]>();
  for (const sc of SCENARIOS) if (sc.sim) byBuilding.set(sc.property_id, [...(byBuilding.get(sc.property_id) ?? []), sc]);
  return [...byBuilding.values()].map((list) => list[Math.floor(Math.random() * list.length)]);
}
