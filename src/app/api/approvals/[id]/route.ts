import { NextResponse } from "next/server";
import { decide, reopen } from "@/lib/approvals";
import { bad, body, handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST { decision: "approve" | "reject" | "restore", by?, note?, edits? }
export const POST = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await body(request);
  if (input.decision !== "approve" && input.decision !== "reject" && input.decision !== "restore") return bad('decision must be "approve", "reject" or "restore"');
  try {
    if (input.decision === "restore") return NextResponse.json(await reopen(createSupabaseAdminClient(), id));
    const result = await decide(createSupabaseAdminClient(), id, {
      decision: input.decision,
      by: typeof input.by === "string" && input.by.trim() ? input.by.trim() : "Facility manager",
      note: typeof input.note === "string" ? input.note : undefined,
      edits: input.edits && typeof input.edits === "object" ? (input.edits as Record<string, unknown>) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (/not found|Already|first|Only a rejected/.test(message)) return bad(message, 409);
    throw error;
  }
});
