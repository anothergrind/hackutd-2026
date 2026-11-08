"use client";

import { useEffect, useState } from "react";
import RunView from "@/components/run/RunView";
import { StatusIcon } from "@/components/pipeline/Pipeline";
import Icon from "@/components/ui/Icon";
import { api, usePoll } from "@/lib/client";
import { SCENARIOS } from "@/lib/scenarios";
import type { Run } from "@/lib/types";
import s from "./console.module.css";

const PREVIEW = [
  ["Signal Received", "A ticket, sensor alarm or the nightly sweep"],
  ["Read Building History", "What past runs learned"],
  ["Investigate", "Specialist agents check tickets, sensors and leases in parallel"],
  ["Price the Risk", "Cost of waiting vs fixing now"],
  ["Draft the Fix", "Vendor, schedule change, tenant emails"],
  ["Your Approval", "Nothing is sent until you approve"],
  ["Fixed", "Before anything breaks"],
];

export default function Home() {
  const runs = usePoll<{ runs: (Run & { properties?: { name: string } | null; pending?: number })[] }>("/api/runs", 4000);
  const status = usePoll<{ reset_enabled: boolean }>("/api/status", 60_000);
  const [runId, setRunId] = useState<string | null>(null);
  const [scenario, setScenario] = useState(SCENARIOS[0].id);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const list = runs.data?.runs ?? [];
  const latest = list[0]?.id ?? null;
  useEffect(() => { const q = new URLSearchParams(location.search).get("run"); if (q) setRunId(q); }, []);
  useEffect(() => { if (!runId && latest) setRunId(latest); }, [latest, runId]);
  const idx = list.findIndex((r) => r.id === runId);
  const show = (i: number) => {
    const r = list[i];
    if (!r) return;
    setRunId(r.id);
    history.replaceState(null, "", `/?run=${r.id}`);
  };
  const switcher = list.length > 1 && idx >= 0 ? (
    <span className={s.switch}>
      <button type="button" className="btn sm" disabled={idx <= 0} onClick={() => show(idx - 1)} aria-label="Newer problem" title={list[idx - 1] ? `${list[idx - 1].properties?.name ?? ""} · ${list[idx - 1].title ?? ""}` : undefined}><Icon name="arrow-right" size={13} className={s.flip} /></button>
      <span className={s.count}>Problem {idx + 1} of {list.length}</span>
      <button type="button" className="btn sm" disabled={idx >= list.length - 1} onClick={() => show(idx + 1)} aria-label="Older problem" title={list[idx + 1] ? `${list[idx + 1].properties?.name ?? ""} · ${list[idx + 1].title ?? ""}` : undefined}><Icon name="arrow-right" size={13} /></button>
    </span>
  ) : null;
  const running = Boolean(runs.data?.runs.some((r) => r.status === "running"));

  async function go(fn: () => Promise<string | null>, key: string) {
    setBusy(key); setNote("");
    try { const id = await fn(); if (id) setRunId(id); void runs.refresh(); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }
  const inject = () => go(async () => (await api<{ run_id: string }>("/api/incidents", { method: "POST", json: { scenario_id: scenario } })).run_id, "run");
  const sweep = () => go(async () => {
    const r = await api<{ run_id: string | null; scores: { name: string; score: number }[] }>("/api/sweep", { method: "POST", json: {} });
    setNote(r.run_id ? `Sweep flagged ${r.scores[0].name} (risk ${r.scores[0].score}/100) and started a run.` : "Sweep finished. Nothing urgent.");
    return r.run_id;
  }, "sweep");
  const reset = () => { if (confirm("Clear all runs?")) void go(async () => { await api("/api/reset", { method: "POST" }); setRunId(null); return null; }, "reset"); };

  return (
    <>
      <header className={`${s.head} console-head`}>
        <div>
          <h1>Live Incident</h1>
          <p>AI agents investigate, price the risk and draft the fix. You approve.</p>
        </div>
        <div className={s.actions}>
          {status.data?.reset_enabled && runId && <button type="button" className="btn ghost sm" disabled={!!busy} onClick={reset}><Icon name="reset" size={13} />Reset</button>}
          <button type="button" className="btn" disabled={!!busy || running} onClick={() => { void sweep(); }}><Icon name="radar" size={14} />Run Sweep</button>
          <div className={s.split}>
            <select className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Scenario">
              {SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
            </select>
            <button type="button" className="btn accent" disabled={!!busy || running} onClick={() => { void inject(); }}>
              <Icon name="play" size={14} />{busy === "run" ? "Starting…" : running ? "Running…" : "Start Analyzing"}
            </button>
          </div>
        </div>
      </header>
      {note && <p className={s.note} role="status">{note}</p>}

      {runId ? <RunView key={runId} runId={runId} switcher={switcher} /> : (
        <section className={`card ${s.empty}`}>
          <h2>No Incident Yet</h2>
          <p>Pick a scenario and click <b>Start Analyzing</b>. The run follows these steps:</p>
          <ol>
            {PREVIEW.map(([t, d], i) => (
              <li key={t}><StatusIcon st="pending" small /><span className={s.n}>{i + 1}</span><b>{t}</b><em>{d}</em></li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
