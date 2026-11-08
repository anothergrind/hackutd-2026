import type { SupabaseClient } from "@supabase/supabase-js";
import type { Approval } from "@/lib/types";
import { scheduleVerification } from "@/lib/verify";

// Fields a manager may edit before approving. Everything else in the payload stays as the agent drafted it.
const EDITABLE: Record<Approval["kind"], string[]> = {
  work_order: ["title", "steps", "priority"],
  tenant_notice: ["subject", "message"],
  schedule_change: ["change", "hours"],
};

export type Decision = { decision: "approve" | "reject"; by: string; note?: string; edits?: Record<string, unknown> };

function cleanEdits(kind: Approval["kind"], edits: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE[kind]) {
    const v = edits[key];
    if (v === undefined) continue;
    if (key === "steps") {
      if (Array.isArray(v)) out.steps = v.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 12).map((s) => s.slice(0, 300));
    } else if (key === "priority" || key === "hours") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0 && n <= (key === "priority" ? 5 : 168)) out[key] = key === "priority" ? Math.round(n) : n;
    } else if (typeof v === "string" && v.trim()) {
      out[key] = v.trim().slice(0, key === "message" ? 4000 : 400);
    }
  }
  return out;
}

/** Approve = execute the side effect, then mark it sent. Reject = mark it, nothing happens. Idempotent per approval. */
export async function decide(db: SupabaseClient, id: string, d: Decision) {
  const { data: row, error } = await db.from("approvals").select("*").eq("id", id).single();
  if (error || !row) throw new Error("Approval not found");
  const a = row as Approval;
  if (a.status !== "pending") throw new Error(`Already ${a.status}`);

  const edits = cleanEdits(a.kind, d.edits);
  const payload = { ...a.payload, ...edits } as Record<string, unknown>;
  const title = a.kind === "work_order" && typeof edits.title === "string" ? edits.title : a.kind === "schedule_change" && typeof edits.change === "string" ? (edits.change as string).slice(0, 70) : a.title;

  // Claim it first so two clicks cannot execute twice.
  const { data: claimed } = await db.from("approvals")
    .update({ status: d.decision === "approve" ? "sent" : "rejected", decided_by: d.by.slice(0, 80), decision_note: d.note?.slice(0, 500) ?? null, decided_at: new Date().toISOString(), payload, title })
    .eq("id", id).eq("status", "pending").select("id");
  if (!claimed?.length) throw new Error("Someone else decided this first");

  if (d.decision === "approve") {
    const res =
      a.kind === "work_order"
        ? await db.from("work_orders").insert({ run_id: a.run_id, approval_id: id, asset_id: payload.asset_id, vendor_id: payload.vendor_id, priority: payload.priority, title, steps: payload.steps ?? [], status: "dispatched", scheduled_for: payload.scheduled_for })
        : a.kind === "tenant_notice"
          ? await db.from("tenant_notices").insert({ run_id: a.run_id, approval_id: id, tenant_id: payload.tenant_id, subject: payload.subject, message: payload.message })
          : await db.from("schedule_changes").insert({ run_id: a.run_id, approval_id: id, asset_id: payload.asset_id, change: payload.change, ends_at: new Date(Date.now() + Number(payload.hours ?? 24) * 3_600_000).toISOString() });
    if (res.error) {
      // Roll the claim back so the manager can retry.
      await db.from("approvals").update({ status: "pending", decided_by: null, decided_at: null }).eq("id", id);
      throw new Error(res.error.message);
    }
    // A booked repair gets a follow-up check that the problem is really gone.
    if (a.kind === "work_order") await scheduleVerification(db, a.run_id).catch((e) => console.error("verify schedule failed", e));
  }

  // Close the run once nothing is left waiting.
  const { count } = await db.from("approvals").select("id", { count: "exact", head: true }).eq("run_id", a.run_id).eq("status", "pending");
  if (!count) {
    const { data: run } = await db.from("agent_runs").select("status, property_id").eq("id", a.run_id).single();
    if (run?.status === "awaiting_approval") {
      await db.from("agent_runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", a.run_id);
      const { data: all } = await db.from("approvals").select("status").eq("run_id", a.run_id);
      const sent = all?.filter((x) => x.status === "sent").length ?? 0;
      if (run.property_id) {
        await db.from("building_memory").insert({ property_id: run.property_id, note: `Manager ${d.by} approved ${sent} of ${all?.length ?? 0} drafted actions.`, source: "manager", run_id: a.run_id });
      }
    }
  }
  return { id, status: d.decision === "approve" ? "sent" : "rejected" };
}
