// The editable crew: per-agent instructions, tools, model, turn limit and on/off.
// Defaults come from roster.ts + prompts.ts; saved rows in agent_configs override them.

import { DEFAULT_INSTRUCTIONS } from "@/lib/agent/prompts";
import { levels } from "@/lib/flow";
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
  /** Specialists only: what this agent runs after ("lead" or another specialist's id). Empty = not connected. */
  after?: string[];
  /** Position on the Agents canvas. */
  x?: number;
  y?: number;
  /** Lead only: canvas positions of the fixed shapes (report, decide, approve). */
  pins?: Record<string, { x: number; y: number }>;
  /** Built-in specialists and Dispatch: taken off the crew (can be restored). The Lead cannot be removed. */
  removed?: boolean;
  /** Lead only: when the AI prepares a repair instead of a brief. */
  rules?: DecisionRules;
};

/** Prepare a repair when the cost of delay is at least `min_ratio` × the repair cost,
 *  or when failure is expected within `urgent_hours` regardless of cost. */
export type DecisionRules = { min_ratio: number; urgent_hours: number };
export const DEFAULT_RULES: DecisionRules = { min_ratio: 1, urgent_hours: 24 };

const DEFAULT_TURNS: Record<string, number> = { lead: 10, triage: 5, sensor: 5, lease: 5, dispatch: 6 };

export function defaultCrew(): AgentConfig[] {
  return ROSTER.map((a) => ({
    id: a.id, name: a.name, role: a.role, kind: a.kind, icon: a.icon, color: a.color,
    instructions: DEFAULT_INSTRUCTIONS[a.id] ?? "", tools: a.tools.map((x) => x.name), model: "",
    max_turns: DEFAULT_TURNS[a.id] ?? 5, enabled: true, builtin: true,
    ...(a.kind === "specialist" ? { after: ["lead"] } : {}),
  }));
}

const ICONS: IconKey[] = ["bot", "ticket", "activity", "scale", "truck", "zap", "history", "shield", "sparkles"];

const num = (v: unknown, fallback?: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-5000, Math.min(5000, Math.round(v))) : fallback);
function cleanPins(v: unknown, fallback?: AgentConfig["pins"]): AgentConfig["pins"] {
  if (!v || typeof v !== "object") return fallback;
  const out: NonNullable<AgentConfig["pins"]> = {};
  for (const k of ["report", "decide", "approve"]) {
    const p = (v as Record<string, { x?: unknown; y?: unknown }>)[k];
    const x = num(p?.x), y = num(p?.y);
    if (x != null && y != null) out[k] = { x, y };
  }
  return out;
}

function cleanRules(v: unknown, fallback?: DecisionRules): DecisionRules {
  const r = (v && typeof v === "object" ? v : {}) as Partial<DecisionRules>;
  const base = fallback ?? DEFAULT_RULES;
  const ratio = Number(r.min_ratio ?? base.min_ratio), hours = Number(r.urgent_hours ?? base.urgent_hours);
  return {
    min_ratio: Number.isFinite(ratio) ? Math.min(500, Math.max(0.5, Math.round(ratio * 10) / 10)) : base.min_ratio,
    urgent_hours: Number.isFinite(hours) ? Math.min(720, Math.max(0, Math.round(hours))) : base.urgent_hours,
  };
}

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
    after: base.kind !== "specialist" ? undefined
      : Array.isArray(input.after) ? [...new Set(input.after.filter((x): x is string => typeof x === "string" && /^[a-z0-9_]{1,40}$/.test(x) && x !== base.id))].slice(0, 8)
      : base.after ?? ["lead"],
    x: num(input.x, base.x), y: num(input.y, base.y),
    pins: base.kind === "lead" ? cleanPins(input.pins, base.pins) : undefined,
    removed: base.builtin && base.kind !== "lead" ? (typeof input.removed === "boolean" ? input.removed : base.removed) || undefined : undefined,
    rules: base.kind === "lead" ? cleanRules(input.rules, base.rules) : undefined,
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
  return normalizeCrew(crew);
}

/** Connections decide who runs: a specialist is on only if a path from the Lead reaches it.
 *  Older saves that switched a specialist off become "not connected". Links to removed agents are dropped. */
export function normalizeCrew(crew: AgentConfig[]): AgentConfig[] {
  const ids = new Set(crew.map((a) => a.id));
  // Keep connections outward from the Lead first, and drop only one that would close a loop
  // (the canvas blocks loops; this guards the API).
  const live = crew.filter((a) => !a.removed);
  const liveIds = new Set(live.map((a) => a.id));
  const wanted = new Map(crew.filter((a) => a.kind === "specialist").map((a) => {
    let after = a.removed ? [] : (a.after ?? ["lead"]).filter((u) => u === "lead" || (ids.has(u) && liveIds.has(u)));
    if (a.enabled === false && a.after === undefined) after = [];
    return [a.id, after] as const;
  }));
  const kept = new Map<string, string[]>([...wanted.keys()].map((id) => [id, []]));
  const upstream = (id: string, seen = new Set<string>()): Set<string> => {
    for (const u of kept.get(id) ?? []) if (!seen.has(u)) { seen.add(u); upstream(u, seen); }
    return seen;
  };
  const accept = (id: string, u: string) => {
    const list = kept.get(id)!;
    if (list.includes(u) || (u !== "lead" && (u === id || upstream(u).has(id)))) return false;
    list.push(u);
    return true;
  };
  const reached = new Set(["lead"]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, after] of wanted) for (const u of after) if (reached.has(u) && accept(id, u)) { reached.add(id); grew = true; }
  }
  for (const [id, after] of wanted) for (const u of after) accept(id, u); // links between switched-off agents are kept too
  const fixed = crew.map((a) => (a.kind === "specialist" ? { ...a, after: wanted.get(a.id)!.filter((u) => kept.get(a.id)!.includes(u)) } : a));
  const lv = levels(fixed);
  return fixed.map((a) =>
    a.kind === "specialist" ? { ...a, enabled: !a.removed && (lv.get(a.id) ?? 0) > 0 }
    : a.kind === "dispatch" && a.removed ? { ...a, enabled: false }
    : a.kind === "lead" ? { ...a, rules: a.rules ?? DEFAULT_RULES } : a);
}

export const specialistsOf = (crew: AgentConfig[]) => crew.filter((a) => a.kind === "specialist" && a.enabled);
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "agent";
