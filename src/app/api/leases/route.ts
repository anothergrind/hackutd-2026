import { NextResponse } from "next/server";
import { bad, handle } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Lease = { id: string; tenant_id: string; lease_ref: string; clauses: unknown[] };
type Tenant = { id: string; name: string; asset_id: string; property_id: string; sla_penalty_per_hour: number; contact_email: string };

// GET ?ref=DC1-HALL-A-2024 -> the whole lease: tenant, building, premises and every clause.
export const GET = handle(async (request: Request) => {
  const ref = new URL(request.url).searchParams.get("ref")?.trim().split(/\s+/)[0];
  if (!ref) return bad("ref is required.");
  const db = createSupabaseAdminClient();
  const { data: leases, error } = await db.from("leases").select("id, tenant_id, lease_ref, clauses").eq("lease_ref", ref).limit(1);
  if (error) throw new Error(error.message);
  const lease = (leases as Lease[] | null)?.[0];
  if (!lease) return bad(`No lease found for ${ref}.`, 404);
  const { data: tenants } = await db.from("tenants").select("id, name, asset_id, property_id, sla_penalty_per_hour, contact_email").eq("id", lease.tenant_id).limit(1);
  const tenant = (tenants as Tenant[] | null)?.[0] ?? null;
  const { data: props } = tenant ? await db.from("properties").select("name, address, building_type").eq("id", tenant.property_id).limit(1) : { data: null };
  return NextResponse.json({ lease_ref: lease.lease_ref, clauses: lease.clauses ?? [], tenant, property: (props as unknown[] | null)?.[0] ?? null });
});
