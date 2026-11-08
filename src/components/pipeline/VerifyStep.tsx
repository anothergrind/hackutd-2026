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
  const W = 560, H = 190, P = { l: 44, r: 16, t: 28, b: 28 };
  const limit = Number(v.limit_value);
  const vals = [...pts.map((p) => p.v), limit];
  const span = Math.max(...vals) - Math.min(...vals) || 1;
  const lo = Math.min(...vals) - span * 0.15, hi = Math.max(...vals) + span * 0.15;
  const x = (i: number) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r);
  const y = (val: number) => H - P.b - ((val - lo) / (hi - lo)) * (H - P.t - P.b);
  const split = v.before.length;
  const xs = split > 0 ? x(split - 0.5) : P.l;
  const seg = (from: number, to: number) => pts.slice(from, to).map((p, i) => `${i ? "L" : "M"}${x(from + i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const good = v.status === "passed";
  const unit = metricLabel(v.metric).unit;
  const dp = span < 5 ? 2 : 1;
  const last = pts[pts.length - 1];
  const ticks = [lo + (hi - lo) * 0.2, (lo + hi) / 2, hi - (hi - lo) * 0.2];
  return (
    <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Readings before and after the repair">
      <rect x={xs} y={P.t} width={W - P.r - xs} height={H - P.t - P.b} className={good ? s.zoneGood : s.zoneBad} />
      {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className={s.grid} /><text x={P.l - 8} y={y(t) + 4} textAnchor="end" className={s.axis}>{t.toFixed(dp)}</text></g>)}
      <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} className={s.base} />
      <line x1={P.l} x2={W - P.r} y1={y(limit)} y2={y(limit)} className={s.limit} />
      <text x={P.l + 6} y={y(limit) - 6} className={s.limitLbl}>Safe limit {limit}{unit}</text>
      {split > 0 && <line x1={xs} x2={xs} y1={P.t - 12} y2={H - P.b} className={s.repair} />}
      <text x={xs - 8} y={P.t - 16} textAnchor="end" className={s.zone}>Before</text>
      <text x={xs + 8} y={P.t - 16} className={s.zone}>After repair</text>
      {split > 1 && <path d={seg(0, split)} className={s.before} />}
      <path d={`M${x(split - 1)} ${y(pts[Math.max(0, split - 1)].v)} ${seg(split, pts.length).replace(/^M/, "L")}`} className={good ? s.good : s.bad} />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r={p.after ? 4 : 3} className={p.after ? (good ? s.dGood : s.dBad) : s.dBefore}><title>{`${p.v}${unit}`}</title></circle>)}
      <text x={x(pts.length - 1) - 8} y={y(last.v) + (last.v > limit === good ? 18 : -10)} textAnchor="end" className={good ? s.valGood : s.valBad}>{last.v}{unit}</text>
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

  if (!v) return <p className="muted">{repairApproved ? "Scheduling the check…" : "Once the repair is approved, the AI checks the sensors again to confirm the incident is resolved."}</p>;
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
