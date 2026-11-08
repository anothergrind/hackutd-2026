// Client-safe description of the crew: built-in agents, the tool library, models and specialist templates.
// Saved edits (src/lib/crew.ts) are layered on top of these defaults.

export type AgentId = string;
export type AgentKind = "lead" | "specialist" | "dispatch";
export type IconKey = "bot" | "ticket" | "activity" | "scale" | "truck" | "zap" | "history" | "shield" | "sparkles";

export type AgentMeta = {
  id: AgentId;
  name: string;
  role: string;
  owns: string;
  color: string; // CSS color or variable
  icon: IconKey;
  kind: AgentKind;
  tools: { name: string; what: string; writes?: boolean }[];
};

export type ToolInfo = { name: string; what: string; source: string; writes?: boolean; leadOnly?: boolean };

/** Every tool an agent can be given. ask_* delegation tools are generated per enabled specialist. */
export const TOOL_LIBRARY: ToolInfo[] = [
  { name: "read_building_memory", what: "What past runs learned about this building", source: "Building memory", leadOnly: true },
  { name: "price_risk", what: "Cost of waiting vs fixing now", source: "Tenants + math", leadOnly: true },
  { name: "save_memory", what: "Remember what this run learned", source: "Building memory", writes: true, leadOnly: true },
  { name: "search_tickets", what: "Open tickets in this building", source: "Work orders" },
  { name: "link_tickets", what: "Group tickets that share a root cause", source: "Work orders" },
  { name: "past_incidents", what: "Earlier work orders and runs on an asset", source: "Work orders" },
  { name: "get_dependencies", what: "What an asset depends on and feeds", source: "Asset graph" },
  { name: "get_readings", what: "Recent sensor readings", source: "Sensors" },
  { name: "detect_trend", what: "Fit a trend, estimate time to the limit", source: "Sensors" },
  { name: "get_energy", what: "Energy use vs baseline, anomaly score", source: "Energy meters" },
  { name: "tenants_at_risk", what: "Tenants downstream and their SLA exposure", source: "Leases" },
  { name: "get_weather", what: "Live 2-day forecast (Open-Meteo)", source: "Weather API" },
  { name: "get_weather_alerts", what: "Active NWS watches and warnings", source: "National Weather Service" },
  { name: "lease_responsibility", what: "Who pays for the repair, per the lease", source: "Leases" },
  { name: "find_vendor", what: "Certified vendors, soonest first", source: "Vendors" },
  { name: "check_parts", what: "Spare parts on hand", source: "Parts" },
  { name: "draft_work_order", what: "Work order, waits for approval", source: "Approvals", writes: true },
  { name: "draft_schedule_change", what: "Schedule change, waits for approval", source: "Approvals", writes: true },
  { name: "draft_tenant_notice", what: "Tenant email, waits for approval", source: "Approvals", writes: true },
];
export const toolInfo = (name: string) => TOOL_LIBRARY.find((t) => t.name === name);

export const MODELS: { id: string; label: string }[] = [
  { id: "", label: "Server default (NEMOTRON_MODEL)" },
  // All four pass `npm run smoke` (tool calling) on build.nvidia.com as of Nov 2026.
  { id: "nvidia/nemotron-3.5-super-vl-120b-a12b", label: "Nemotron 3.5 Super 120B" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", label: "Nemotron 3 Ultra 550B" },
  { id: "nvidia/nemotron-3.5-bolt-e4b", label: "Nemotron 3.5 Bolt (small, fast)" },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni 30B" },
];

const t = (...names: string[]) => names.map((n) => { const i = toolInfo(n)!; return { name: i.name, what: i.what, writes: i.writes }; });

export const ROSTER: AgentMeta[] = [
  { id: "lead", name: "Lead agent", role: "Plans the work and prices the risk", owns: "The incident", color: "var(--a-lead)", icon: "bot", kind: "lead", tools: t("read_building_memory", "price_risk", "save_memory") },
  { id: "triage", name: "Ticket Triage", role: "Links related tickets into one problem", owns: "Work orders", color: "var(--a-triage)", icon: "ticket", kind: "specialist", tools: t("search_tickets", "link_tickets") },
  { id: "sensor", name: "Sensor Watch", role: "Tracks sensor trends and time to failure", owns: "Sensors", color: "var(--a-sensor)", icon: "activity", kind: "specialist", tools: t("get_dependencies", "get_readings", "detect_trend") },
  { id: "lease", name: "Lease / SLA", role: "Finds affected tenants and who pays", owns: "Leases + weather", color: "var(--a-lease)", icon: "scale", kind: "specialist", tools: t("tenants_at_risk", "lease_responsibility", "get_weather", "get_weather_alerts") },
  { id: "dispatch", name: "Dispatch", role: "Picks a vendor and drafts the repair", owns: "Vendors, parts, notices", color: "var(--a-dispatch)", icon: "truck", kind: "dispatch", tools: t("find_vendor", "check_parts", "tenants_at_risk", "draft_work_order", "draft_schedule_change", "draft_tenant_notice") },
];
export const BUILTIN_IDS = ROSTER.map((a) => a.id);

/** Starting points for a new specialist in the crew builder. */
export const TEMPLATES: { id: string; name: string; role: string; icon: IconKey; color: string; tools: string[]; instructions: string }[] = [
  {
    id: "energy", name: "Energy Watch", role: "Finds equipment using extra power", icon: "zap", color: "#a08a3c", tools: ["get_energy", "get_readings"],
    instructions: "You are Energy Watch. Call get_energy for the asset you were given (and its building), then get_readings if a spike needs context. Report usage vs baseline in percent, the anomaly score, and whether the extra load points to the same failing equipment.",
  },
  {
    id: "repeat", name: "Repeat-Failure Check", role: "Checks for past failures", icon: "history", color: "#7f5539", tools: ["past_incidents", "search_tickets"],
    instructions: "You are Repeat-Failure Check. Call past_incidents for the asset and the equipment that feeds it. Report every earlier work order or run on it, how long ago, and whether this looks like the same failure coming back.",
  },
  {
    id: "verify", name: "Second Opinion", role: "Re-checks the numbers before approval", icon: "shield", color: "#2f6f73", tools: ["detect_trend", "tenants_at_risk", "get_dependencies"],
    instructions: "You are Second Opinion. Independently re-run detect_trend and tenants_at_risk on the asset in question and confirm or challenge the time to failure and the dollars per hour. Report AGREE or DISAGREE with the numbers you got.",
  },
  {
    id: "weather", name: "Weather Watch", role: "Checks the forecast for extra risk", icon: "activity", color: "#3e6e8e", tools: ["get_weather", "get_readings"],
    instructions: "You are Weather Watch. Call get_weather for the asset's building and get_readings for the asset. Report whether heat, storms or wind in the next two days make a failure more likely or the repair harder.",
  },
  {
    id: "tenants", name: "Tenant Impact", role: "Finds who is affected and who pays", icon: "scale", color: "#4a5a8a", tools: ["tenants_at_risk", "lease_responsibility"],
    instructions: "You are Tenant Impact. Call tenants_at_risk and lease_responsibility for the asset. Report which tenants lose service, the penalty per hour, and whether the landlord or a tenant pays for the repair, quoting the lease clause.",
  },
  {
    id: "vendors", name: "Vendor Scout", role: "Finds the soonest vendor and spare parts", icon: "truck", color: "#5f7d4a", tools: ["find_vendor", "check_parts"],
    instructions: "You are Vendor Scout. Call find_vendor and check_parts for the asset. Report the soonest certified vendor, the estimated cost, and whether spare parts are on site.",
  },
  {
    id: "deps", name: "Dependency Mapper", role: "Maps what else would go down", icon: "zap", color: "#6b5a7a", tools: ["get_dependencies"],
    instructions: "You are Dependency Mapper. Call get_dependencies for the asset. Report everything it feeds and everything it depends on, and which of those would fail with it.",
  },
  {
    id: "tickets", name: "Ticket Scanner", role: "Finds open tickets in the building", icon: "ticket", color: "#8a6a3a", tools: ["search_tickets", "past_incidents"],
    instructions: "You are Ticket Scanner. Call search_tickets for the last 30 days and past_incidents for the asset. Report the open tickets that mention the same equipment and any earlier repairs.",
  },
  {
    id: "trend", name: "Trend Analyst", role: "Estimates time until a limit is crossed", icon: "activity", color: "#2f5f6f", tools: ["get_readings", "detect_trend"],
    instructions: "You are Trend Analyst. Call get_readings and detect_trend for the asset. Report the trend per day, the hours until the limit, and how confident the fit is in plain words.",
  },
  { id: "blank", name: "New specialist", role: "Describe its job", icon: "sparkles", color: "#64748b", tools: ["get_readings"], instructions: "Describe what this agent should check and report." },
];

/** Fallback look for an agent id the UI does not know yet. */
export const agentMeta = (id: string): AgentMeta =>
  ROSTER.find((a) => a.id === id) ?? { id, name: id, role: "", owns: "", color: "#64748b", icon: "sparkles", kind: "specialist", tools: [] };
