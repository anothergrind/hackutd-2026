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

// DELETE -> removes a custom specialist, or resets a built-in agent to its defaults.
export const DELETE = handle(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  await deleteAgent(createSupabaseAdminClient(), id);
  const builtin = defaultCrew().find((a) => a.id === id);
  return NextResponse.json(builtin ? { reset: builtin } : { deleted: id });
});
