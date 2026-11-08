import { scenarioByLabel, type Scenario } from "@/lib/scenarios";

// More buildings for the demo portfolio. Each one is a copy of an original building (same kind of equipment,
// tenants, leases, parts and history) with its own name, address and equipment tags, so the same problem type
// can happen in different buildings. Equipment tags get the building's code in front, e.g. PLN-CRAH-A1.

const DC1 = "00000000-0000-0000-0000-000000000003", CENTER = "00000000-0000-0000-0000-000000000001", NORTHSTAR = "00000000-0000-0000-0000-000000000002";

/** `quiet` buildings start healthy (no open tickets or energy anomalies) and never get demo incidents. */
export type Site = { code: string; from: string; id: string; name: string; address: string; building_type: string; lat: number; lon: number; quiet?: boolean };

// Every building is a real building at its real address. The incidents in this demo are simulated.
export const SITES: Site[] = [
  // Data centers (equipment copied from the original data center)
  { code: "PLN", from: DC1, id: "00000000-0000-0000-0000-000000000013", name: "2323 Bryan Street", address: "2323 Bryan Street, Dallas, TX", building_type: "Data center", lat: 32.7907, lon: -96.7957 },
  { code: "IRV", from: DC1, id: "00000000-0000-0000-0000-000000000023", name: "1649 West Frankford", address: "1649 W Frankford Road, Carrollton, TX", building_type: "Data center", lat: 33.0005, lon: -96.9172 },
  { code: "AUS", from: DC1, id: "00000000-0000-0000-0000-000000000033", name: "7000 Burleson Road", address: "7000 Burleson Road, Austin, TX", building_type: "Data center", lat: 30.205, lon: -97.702 },
  { code: "HOU", from: DC1, id: "00000000-0000-0000-0000-000000000043", name: "1301 Fannin Street", address: "1301 Fannin Street, Houston, TX", building_type: "Data center", lat: 29.7543, lon: -95.365 },
  { code: "LNG", from: DC1, id: "00000000-0000-0000-0000-000000000073", name: "6431 Longhorn Drive", address: "6431 Longhorn Drive, Irving, TX", building_type: "Data center", lat: 32.908, lon: -96.9711 },
  { code: "SAT", from: DC1, id: "00000000-0000-0000-0000-000000000053", name: "850 East Collins", address: "850 E Collins Blvd, Richardson, TX", building_type: "Data center", lat: 32.9851, lon: -96.7117, quiet: true },
  { code: "FTW", from: DC1, id: "00000000-0000-0000-0000-000000000063", name: "4500 Like Way", address: "4500 Like Way, Fort Worth, TX", building_type: "Data center", lat: 32.9587, lon: -97.323, quiet: true },
  // Office towers (equipment copied from the original office tower with the air handler)
  { code: "LGT", from: CENTER, id: "00000000-0000-0000-0000-000000000011", name: "Bank of America Plaza", address: "901 Main Street, Dallas, TX", building_type: "Office", lat: 32.779, lon: -96.802 },
  { code: "UPT", from: CENTER, id: "00000000-0000-0000-0000-000000000021", name: "Trammell Crow Center", address: "2001 Ross Avenue, Dallas, TX", building_type: "Office", lat: 32.7883, lon: -96.8013 },
  { code: "SUG", from: CENTER, id: "00000000-0000-0000-0000-000000000031", name: "Frost Bank Tower", address: "401 Congress Avenue, Austin, TX", building_type: "Office", lat: 30.2665, lon: -97.743 },
  { code: "TGT", from: CENTER, id: "00000000-0000-0000-0000-000000000051", name: "Thanksgiving Tower", address: "1601 Elm Street, Dallas, TX", building_type: "Office", lat: 32.7815, lon: -96.798 },
  { code: "JPM", from: CENTER, id: "00000000-0000-0000-0000-000000000071", name: "JPMorgan Chase Tower", address: "2200 Ross Avenue, Dallas, TX", building_type: "Office", lat: 32.787, lon: -96.799 },
  { code: "DOM", from: CENTER, id: "00000000-0000-0000-0000-000000000041", name: "One Shell Plaza", address: "910 Louisiana Street, Houston, TX", building_type: "Office", lat: 29.7597, lon: -95.3666, quiet: true },
  { code: "PNZ", from: CENTER, id: "00000000-0000-0000-0000-000000000061", name: "Pennzoil Place", address: "711 Louisiana Street, Houston, TX", building_type: "Office", lat: 29.7605, lon: -95.3627, quiet: true },
  // Office towers (equipment copied from the original office tower with the electrical panel)
  { code: "GAL", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000012", name: "Williams Tower", address: "2800 Post Oak Boulevard, Houston, TX", building_type: "Office", lat: 29.7398, lon: -95.4616 },
  { code: "FRS", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000022", name: "Renaissance Tower", address: "1201 Elm Street, Dallas, TX", building_type: "Office", lat: 32.7818, lon: -96.7994 },
  { code: "RCS", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000032", name: "Wells Fargo Plaza", address: "1000 Louisiana Street, Houston, TX", building_type: "Office", lat: 29.757, lon: -95.368 },
  { code: "HRT", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000072", name: "Heritage Plaza", address: "1111 Bagby Street, Houston, TX", building_type: "Office", lat: 29.7584, lon: -95.3712 },
  { code: "FTS", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000092", name: "Frost Tower", address: "111 W Houston Street, San Antonio, TX", building_type: "Office", lat: 29.426, lon: -98.495 },
  { code: "LCC", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000042", name: "Burnett Plaza", address: "801 Cherry Street, Fort Worth, TX", building_type: "Office", lat: 32.7495, lon: -97.3313, quiet: true },
  { code: "ADP", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000052", name: "Weston Centre", address: "112 E Pecan Street, San Antonio, TX", building_type: "Office", lat: 29.4277, lon: -98.4925, quiet: true },
  { code: "TLB", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000062", name: "Tower Life Building", address: "310 S St Mary's Street, San Antonio, TX", building_type: "Office", lat: 29.4219, lon: -98.4913, quiet: true },
  { code: "CRS", from: NORTHSTAR, id: "00000000-0000-0000-0000-000000000082", name: "The Crescent", address: "200 Crescent Court, Dallas, TX", building_type: "Office", lat: 32.795, lon: -96.8035, quiet: true },
];

/** The three original buildings, renamed to real buildings at their real addresses. */
export const ORIGINALS = [
  { id: DC1, name: "Dallas Infomart", address: "1950 N Stemmons Freeway, Dallas, TX", building_type: "Data center", lat: 32.8016, lon: -96.8205 },
  { id: CENTER, name: "Comerica Bank Tower", address: "1717 Main Street, Dallas, TX", building_type: "Office", lat: 32.7803, lon: -96.7985 },
  { id: NORTHSTAR, name: "Fountain Place", address: "1445 Ross Avenue, Dallas, TX", building_type: "Office", lat: 32.7843, lon: -96.801 },
];

/** Earlier made-up names, replaced in old notes, tickets and incident text by scripts/rename-buildings.ts. */
export const OLD_NAMES: Record<string, string> = {
  "Avon DC1": "Dallas Infomart", "Avon Center": "Comerica Bank Tower", "Northstar Tower": "Fountain Place",
  "Plano DC2": "2323 Bryan Street", "Irving DC3": "1649 West Frankford", "Austin DC4": "7000 Burleson Road", "Houston DC5": "1301 Fannin Street",
  "San Antonio DC6": "850 East Collins", "Fort Worth DC7": "4500 Like Way", "Legacy Tower": "Bank of America Plaza", "Uptown Plaza": "Trammell Crow Center",
  "Sugar Land Plaza": "Frost Bank Tower", "Domain Tower": "One Shell Plaza", "Galleria Office Park": "Williams Tower", "Frisco Commons": "Renaissance Tower",
  "Richardson Square": "Wells Fargo Plaza", "Las Colinas Center": "Burnett Plaza", "Addison Point": "Weston Centre",
};

/** Original building names, replaced in copied notes and tickets. */
export const BASE_NAMES: Record<string, string> = Object.fromEntries(ORIGINALS.map((o) => [o.id, o.name]));

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
