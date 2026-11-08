"use client";

import { useState } from "react";
import PageHeader from "@/components/shell/PageHeader";
import BuildingNotes, { type Note } from "@/components/buildings/BuildingNotes";
import Icon from "@/components/ui/Icon";
import { assetLabel, plainText } from "@/lib/plain";
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

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const KINDS = ["power", "controls", "cooling", "hvac", "space"] as const;
const KIND_LABEL: Record<string, string> = { power: "Power", controls: "Controls", cooling: "Cooling", hvac: "Heating and Air", space: "Spaces" };
const tone = (n: number) => (n >= 60 ? "err" : n >= 35 ? "warn" : "ok");

export default function Portfolio() {
  const { data, error, refresh } = usePoll<Data>("/api/portfolio", 8000);
  const memory = usePoll<{ memory: Note[] }>("/api/memory", 8000);
  const [busy, setBusy] = useState(false);
  const scores = new Map((data?.sweep?.scores ?? []).map((x) => [x.property_id, x]));

  async function score() {
    setBusy(true);
    try { await api("/api/sweep", { method: "POST", json: { autostart: false } }); await refresh(); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader
        title="Buildings"
        sub="Each building's risk score, equipment, tenants and history. The agents read a building's history before analyzing any incident there."
        actions={<button type="button" className="btn" disabled={busy} onClick={() => { void score(); }}><Icon name="gauge" size={15} />{busy ? "Checking…" : "Check All Buildings"}</button>}
      />
      {error && <p className="c-err">{error}</p>}

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
                <span className="right">{sc && <span className={`tag ${tone(sc.score)}`}>Risk {sc.score}/100</span>}{tickets.length > 0 && <span className="tag">{tickets.length} open ticket{tickets.length === 1 ? "" : "s"}</span>}</span>
              </div>
              <div className={s.chain}>
                {KINDS.filter((k) => assets.some((a) => a.kind === k)).map((k, i, arr) => (
                  <div key={k} className={s.col}>
                    <span className="label">{KIND_LABEL[k] ?? k}</span>
                    {assets.filter((a) => a.kind === k).map((a) => (
                      <span key={a.id} className={`${s.asset} ${a.status !== "ok" ? s.bad : ""}`} title={`${a.id} · ${a.status === "ok" ? "OK" : a.status}`}>
                        <i className={`dot ${a.status === "ok" ? "c-ok" : a.status === "failed" ? "c-err" : "c-warn"}`} />{assetLabel(a.id)}
                      </span>
                    ))}
                    {i < arr.length - 1 && <span className={s.arrow} aria-hidden>→</span>}
                  </div>
                ))}
              </div>
              {tenants.length > 0 && (
                <div className={s.tenants}>
                  {tenants.map((t) => <span key={t.id} className={s.tenant}><Icon name="users" size={13} />{t.name}<em>{usd(Number(t.sla_penalty_per_hour))} per hour of outage</em></span>)}
                </div>
              )}
              <BuildingNotes propertyId={p.id} notes={(memory.data?.memory ?? []).filter((m) => m.property_id === p.id)} assets={assets.map((x) => x.id)} onSaved={() => { void memory.refresh(); }} />
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
                <span className="tag ok">Priority {w.priority}</span><b>{plainText(w.title)}</b>
                <span className="muted">{w.vendors?.name} · {when(w.scheduled_for)}</span>
                <span className="muted">{ago(w.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
