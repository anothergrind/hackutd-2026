"use client";

import { useEffect, useMemo, useState } from "react";
import SidePanel from "@/components/ui/SidePanel";
import Icon from "@/components/ui/Icon";
import { api, usePoll } from "@/lib/client";
import { assetLabel, METRIC_LABEL } from "@/lib/plain";
import { ASSET_EXAMPLES, type AssetExample } from "@/lib/scenarios";
import { synthSeries } from "@/lib/sensors";
import { baseAsset } from "@/lib/sites";
import s from "./NewIncident.module.css";

type Portfolio = { properties: { id: string; name: string }[]; assets: { id: string; property_id: string; name: string; kind: string }[] };
const METRICS = Object.entries(METRIC_LABEL).map(([id, m]) => ({ id, label: `${m.label}${m.unit ? ` (${m.unit.trim()})` : ""}` }));

/** Realistic example readings for an equipment's example: two weeks drifting toward the limit, with noise. */
function exampleReadings(ex: AssetExample) {
  const hours = ex.sim.hours[0] + Math.random() * (ex.sim.hours[1] - ex.sim.hours[0]);
  return synthSeries(ex.sim, hours).map((p) => `${p.t.slice(0, 16)}Z,${p.v}`).join("\n");
}
const fallbackExample = (assetId: string): AssetExample => ({
  title: `${assetLabel(assetId)} health check`, reported: `${assetLabel(assetId)} readings are drifting toward the limit.`, outage_hours: 4, repair_hours: 3,
  sim: { asset_id: assetId, metric: "health_pct", limit: 70, failing: "falling", normal: 98, hours: [12, 72] },
});
/** Every field of the form, pre-filled for one piece of equipment. */
const prefill = (assetId: string) => {
  const ex = ASSET_EXAMPLES[baseAsset(assetId)] ?? fallbackExample(assetId);
  return { title: ex.title, reported: ex.reported, metric: ex.sim.metric, limit: String(ex.sim.limit), readings: exampleReadings(ex), outage_hours: String(ex.outage_hours), repair_hours: String(ex.repair_hours) };
};

/** Start an incident from your own sensor readings (pasted or uploaded as CSV). */
export default function NewIncident({ onClose, onStarted }: { onClose: () => void; onStarted: (runId: string) => void }) {
  const { data } = usePoll<Portfolio>("/api/portfolio", 0, false);
  const [form, setForm] = useState({ property_id: "", asset_id: "", title: "", reported: "", metric: "", limit: "", readings: "", outage_hours: "4", repair_hours: "3" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const building = form.property_id || data?.properties[0]?.id || "";
  const assets = useMemo(() => (data?.assets ?? []).filter((a) => a.property_id === building && a.kind !== "space"), [data, building]);
  const asset = form.asset_id && assets.some((a) => a.id === form.asset_id) ? form.asset_id : assets[0]?.id ?? "";
  const lines = form.readings.split(/\r?\n/).filter((l) => l.trim()).length;
  // Pick equipment and every box fills in with a realistic example, ready to analyze.
  useEffect(() => { if (asset) setForm((f) => ({ ...f, ...prefill(asset) })); }, [asset]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 500_000) return setErr("That file is too large. Keep it under 500 KB.");
    setForm((f) => ({ ...f, readings: "" }));
    const text = await file.text();
    setForm((f) => ({ ...f, readings: text }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api<{ run_id: string }>("/api/incidents/custom", { method: "POST", json: { ...form, property_id: building, asset_id: asset } });
      onStarted(r.run_id);
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  }

  return (
    <SidePanel eyebrow="New Incident" label="New incident from your data" onClose={onClose}
      footer={<>
        <span className={s.note}>{lines ? `${lines} readings` : "No readings yet"}</span>
        <button type="submit" form="new-incident" className="btn accent" disabled={busy || !asset || lines < 5}><Icon name="play" size={14} />{busy ? "Starting…" : "Start Analyzing"}</button>
      </>}>
      <form id="new-incident" className={s.form} onSubmit={(e) => { void submit(e); }}>
        <h2>Analyze Your Own Data</h2>
        <p className={s.help}>Everything is filled in with example readings for the selected equipment. Change any field, paste your own readings or upload a CSV, then click Start Analyzing.</p>
        <div className={s.row}>
          <label><span className="label">Building</span>
            <select className="input" value={building} onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value, asset_id: "" }))}>
              {data?.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label><span className="label">Equipment</span>
            <select className="input" value={asset} onChange={set("asset_id")}>
              {assets.map((a) => <option key={a.id} value={a.id}>{assetLabel(a.id)}</option>)}
            </select>
          </label>
        </div>
        <label><span className="label">Incident Name</span><input className="input" placeholder="e.g. Chiller running hot" value={form.title} onChange={set("title")} /></label>
        <label><span className="label">What Was Reported</span><textarea className="input" rows={2} placeholder="e.g. Staff noticed the chiller room is warmer than usual." value={form.reported} onChange={set("reported")} /></label>
        <div className={s.row}>
          <label><span className="label">Measurement</span>
            <input className="input" list="metric-list" value={form.metric} onChange={set("metric")} />
            <datalist id="metric-list">{METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</datalist>
          </label>
          <label><span className="label">Safe Limit</span><input className="input" type="number" step="any" value={form.limit} onChange={set("limit")} /></label>
        </div>
        <div>
          <div className={s.readHead}>
            <span className="label">Readings</span>
            <span className={s.actions}>
              <label className={`btn sm ${s.file}`}><Icon name="plus" size={13} />Upload CSV<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => { void upload(e.target.files?.[0]); }} /></label>
              <button type="button" className="btn sm" onClick={() => asset && setForm((f) => ({ ...f, ...prefill(asset) }))}>New Example Data</button>
            </span>
          </div>
          <textarea className={`input ${s.readings}`} rows={8} placeholder={"One reading per line:\n2026-11-08T09:00,46.2\n2026-11-08T12:00,46.5\n…or just one value per line (spaced an hour apart)"} value={form.readings} onChange={set("readings")} />
        </div>
        <div className={s.row}>
          <label><span className="label">Outage If It Fails (Hours)</span><input className="input" type="number" min={0.5} step={0.5} value={form.outage_hours} onChange={set("outage_hours")} /></label>
          <label><span className="label">Repair Time (Hours)</span><input className="input" type="number" min={0.5} step={0.5} value={form.repair_hours} onChange={set("repair_hours")} /></label>
        </div>
        {err && <p className="c-err">{err}</p>}
      </form>
    </SidePanel>
  );
}
