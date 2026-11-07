"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { api, ago, usd, when } from "@/lib/client";
import type { Approval } from "@/lib/types";
import s from "./ApprovalCard.module.css";

const KIND = {
  work_order: { label: "Work order", icon: "wrench" },
  tenant_notice: { label: "Tenant notice", icon: "mail" },
  schedule_change: { label: "Schedule change", icon: "calendar" },
} as const;

type P = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export default function ApprovalCard({ a, onDone, context }: { a: Approval & { agent_runs?: { title: string | null; properties?: { name: string } | null } | null }; onDone?: () => void; context?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const p = a.payload as P;
  const [draft, setDraft] = useState<P>({
    title: a.title, steps: (p.steps as string[] | undefined)?.join("\n") ?? "", priority: p.priority,
    subject: p.subject, message: p.message, change: p.change, hours: p.hours,
  });
  const k = KIND[a.kind];

  async function decide(decision: "approve" | "reject") {
    setBusy(true); setErr("");
    const edits: P = {};
    if (editing) {
      if (a.kind === "work_order") Object.assign(edits, { title: draft.title, steps: str(draft.steps).split("\n").map((x) => x.trim()).filter(Boolean), priority: draft.priority });
      if (a.kind === "tenant_notice") Object.assign(edits, { subject: draft.subject, message: draft.message });
      if (a.kind === "schedule_change") Object.assign(edits, { change: draft.change, hours: draft.hours });
    }
    try {
      await api(`/api/approvals/${a.id}`, { method: "POST", json: { decision, edits, by: "Facility manager" } });
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const pending = a.status === "pending";

  return (
    <article className={`${s.card} ${pending ? s.pending : ""}`}>
      <header className={s.head}>
        <span className={s.ico}><Icon name={k.icon} size={16} /></span>
        <div className={s.title}>
          <span className={s.kind}>{k.label}{context && a.agent_runs ? <> · <Link className="link" href={`/runs/${a.run_id}`}>{a.agent_runs.properties?.name ?? a.agent_runs.title}</Link></> : null}</span>
          <b title={a.title}>{a.title}</b>
          {(a.protects_usd > 0 || a.cost_usd > 0) && (
            <span className={s.money}>
              {a.protects_usd > 0 && <span><em>protects</em> {usd(a.protects_usd)}</span>}
              {a.cost_usd > 0 && <span><em>cost</em> {usd(a.cost_usd)}</span>}
            </span>
          )}
        </div>
        {!pending && <span className={`tag ${a.status === "sent" ? "ok" : "err"}`}>{a.status.toUpperCase()}</span>}
      </header>

      <div className={s.body}>
        {a.kind === "work_order" && (editing ? (
          <div className={s.form}>
            <label><span className="label">Title</span><input className="input" value={str(draft.title)} onChange={set("title")} /></label>
            <label><span className="label">Steps, one per line</span><textarea className="input" value={str(draft.steps)} onChange={set("steps")} rows={4} /></label>
            <label className={s.narrow}><span className="label">Priority</span>
              <select className="input" value={str(draft.priority)} onChange={set("priority")}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>P{n}</option>)}</select>
            </label>
          </div>
        ) : (
          <>
            <p className={s.meta}><span className="mono">{str(p.asset_id)}</span> · {str(p.vendor_name)} · {when(str(p.scheduled_for))} · P{str(p.priority)} · {str(p.est_hours)} h</p>
            <ol className={s.steps}>{((p.steps as string[]) ?? []).map((x) => <li key={x}>{x}</li>)}</ol>
          </>
        ))}
        {a.kind === "tenant_notice" && (editing ? (
          <div className={s.form}>
            <label><span className="label">Subject</span><input className="input" value={str(draft.subject)} onChange={set("subject")} /></label>
            <label><span className="label">Message</span><textarea className="input" value={str(draft.message)} onChange={set("message")} rows={7} /></label>
          </div>
        ) : (
          <>
            <p className={s.meta}>To {str(p.tenant_name)} · <span className="mono">{str(p.to)}</span></p>
            <p className={s.subject}>{str(p.subject)}</p>
            <p className={s.message}>{str(p.message)}</p>
          </>
        ))}
        {a.kind === "schedule_change" && (editing ? (
          <div className={s.form}>
            <label><span className="label">Change</span><textarea className="input" value={str(draft.change)} onChange={set("change")} rows={3} /></label>
            <label className={s.narrow}><span className="label">Hours</span><input className="input" type="number" min={1} max={168} value={str(draft.hours)} onChange={set("hours")} /></label>
          </div>
        ) : (
          <p className={s.meta}><span className="mono">{str(p.asset_id)}</span> · {str(p.change)} · for {str(p.hours)} h</p>
        ))}
      </div>

      <footer className={s.foot}>
        {pending ? (
          <>
            <button type="button" className="btn sm accent" disabled={busy} onClick={() => { void decide("approve"); }}><Icon name="check" size={14} />{editing ? "Save and approve" : "Approve"}</button>
            <button type="button" className="btn sm" disabled={busy} onClick={() => setEditing((v) => !v)}><Icon name="pencil" size={13} />{editing ? "Cancel edit" : "Edit"}</button>
            <button type="button" className="btn sm ghost" disabled={busy} onClick={() => { void decide("reject"); }}>Reject</button>
            <span className={s.when}>drafted {ago(a.created_at)}</span>
          </>
        ) : (
          <span className={s.when}>{a.status === "sent" ? "Sent" : "Rejected"} by {a.decided_by} · {ago(a.decided_at)}</span>
        )}
        {err && <span className="c-err" role="alert">{err}</span>}
      </footer>
    </article>
  );
}
