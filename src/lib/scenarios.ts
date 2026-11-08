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
};

const DC1 = "00000000-0000-0000-0000-000000000003";

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
      problem: "Weak utility feed during storms will push the site onto a generator and a UPS string at 71% health",
      outage_hours: 4, repair_hours: 3,
      steps: ["Load-test GEN-1 and top off fuel", "Replace degraded UPS-A battery modules (4 on site)", "Confirm transfer switch timing"],
      schedule: "Pre-start GEN-1 at 6 PM and hold until the storm cell passes",
    },
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
      outage_hours: 8, repair_hours: 3,
      steps: ["Replace AHU-04 drain pan (order, 3-day lead)", "Clear condensate line and dry ceiling void", "Moisture-check Floor 5 ceiling below"],
    },
  },
  {
    id: "northstar-panel",
    label: "Northstar panel",
    blurb: "Lights flickering, panel 12B running hot",
    plain: { reported: "Floor 12 tenants report flickering lights again, and the electrical panel feels hot.", problem: "an electrical panel on Floor 12 is overheating and could cut power to the whole floor" },
    property_id: "00000000-0000-0000-0000-000000000002",
    signal: { asset_id: "PANEL-12B", source: "sensor", metric: "panel_temp_f", value: 131, message: "Panel 12B surface temperature 131F (normal under 100F); flicker reports from Floor 12 west." },
    hints: {
      root: "PANEL-12B", impacted: "FLOOR-12", price_asset: "PANEL-12B",
      problem: "Loose or overloaded breaker in PANEL-12B overheating; Floor 12 power and HVAC at risk",
      outage_hours: 6, repair_hours: 3,
      steps: ["Thermal scan PANEL-12B and torque all terminations", "Replace the failing breaker", "Rebalance Floor 12 west circuits"],
      schedule: "Shed non-essential Floor 12 west lighting load until the panel is repaired",
    },
  },
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
export const scenarioByLabel = (label: string | null | undefined) => SCENARIOS.find((s) => s.label === label);
export const scenarioForProperty = (propertyId: string) => SCENARIOS.find((s) => s.property_id === propertyId);
