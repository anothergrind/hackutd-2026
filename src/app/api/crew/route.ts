import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sanitize, slug, type AgentConfig } from "@/lib/crew";
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

// POST { template_id } -> adds a custom specialist from a template.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  const tpl = TEMPLATES.find((t) => t.id === input.template_id);
  if (!tpl) return bad(`Unknown template_id. Try: ${TEMPLATES.map((t) => t.id).join(", ")}`);
  const db = createSupabaseAdminClient();
  const crew = await loadCrew(db);
  if (crew.filter((a) => !a.builtin).length >= 6) return bad("At most 6 custom specialists.");
  const id = `${slug(tpl.name)}_${randomUUID().slice(0, 4)}`;
  const base: AgentConfig = { id, name: tpl.name, role: tpl.role, kind: "specialist", icon: tpl.icon, color: tpl.color, instructions: tpl.instructions, tools: tpl.tools, model: "", max_turns: 4, enabled: true, builtin: false };
  const clean = sanitize({}, base);
  if (typeof clean === "string") return bad(clean);
  await saveAgent(db, clean);
  return NextResponse.json({ agent: clean }, { status: 201 });
});
