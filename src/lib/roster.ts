// Client-safe description of the crew. The server agents read their tool lists from here too,
// so adding a tool to an agent shows up in the UI automatically.

export type AgentId = "lead" | "triage" | "sensor" | "lease" | "dispatch";

export type AgentMeta = {
  id: AgentId;
  name: string;
  role: string;
  owns: string;
  color: string; // CSS variable
  icon: "bot" | "ticket" | "activity" | "scale" | "truck";
  tools: { name: string; what: string; writes?: boolean }[];
};

export const ROSTER: AgentMeta[] = [
  {
    id: "lead", name: "Lead agent", role: "Plans, delegates, prices the risk", owns: "The incident as a whole", color: "var(--a-lead)", icon: "bot",
    tools: [
      { name: "read_building_memory", what: "What past runs learned about this building" },
      { name: "ask_triage", what: "Hand a question to Ticket Triage" },
      { name: "ask_sensor", what: "Hand a question to Sensor Watch" },
      { name: "ask_lease", what: "Hand a question to Lease / SLA" },
      { name: "price_risk", what: "Cost of waiting vs fixing now" },
      { name: "ask_dispatch", what: "Have Dispatch draft the fix" },
      { name: "save_memory", what: "Remember what this run learned", writes: true },
    ],
  },
  {
    id: "triage", name: "Ticket Triage", role: "Links small tickets into one problem", owns: "Work orders and technician notes", color: "var(--a-triage)", icon: "ticket",
    tools: [
      { name: "search_tickets", what: "Open tickets in this building" },
      { name: "link_tickets", what: "Group tickets that share a root cause" },
    ],
  },
  {
    id: "sensor", name: "Sensor Watch", role: "Spots drift, hours until the limit", owns: "Building-system telemetry", color: "var(--a-sensor)", icon: "activity",
    tools: [
      { name: "get_dependencies", what: "What an asset depends on and feeds" },
      { name: "get_readings", what: "Recent sensor readings" },
      { name: "detect_trend", what: "Fit a trend and estimate time to the limit" },
    ],
  },
  {
    id: "lease", name: "Lease / SLA", role: "Who gets hurt, penalty per hour", owns: "Leases, SLAs and the forecast", color: "var(--a-lease)", icon: "scale",
    tools: [
      { name: "tenants_at_risk", what: "Tenants downstream and their SLA exposure" },
      { name: "get_weather", what: "Live 2-day forecast (Open-Meteo)" },
    ],
  },
  {
    id: "dispatch", name: "Dispatch", role: "Picks a vendor, drafts the fix", owns: "Vendors, parts, notices", color: "var(--a-dispatch)", icon: "truck",
    tools: [
      { name: "find_vendor", what: "Certified vendors, soonest first" },
      { name: "check_parts", what: "Spare parts on hand" },
      { name: "draft_work_order", what: "Work order, waits for approval", writes: true },
      { name: "draft_schedule_change", what: "Building schedule change, waits for approval", writes: true },
      { name: "draft_tenant_notice", what: "Tenant email, waits for approval", writes: true },
    ],
  },
];

export const agentMeta = (id: string) => ROSTER.find((a) => a.id === id) ?? ROSTER[0];
export const SPECIALISTS = ROSTER.filter((a) => a.id !== "lead").map((a) => a.id);
