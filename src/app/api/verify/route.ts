import { NextResponse } from "next/server";
import { bad, body, handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkVerification } from "@/lib/verify";

// POST { run_id, outcome?: "pass" | "fail" } -> run the after-repair check now (demo control).
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  if (typeof input.run_id !== "string") return bad("Need run_id.");
  const outcome = input.outcome === "fail" ? "fail" : "pass";
  const v = await checkVerification(createSupabaseAdminClient(), input.run_id, { force: true, outcome });
  if (!v) return bad("No repair check scheduled for this run. Approve the work order first.", 404);
  return NextResponse.json({ verification: v });
});
