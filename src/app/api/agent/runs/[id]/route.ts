import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Poll this while a run is "running" to show the agent's steps live.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createSupabaseServerClient();
    const [run, steps] = await Promise.all([
      supabase.from("agent_runs").select("*").eq("id", id).single(),
      supabase.from("agent_steps").select("id, kind, content, created_at").eq("run_id", id).order("id"),
    ]);
    if (run.error) return NextResponse.json({ error: run.error.message }, { status: 404 });
    if (steps.error) return NextResponse.json({ error: steps.error.message }, { status: 500 });
    return NextResponse.json({ run: run.data, steps: steps.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}
