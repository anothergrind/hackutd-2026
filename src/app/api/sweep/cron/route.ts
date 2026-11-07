import { NextResponse, after } from "next/server";
import { handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runSweep } from "@/lib/sweep";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Called by Vercel Cron (vercel.json). Vercel sends Authorization: Bearer $CRON_SECRET.
export const GET = handle(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { sweepId, started } = await runSweep(createSupabaseAdminClient(), { autostart: true });
  if (started) after(started.execute);
  return NextResponse.json({ sweep_id: sweepId, run_id: started?.runId ?? null });
});
