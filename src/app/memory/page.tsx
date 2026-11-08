"use client";

import { useState } from "react";
import PageHeader from "@/components/shell/PageHeader";
import { ago, api, usePoll } from "@/lib/client";
import s from "./memory.module.css";

type Note = { id: string; property_id: string; asset_id: string | null; note: string; source: "agent" | "manager" | "seed"; run_id: string | null; created_at: string; properties?: { name: string } | null };
type Props = { properties: { id: string; name: string }[] };

export default function Memory() {
  const { data, refresh } = usePoll<{ memory: Note[] }>("/api/memory", 6000);
  const { data: props } = usePoll<Props>("/api/portfolio", 60_000);
  const [form, setForm] = useState({ property_id: "", asset_id: "", note: "" });
  const [err, setErr] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try {
      await api("/api/memory", { method: "POST", json: { ...form, property_id: form.property_id || props?.properties[0]?.id } });
      setForm((f) => ({ ...f, note: "", asset_id: "" }));
      void refresh();
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
  }

  return (
    <>
      <PageHeader title="Building memory" sub="What the agents remember about each building. Read at the start of every run." />
      <div className="grid2">
        <section className="card">
          <div className="ch"><h2>Notes</h2><span className="n">{data?.memory.length ?? 0}</span></div>
          <div className="rows">
            {data?.memory.map((m) => (
              <div key={m.id} className={s.note}>
                <span className={`tag ${m.source === "agent" ? "accent" : m.source === "manager" ? "ok" : ""}`}>{m.source}</span>
                <div>
                  <p>{m.note}</p>
                  <span className="muted mono" style={{ fontSize: 11 }}>{m.properties?.name}{m.asset_id ? ` · ${m.asset_id}` : ""} · {ago(m.created_at)}{m.run_id ? <> · <a className="link" href={`/runs/${m.run_id}`}>run</a></> : null}</span>
                </div>
              </div>
            ))}
            {data && !data.memory.length && <p className="empty">No notes yet.</p>}
          </div>
        </section>
        <form className="card" onSubmit={(e) => { void save(e); }}>
          <div className="ch"><h2>Add a note</h2></div>
          <div className={s.form}>
            <label><span className="label">Building</span>
              <select className="input" value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
                {props?.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label><span className="label">Asset (optional)</span><input className="input" placeholder="CHILLER-1" value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} /></label>
            <label><span className="label">Note</span><textarea className="input" rows={4} placeholder="CRAH-A1 pump was replaced on Nov 8; watch condensate amps." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            <button type="submit" className="btn solid" disabled={!form.note.trim()}>Save note</button>
            {err && <p className="c-err">{err}</p>}
          </div>
        </form>
      </div>
    </>
  );
}
