"use client";

import { useState } from "react";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/ui/Icon";
import { ago, api, usd, usePoll, when } from "@/lib/client";
import type { SweepScore } from "@/lib/types";
import s from "./portfolio.module.css";

type Data = {
  properties: { id: string; name: string; address: string; building_type: string }[];
  assets: { id: string; property_id: string; name: string; kind: string; status: string }[];
  dependencies: { upstream: string; downstream: string; relation: string }[];
  tenants: { id: string; property_id: string; asset_id: string; name: string; sla_penalty_per_hour: number }[];
  tickets: { id: string; property_id: string; equipment: string; title: string; urgency: number }[];
  work_orders: { id: string; asset_id: string; title: string; priority: number; status: string; scheduled_for: string | null; created_at: string; vendors?: { name: string } | null }[];
  sweep: { scores: SweepScore[]; created_at: string } | null;
};

const KINDS = ["power", "controls", "cooling", "hvac", "space"] as const;
const tone = (n: number) => (n >= 60 ? "err" : n >= 35 ? "warn" : "ok");

export default function Portfolio() {
  const { data, error, refresh } = usePoll<Data>("/api/portfolio", 8000);
  const [busy, setBusy] = useState(false);
  const scores = new Map((data?.sweep?.scores ?? []).map((x) => [x.property_id, x]));

  async function score() {
    setBusy(true);
    try { await api("/api/sweep", { method: "POST", json: { autostart: false } }); await refresh(); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader
        title="Portfolio"
        sub="Risk score per building, its systems, and who pays when they fail."
        actions={<button type="button" className="btn" disabled={busy} onClick={() => { void score(); }}><Icon name="gauge" size={15} />{busy ? "Scoring…" : "Score buildings"}</button>}
      />
      {error && <p className="c-err">{error}</p>}

      {data?.sweep && (
        <section className="card rise">
          <div className="ch"><h2>Last Sweep</h2><span className="n">{ago(data.sweep.created_at)}</span></div>
          <div className="rows">
            {data.sweep.scores.map((x) => (
              <div key={x.property_id} className={s.score}>
                <span className={s.pname}><b>{x.name}</b><em>{x.building_type}</em></span>
                <div className={`bar ${tone(x.score)}`}><i style={{ width: `${x.score}%` }} /></div>
                <b className={`mono c-${tone(x.score)}`}>{x.score}</b>
                <span className={s.reasons}>{x.reasons.map((r) => <span key={r.text} className="tag">{r.text} +{r.points}</span>)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={s.props}>
        {data?.properties.map((p) => {
          const assets = data.assets.filter((a) => a.property_id === p.id);
          const tenants = data.tenants.filter((t) => t.property_id === p.id);
          const tickets = data.tickets.filter((t) => t.property_id === p.id);
          const sc = scores.get(p.id);
          return (
            <article key={p.id} className="card rise">
              <div className="ch">
                <h2>{p.name}</h2><span className="n">{p.building_type}</span>
                <span className="right">{sc && <span className={`tag ${tone(sc.score)}`}>RISK {sc.score}</span>}{tickets.length > 0 && <span className="tag">{tickets.length} open tickets</span>}</span>
              </div>
              <div className={s.chain}>
                {KINDS.filter((k) => assets.some((a) => a.kind === k)).map((k, i, arr) => (
                  <div key={k} className={s.col}>
                    <span className="label">{k}</span>
                    {assets.filter((a) => a.kind === k).map((a) => (
                      <span key={a.id} className={`${s.asset} ${a.status !== "ok" ? s.bad : ""}`} title={a.name}>
                        <i className={`dot ${a.status === "ok" ? "c-ok" : a.status === "failed" ? "c-err" : "c-warn"}`} />{a.id}
                      </span>
                    ))}
                    {i < arr.length - 1 && <span className={s.arrow} aria-hidden>→</span>}
                  </div>
                ))}
              </div>
              {tenants.length > 0 && (
                <div className={s.tenants}>
                  {tenants.map((t) => <span key={t.id} className={s.tenant}><Icon name="users" size={13} />{t.name}<em>{usd(Number(t.sla_penalty_per_hour))}/hr · {t.asset_id}</em></span>)}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {!!data?.work_orders.length && (
        <section className="card">
          <div className="ch"><h2>Work Orders Sent</h2><span className="n">{data.work_orders.length}</span></div>
          <div className="rows">
            {data.work_orders.map((w) => (
              <div key={w.id} className={s.wo}>
                <span className="tag ok">P{w.priority}</span><b>{w.title}</b>
                <span className="muted">{w.vendors?.name} · {when(w.scheduled_for)}</span>
                <span className="muted mono">{ago(w.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
