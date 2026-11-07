import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("projects").select("id").limit(1);

    if (error) {
      return NextResponse.json(
        { status: "error", database: "unavailable", message: error.message },
        { status: 503 },
      );
    }

    return NextResponse.json({ status: "ok", database: "connected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", database: "unconfigured", message },
      { status: 503 },
    );
  }
}
