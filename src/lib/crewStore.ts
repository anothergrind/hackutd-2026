import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultCrew, mergeCrew, type AgentConfig } from "@/lib/crew";

/** Defaults + saved overrides + custom specialists. Falls back to defaults if migration 006 is not applied. */
export async function loadCrew(db: SupabaseClient): Promise<AgentConfig[]> {
  const { data, error } = await db.from("agent_configs").select("id, config");
  if (error) return defaultCrew();
  return mergeCrew((data ?? []) as { id: string; config: Partial<AgentConfig> }[]);
}

export async function saveAgent(db: SupabaseClient, config: AgentConfig) {
  const row = { id: config.id, config, updated_at: new Date().toISOString() };
  const { data: existing } = await db.from("agent_configs").select("id").eq("id", config.id);
  const res = existing?.length
    ? await db.from("agent_configs").update(row).eq("id", config.id)
    : await db.from("agent_configs").insert(row);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteAgent(db: SupabaseClient, id: string) {
  const { error } = await db.from("agent_configs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** What the UI needs to draw a past run even if the crew changed since. */
export const crewSnapshot = (crew: AgentConfig[]) =>
  crew.filter((a) => a.enabled).map(({ id, name, role, color, icon, kind, after, x, y, pins }) => ({ id, name, role, color, icon, kind, after, x, y, pins }));
