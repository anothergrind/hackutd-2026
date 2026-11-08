"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { api, usd, usePoll } from "@/lib/client";
import type { Candidate, PlanItem } from "@/lib/plan";
import s from "./TonightPlan.module.css";

type Plan = { id: string; technicians: number; budget_usd: number; items: PlanItem[]; explanation: string; status: string; created_at: string;
  summary: { technicians_used: number; technicians: number; budget: number; landlord_spend: number; billed_to_tenants: number; protected_usd: number; deferred_risk_usd: number } };

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const DECISION = {
  fix_tonight: { label: "Fix Tonight", tone: "ok" },
  mitigate: { label: "Make Safe, Fix Tomorrow", tone: "warn" },
  defer: { label: "Wait Until Tomorrow", tone: "" },
} as const;

/** Plans repairs across every incident waiting for approval, within tonight's technicians and budget. */
export default function TonightPlan({ onChanged }: { onChanged: () => void }) {
  const { data, refresh } = usePoll<{ candidates: Candidate[]; plan: Plan | null }>("/api/plan", 3000);
  const [techs, setTechs] = useState(2);
  const [budget, setBudget] = useState(1500);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const count = data?.candidates.length ?? 0;
  const plan = data?.plan;

  async function go(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setErr("");
    try { await fn(); await refresh(); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  }
  const make = () => go("plan", () => api("/api/plan", { method: "POST", json: { technicians: techs, budget } }));
  const apply = () => plan && go("apply", () => api(`/api/plan/${plan.id}/apply`, { method: "POST" }));

  return (
    <section className="card" id="plan">
      <div className="ch">
        <h2>Tonight&apos;s Plan</h2>
        <span className="n">Decide which pending incidents to fix tonight with the technicians and budget available</span>
        {plan && <span className="right">{plan.status === "applied" ? <span className="tag ok">Approved</span> : <span className="tag warn">Pending Approval</span>}</span>}
      </div>

      <div className={s.form}>
        <label><span className="label">Technicians Available</span><input className="input" type="number" min={0} max={20} value={techs} onChange={(e) => setTechs(Number(e.target.value))} /></label>
        <label><span className="label">Landlord Repair Budget ($)</span><input className="input" type="number" min={0} step={100} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
        <button type="button" className="btn accent" disabled={!!busy || !count} onClick={() => { void make(); }}><Icon name="sparkles" size={14} />{busy === "plan" ? "Planning…" : plan ? "Update Plan" : "Make Tonight's Plan"}</button>
        <span className="muted">{count ? `${count} incident${count === 1 ? "" : "s"} pending approval will be ranked.` : "No incidents are pending approval."}</span>
        {err && <span className="c-err">{err}</span>}
      </div>

      {plan && (
        <>
          <p className={s.explain}><Icon name="bot" size={15} />{plan.explanation}</p>
          <dl className={s.stats}>
            <div><dt>Protected Tonight</dt><dd className="c-ok">{usd(plan.summary.protected_usd)}</dd></div>
            <div><dt>Technicians Used</dt><dd>{plan.summary.technicians_used} of {plan.summary.technicians}</dd></div>
            <div><dt>Landlord Spend</dt><dd>{usd(plan.summary.landlord_spend)} <em>of {usd(plan.summary.budget)}</em></dd></div>
            <div><dt>Billed to Tenants</dt><dd>{usd(plan.summary.billed_to_tenants)}</dd></div>
            <div><dt>Risk Left Until Tomorrow</dt><dd className="c-warn">{usd(plan.summary.deferred_risk_usd)}</dd></div>
          </dl>
          <ol className={s.items}>
            {plan.items.map((i) => (
              <li key={i.run_id}>
                <span className={s.rank}>{i.rank}</span>
                <span className={s.what}><b>{i.building}</b><em>{cap(i.problem)}</em></span>
                <span className={`tag ${DECISION[i.decision].tone}`}>{DECISION[i.decision].label}</span>
                <span className={s.reason}>{cap(i.reason.replace("; ", ". "))}</span>
              </li>
            ))}
          </ol>
          {plan.status !== "applied" && (
            <div className={s.cta}>
              <button type="button" className="btn accent" disabled={!!busy} onClick={() => { void apply(); }}><Icon name="check" size={15} />{busy === "apply" ? "Sending…" : "Approve This Plan"}</button>
              <span className="muted">Fix Tonight repairs are booked. For the others, only safety changes and tenant emails are sent; their repairs wait until tomorrow.</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
