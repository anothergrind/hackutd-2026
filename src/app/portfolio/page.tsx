"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "@/components/shell/PageHeader";
import BuildingNotes, { type Note } from "@/components/buildings/BuildingNotes";
import Icon from "@/components/ui/Icon";
import SidePanel from "@/components/ui/SidePanel";
import { assetLabel, plainText } from "@/lib/plain";
import { api, usd, usePoll, when } from "@/lib/client";
import type { SweepScore } from "@/lib/types";
import s from "./portfolio.module.css";

type Asset = { id: string; property_id: string; name: string; kind: string; status: string };
type Data = {
  properties: { id: string; name: string; address: string; building_type: string }[];
  assets: Asset[];
  tenants: { id: string; property_id: string; asset_id: string; name: string; sla_penalty_per_hour: number }[];
  tickets: { id: string; property_id: string; equipment: string; title: string; urgency: number }[];
  work_orders: { id: string; asset_id: string; title: string; priority: number; status: string; scheduled_for: string | null; created_at: string; vendors?: { name: string } | null }[];
  sweep: { scores: SweepScore[]; created_at: string } | null;
};
type Run = { id: string; status: string; title: string | null; property_id: string | null; pending?: number; telemetry_events?: { asset_id: string } | null };

const KINDS = ["power", "controls", "cooling", "hvac", "space"] as const;
const KIND_LABEL: Record<string, string> = { power: "Power", controls: "Controls", cooling: "Cooling", hvac: "Heating and Air", space: "Spaces" };
const tone = (n: number) => (n >= 60 ? "err" : n >= 35 ? "warn" : "ok");

/** Where a piece of equipment stands, from its status and its newest incident. */
/** `short` is what fits on the diagram; `label` is the full wording for hover text. */
type State = { key: "approve" | "approved" | "fixed" | "risk" | "ok"; label: string; short: string; run?: Run };
function stateOf(a: Asset, run?: Run): State {
  if (a.status !== "ok") {
    if (run && (run.pending ?? 0) > 0) return { key: "approve", label: `${run.pending} action${run.pending === 1 ? "" : "s"} to approve`, short: String(run.pending), run };
    if (run && run.status === "done") return { key: "approved", label: "Repair approved", short: "Approved", run };
    if (run) return { key: "risk", label: run.status === "running" ? "Analyzing" : "At risk", short: run.status === "running" ? "Analyzing" : "At risk", run };
    return { key: "risk", label: "At risk", short: "At risk" };
  }
  if (run && run.status === "done") return { key: "fixed", label: "Fixed and verified", short: "Fixed", run };
  return { key: "ok", label: "OK", short: "" };
}

function Chip({ a, st }: { a: Asset; st: State }) {
  const body = <><i className={s.mark} data-k={st.key} /><span className={s.cName}>{assetLabel(a.id)}</span>{st.short && <em data-k={st.key}>{st.short}</em>}</>;
  return st.run && st.key !== "ok"
    ? <Link href={`/approvals?run=${st.run.id}`} className={`${s.chip} ${s.go}`} data-k={st.key} title={`${st.run.title ?? "Incident"}: ${st.label}. Open in Approvals.`}>{body}</Link>
    : <span className={s.chip} data-k={st.key}>{body}</span>;
}

export default function Portfolio() {
  const { data, error, refresh } = usePoll<Data>("/api/portfolio", 5000);
  const memory = usePoll<{ memory: Note[] }>("/api/memory", 8000);
  const runs = usePoll<{ runs: Run[] }>("/api/runs", 4000);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { const id = new URLSearchParams(location.search).get("building"); if (id) setOpenId(id); }, []);
  const scores = new Map((data?.sweep?.scores ?? []).map((x) => [x.property_id, x]));
  // The newest incident on each piece of equipment (the runs list is newest first).
  const incidentOf = new Map<string, Run>();
  for (const r of runs.data?.runs ?? []) { const a = r.telemetry_events?.asset_id; if (a && !incidentOf.has(a)) incidentOf.set(a, r); }
  const st = (a: Asset) => stateOf(a, incidentOf.get(a.id));

  async function score() {
    setBusy(true);
    try { await api("/api/sweep", { method: "POST", json: { autostart: false } }); await refresh(); } finally { setBusy(false); }
  }

  const open = data?.properties.find((p) => p.id === openId);
  const openAssets = open ? data!.assets.filter((a) => a.property_id === open.id) : [];
  const openIds = new Set(openAssets.map((a) => a.id));

  return (
    <>
      <PageHeader
        title="Buildings"
        sub="Each building's risk score, equipment, tenants and history. The agents read a building's history before analyzing any incident there."
        actions={<button type="button" className="btn" disabled={busy} onClick={() => { void score(); }}><Icon name="gauge" size={15} />{busy ? "Checking…" : "Check All Buildings"}</button>}
      />
      {error && <p className="c-err">{error}</p>}

      <section className={`card ${s.table}`}>
        <div className={`${s.row} ${s.hrow}`}>
          <span>Building</span><span>Equipment</span><span>Risk</span><span>Approvals</span><span />
        </div>
        {data?.properties.map((p) => {
          const assets = data.assets.filter((a) => a.property_id === p.id);
          const flagged = assets.map((a) => ({ a, st: st(a) })).filter((x) => x.st.key !== "ok");
          const waiting = flagged.reduce((n, x) => n + (x.st.key === "approve" ? x.st.run?.pending ?? 0 : 0), 0);
          const sc = scores.get(p.id);
          return (
            <div key={p.id} className={s.row} data-open={openId === p.id || undefined}>
              <div className={s.who}>
                <b>{p.name}</b>
                <em>{p.building_type}</em><em>{p.address}</em>
                <div className={s.sums}>
                  {flagged.length ? (["approve", "risk", "approved", "fixed"] as const).map((k) => {
                    const n = flagged.filter((x) => x.st.key === k).length;
                    const label = { approve: "need approval", risk: "at risk", approved: "repair approved", fixed: "fixed" }[k];
                    return n ? <span key={k} className={s.sum}><i className={s.mark} data-k={k} />{n} {label}</span> : null;
                  }) : <span className={s.sum}><i className={s.mark} data-k="ok" />All equipment OK</span>}
                </div>
              </div>
              {/* How the building's systems feed each other, left to right. */}
              <div className={s.chain}>
                {KINDS.filter((k) => assets.some((a) => a.kind === k)).map((k, i, arr) => (
                  <div key={k} className={s.col}>
                    <span className={s.colName}>{KIND_LABEL[k] ?? k}</span>
                    {assets.filter((a) => a.kind === k).map((a) => <Chip key={a.id} a={a} st={st(a)} />)}
                    {i < arr.length - 1 && <span className={s.arrow} aria-hidden>→</span>}
                  </div>
                ))}
              </div>
              <div>{sc ? <span className={`tag ${tone(sc.score)}`}>{sc.score}/100</span> : <span className="muted">–</span>}</div>
              <div className={s.num}>{waiting ? <b>{waiting} action{waiting === 1 ? "" : "s"}</b> : <span className="muted">None</span>}</div>
              <div className={s.act}><button type="button" className="btn sm" onClick={() => setOpenId(p.id)}>View<Icon name="arrow-right" size={13} /></button></div>
            </div>
          );
        })}
      </section>

      {open && (() => {
        const sc = scores.get(open.id);
        const tenants = data!.tenants.filter((t) => t.property_id === open.id);
        const tickets = data!.tickets.filter((t) => t.property_id === open.id);
        const repairs = data!.work_orders.filter((w) => openIds.has(w.asset_id));
        return (
          <SidePanel eyebrow="Building" label={open.name} onClose={() => setOpenId(null)}>
            <header className={s.pHead}>
              <h2>{open.name}</h2>
              <p>{open.building_type}, {open.address}</p>
              <dl className={s.pFacts}>
                <div><dt>Risk Score</dt><dd>{sc ? `${sc.score}/100` : "–"}</dd></div>
                <div><dt>Open Tickets</dt><dd>{tickets.length}</dd></div>
                <div><dt>Tenants</dt><dd>{tenants.length}</dd></div>
                <div><dt>Repairs Sent</dt><dd>{repairs.length}</dd></div>
              </dl>
            </header>

            <div className={s.pBody}>
              {tenants.length > 0 && <>
                <h3 className={s.h3}>Tenants</h3>
                <ul className={s.list}>
                  {tenants.map((t) => <li key={t.id}><b>{t.name}</b><span>{usd(Number(t.sla_penalty_per_hour))} per hour of outage</span></li>)}
                </ul>
              </>}

              {repairs.length > 0 && <>
                <h3 className={s.h3}>Repairs Sent</h3>
                <ul className={s.list}>
                  {repairs.slice(0, 6).map((w) => <li key={w.id}><b>{plainText(w.title)}</b><span>{[w.vendors?.name, w.scheduled_for ? when(w.scheduled_for) : null].filter(Boolean).join(", ") || "Done"}</span></li>)}
                </ul>
              </>}

              {sc && sc.reasons.length > 0 && <>
                <h3 className={s.h3}>Why This Risk Score</h3>
                <ul className={s.list}>{sc.reasons.map((r) => <li key={r.text}><b>{r.text}</b><span>+{r.points} points</span></li>)}</ul>
              </>}
            </div>

            <div className={s.notes}>
              <BuildingNotes propertyId={open.id} notes={(memory.data?.memory ?? []).filter((m) => m.property_id === open.id)} assets={openAssets.map((x) => x.id)} onSaved={() => { void memory.refresh(); }} />
            </div>
          </SidePanel>
        );
      })()}
    </>
  );
}
