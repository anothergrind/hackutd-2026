"use client";

import Link from "next/link";
import { useState } from "react";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/ui/Icon";
import { api, usd, usePoll } from "@/lib/client";
import type { Candidate, PlanItem } from "@/lib/plan";
import type { Run } from "@/lib/types";
import s from "./plan.module.css";

type Plan = { id: string; technicians: number; budget_usd: number; items: PlanItem[]; explanation: string; status: string; created_at: string;
  summary: { technicians_used: number; technicians: number; budget: number; landlord_spend: number; billed_to_tenants: number; protected_usd: number; deferred_risk_usd: number } };

const DECISION = {
  fix_tonight: { label: "Fix tonight", tone: "ok" },
  mitigate: { label: "Make safe, fix in the morning", tone: "warn" },
  defer: { label: "Wait until morning", tone: "" },
} as const;

export default function PlanPage() {
  const { data, refresh } = usePoll<{ candidates: Candidate[]; plan: Plan | null }>("/api/plan", 3000);
  const runs = usePoll<{ runs: Run[] }>("/api/runs", 3000);
  const [techs, setTechs] = useState(2);
  const [budget, setBudget] = useState(1500);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const working = runs.data?.runs.filter((r) => r.status === "running").length ?? 0;
  const cands = data?.candidates ?? [];
  const plan = data?.plan;

  async function go(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setErr("");
    try { await fn(); await refresh(); void runs.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  }
  const storm = () => go("storm", () => api("/api/storm", { method: "POST" }));
  const make = () => go("plan", () => api("/api/plan", { method: "POST", json: { technicians: techs, budget } }));
  const apply = () => plan && go("apply", () => api(`/api/plan/${plan.id}/apply`, { method: "POST" }));

  return (
    <>
      <PageHeader
        title="Tonight's Plan"
        sub="Several buildings need repairs at once, but there are only so many technicians and so much budget. The AI decides what to fix tonight and explains why."
        actions={<button type="button" className="btn" disabled={!!busy || working > 0} onClick={() => { void storm(); }}><Icon name="zap" size={14} />{busy === "storm" ? "Starting…" : "Start Storm Night"}</button>}
      />
      {err && <p className="c-err">{err}</p>}
      {working > 0 && <p className={s.working}><i className="dot live c-run" />AI agents are investigating {working} building{working === 1 ? "" : "s"}…</p>}

      <section className="card">
        <div className="ch"><h2>Problems Waiting for a Decision</h2><span className="n">{cands.length}</span></div>
        {cands.length ? (
          <table className={s.table}>
            <thead><tr><th>Building</th><th>What&apos;s wrong</th><th>Could cost if we wait</th><th>Repair</th><th>Who pays</th><th>Time left</th></tr></thead>
            <tbody>
              {cands.map((c) => (
                <tr key={c.run_id}>
                  <td><Link className="link" href={`/runs/${c.run_id}`}>{c.building}</Link></td>
                  <td>{c.problem}</td>
                  <td className="c-err num">{usd(c.risk.wait_usd)}</td>
                  <td className="num">{usd(c.work_order.cost_usd)}</td>
                  <td>{c.payer ? <span className={`tag ${c.payer.party === "tenant" ? "accent" : ""}`}>{c.payer.name}</span> : "Landlord"}</td>
                  <td className="num">{c.risk.hours_until_failure != null ? `${Math.round(c.risk.hours_until_failure)} hours` : "no deadline"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">{working ? "Waiting for the agents to finish…" : "Nothing waiting. Click Start storm night to raise problems in three buildings at once."}</p>}
        {cands.length > 0 && (
          <div className={s.form}>
            <label><span className="label">Technicians available tonight</span><input className="input" type="number" min={0} max={20} value={techs} onChange={(e) => setTechs(Number(e.target.value))} /></label>
            <label><span className="label">Landlord repair budget tonight</span><input className="input" type="number" min={0} step={100} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
            <button type="button" className="btn accent" disabled={!!busy} onClick={() => { void make(); }}><Icon name="sparkles" size={14} />{busy === "plan" ? "Planning…" : "Make Tonight's Plan"}</button>
          </div>
        )}
      </section>

      {plan && (
        <section className={`card ${s.plan}`} data-applied={plan.status === "applied" || undefined}>
          <div className="ch">
            <h2>The AI&apos;s Plan for Tonight</h2>
            <span className="n">{plan.technicians} technicians · {usd(plan.budget_usd)} budget</span>
            <span className="right">{plan.status === "applied" ? <span className="tag ok">Approved</span> : <span className="tag warn">Pending Approval</span>}</span>
          </div>
          <p className={s.explain}><Icon name="bot" size={15} />{plan.explanation}</p>
          <dl className={s.stats}>
            <div><dt>Protected tonight</dt><dd className="c-ok">{usd(plan.summary.protected_usd)}</dd></div>
            <div><dt>Technicians used</dt><dd>{plan.summary.technicians_used} of {plan.summary.technicians}</dd></div>
            <div><dt>Landlord spend</dt><dd>{usd(plan.summary.landlord_spend)} <em>of {usd(plan.summary.budget)}</em></dd></div>
            <div><dt>Billed to tenants (per lease)</dt><dd>{usd(plan.summary.billed_to_tenants)}</dd></div>
            <div><dt>Risk left until morning</dt><dd className="c-warn">{usd(plan.summary.deferred_risk_usd)}</dd></div>
          </dl>
          <ol className={s.items}>
            {plan.items.map((i) => (
              <li key={i.run_id} data-d={i.decision}>
                <span className={s.rank}>{i.rank}</span>
                <span className={s.what}><b>{i.building}</b><em>{i.problem}</em></span>
                <span className={`tag ${DECISION[i.decision].tone}`}>{DECISION[i.decision].label}</span>
                <span className={s.reason}>{i.reason}</span>
              </li>
            ))}
          </ol>
          {plan.status !== "applied" && (
            <div className={s.cta}>
              <button type="button" className="btn accent" disabled={!!busy} onClick={() => { void apply(); }}><Icon name="check" size={15} />{busy === "apply" ? "Sending…" : "Approve This Plan"}</button>
              <span className="muted" style={{ fontSize: 12.5 }}>Fix-tonight repairs are booked. For the rest, only the safety changes and tenant emails go out; their repairs wait for tomorrow.</span>
            </div>
          )}
        </section>
      )}
    </>
  );
}
