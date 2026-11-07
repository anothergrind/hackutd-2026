import { NextResponse } from "next/server";
import { decide } from "@/lib/approvals";
import { bad, body, handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST { decision: "approve" | "reject", by?, note?, edits? }
export const POST = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await body(request);
  if (input.decision !== "approve" && input.decision !== "reject") return bad('decision must be "approve" or "reject"');
  try {
    const result = await decide(createSupabaseAdminClient(), id, {
      decision: input.decision,
      by: typeof input.by === "string" && input.by.trim() ? input.by.trim() : "Facility manager",
      note: typeof input.note === "string" ? input.note : undefined,
      edits: input.edits && typeof input.edits === "object" ? (input.edits as Record<string, unknown>) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (/not found|Already|first/.test(message)) return bad(message, 409);
    throw error;
  }
});
