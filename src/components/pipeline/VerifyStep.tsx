"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { api } from "@/lib/client";
import { assetName, metricLabel } from "@/lib/plain";
import { scenarioByLabel } from "@/lib/scenarios";
import type { Verification } from "@/lib/verify";
import s from "./VerifyStep.module.css";

/** Before/after readings with the safe limit, so anyone can see the fix worked (or didn't). */
function Chart({ v }: { v: Verification }) {
  const pts = [...v.before.map((p) => ({ ...p, after: false })), ...v.after.map((p) => ({ ...p, after: true }))];
  if (pts.length < 2) return null;
  const W = 420, H = 120, pad = 26;
  const limit = Number(v.limit_value);
  const vals = [...pts.map((p) => p.v), limit];
  const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (val: number) => H - pad - ((val - lo) / (hi - lo)) * (H - pad * 2);
  const split = v.before.length;
  const line = (from: number, to: number) => pts.slice(from, to).map((p, i) => `${i ? "L" : "M"}${x(from + i)} ${y(p.v)}`).join(" ");
  const good = v.status === "passed";
  const unit = metricLabel(v.metric).unit;
  return (
    <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Readings before and after the repair">
      <line x1={pad} x2={W - pad} y1={y(limit)} y2={y(limit)} className={s.limit} />
      <text x={W - pad} y={y(limit) - 5} textAnchor="end" className={s.lbl}>safe limit {limit}{unit}</text>
      {split > 0 && <line x1={x(split - 0.5)} x2={x(split - 0.5)} y1={8} y2={H - pad + 4} className={s.repair} />}
      {split > 0 && <text x={x(split - 0.5) + 4} y={16} className={s.lbl}>repair</text>}
      {split > 1 && <path d={line(0, split)} className={s.before} />}
      <path d={`M${x(split - 1)} ${y(pts[Math.max(0, split - 1)].v)} ${line(split, pts.length).replace(/^M/, "L")}`} className={good ? s.good : s.bad} />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r={3} className={p.after ? (good ? s.dGood : s.dBad) : s.dBefore} />)}
      <text x={pad} y={H - 6} className={s.lbl}>before</text>
      <text x={W - pad} y={H - 6} textAnchor="end" className={s.lbl}>after repair</text>
    </svg>
  );
}

export default function VerifyStep({ runId, runTitle, v, repairApproved, refresh }: {
  runId: string; runTitle: string | null; v: Verification | null | undefined; repairApproved: boolean; refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function check(outcome: "pass" | "fail") {
    setBusy(true);
    try { await api("/api/verify", { method: "POST", json: { run_id: runId, outcome } }); } finally { setBusy(false); refresh(); }
  }
  async function followUp() {
    const sc = scenarioByLabel(runTitle);
    if (!sc) return;
    setBusy(true);
    try { await api("/api/incidents", { method: "POST", json: { scenario_id: sc.id } }); location.reload(); } finally { setBusy(false); }
  }

  if (!v) return <p className="muted">{repairApproved ? "Scheduling the check…" : "Once the repair is approved, the AI checks the sensors again to confirm the problem is gone."}</p>;
  const m = metricLabel(v.metric);
  const latest = v.after[v.after.length - 1]?.v;

  if (v.status === "scheduled") {
    const secs = Math.max(0, Math.ceil((Date.parse(v.due_at) - now) / 1000));
    return (
      <div className={s.wrap}>
        <p className={s.lead}>Waiting for the repair to finish. The AI will read the {m.label} on {assetName(v.asset_id)} again {secs ? `in ${secs} seconds` : "now"}.</p>
        <div className={s.btns}>
          <button type="button" className="btn sm" disabled={busy} onClick={() => { void check("pass"); }}><Icon name="radar" size={13} />Check Now</button>
          <button type="button" className="btn sm ghost" disabled={busy} onClick={() => { void check("fail"); }}>Simulate a Failed Repair</button>
        </div>
        <p className={s.small}>Demo: there is no real repair, so the after-repair readings are simulated.</p>
      </div>
    );
  }
  return (
    <div className={s.wrap}>
      <p className={`${s.lead} ${v.status === "passed" ? s.ok : s.no}`}>
        <Icon name={v.status === "passed" ? "check" : "x"} size={15} />
        {v.status === "passed"
          ? `Fix confirmed. ${assetName(v.asset_id).replace(/^./, (c) => c.toUpperCase())} is back to ${latest}${m.unit} and improving.`
          : `The repair did not hold. ${assetName(v.asset_id).replace(/^./, (c) => c.toUpperCase())} is at ${latest}${m.unit} and still getting worse.`}
      </p>
      <Chart v={v} />
      {v.status === "failed" && (
        <div className={s.btns}><button type="button" className="btn sm accent" disabled={busy} onClick={() => { void followUp(); }}><Icon name="play" size={13} />Start a Follow-Up Incident</button></div>
      )}
      
    </div>
  );
}
