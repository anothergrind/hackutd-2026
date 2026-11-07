import { NextResponse } from "next/server";
import { agentMode, nemotronModel } from "@/lib/nemotron";
import { usingMemoryDb } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    mode: agentMode(),
    model: agentMode() === "live" ? nemotronModel() : null,
    database: usingMemoryDb() ? "memory" : "supabase",
    reset_enabled: process.env.ALLOW_DEMO_RESET === "true" || usingMemoryDb(),
  });
}
