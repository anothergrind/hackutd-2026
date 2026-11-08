// The editable crew: per-agent instructions, tools, model, turn limit and on/off.
// Defaults come from roster.ts + prompts.ts; saved rows in agent_configs override them.

import { DEFAULT_INSTRUCTIONS } from "@/lib/agent/prompts";
import { MODELS, ROSTER, TOOL_LIBRARY, type AgentKind, type IconKey } from "@/lib/roster";

export type AgentConfig = {
  id: string;
  name: string;
  role: string;
  kind: AgentKind;
  icon: IconKey;
  color: string;
  instructions: string;
  tools: string[];
  model: string; // "" = server default
  max_turns: number;
  enabled: boolean;
  builtin: boolean;
};

const DEFAULT_TURNS: Record<string, number> = { lead: 10, triage: 5, sensor: 5, lease: 5, dispatch: 6 };

export function defaultCrew(): AgentConfig[] {
  return ROSTER.map((a) => ({
    id: a.id, name: a.name, role: a.role, kind: a.kind, icon: a.icon, color: a.color,
    instructions: DEFAULT_INSTRUCTIONS[a.id] ?? "", tools: a.tools.map((x) => x.name), model: "",
    max_turns: DEFAULT_TURNS[a.id] ?? 5, enabled: true, builtin: true,
  }));
}

const ICONS: IconKey[] = ["bot", "ticket", "activity", "scale", "truck", "zap", "history", "shield", "sparkles"];

/** Cleans a config coming from the browser. Returns an error string or the safe config. */
export function sanitize(input: Partial<AgentConfig>, base: AgentConfig): AgentConfig | string {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 40) : base.name;
  if (!name) return "Name is required.";
  const instructions = typeof input.instructions === "string" ? input.instructions.trim().slice(0, 4000) : base.instructions;
  if (!instructions) return "Instructions are required.";
  const known = new Set(TOOL_LIBRARY.map((x) => x.name));
  let tools = Array.isArray(input.tools) ? input.tools.filter((x): x is string => typeof x === "string" && known.has(x)) : base.tools;
  // Lead-only tools stay with the lead; the lead always keeps them.
  const leadOnly = new Set(TOOL_LIBRARY.filter((x) => x.leadOnly).map((x) => x.name));
  if (base.kind === "lead") tools = [...new Set([...tools, ...leadOnly])];
  else tools = tools.filter((x) => !leadOnly.has(x));
  if (!tools.length) return "Pick at least one tool.";
  const model = typeof input.model === "string" && MODELS.some((m) => m.id === input.model) ? input.model : base.model;
  const turns = Number(input.max_turns ?? base.max_turns);
  return {
    ...base, name, instructions, tools: [...new Set(tools)], model,
    role: typeof input.role === "string" ? input.role.trim().slice(0, 60) : base.role,
    icon: typeof input.icon === "string" && ICONS.includes(input.icon as IconKey) ? (input.icon as IconKey) : base.icon,
    color: typeof input.color === "string" && /^(#[0-9a-fA-F]{6}|var\(--a-[a-z]+\))$/.test(input.color) ? input.color : base.color,
    max_turns: Number.isFinite(turns) ? Math.min(12, Math.max(2, Math.round(turns))) : base.max_turns,
    // The lead always runs.
    enabled: base.kind === "lead" ? true : typeof input.enabled === "boolean" ? input.enabled : base.enabled,
  };
}

/** Defaults overlaid with saved rows, plus saved custom specialists. Lead first, Dispatch last. */
export function mergeCrew(saved: { id: string; config: Partial<AgentConfig> }[]): AgentConfig[] {
  const byId = new Map(saved.map((r) => [r.id, r.config]));
  const crew = defaultCrew().map((d) => {
    const s = byId.get(d.id);
    if (!s) return d;
    const clean = sanitize(s, d);
    return typeof clean === "string" ? d : clean;
  });
  for (const r of saved) {
    if (crew.some((c) => c.id === r.id)) continue;
    const base: AgentConfig = { id: r.id, name: "Specialist", role: "", kind: "specialist", icon: "sparkles", color: "#64748b", instructions: "Report what you find.", tools: ["get_readings"], model: "", max_turns: 4, enabled: true, builtin: false };
    const clean = sanitize(r.config, base);
    if (typeof clean !== "string") crew.splice(crew.length - 1, 0, clean);
  }
  return crew;
}

export const specialistsOf = (crew: AgentConfig[]) => crew.filter((a) => a.kind === "specialist" && a.enabled);
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "agent";
