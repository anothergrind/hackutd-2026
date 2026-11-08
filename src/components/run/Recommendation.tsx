"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { api } from "@/lib/client";
import { payerSentence, recommendation } from "@/lib/plain";
import type { Verification } from "@/lib/verify";
import type { Approval, Run } from "@/lib/types";
import type { AgentView, CrewMember } from "@/lib/view";
import s from "./Recommendation.module.css";

/** The decision the AI reached, why, and what one click will do. Written for non-technical readers. */
export default function Recommendation({ run, approvals, agents, crew, verification, onChange, onReview }: {
  run: Run; approvals: Approval[]; agents: Record<string, AgentView>; crew: CrewMember[]; verification?: Verification | null; onChange: () => void; onReview: () => void;
}) {
  const r = recommendation(run, approvals, agents, crew, verification);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tone = r.tone;

  async function approveAll() {
    setBusy(true); setErr("");
    try {
      for (const a of approvals.filter((x) => x.status === "pending")) await api(`/api/approvals/${a.id}`, { method: "POST", json: { decision: "approve", by: "Facility manager" } });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); onChange(); }
  }

  return (
    <section className={`card ${s.card} run-rec`} data-tone={tone}>
      <div className={s.top}>
        <span className={s.badge}><Icon name={tone === "done" ? "badge" : tone === "wait" ? "radar" : "bot"} size={16} />Recommendation</span>
      </div>
      <h2 className={`${s.verdict} rec-verdict`}>{r.verdict}</h2>
      {r.why && <p className={s.why}>{r.why}</p>}
      {r.problem && <p className={s.problem}><b>Issue:</b> {r.problem}.</p>}
      {r.payer && <p className={s.problem}><b>Cost Responsibility:</b> {payerSentence(r.payer)} <span className={s.clause}>&ldquo;{r.payer.text}&rdquo;</span></p>}

      {(r.reasons.length > 0 || r.ifApproved.length > 0) && (
        <div className={`${s.cols} rec-cols`}>
          {r.ifApproved.length > 0 && (
            <div className="rec-plan">
              <h3>{r.pending ? "Action Plan" : "Actions Taken"}</h3>
              <ul>{r.ifApproved.map((x) => <li key={x}><Icon name="arrow-right" size={13} />{x}</li>)}</ul>
            </div>
          )}
          {r.reasons.length > 0 && (
            <div className="rec-reasons">
              <h3>Reasoning</h3>
              <ul>{r.reasons.map((x) => <li key={x}><Icon name="check" size={13} />{x}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {r.pending > 0 && (
        <div className={`${s.cta} rec-cta`}>
          <button type="button" className="btn accent" disabled={busy} onClick={() => { void approveAll(); }}>
            <Icon name="check" size={15} />{busy ? "Sending…" : "Approve All Actions"}
          </button>
          <button type="button" className="btn" onClick={onReview}>Review Actions</button>
          <span className={s.note}>Nothing is sent until approved.</span>
          {err && <span className="c-err">{err}</span>}
        </div>
      )}
    </section>
  );
}
