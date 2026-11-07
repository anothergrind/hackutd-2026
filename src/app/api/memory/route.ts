import { NextResponse } from "next/server";
import { bad, body, handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const { data, error } = await createSupabaseAdminClient().from("building_memory")
    .select("id, property_id, asset_id, note, source, run_id, created_at, properties(name)").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return NextResponse.json({ memory: data });
});

// POST { property_id, asset_id?, note } -> a manager's note the agents read next time.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  if (typeof input.property_id !== "string" || typeof input.note !== "string" || !input.note.trim()) return bad("Need property_id and note.");
  const { data, error } = await createSupabaseAdminClient().from("building_memory").insert({
    property_id: input.property_id, asset_id: typeof input.asset_id === "string" && input.asset_id ? input.asset_id : null,
    note: input.note.trim().slice(0, 600), source: "manager",
  }).select("id").single();
  if (error) return bad(error.message);
  return NextResponse.json({ saved: data }, { status: 201 });
});
