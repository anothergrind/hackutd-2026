import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET ?status=pending (default) | all
export const GET = handle(async (request: Request) => {
  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  const db = createSupabaseAdminClient();
  let q = db.from("approvals").select("*, agent_runs(title, property_id, properties(name))").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return NextResponse.json({ approvals: data });
});
