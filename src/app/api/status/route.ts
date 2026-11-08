import { NextResponse } from "next/server";
import { agentMode, modelHealth, nemotronModel } from "@/lib/nemotron";
import { createSupabaseAdminClient, usingMemoryDb } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Health = { ok: boolean; label: string; detail: string; checks: { name: string; ok: boolean; note: string }[] };
const g = globalThis as unknown as { __health?: { at: number; value: Health } };

/** Checks the database and the AI model, at most every 10 seconds. */
async function health(): Promise<Health> {
  if (g.__health && Date.now() - g.__health.at < 10_000) return g.__health.value;
  const checks: Health["checks"] = [];

  let dbOk = false;
  if (usingMemoryDb()) checks.push({ name: "Database", ok: false, note: "Supabase is not set up; using demo memory" });
  else {
    try {
      const { error } = await createSupabaseAdminClient().from("properties").select("id").limit(1).abortSignal(AbortSignal.timeout(4000));
      dbOk = !error;
      checks.push({ name: "Database", ok: dbOk, note: error ? `Supabase error: ${error.message.slice(0, 80)}` : "Supabase connected" });
    } catch (e) { checks.push({ name: "Database", ok: false, note: `Supabase unreachable (${String(e).slice(0, 60)})` }); }
  }

  let label = "Nemotron live", detail = nemotronModel().split("/").pop() ?? "";
  let aiOk = false;
  if (agentMode() !== "live") { checks.push({ name: "AI model", ok: false, note: "No NVIDIA_API_KEY: scripted agents only" }); label = "AI offline"; detail = "Scripted agents"; }
  else {
    const m = await modelHealth();
    aiOk = m.primary;
    if (m.primary) checks.push({ name: "AI model", ok: true, note: m.selfHosted ? "GPU server reachable" : "NVIDIA hosted API reachable" });
    else if (m.hosted) { checks.push({ name: "AI model", ok: false, note: "GPU unreachable (is the tunnel running?). Using hosted Nemotron as a backup." }); label = "GPU offline"; detail = "Using hosted backup"; }
    else { checks.push({ name: "AI model", ok: false, note: "Nemotron unreachable: agents fall back to scripted mode" }); label = "Nemotron offline"; detail = "Scripted fallback"; }
  }
  if (!dbOk) { label = usingMemoryDb() ? "No database" : "Database offline"; detail = checks[0].note; }
  const value = { ok: dbOk && aiOk, label, detail, checks };
  g.__health = { at: Date.now(), value };
  return value;
}

export async function GET() {
  return NextResponse.json({
    mode: agentMode(),
    model: agentMode() === "live" ? nemotronModel() : null,
    database: usingMemoryDb() ? "memory" : "supabase",
    reset_enabled: process.env.ALLOW_DEMO_RESET === "true" || usingMemoryDb(),
    health: await health(),
  });
}
