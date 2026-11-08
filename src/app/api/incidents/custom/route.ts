import { NextResponse, after } from "next/server";
import { startRun } from "@/lib/agent/orchestrate";
import { bad, body, handle } from "@/lib/http";
import { assetLabel, metricLabel } from "@/lib/plain";
import { SCENARIOS, type Hints } from "@/lib/scenarios";
import { parseReadings, writeSeries } from "@/lib/sensors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const number = (v: unknown, lo: number, hi: number, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };

// POST { property_id, asset_id, title, reported, metric, limit, readings, outage_hours?, repair_hours? }
// -> a new incident built from the caller's own sensor readings. The agents analyze it like any other incident.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  const db = createSupabaseAdminClient();

  const assetId = text(input.asset_id, 50);
  const { data: found } = await db.from("assets").select("id, property_id, name").eq("id", assetId).limit(1);
  const asset = found?.[0] as { id: string; property_id: string; name: string } | undefined;
  if (!asset) return bad("Pick a piece of equipment from the list.");
  if (input.property_id && asset.property_id !== input.property_id) return bad("That equipment is in a different building.");

  const metric = text(input.metric, 40).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "");
  if (!metric) return bad("Name the measurement, for example temperature_f or pressure_psi.");
  const limit = Number(input.limit);
  if (!Number.isFinite(limit)) return bad("Enter the safe limit as a number.");
  const points = parseReadings(text(input.readings, 60_000));
  if (points.length < 5) return bad("Add at least 5 readings: one value per line, or timestamp,value.");

  const reported = text(input.reported, 400) || `${assetLabel(assetId)} ${metricLabel(metric).label} is drifting toward its limit.`;
  let title = text(input.title, 60) || `${assetLabel(assetId)} ${metricLabel(metric).label}`;
  if (SCENARIOS.some((s) => s.label === title)) title = `${title} (custom)`.slice(0, 60);

  await writeSeries(db, assetId, metric, points);
  const latest = points[points.length - 1].v;
  const m = metricLabel(metric).label;
  const hints: Hints = {
    root: assetId, impacted: assetId, price_asset: assetId,
    problem: reported,
    trend: { asset_id: assetId, metric, limit },
    outage_hours: number(input.outage_hours, 0.5, 72, 4),
    repair_hours: number(input.repair_hours, 0.5, 40, 3),
    steps: [`Inspect ${assetLabel(assetId)} and find why the ${m} is changing`, `Repair or replace the failing component`, `Confirm the ${m} is back within the safe limit`],
    verify: { asset_id: assetId, metric, limit, direction: latest <= limit ? "below" : "above" },
  };
  const { runId, execute } = await startRun(db, {
    signal: { asset_id: assetId, source: "sensor", metric, value: latest, message: reported },
    propertyId: asset.property_id, hints, trigger: "incident", title,
  });
  after(execute);
  return NextResponse.json({ run_id: runId, readings: points.length }, { status: 202 });
});
