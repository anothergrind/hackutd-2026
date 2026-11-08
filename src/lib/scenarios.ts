import type { Sim } from "@/lib/sensors";

// Demo incidents. Each one is a real signal written to telemetry_events; the hints steer the scripted
// (no-API-key) mode and are also given to Nemotron as context. Asset ids must exist in public.assets.

export type Hints = {
  root: string; // asset the fix targets
  impacted: string; // asset whose tenants get hurt first
  price_asset: string; // asset whose blast radius is priced
  problem: string;
  trend?: { asset_id: string; metric: string; limit: number };
  outage_hours: number;
  repair_hours: number;
  steps: string[];
  schedule?: string;
  schedule_asset?: string; // asset the schedule change applies to (default: root)
  /** How to confirm the fix worked afterwards (default: a health reading on the root asset). */
  verify?: { asset_id: string; metric: string; limit: number; direction: "below" | "above" };
};

export type Scenario = {
  id: string;
  label: string;
  blurb: string;
  property_id: string;
  signal: { asset_id: string; source: "sensor" | "bms" | "cyber" | "ticket" | "weather"; metric: string; value: number | null; message: string };
  hints: Hints;
  /** Plain-English wording for non-technical viewers. */
  plain: { reported: string; problem: string };
  /** The sensor that drifts toward failure. Each run gets a fresh history from it, so numbers differ every time. */
  sim?: Sim;
};

const DC1 = "00000000-0000-0000-0000-000000000003";

/** Builds a scenario whose trend, verification and sensor feed all come from one Sim. */
function drift(base: Omit<Scenario, "hints" | "sim"> & { hints: Omit<Hints, "trend" | "verify">; sim: Sim }): Scenario {
  const { sim } = base;
  return {
    ...base,
    hints: { ...base.hints, trend: { asset_id: sim.asset_id, metric: sim.metric, limit: sim.limit }, verify: { asset_id: sim.asset_id, metric: sim.metric, limit: sim.limit, direction: sim.failing === "rising" ? "below" : "above" } },
  };
}

const CENTER = "00000000-0000-0000-0000-000000000001", NORTHSTAR = "00000000-0000-0000-0000-000000000002";

const MORE: Scenario[] = [
  drift({
    id: "ups-fade", label: "UPS battery fade", blurb: "UPS string B batteries losing capacity",
    plain: { reported: "The weekly battery test shows UPS string B holding less charge each week.", problem: "the backup batteries for Data hall B are wearing out and may not carry the hall through a power cut" },
    property_id: DC1,
    signal: { asset_id: "UPS-B", source: "sensor", metric: "battery_health_pct", value: null, message: "Weekly self-test: UPS-B battery health down again; runtime estimate shrinking." },
    hints: { root: "UPS-B", impacted: "HALL-B", price_asset: "UPS-B", problem: "UPS-B battery strings degrading; Data hall B has no reliable ride-through if utility power drops", outage_hours: 2, repair_hours: 5,
      steps: ["Replace weakest UPS-B battery modules", "Run a full UPS-B load test", "Confirm runtime meets the 10-minute target"] },
    sim: { asset_id: "UPS-B", metric: "battery_health_pct", limit: 80, failing: "falling", normal: 98, hours: [30, 140] },
  }),
  drift({
    id: "hall-b-fans", label: "Data hall B fan strain", blurb: "CRAH-B1 fan motor drawing more current",
    plain: { reported: "The cooling unit in Data hall B is louder than usual and its fan is working harder every day.", problem: "the fan motor in the Data hall B cooling unit is wearing out and could stop, overheating the hall" },
    property_id: DC1,
    signal: { asset_id: "CRAH-B1", source: "sensor", metric: "fan_amps", value: null, message: "CRAH-B1 fan current trending up; bearing noise reported by the night technician." },
    hints: { root: "CRAH-B1", impacted: "HALL-B", price_asset: "CRAH-B1", problem: "CRAH-B1 fan motor bearings failing; current draw climbing toward the trip limit", outage_hours: 4, repair_hours: 4,
      steps: ["Replace CRAH-B1 fan motor bearings", "Balance and align the fan", "Verify fan current back under 12 A"],
      schedule: "Raise CRAH-A1 output and spread Data hall B load until CRAH-B1 is repaired", schedule_asset: "HALL-B" },
    sim: { asset_id: "CRAH-B1", metric: "fan_amps", limit: 18, failing: "rising", normal: 11, hours: [8, 48] },
  }),
  drift({
    id: "cw-leak", label: "Chilled water leak", blurb: "Loop pressure slowly dropping",
    plain: { reported: "The chilled water pipes are slowly losing pressure, and a technician found a damp spot near a valve.", problem: "the chilled water pipes are leaking, and both data halls could lose cooling if pressure keeps falling" },
    property_id: DC1,
    signal: { asset_id: "CW-LOOP-1", source: "sensor", metric: "loop_pressure_psi", value: null, message: "CW-LOOP-1 pressure down several psi this week; makeup water meter running more than usual." },
    hints: { root: "CW-LOOP-1", impacted: "HALL-A", price_asset: "CW-LOOP-1", problem: "Slow leak in the chilled water loop; both data halls lose cooling below minimum pressure", outage_hours: 3, repair_hours: 6,
      steps: ["Locate and isolate the leaking valve on CW-LOOP-1", "Replace the valve packing or valve", "Refill, purge air and verify loop pressure"] },
    sim: { asset_id: "CW-LOOP-1", metric: "loop_pressure_psi", limit: 35, failing: "falling", normal: 62, hours: [6, 36] },
  }),
  drift({
    id: "floor12-cooling", label: "Floor 12 cooling fade", blurb: "HVAC-12 refrigerant pressure dropping",
    plain: { reported: "Floor 12 tenants say the office is getting warmer each afternoon.", problem: "the Floor 12 air conditioning is slowly losing refrigerant and will stop cooling the offices" },
    property_id: NORTHSTAR,
    signal: { asset_id: "HVAC-12", source: "ticket", metric: "refrigerant_psi", value: null, message: "Comfort complaints from Floor 12 three afternoons in a row; HVAC-12 suction pressure low." },
    hints: { root: "HVAC-12", impacted: "FLOOR-12", price_asset: "HVAC-12", problem: "Refrigerant leak in HVAC-12; Floor 12 loses cooling when pressure drops below minimum", outage_hours: 8, repair_hours: 3,
      steps: ["Leak-test and repair HVAC-12 refrigerant circuit", "Recharge refrigerant to spec", "Verify Floor 12 supply air temperature"] },
    sim: { asset_id: "HVAC-12", metric: "refrigerant_psi", limit: 70, failing: "falling", normal: 118, hours: [12, 72] },
  }),
  drift({
    id: "generator-coolant", label: "Generator overheating", blurb: "GEN-1 coolant temperature rising on tests",
    plain: { reported: "The backup generator ran hotter than normal during its last three weekly tests.", problem: "the backup generator is overheating and may shut down during a power cut, leaving both data halls without power" },
    property_id: DC1,
    signal: { asset_id: "GEN-1", source: "sensor", metric: "coolant_temp_f", value: null, message: "GEN-1 weekly test: coolant temperature higher each week; radiator fins look clogged." },
    hints: { root: "GEN-1", impacted: "HALL-A", price_asset: "SWGR-1", problem: "GEN-1 cooling degrading; generator will overheat and trip during a utility outage", outage_hours: 2, repair_hours: 4,
      steps: ["Clean GEN-1 radiator and check coolant", "Replace the thermostat and fan belt", "Run a 2-hour load test"] },
    sim: { asset_id: "GEN-1", metric: "coolant_temp_f", limit: 230, failing: "rising", normal: 186, hours: [12, 96] },
  }),
  drift({
    id: "ahu-filters", label: "Clogged air filters", blurb: "AHU-04 filter pressure climbing",
    plain: { reported: "Air on Floor 4 feels stuffy and the air handler is working harder to push air through.", problem: "the air filters in the Floor 4 air handler are clogging and will choke off airflow to the offices" },
    property_id: CENTER,
    signal: { asset_id: "AHU-04", source: "sensor", metric: "filter_dp_inwc", value: null, message: "AHU-04 filter pressure drop rising; stuffy air complaints from Floor 4 east." },
    hints: { root: "AHU-04", impacted: "FLOOR-4-EAST", price_asset: "AHU-04", problem: "AHU-04 filters loading up; airflow to Floor 4 east falls off past the limit", outage_hours: 6, repair_hours: 2,
      steps: ["Replace AHU-04 filter bank", "Inspect coil for dust", "Verify filter pressure drop under 0.5 in. w.c."] },
    sim: { asset_id: "AHU-04", metric: "filter_dp_inwc", limit: 1, failing: "rising", normal: 0.32, hours: [24, 120] },
  }),
];

export const SCENARIOS: Scenario[] = [
  {
    id: "cooling-cascade",
    plain: { reported: "Staff reported a third small problem in Data hall A: water on the floor, a musty smell and warmer air.", problem: "a cooling unit in Data hall A is leaking, and the main chiller that cools the building is slowly overheating" },
    label: "Cooling cascade",
    blurb: "3 small tickets in Data hall A and a chiller running hot",
    property_id: DC1,
    signal: { asset_id: "CRAH-A1", source: "ticket", metric: "repeat_report", value: 3, message: "Third report in two weeks from Data hall A: water near CRAH-A1, musty smell, hot aisle warmer than usual." },
    hints: {
      root: "CRAH-A1", impacted: "HALL-A", price_asset: "CHILLER-1",
      problem: "CRAH-A1 condensate pump failing while CHILLER-1 supply water drifts toward its limit",
      trend: { asset_id: "CHILLER-1", metric: "supply_temp_f", limit: 50 },
      outage_hours: 3, repair_hours: 4,
      steps: ["Replace CRAH-A1 condensate pump (spare on site)", "Check CHILLER-1 refrigerant charge and compressor bearings", "Verify hall A rack inlet temps under 78F after repair"],
      schedule: "Pre-cool Data hall A to 68F supply tonight and shift batch load to hall B until the repair is verified",
      schedule_asset: "HALL-A",
      verify: { asset_id: "CHILLER-1", metric: "supply_temp_f", limit: 50, direction: "below" },
    },
    sim: { asset_id: "CHILLER-1", metric: "supply_temp_f", limit: 50, failing: "rising", normal: 43.5, hours: [8, 60] },
  },
  {
    id: "bms-intrusion",
    plain: { reported: "Someone from an unknown computer is changing the cooling settings.", problem: "the building control system may be hacked and could let the data halls overheat" },
    label: "BMS intrusion",
    blurb: "Unknown IP rewriting cooling setpoints",
    property_id: DC1,
    signal: { asset_id: "BMS-1", source: "cyber", metric: "unauthorized_write", value: 14, message: "14 unauthorized setpoint writes to CRAH units from unknown IP 185.220.x.x in 6 minutes." },
    hints: {
      root: "BMS-1", impacted: "HALL-A", price_asset: "BMS-1",
      problem: "Compromised building management system can push both data halls out of temperature range",
      outage_hours: 2, repair_hours: 3,
      steps: ["Isolate BMS-1 from the corporate network", "Restore CRAH setpoints from last known good config", "Rotate BMS credentials and review access logs"],
      schedule: "Put CRAH-A1 and CRAH-B1 in local manual control at fixed setpoints until BMS-1 is cleared",
    },
  },
  {
    id: "utility-sag",
    plain: { reported: "The main power line keeps dipping, and storms are forecast tonight.", problem: "a weak power line during storms could push the site onto a backup generator and an aging battery" },
    label: "Utility sag + storms",
    blurb: "Feed A voltage dropping with storms in the forecast",
    property_id: DC1,
    signal: { asset_id: "UTIL-FEED-1", source: "sensor", metric: "voltage_pct", value: 82, message: "Utility feed A voltage sagged to 82% of nominal twice in an hour; thunderstorms forecast tonight." },
    hints: {
      root: "GEN-1", impacted: "HALL-A", price_asset: "SWGR-1",
      problem: "Weak utility feed during storms will push the site onto a generator and a UPS string with fading batteries",
      trend: { asset_id: "UPS-A", metric: "battery_health_pct", limit: 65 },
      outage_hours: 4, repair_hours: 3,
      steps: ["Load-test GEN-1 and top off fuel", "Replace degraded UPS-A battery modules (4 on site)", "Confirm transfer switch timing"],
      schedule: "Pre-start GEN-1 at 6 PM and hold until the storm cell passes",
      verify: { asset_id: "UPS-A", metric: "battery_health_pct", limit: 65, direction: "above" },
    },
    sim: { asset_id: "UPS-A", metric: "battery_health_pct", limit: 65, failing: "falling", normal: 97, hours: [20, 110] },
  },
  {
    id: "office-ahu",
    plain: { reported: "Water was found under an air handler on Floor 4 for the third time today.", problem: "an air handler on Floor 4 is leaking, and its drain pan was only patched last year" },
    label: "Office AHU leak",
    blurb: "Condensation under AHU-04 at Avon Center",
    property_id: "00000000-0000-0000-0000-000000000001",
    signal: { asset_id: "AHU-04", source: "ticket", metric: "leak_report", value: 1, message: "Third report this morning: moisture under the AHU-04 supply vent, east corridor warm." },
    hints: {
      root: "AHU-04", impacted: "FLOOR-4-EAST", price_asset: "AHU-04",
      problem: "AHU-04 drain pan leaking (patched in 2025), cooling to Floor 4 east degrading",
      trend: { asset_id: "AHU-04", metric: "condensate_level_pct", limit: 90 },
      outage_hours: 8, repair_hours: 3,
      steps: ["Replace AHU-04 drain pan (order, 3-day lead)", "Clear condensate line and dry ceiling void", "Moisture-check Floor 5 ceiling below"],
      verify: { asset_id: "AHU-04", metric: "condensate_level_pct", limit: 90, direction: "below" },
    },
    sim: { asset_id: "AHU-04", metric: "condensate_level_pct", limit: 90, failing: "rising", normal: 22, hours: [4, 30] },
  },
  {
    id: "northstar-panel",
    label: "Electrical panel overheating",
    blurb: "Lights flickering, panel 12B running hot",
    plain: { reported: "Floor 12 tenants report flickering lights again, and the electrical panel feels hot.", problem: "an electrical panel on Floor 12 is overheating and could cut power to the whole floor" },
    property_id: "00000000-0000-0000-0000-000000000002",
    signal: { asset_id: "PANEL-12B", source: "sensor", metric: "panel_temp_f", value: 131, message: "Panel 12B surface temperature 131F (normal under 100F); flicker reports from Floor 12 west." },
    hints: {
      root: "PANEL-12B", impacted: "FLOOR-12", price_asset: "PANEL-12B",
      problem: "Loose or overloaded breaker in PANEL-12B overheating; Floor 12 power and HVAC at risk",
      trend: { asset_id: "PANEL-12B", metric: "panel_temp_f", limit: 140 },
      outage_hours: 6, repair_hours: 3,
      steps: ["Thermal scan PANEL-12B and torque all terminations", "Replace the failing breaker", "Rebalance Floor 12 west circuits"],
      schedule: "Shed non-essential Floor 12 west lighting load until the panel is repaired",
      verify: { asset_id: "PANEL-12B", metric: "panel_temp_f", limit: 140, direction: "below" },
    },
    sim: { asset_id: "PANEL-12B", metric: "panel_temp_f", limit: 140, failing: "rising", normal: 96, hours: [6, 48] },
  },
  ...MORE,
];

/** A copy of the scenario's hints with outage and repair hours varied for this run. */
export function variedHints(h: Hints): Hints {
  const vary = (n: number, lo: number, hi: number, step = 1) => Math.max(step, Math.round((n * (lo + Math.random() * (hi - lo))) / step) * step);
  return { ...h, outage_hours: vary(h.outage_hours, 0.6, 1.7), repair_hours: vary(h.repair_hours, 0.75, 1.5, 0.5) };
}

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
/** Older runs used a few earlier names. */
const OLD_LABELS: Record<string, string> = { "Northstar panel": "Electrical panel overheating" };
export const scenarioByLabel = (label: string | null | undefined) => SCENARIOS.find((s) => s.label === (label && OLD_LABELS[label] ? OLD_LABELS[label] : label));
export const scenarioForProperty = (propertyId: string) => SCENARIOS.find((s) => s.property_id === propertyId);

/** A ready-to-use example for the "New Incident From Data" form, per piece of equipment. */
export type AssetExample = { sim: Sim; title: string; reported: string; outage_hours: number; repair_hours: number };

const EXTRA: AssetExample[] = [
  { title: "Utility voltage dropping", reported: "The main power line voltage keeps sagging a little lower each day.", outage_hours: 3, repair_hours: 4,
    sim: { asset_id: "UTIL-FEED-1", metric: "voltage_pct", limit: 88, failing: "falling", normal: 100, hours: [12, 96] } },
  { title: "Switchgear running hot", reported: "An infrared scan shows the main switchgear busbars getting hotter week over week.", outage_hours: 4, repair_hours: 5,
    sim: { asset_id: "SWGR-1", metric: "busbar_temp_f", limit: 150, failing: "rising", normal: 104, hours: [24, 120] } },
  { title: "Control system overloaded", reported: "The building control system is slowing down and its processor load keeps climbing.", outage_hours: 2, repair_hours: 3,
    sim: { asset_id: "BMS-1", metric: "cpu_load_pct", limit: 95, failing: "rising", normal: 35, hours: [12, 72] } },
  { title: "Condensate pump weakening", reported: "The condensate pump in Data hall A is drawing less current every day.", outage_hours: 3, repair_hours: 2,
    sim: { asset_id: "CRAH-A1", metric: "condensate_pump_amps", limit: 0.4, failing: "falling", normal: 1.4, hours: [8, 60] } },
];

/** One example per piece of equipment: taken from the problem types, plus a few extras for equipment without one. */
export const ASSET_EXAMPLES: Record<string, AssetExample> = Object.fromEntries([
  ...EXTRA.map((e) => [e.sim.asset_id, e] as const),
  ...[...SCENARIOS].reverse().filter((sc) => sc.sim).map((sc) => [sc.sim!.asset_id, { sim: sc.sim!, title: sc.label, reported: sc.plain.reported, outage_hours: sc.hints.outage_hours, repair_hours: sc.hints.repair_hours }] as const),
]);
