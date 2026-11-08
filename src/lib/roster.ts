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
  { name: "find_vendor", what: "Certified vendors, soonest first", source: "Vendors" },
  { name: "check_parts", what: "Spare parts on hand", source: "Parts" },
  { name: "draft_work_order", what: "Work order, waits for approval", source: "Approvals", writes: true },
  { name: "draft_schedule_change", what: "Schedule change, waits for approval", source: "Approvals", writes: true },
  { name: "draft_tenant_notice", what: "Tenant email, waits for approval", source: "Approvals", writes: true },
];
export const toolInfo = (name: string) => TOOL_LIBRARY.find((t) => t.name === name);

export const MODELS: { id: string; label: string }[] = [
  { id: "", label: "Server default (NEMOTRON_MODEL)" },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1.5", label: "Nemotron Super 49B v1.5" },
  { id: "nvidia/llama-3.1-nemotron-ultra-253b-v1", label: "Nemotron Ultra 253B" },
  { id: "nvidia/nvidia-nemotron-nano-9b-v2", label: "Nemotron Nano 9B v2" },
];

const t = (...names: string[]) => names.map((n) => { const i = toolInfo(n)!; return { name: i.name, what: i.what, writes: i.writes }; });

export const ROSTER: AgentMeta[] = [
  { id: "lead", name: "Lead agent", role: "Plans, delegates, prices the risk", owns: "The incident", color: "var(--a-lead)", icon: "bot", kind: "lead", tools: t("read_building_memory", "price_risk", "save_memory") },
  { id: "triage", name: "Ticket Triage", role: "Links small tickets into one problem", owns: "Work orders", color: "var(--a-triage)", icon: "ticket", kind: "specialist", tools: t("search_tickets", "link_tickets") },
  { id: "sensor", name: "Sensor Watch", role: "Spots drift, hours to the limit", owns: "Sensors", color: "var(--a-sensor)", icon: "activity", kind: "specialist", tools: t("get_dependencies", "get_readings", "detect_trend") },
  { id: "lease", name: "Lease / SLA", role: "Who gets hurt, $ per hour", owns: "Leases + weather", color: "var(--a-lease)", icon: "scale", kind: "specialist", tools: t("tenants_at_risk", "get_weather") },
  { id: "dispatch", name: "Dispatch", role: "Picks a vendor, drafts the fix", owns: "Vendors, parts, notices", color: "var(--a-dispatch)", icon: "truck", kind: "dispatch", tools: t("find_vendor", "check_parts", "draft_work_order", "draft_schedule_change", "draft_tenant_notice") },
];
export const BUILTIN_IDS = ROSTER.map((a) => a.id);

/** Starting points for a new specialist in the crew builder. */
export const TEMPLATES: { id: string; name: string; role: string; icon: IconKey; color: string; tools: string[]; instructions: string }[] = [
  {
    id: "energy", name: "Energy Watch", role: "Finds equipment burning extra power", icon: "zap", color: "#d4a017", tools: ["get_energy", "get_readings"],
    instructions: "You are Energy Watch. Call get_energy for the asset you were given (and its building), then get_readings if a spike needs context. Report usage vs baseline in percent, the anomaly score, and whether the extra load points to the same failing equipment.",
  },
  {
    id: "repeat", name: "Repeat-Failure Check", role: "Has this broken before?", icon: "history", color: "#c2410c", tools: ["past_incidents", "search_tickets"],
    instructions: "You are Repeat-Failure Check. Call past_incidents for the asset and the equipment that feeds it. Report every earlier work order or run on it, how long ago, and whether this looks like the same failure coming back.",
  },
  {
    id: "verify", name: "Second Opinion", role: "Re-checks the numbers before money moves", icon: "shield", color: "#0f766e", tools: ["detect_trend", "tenants_at_risk", "get_dependencies"],
    instructions: "You are Second Opinion. Independently re-run detect_trend and tenants_at_risk on the asset in question and confirm or challenge the time to failure and the dollars per hour. Report AGREE or DISAGREE with the numbers you got.",
  },
  { id: "blank", name: "New specialist", role: "Describe its job", icon: "sparkles", color: "#64748b", tools: ["get_readings"], instructions: "Describe what this agent should check and report." },
];

/** Fallback look for an agent id the UI does not know yet. */
export const agentMeta = (id: string): AgentMeta =>
  ROSTER.find((a) => a.id === id) ?? { id, name: id, role: "", owns: "", color: "#64748b", icon: "sparkles", kind: "specialist", tools: [] };
