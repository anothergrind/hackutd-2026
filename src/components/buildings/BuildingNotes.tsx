"use client";

import { useState } from "react";
import Md from "@/components/ui/Md";
import { ago, api } from "@/lib/client";
import { assetLabel, plainText } from "@/lib/plain";
import s from "./BuildingNotes.module.css";

export type Note = { id: string; property_id: string; asset_id: string | null; note: string; source: "agent" | "manager" | "seed"; run_id: string | null; created_at: string };
const SOURCE = { agent: "Saved by AI", manager: "Manager", seed: "Building Records" } as const;

/** A building's history: past problems and repairs the agents read before every incident, plus a box to add one. */
export default function BuildingNotes({ propertyId, notes, assets, onSaved }: { propertyId: string; notes: Note[]; assets: string[]; onSaved: () => void }) {
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [asset, setAsset] = useState("");
  const [err, setErr] = useState("");
  const shown = all ? notes : notes.slice(0, 3);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try {
      await api("/api/memory", { method: "POST", json: { property_id: propertyId, asset_id: asset || undefined, note: text } });
      setText(""); setAsset(""); setAdding(false); onSaved();
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
  }

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={s.title}>Building History <em>{notes.length}</em></span>
        <button type="button" className="btn sm" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add Note"}</button>
      </div>
      {adding && (
        <form className={s.form} onSubmit={(e) => { void save(e); }}>
          <select className="input" value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Equipment">
            <option value="">Whole building</option>
            {assets.map((a) => <option key={a} value={a}>{assetLabel(a)}</option>)}
          </select>
          <textarea className="input" rows={2} placeholder="For example: pump replaced on Nov 8, watch it for a week." value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="btn sm accent" disabled={!text.trim()}>Save Note</button>
          {err && <span className="c-err">{err}</span>}
        </form>
      )}
      {notes.length ? (
        <ul className={s.list}>
          {shown.map((m) => (
            <li key={m.id}>
              <p><Md text={plainText(m.note)} /></p>
              <span>{SOURCE[m.source]}{m.asset_id ? `, ${assetLabel(m.asset_id)}` : ""}, {ago(m.created_at)}{m.run_id ? <>{"   "}<a className="link" href={`/?run=${m.run_id}`}>View incident</a></> : null}</span>
            </li>
          ))}
        </ul>
      ) : <p className={s.empty}>No history yet. The AI adds a note after each incident.</p>}
      {notes.length > 3 && <button type="button" className={s.more} onClick={() => setAll((v) => !v)}>{all ? "Show less" : `Show all ${notes.length}`}</button>}
    </div>
  );
}
