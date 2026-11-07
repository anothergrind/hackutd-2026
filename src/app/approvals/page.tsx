"use client";

import ApprovalCard from "@/components/approvals/ApprovalCard";
import PageHeader from "@/components/shell/PageHeader";
import { usd, usePoll } from "@/lib/client";
import type { Approval } from "@/lib/types";
import s from "./approvals.module.css";

type Row = Approval & { agent_runs?: { title: string | null; properties?: { name: string } | null } | null };

export default function Approvals() {
  const { data, error, refresh } = usePoll<{ approvals: Row[] }>("/api/approvals?status=all", 3000);
  const all = data?.approvals ?? [];
  const order = { work_order: 0, schedule_change: 1, tenant_notice: 2 } as const;
  const pending = all.filter((a) => a.status === "pending").sort((a, b) => a.run_id.localeCompare(b.run_id) || order[a.kind] - order[b.kind]);
  const decided = all.filter((a) => a.status !== "pending").slice(0, 20);
  const protects = pending.reduce((sum, a) => sum + (a.kind === "work_order" ? Number(a.protects_usd) : 0), 0);

  return (
    <>
      <PageHeader
        title="Approval queue"
        sub="Every side effect the crew wants to take waits here. Edit the draft if you need to, then approve to send it or reject to drop it."
        actions={pending.length > 0 && <span className="chip accent">{pending.length} waiting · protects {usd(protects)}</span>}
      />
      {error && <p className="c-err">{error}</p>}
      <section className={s.list}>
        {pending.length ? pending.map((a) => <ApprovalCard key={a.id} a={a} onDone={refresh} context />) : (
          <div className="card"><p className="empty">{data ? "Nothing waiting. The crew drafts actions here during a run." : "Loading…"}</p></div>
        )}
      </section>
      {decided.length > 0 && (
        <>
          <h2 className={s.h2}>Recently decided</h2>
          <section className={s.list}>{decided.map((a) => <ApprovalCard key={a.id} a={a} context />)}</section>
        </>
      )}
    </>
  );
}
