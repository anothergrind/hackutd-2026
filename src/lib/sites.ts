import { scenarioByLabel, type Scenario } from "@/lib/scenarios";

// More buildings for the demo portfolio. Each one is a copy of an original building (same kind of equipment,
// tenants, leases, parts and history) with its own name, address and equipment tags, so the same problem type
// can happen in different buildings. Equipment tags get the building's code in front, e.g. PLN-CRAH-A1.

const DC1 = "00000000-0000-0000-0000-000000000003", CENTER = "00000000-0000-0000-0000-000000000001", NORTHSTAR = "00000000-0000-0000-0000-000000000002";

/** `quiet` buildings start healthy (no open tickets or energy anomalies) and never get demo incidents. */
export type Site = { code: string; from: string; id: string; name: string; address: string; building_type: string; lat: number; lon: number; quiet?: boolean };

export const SITES: Site[] = [
  { code: "PLN", from: DC1, id: "00000000-0000-0000-0000-000000000013", name: "Plano DC2", address: "6100 Legacy Drive, Plano, TX", building_type: "Data center", lat: 33.0776, lon: -96.8236 },
  { code: "IRV", from: DC1, id: "00000000-0000-0000-0000-000000000023", name: "Irving DC3", address: "7600 Las Colinas Blvd, Irving, TX", building_type: "Data center", lat: 32.8902, lon: -96.9578 },
  { code: "AUS", from: DC1, id: "00000000-0000-0000-0000-000000000033", name: "Austin DC4", address: "9800 N Lamar Blvd, Austin, TX", building_type: "Data center", lat: 30.372, lon: -97.697 },
  { code: "LGT", from: CENTER, id: "00000000-0000-0000-0000-000000000011", name: "Legacy Tower", address: "5800 Granite Parkway, Plano, TX", building_type: "Mixed-use", lat: 33.0807, lon: -96.8186 },
  { code: "UPT", from: CENTER, id: "00000000-0000-0000-0000-000000000021", name: "Uptown Plaza", address: "2500 McKinney Ave, Dallas, TX", building_type: "Mixed-use", lat: 32.7979, lon: -96.8031 },
  { code: "GAL", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000012", name: "Galleria Office Park", address: "13355 Noel Road, Dallas, TX", building_type: "Office", lat: 32.9306, lon: -96.8199 },
  { code: "FRS", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000022", name: "Frisco Commons", address: "3000 Internet Blvd, Frisco, TX", building_type: "Office", lat: 33.1023, lon: -96.8285 },
  { code: "HOU", from: DC1, id: "00000000-0000-0000-0000-000000000043", name: "Houston DC5", address: "5150 Westway Park Blvd, Houston, TX", building_type: "Data center", lat: 29.8435, lon: -95.5566 },
  { code: "RCS", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000032", name: "Richardson Square", address: "1201 E Campbell Road, Richardson, TX", building_type: "Office", lat: 32.9773, lon: -96.7064 },
  { code: "SUG", from: CENTER, id: "00000000-0000-0000-0000-000000000031", name: "Sugar Land Plaza", address: "2245 Texas Drive, Sugar Land, TX", building_type: "Mixed-use", lat: 29.5966, lon: -95.6216 },
  { code: "SAT", from: DC1, id: "00000000-0000-0000-0000-000000000053", name: "San Antonio DC6", address: "5455 Rogers Road, San Antonio, TX", building_type: "Data center", lat: 29.4952, lon: -98.6886, quiet: true },
  { code: "FTW", from: DC1, id: "00000000-0000-0000-0000-000000000063", name: "Fort Worth DC7", address: "4800 Alliance Gateway, Fort Worth, TX", building_type: "Data center", lat: 32.9726, lon: -97.3097, quiet: true },
  { code: "DOM", from: CENTER, id: "00000000-0000-0000-0000-000000000041", name: "Domain Tower", address: "11601 Alterra Parkway, Austin, TX", building_type: "Mixed-use", lat: 30.4021, lon: -97.7254, quiet: true },
  { code: "LCC", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000042", name: "Las Colinas Center", address: "5221 N O'Connor Blvd, Irving, TX", building_type: "Office", lat: 32.8807, lon: -96.9481, quiet: true },
  { code: "ADP", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000052", name: "Addison Point", address: "15455 Dallas Parkway, Addison, TX", building_type: "Office", lat: 32.9562, lon: -96.8227, quiet: true },
];

/** Original building names, replaced in copied notes and tickets. */
export const BASE_NAMES: Record<string, string> = { [DC1]: "Avon DC1", [CENTER]: "Avon Center", [NORTHSTAR]: "Northstar Tower" };

const CODE_RE = new RegExp(`^(?:${SITES.map((s) => s.code).join("|")})-`);
/** The original equipment tag behind a copied one (PLN-CRAH-A1 → CRAH-A1). */
export const baseAsset = (id: string) => id.replace(CODE_RE, "");
export const siteByProperty = (propertyId: string | null | undefined) => SITES.find((s) => s.id === propertyId);
/** The buildings a scenario can happen in: its original one and every copy of it (null = the original). */
export const sitesFor = (propertyId: string) => [null, ...SITES.filter((s) => s.from === propertyId && !s.quiet)];

/** Replaces equipment tags (and the building name) in any JSON-able value with the copy's. */
export function remap<T>(value: T, site: Site, assetIds: string[]): T {
  if (!assetIds.length) return value;
  const ids = [...assetIds].sort((a, b) => b.length - a.length).map((a) => a.replace(/[-]/g, "\\-"));
  const re = new RegExp(`(?<![A-Za-z0-9-])(${ids.join("|")})(?![A-Za-z0-9-])`, "g");
  let json = JSON.stringify(value).replace(re, `${site.code}-$1`);
  const base = BASE_NAMES[site.from];
  if (base) json = json.split(base).join(site.name);
  return JSON.parse(json) as T;
}

/** Equipment tags a scenario mentions (sensor, signal and hints). */
const tagsOf = (sc: Scenario) => [...new Set((JSON.stringify(sc).match(/\b[A-Z]+(?:-[A-Z0-9]+)+\b/g) ?? []).filter((t) => !CODE_RE.test(t)))];

/** The scenario as it happens in another building. */
export function scenarioAt(sc: Scenario, site: Site | null | undefined): Scenario {
  if (!site) return sc;
  const { id, label } = sc;
  return { ...remap(sc, site, tagsOf(sc)), id, label, property_id: site.id };
}

/** The scenario behind a run, with the equipment tags of the building it ran in. */
export function scenarioOfRun(run: { title: string | null; property_id?: string | null }): Scenario | undefined {
  const sc = scenarioByLabel(run.title);
  return sc && scenarioAt(sc, siteByProperty(run.property_id));
}
