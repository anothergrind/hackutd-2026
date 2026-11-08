// Shapes returned by the API routes (client + server).

export type RunStatus = "running" | "awaiting_approval" | "done" | "error";

export type Risk = {
  wait_usd: number; fix_usd: number; saved_usd: number; penalties_usd: number; emergency_repair_usd: number;
  hours_until_failure: number | null; urgency: string; formula: string; asset_id?: string; outage_hours?: number; penalty_per_hour?: number;
};

export type Run = {
  id: string; status: RunStatus; trigger: "incident" | "sweep" | "manual"; title: string | null; summary: string | null;
  property_id: string | null; risk: Risk | null; mode: "live" | "scripted"; created_at: string; finished_at: string | null;
  crew?: { id: string; name: string; role: string; color: string; icon: import("@/lib/roster").IconKey; kind: import("@/lib/roster").AgentKind }[] | null;
};

export type Step = {
  id: number; agent: string; kind: "start" | "thought" | "tool" | "final" | "error";
  content: { text?: string; task?: string; name?: string; args?: Record<string, unknown>; result?: unknown; ms?: number };
  created_at: string;
};

export type Approval = {
  id: string; run_id: string; kind: "work_order" | "tenant_notice" | "schedule_change"; title: string;
  payload: Record<string, unknown>; protects_usd: number; cost_usd: number; status: "pending" | "sent" | "rejected";
  decided_by: string | null; decision_note: string | null; decided_at: string | null; created_at: string;
};

export type RunDetail = { run: Run; steps: Step[]; approvals: Approval[] };

export type SweepScore = { property_id: string; name: string; building_type: string; score: number; reasons: { text: string; points: number }[] };
export type Sweep = { id: string; status: string; scores: SweepScore[]; started_run_id: string | null; created_at: string; finished_at: string | null };
