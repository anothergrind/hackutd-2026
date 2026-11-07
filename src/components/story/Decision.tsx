"use client";

import { useState } from "react";
import ApprovalCard from "@/components/approvals/ApprovalCard";
import Icon, { type IconName } from "@/components/ui/Icon";
import { api, hoursText, usd, when } from "@/lib/client";
import type { Approval, Risk } from "@/lib/types";
import s from "./Decision.module.css";

const KIND: Record<Approval["kind"], { icon: IconName; label: string }> = {
  work_order: { icon: "wrench", label: "Book vendor" },
  schedule_change: { icon: "calendar", label: "Change schedule" },
  tenant_notice: { icon: "mail", label: "Email tenant" },
};

/** The one thing the manager has to do: see the money, approve the fix. */
export default function Decision({ risk, approvals, running, onChange }: { risk: Risk | null; approvals: Approval[]; running: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const pending = approvals.filter((a) => a.status === "pending");
  const done = approvals.length > 0 && pending.length === 0;
  const sent = approvals.filter((a) => a.status === "sent");
  const wo = approvals.find((a) => a.kind === "work_order");

  async function approveAll() {
    setBusy(true); setErr("");
    try {
      for (const a of pending) await api(`/api/approvals/${a.id}`, { method: "POST", json: { decision: "approve", by: "Facility manager" } });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); onChange(); }
  }

  return (
    <section className={`card rise ${s.card} ${pending.length ? s.waiting : done && sent.length ? s.fixed : ""}`}>
      <div className="ch">
        <h2>{done ? (sent.length ? "Fixed before it failed" : "Decision recorded") : "Your decision"}</h2>
        {risk && <span className="right"><span className={`tag ${risk.urgency === "act today" ? "err" : risk.urgency === "act this week" ? "warn" : ""}`}>{risk.urgency.toUpperCase()}</span></span>}
      </div>

      {risk ? (
        <div className={s.money}>
          <div className={s.wait}>
            <span className="label">If we wait</span>
            <b>{usd(risk.wait_usd)}</b>
            <em>SLA penalties + emergency repair</em>
          </div>
          <div className={s.fix}>
            <span className="label">If we fix now</span>
            <b>{usd(risk.fix_usd)}</b>
            <em>planned repair</em>
          </div>
          <p className={s.facts}>
            Saves <b>{usd(risk.saved_usd)}</b> · fails in <b>{hoursText(risk.hours_until_failure)}</b>
            <span className={s.formula}>{risk.formula}</span>
          </p>
        </div>
      ) : (
        <p className="empty">{running ? "The agents are still investigating. The cost of waiting vs fixing shows up here." : "This run was not priced."}</p>
      )}

      {approvals.length > 0 && (
        <div className={s.actions}>
          <span className="label">{done ? "What happened" : `The fix, drafted by the agents (${approvals.length})`}</span>
          {approvals.map((a) => {
            const k = KIND[a.kind];
            const p = a.payload as Record<string, unknown>;
            const sub = a.kind === "work_order" ? `${p.vendor_name} · ${when(String(p.scheduled_for ?? ""))} · ${usd(a.cost_usd)}`
              : a.kind === "tenant_notice" ? `to ${p.tenant_name}` : `${p.asset_id} · ${p.hours} h`;
            return (
              <div key={a.id} className={s.item}>
                <button type="button" className={s.row} onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                  <span className={s.ico}><Icon name={k.icon} size={14} /></span>
                  <span className={s.what}><b>{k.label}</b><em>{a.kind === "schedule_change" ? String(p.change ?? a.title) : sub}</em></span>
                  <span className={`tag ${a.status === "sent" ? "ok" : a.status === "rejected" ? "err" : "warn"}`}>{a.status === "pending" ? "DRAFT" : a.status.toUpperCase()}</span>
                </button>
                {open === a.id && <div className={s.detail}><ApprovalCard a={a} onDone={onChange} /></div>}
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className={s.cta}>
          <button type="button" className="btn accent" disabled={busy} onClick={() => { void approveAll(); }}>
            <Icon name="check" size={15} />{busy ? "Sending…" : `Approve all ${pending.length} and send`}
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>or click an item to edit or reject it</span>
          {err && <span className="c-err">{err}</span>}
        </div>
      )}
      {done && sent.length > 0 && wo?.status === "sent" && (
        <p className={s.done}><Icon name="badge" size={15} /> {String((wo.payload as Record<string, unknown>).vendor_name)} is booked for {when(String((wo.payload as Record<string, unknown>).scheduled_for ?? ""))}. Saved to building memory.</p>
      )}
    </section>
  );
}
