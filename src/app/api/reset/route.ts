import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { resetAllowed, resetDemo } from "@/lib/reset";
import { createSupabaseAdminClient, usingMemoryDb } from "@/lib/supabase/admin";

// Demo reset before judging. Off unless ALLOW_DEMO_RESET=true, because it deletes run history.
export const POST = handle(async () => {
  if (!resetAllowed(usingMemoryDb())) return NextResponse.json({ error: "Set ALLOW_DEMO_RESET=true to enable." }, { status: 403 });
  await resetDemo(createSupabaseAdminClient());
  return NextResponse.json({ reset: true });
});
