// In-memory stand-in for the Supabase client, seeded like migrations 003-005.
// Used when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set, so the whole app runs with zero setup,
// and by scripts/dry-run.ts. State lives in this server process and resets on restart.
// It implements only the query-builder calls this app makes.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DC1 = "00000000-0000-0000-0000-000000000003", AVON = "00000000-0000-0000-0000-000000000001", NORTH = "00000000-0000-0000-0000-000000000002";
const now = Date.now(), h = 3_600_000, iso = (ms: number) => new Date(ms).toISOString();
const asset = (id: string, property_id: string, kind: string) => ({ id, property_id, name: id, kind, location: "", status: "ok" });

const TEN = { lone: randomUUID(), med: randomUUID(), bright: randomUUID(), park: randomUUID() };
const T: Record<string, Row[]> = ((globalThis as unknown as { __opscrewTables?: Record<string, Row[]> }).__opscrewTables ??= {
  properties: [
    { id: AVON, name: "Comerica Bank Tower", address: "1717 Main Street, Dallas, TX", building_type: "Office", lat: 32.7767, lon: -96.797 },
    { id: NORTH, name: "Fountain Place", address: "1445 Ross Avenue, Dallas, TX", building_type: "Office", lat: 32.9857, lon: -96.7502 },
    { id: DC1, name: "Dallas Infomart", address: "1950 N Stemmons Freeway, Dallas, TX", building_type: "Data center", lat: 32.9483, lon: -96.7299 },
  ],
  assets: [
    ...["UTIL-FEED-1", "SWGR-1", "GEN-1", "UPS-A", "UPS-B"].map((a) => asset(a, DC1, "power")),
    asset("BMS-1", DC1, "controls"), ...["CHILLER-1", "CW-LOOP-1", "CRAH-A1", "CRAH-B1"].map((a) => asset(a, DC1, "cooling")),
    asset("HALL-A", DC1, "space"), asset("HALL-B", DC1, "space"),
    asset("AHU-04", AVON, "hvac"), asset("FLOOR-4-EAST", AVON, "space"), asset("PANEL-12B", NORTH, "power"), asset("HVAC-12", NORTH, "hvac"), asset("FLOOR-12", NORTH, "space"),
  ],
  dependencies: [
    ["UTIL-FEED-1", "SWGR-1", "powers"], ["GEN-1", "SWGR-1", "powers"], ["SWGR-1", "UPS-A", "powers"], ["SWGR-1", "UPS-B", "powers"], ["SWGR-1", "CHILLER-1", "powers"],
    ["UPS-A", "HALL-A", "powers"], ["UPS-B", "HALL-B", "powers"], ["BMS-1", "CHILLER-1", "controls"], ["BMS-1", "CRAH-A1", "controls"], ["BMS-1", "CRAH-B1", "controls"],
    ["CHILLER-1", "CW-LOOP-1", "cools"], ["CW-LOOP-1", "CRAH-A1", "cools"], ["CW-LOOP-1", "CRAH-B1", "cools"], ["CRAH-A1", "HALL-A", "cools"], ["CRAH-B1", "HALL-B", "cools"],
    ["AHU-04", "FLOOR-4-EAST", "serves"], ["PANEL-12B", "HVAC-12", "powers"], ["PANEL-12B", "FLOOR-12", "powers"], ["HVAC-12", "FLOOR-12", "serves"],
  ].map(([upstream, downstream, relation]) => ({ upstream, downstream, relation })),
  tenants: [
    { id: TEN.lone, property_id: DC1, asset_id: "HALL-A", name: "Lonestar Cloud", sla_penalty_per_hour: 25000, contact_email: "noc@lonestar.example" },
    { id: TEN.med, property_id: DC1, asset_id: "HALL-B", name: "MedRecords Health", sla_penalty_per_hour: 12000, contact_email: "it-ops@medrecords.example" },
    { id: TEN.bright, property_id: AVON, asset_id: "FLOOR-4-EAST", name: "Brightline Legal", sla_penalty_per_hour: 800, contact_email: "office@brightline.example" },
    { id: TEN.park, property_id: NORTH, asset_id: "FLOOR-12", name: "Parkway Capital", sla_penalty_per_hour: 1500, contact_email: "facilities@parkway.example" },
  ],
  maintenance_tickets: [
    { id: randomUUID(), property_id: DC1, equipment: "CRAH-A1", floor: "Data hall A", title: "Water on raised floor near CRAH-A1", notes: "Small puddle.", status: "open", urgency: 2, reported_at: iso(now - 13 * 24 * h) },
    { id: randomUUID(), property_id: DC1, equipment: "CRAH-A1", floor: "Data hall A", title: "Musty smell in hall A cold aisle", notes: "Damp smell.", status: "open", urgency: 2, reported_at: iso(now - 6 * 24 * h) },
    { id: randomUUID(), property_id: DC1, equipment: "HALL-A", floor: "Data hall A", title: "Hot aisle warmer than usual", notes: "Inlet temps +2F.", status: "open", urgency: 3, reported_at: iso(now - 20 * h) },
    { id: randomUUID(), property_id: AVON, equipment: "AHU-04", floor: "Floor 4", title: "Warm air in east corridor", notes: "Three offices report rising temperature and weak airflow.", status: "open", urgency: 3, reported_at: iso(now - 2 * h) },
    { id: randomUUID(), property_id: AVON, equipment: "AHU-04", floor: "Floor 4", title: "Condensation near supply vent", notes: "Moisture beneath the air handler. No ceiling damage yet.", status: "open", urgency: 4, reported_at: iso(now - h) },
    { id: randomUUID(), property_id: NORTH, equipment: "PANEL-12B", floor: "Floor 12", title: "Lights flickering", notes: "Intermittent flicker near west conference rooms.", status: "monitoring", urgency: 2, reported_at: iso(now - 4 * h) },
  ],
  telemetry_events: Array.from({ length: 15 }, (_, d) => ({ id: randomUUID(), asset_id: "CHILLER-1", source: "sensor", metric: "supply_temp_f", value: Math.round((44 + 0.41 * d + (d % 3 === 0 ? 0.15 : -0.05)) * 100) / 100, message: "Daily average chilled water supply temperature", created_at: iso(now - (14 - d) * 24 * h) })).concat([
    { id: randomUUID(), asset_id: "CHILLER-1", source: "sensor", metric: "vibration_mm_s", value: 6.8, message: "Compressor vibration trending up (baseline 2.1 mm/s)", created_at: iso(now - 3 * h) },
    { id: randomUUID(), asset_id: "CRAH-A1", source: "sensor", metric: "condensate_pump_amps", value: 0.2, message: "Condensate pump drawing almost no current (normal 1.4 A)", created_at: iso(now - 48 * h) },
    { id: randomUUID(), asset_id: "HALL-A", source: "sensor", metric: "inlet_temp_f", value: 76.5, message: "Average rack inlet temperature (ASHRAE limit 80.6F)", created_at: iso(now - h) },
    { id: randomUUID(), asset_id: "UPS-A", source: "sensor", metric: "battery_health_pct", value: 71, message: "Battery string A health below 75%", created_at: iso(now - 24 * h) },
  ]),
  vendors: [
    { id: randomUUID(), name: "Lone Star Mechanical", trade: "hvac", certified_kinds: ["cooling", "hvac"], response_hours: 4, hourly_rate: 165, callout_fee: 350, next_available: iso(now + 14 * h), rating: 4.8 },
    { id: randomUUID(), name: "Metroplex Chiller Service", trade: "hvac", certified_kinds: ["cooling"], response_hours: 8, hourly_rate: 140, callout_fee: 250, next_available: iso(now + 30 * h), rating: 4.4 },
    { id: randomUUID(), name: "Trinity Electric", trade: "electrical", certified_kinds: ["power"], response_hours: 3, hourly_rate: 150, callout_fee: 300, next_available: iso(now + 6 * h), rating: 4.7 },
    { id: randomUUID(), name: "Prairie Controls", trade: "controls", certified_kinds: ["controls"], response_hours: 6, hourly_rate: 175, callout_fee: 200, next_available: iso(now + 10 * h), rating: 4.6 },
    { id: randomUUID(), name: "DFW Facility Pros", trade: "general", certified_kinds: ["hvac", "space"], response_hours: 12, hourly_rate: 95, callout_fee: 120, next_available: iso(now + 20 * h), rating: 4.1 },
  ],
  parts: [
    { id: randomUUID(), asset_id: "CRAH-A1", part: "Condensate pump assembly", on_hand: 1, unit_cost: 420, lead_days: 0 },
    { id: randomUUID(), asset_id: "CHILLER-1", part: "Compressor bearing kit", on_hand: 0, unit_cost: 1850, lead_days: 2 },
    { id: randomUUID(), asset_id: "CHILLER-1", part: "Refrigerant charge (R-134a, 50 lb)", on_hand: 2, unit_cost: 380, lead_days: 0 },
    { id: randomUUID(), asset_id: "UPS-A", part: "Battery string module", on_hand: 4, unit_cost: 900, lead_days: 0 },
    { id: randomUUID(), asset_id: "AHU-04", part: "Condensate drain pan", on_hand: 0, unit_cost: 260, lead_days: 3 },
  ],
  building_memory: [
    { id: randomUUID(), property_id: DC1, asset_id: "CHILLER-1", note: "Oct 2026: compressor bearing replaced after vibration alarm. Vendor said refrigerant was 15% low at the time.", source: "seed", run_id: null, created_at: iso(now - 28 * 24 * h) },
    { id: randomUUID(), property_id: DC1, asset_id: "CRAH-A1", note: "Condensate pump on CRAH-A1 is original equipment (2017). Flagged as end-of-life in the last audit.", source: "seed", run_id: null, created_at: iso(now - 60 * 24 * h) },
    { id: randomUUID(), property_id: AVON, asset_id: "AHU-04", note: "AHU-04 drain pan cracked in 2025 and was patched, not replaced.", source: "seed", run_id: null, created_at: iso(now - 200 * 24 * h) },
  ],
  energy_readings: [
    { id: randomUUID(), property_id: AVON, zone: "East wing", equipment: "AHU-04", reading_date: iso(now).slice(0, 10), usage_kwh: 842, baseline_kwh: 590, anomaly_score: 86 },
    { id: randomUUID(), property_id: AVON, zone: "West wing", equipment: "AHU-02", reading_date: iso(now).slice(0, 10), usage_kwh: 544, baseline_kwh: 520, anomaly_score: 18 },
    { id: randomUUID(), property_id: NORTH, zone: "Floor 12", equipment: "HVAC-12", reading_date: iso(now).slice(0, 10), usage_kwh: 713, baseline_kwh: 480, anomaly_score: 79 },
    { id: randomUUID(), property_id: DC1, zone: "Roof", equipment: "CHILLER-1", reading_date: iso(now).slice(0, 10), usage_kwh: 2380, baseline_kwh: 1900, anomaly_score: 72 },
    { id: randomUUID(), property_id: DC1, zone: "Data hall A", equipment: "CRAH-A1", reading_date: iso(now).slice(0, 10), usage_kwh: 410, baseline_kwh: 395, anomaly_score: 12 },
  ],
  work_orders: [
    { id: randomUUID(), run_id: null, approval_id: null, vendor_id: null, asset_id: "CHILLER-1", priority: 4, title: "Replace CHILLER-1 compressor bearing", steps: ["Replace bearing", "Check refrigerant charge"], status: "done", scheduled_for: null, created_at: iso(now - 28 * 24 * h) },
  ],
  agent_configs: [],
  leases: [
    { id: randomUUID(), tenant_id: TEN.lone, lease_ref: "DC1-HALL-A-2024", clauses: [
      { assets: ["CRAH-A1"], party: "tenant", ref: "§8.2", text: "Tenant shall maintain, repair and replace the supplemental cooling units installed for Tenant's exclusive use in Data Hall A, at Tenant's sole cost." },
      { kinds: ["cooling", "power", "controls"], party: "landlord", ref: "§7.1", text: "Landlord shall maintain the base building systems, including the central chiller plant, electrical service and building controls." },
    ] },
    { id: randomUUID(), tenant_id: TEN.med, lease_ref: "DC1-HALL-B-2023", clauses: [
      { kinds: ["cooling", "power", "controls"], party: "landlord", ref: "§7.1", text: "Landlord shall maintain all base building systems serving Data Hall B, including cooling, power and controls." },
    ] },
    { id: randomUUID(), tenant_id: TEN.bright, lease_ref: "AVON-F4E-2022", clauses: [
      { assets: ["AHU-04"], party: "landlord", ref: "§10.4", text: "Landlord is responsible for the building HVAC, including air handlers serving the Premises; costs are recoverable as operating expenses." },
    ] },
    { id: randomUUID(), tenant_id: TEN.park, lease_ref: "NST-F12-2025", clauses: [
      { assets: ["PANEL-12B"], party: "tenant", ref: "§9.3", text: "Tenant is responsible for electrical panels and distribution installed within the Premises after the Commencement Date." },
      { kinds: ["hvac"], party: "landlord", ref: "§9.1", text: "Landlord maintains base building HVAC serving Floor 12." },
    ] },
  ],
  verifications: [], triage_plans: [],
  agent_runs: [], agent_steps: [], approvals: [], tenant_notices: [], schedule_changes: [], sweeps: [],
});
const DEFAULTS: Record<string, Row> = {
  agent_runs: { status: "running", trigger: "incident", mode: "live", risk: null, summary: null, finished_at: null },
  approvals: { status: "pending", protects_usd: 0, cost_usd: 0, decided_by: null, decided_at: null },
  sweeps: { status: "running", scores: [], started_run_id: null },
  work_orders: { status: "open" },
  verifications: { status: "scheduled", after: [], note: null, checked_at: null },
  triage_plans: { status: "proposed" },
};
const FK: Record<string, string> = { properties: "property_id", vendors: "vendor_id", telemetry_events: "event_id", agent_runs: "run_id" };
type Embed = { name: string; children: Embed[] };
/** Parses "*, a(x, b(y))" into the embedded relations PostgREST would join. */
function parseEmbeds(cols: string): Embed[] {
  const out: Embed[] = [];
  let depth = 0, start = 0;
  const parts: string[] = [];
  for (let i = 0; i < cols.length; i++) {
    if (cols[i] === "(") depth++;
    else if (cols[i] === ")") depth--;
    else if (cols[i] === "," && depth === 0) { parts.push(cols.slice(start, i)); start = i + 1; }
  }
  parts.push(cols.slice(start));
  for (const p of parts) {
    const m = p.trim().match(/^(\w+)\((.*)\)$/s);
    if (m && FK[m[1]]) out.push({ name: m[1], children: parseEmbeds(m[2]) });
  }
  return out;
}
function attach(row: Row, embeds: Embed[]): Row {
  const copy = structuredClone(row);
  for (const e of embeds) {
    const hit = (T[e.name] ?? []).find((x) => x.id === row[FK[e.name]]);
    copy[e.name] = hit ? attach(hit, e.children) : null;
  }
  return copy;
}
let stepId = 0;

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row[] | Row = [];
  private embeds: Embed[] = [];
  private ordering?: { col: string; asc: boolean };
  private lim?: number;
  private one = false;
  private returning = false;
  private head = false;
  constructor(private table: string) {}
  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    this.embeds = parseEmbeds(cols);
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  contains(c: string, vs: unknown[]) { this.filters.push((r) => vs.every((v) => (r[c] ?? []).includes(v))); return this; }
  not(c: string, _op: string, _v: null) { this.filters.push((r) => r[c] != null); return this; }
  lte(c: string, v: string) { this.filters.push((r) => String(r[c]) <= v); return this; }
  like(c: string, pattern: string) { const re = new RegExp(`^${pattern.split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`); this.filters.push((r) => re.test(String(r[c] ?? ""))); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.ordering = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.one = true; return this; }
  then<R>(ok: (v: { data: any; error: any; count?: number }) => R, bad?: (e: unknown) => R) { // eslint-disable-line @typescript-eslint/no-explicit-any
    try { return Promise.resolve(this.run()).then(ok, bad); } catch (e) { return Promise.reject(e).then(ok, bad); }
  }
  private run() {
    const rows = (T[this.table] ??= []);
    const match = () => rows.filter((r) => this.filters.every((f) => f(r)));
    let out: Row[];
    if (this.op === "insert") {
      out = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p) => ({
        id: this.table === "agent_steps" ? ++stepId : randomUUID(), created_at: iso(Date.now()), ...DEFAULTS[this.table], ...structuredClone(p),
      }));
      rows.push(...out);
      if (!this.returning) return { data: null, error: null };
    } else if (this.op === "update") {
      out = match();
      for (const r of out) Object.assign(r, structuredClone(this.payload));
      if (!this.returning) return { data: null, error: null };
    } else if (this.op === "delete") {
      const gone = new Set(match());
      T[this.table] = rows.filter((r) => !gone.has(r));
      return { data: null, error: null };
    } else {
      out = match();
      if (this.head) return { data: null, error: null, count: out.length };
    }
    if (this.ordering) {
      const { col, asc } = this.ordering;
      out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    if (this.lim) out = out.slice(0, this.lim);
    out = out.map((r) => attach(r, this.embeds));
    if (this.one) return out.length ? { data: out[0], error: null } : { data: null, error: { message: "No rows" } };
    return { data: out, error: null };
  }
}

const g = globalThis as unknown as { __opscrewMemoryDb?: SupabaseClient };
export function memoryDb(): SupabaseClient {
  g.__opscrewMemoryDb ??= { from: (t: string) => new Query(t) } as unknown as SupabaseClient;
  return g.__opscrewMemoryDb;
}
/** Direct table access for scripts. */
export const memoryTables = T;
