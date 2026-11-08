import { NextResponse } from "next/server";
import { defaultCrew, sanitize, type AgentConfig } from "@/lib/crew";
import { deleteAgent, loadCrew, saveAgent } from "@/lib/crewStore";
import { bad, body, handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

// PUT {name, role, instructions, tools, model, max_turns, enabled} -> saves one agent's settings.
export const PUT = handle(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const current = (await loadCrew(db)).find((a) => a.id === id);
  if (!current) return bad("Unknown agent", 404);
  const clean = sanitize((await body(request)) as Partial<AgentConfig>, current);
  if (typeof clean === "string") return bad(clean);
  await saveAgent(db, clean);
  return NextResponse.json({ agent: clean });
});

// DELETE -> deletes a custom specialist, or removes a built-in one from the crew (restorable).
// DELETE ?reset=1 -> resets a built-in agent to its default settings. The Lead can only be reset.
export const DELETE = handle(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const builtin = defaultCrew().find((a) => a.id === id);
  const reset = new URL(request.url).searchParams.get("reset") === "1";
  if (builtin && !reset) {
    if (builtin.kind === "lead") return bad("The Lead coordinates every incident, so it can't be removed. You can reset it.");
    const current = (await loadCrew(db)).find((a) => a.id === id) ?? builtin;
    const clean = sanitize({ ...current, removed: true, after: [] }, current);
    if (typeof clean === "string") return bad(clean);
    await saveAgent(db, clean);
    return NextResponse.json({ removed: id });
  }
  await deleteAgent(db, id);
  return NextResponse.json(builtin ? { reset: builtin } : { deleted: id });
});
