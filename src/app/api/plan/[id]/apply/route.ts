import { NextResponse } from "next/server";
import { bad, handle } from "@/lib/http";
import { applyPlan } from "@/lib/plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const POST = handle(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  try {
    return NextResponse.json(await applyPlan(createSupabaseAdminClient(), id, "Facility director"));
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e), 409);
  }
});
