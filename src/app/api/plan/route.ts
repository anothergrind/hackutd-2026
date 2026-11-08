import { NextResponse } from "next/server";
import { bad, body, handle } from "@/lib/http";
import { candidates, makePlan } from "@/lib/plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET -> open incidents that could be fixed tonight, and the latest plan.
export const GET = handle(async () => {
  const db = createSupabaseAdminClient();
  const [cands, latest] = await Promise.all([candidates(db).catch(() => []), db.from("triage_plans").select("*").order("created_at", { ascending: false }).limit(1)]);
  return NextResponse.json({ candidates: cands, plan: latest.data?.[0] ?? null });
});

// POST { technicians, budget } -> a ranked plan with an explanation.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  const technicians = Math.round(Number(input.technicians ?? 2));
  const budget = Number(input.budget ?? 2000);
  if (!(technicians >= 0 && technicians <= 20) || !(budget >= 0 && budget <= 1_000_000)) return bad("technicians 0-20, budget 0-1,000,000");
  try {
    return NextResponse.json({ plan: await makePlan(createSupabaseAdminClient(), technicians, budget) }, { status: 201 });
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e));
  }
});
