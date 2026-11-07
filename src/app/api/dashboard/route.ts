import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const [properties, tickets, energy, incidents] = await Promise.all([
      supabase.from("properties").select("*").order("name"),
      supabase.from("maintenance_tickets").select("*").order("risk_score", { ascending: false }),
      supabase.from("energy_readings").select("*").order("anomaly_score", { ascending: false }),
      supabase.from("incidents").select("*").order("probability", { ascending: false }),
    ]);

    const failure = [properties, tickets, energy, incidents].find((result) => result.error);
    if (failure?.error) {
      return NextResponse.json({ error: failure.error.message }, { status: 500 });
    }

    return NextResponse.json({
      properties: properties.data,
      tickets: tickets.data,
      energy: energy.data,
      incidents: incidents.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
