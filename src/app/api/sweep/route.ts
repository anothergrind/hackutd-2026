import { NextResponse, after } from "next/server";
import { body, handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runSweep } from "@/lib/sweep";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const { data, error } = await createSupabaseAdminClient().from("sweeps").select("*").order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return NextResponse.json({ sweep: data?.[0] ?? null });
});

// POST { autostart?: boolean } -> scores every building; starts a run on the worst one if it crosses the bar.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  const { sweepId, scores, started } = await runSweep(createSupabaseAdminClient(), { autostart: input.autostart !== false });
  if (started) after(started.execute);
  return NextResponse.json({ sweep_id: sweepId, scores, run_id: started?.runId ?? null });
});
