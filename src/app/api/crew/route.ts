import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeCrew, sanitize, slug, type AgentConfig } from "@/lib/crew";
import { loadCrew, saveAgent } from "@/lib/crewStore";
import { bad, body, handle } from "@/lib/http";
import { MODELS, TEMPLATES, TOOL_LIBRARY } from "@/lib/roster";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET -> the crew (defaults + saved edits + custom specialists) and what the builder can offer.
export const GET = handle(async () => {
  const crew = await loadCrew(createSupabaseAdminClient());
  return NextResponse.json({ crew, tools: TOOL_LIBRARY, models: MODELS, templates: TEMPLATES });
});

// POST { template_id, x?, y?, after? } -> adds a custom specialist from a template, optionally at a canvas spot.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  // { duplicate_of } -> copies an existing specialist (settings and connections) as a new custom agent.
  if (typeof input.duplicate_of === "string") {
    const db = createSupabaseAdminClient();
    const crew = await loadCrew(db);
    const src = crew.find((a) => a.id === input.duplicate_of && a.kind === "specialist");
    if (!src) return bad("Only specialists can be duplicated.");
    if (crew.filter((a) => !a.builtin).length >= 10) return bad("At most 10 custom specialists.");
    const base: AgentConfig = { ...src, id: `${slug(src.name)}_${randomUUID().slice(0, 4)}`, name: `${src.name} (copy)`.slice(0, 40), builtin: false, removed: undefined, x: src.x != null ? src.x + 40 : undefined, y: src.y != null ? src.y + 40 : undefined };
    const clean = sanitize({}, base);
    if (typeof clean === "string") return bad(clean);
    await saveAgent(db, clean);
    return NextResponse.json({ agent: normalizeCrew([...crew, clean]).find((a) => a.id === clean.id) ?? clean }, { status: 201 });
  }
  const tpl = TEMPLATES.find((t) => t.id === input.template_id);
  if (!tpl) return bad(`Unknown template_id. Try: ${TEMPLATES.map((t) => t.id).join(", ")}`);
  const db = createSupabaseAdminClient();
  const crew = await loadCrew(db);
  if (crew.filter((a) => !a.builtin).length >= 10) return bad("At most 10 custom specialists.");
  const id = `${slug(tpl.name)}_${randomUUID().slice(0, 4)}`;
  const base: AgentConfig = { id, name: tpl.name, role: tpl.role, kind: "specialist", icon: tpl.icon, color: tpl.color, instructions: tpl.instructions, tools: tpl.tools, model: "", max_turns: 4, enabled: true, builtin: false, after: ["lead"] };
  const clean = sanitize({ x: input.x, y: input.y, after: input.after } as Partial<AgentConfig>, base);
  if (typeof clean === "string") return bad(clean);
  await saveAgent(db, clean);
  // Report the agent as the canvas will see it: on only if something connects to it.
  const added = normalizeCrew([...crew, clean]).find((a) => a.id === clean.id) ?? clean;
  return NextResponse.json({ agent: added }, { status: 201 });
});

// PUT { agents: [{ id, x, y, after? }], dispatch_on, pins } -> saves the Agents canvas: positions and connections.
export const PUT = handle(async (request: Request) => {
  const input = await body(request);
  if (!Array.isArray(input.agents)) return bad("Need agents: [{ id, x, y, after }].");
  const db = createSupabaseAdminClient();
  const crew = await loadCrew(db);
  const edits = new Map((input.agents as Partial<AgentConfig>[]).filter((a) => typeof a?.id === "string").map((a) => [a.id as string, a]));
  const next = crew.map((a) => {
    const e = edits.get(a.id) ?? {};
    const patch: Partial<AgentConfig> = { ...a, x: e.x, y: e.y };
    if (a.kind === "specialist" && Array.isArray(e.after)) patch.after = e.after;
    if (a.kind === "dispatch" && typeof input.dispatch_on === "boolean") patch.enabled = input.dispatch_on;
    if (a.kind === "lead") patch.pins = input.pins as AgentConfig["pins"];
    const clean = sanitize(patch, a);
    return typeof clean === "string" ? a : clean;
  });
  const saved = normalizeCrew(next);
  for (const a of saved) await saveAgent(db, a);
  return NextResponse.json({ crew: saved });
});
