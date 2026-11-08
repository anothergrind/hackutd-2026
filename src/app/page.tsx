"use client";

import { useEffect, useState } from "react";
import RunView from "@/components/run/RunView";
import { StatusIcon } from "@/components/pipeline/Pipeline";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/ui/Icon";
import { api, usePoll } from "@/lib/client";
import { SCENARIOS } from "@/lib/scenarios";
import type { Run } from "@/lib/types";
import s from "./console.module.css";

const PREVIEW = [
  ["Report Received", "A staff report, sensor alarm or nightly check"],
  ["History Review", "Past repairs at the building"],
  ["Agent Analysis", "Specialist agents check tickets, sensors and leases in parallel"],
  ["Cost Analysis", "Cost of delay compared with the repair cost"],
  ["Repair Plan", "Vendor, schedule change and tenant emails"],
  ["Approve Actions", "You approve or reject each action"],
  ["Execution", "Approved actions are sent"],
  ["Verification", "Sensors are checked again after the repair"],
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
  const near = (i: number) => list[i] ? `${list[i].properties?.name ?? ""}: ${list[i].title ?? ""}` : undefined;
  const switcher = list.length > 1 && idx >= 0 ? (
    <nav className={s.switch} aria-label="Move between incidents">
      <button type="button" disabled={idx <= 0} onClick={() => show(idx - 1)} title={near(idx - 1)} aria-label="Previous incident"><Icon name="arrow-left" size={16} /></button>
      <span className={s.count}><b>Incident {idx + 1}</b> of {list.length}</span>
      <button type="button" disabled={idx >= list.length - 1} onClick={() => show(idx + 1)} title={near(idx + 1)} aria-label="Next incident"><Icon name="arrow-right" size={16} /></button>
    </nav>
  ) : null;
  const running = Boolean(runs.data?.runs.some((r) => r.status === "running"));

  async function go(fn: () => Promise<string | null>, key: string) {
    setBusy(key); setNote("");
    try { const id = await fn(); if (id) setRunId(id); void runs.refresh(); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }
  const inject = () => go(async () => (await api<{ run_id: string }>("/api/incidents", { method: "POST", json: { scenario_id: scenario } })).run_id, "run");
  const reset = () => { if (confirm("Clear all runs?")) void go(async () => { await api("/api/reset", { method: "POST" }); setRunId(null); return null; }, "reset"); };

  return (
    <>
      <PageHeader
        title="Live Incident"
        sub="AI agents analyze an incident, price the risk of waiting and prepare the repair for your approval."
        actions={<>
          {switcher}
          {status.data?.reset_enabled && runId && <button type="button" className="btn ghost sm" disabled={!!busy} onClick={reset}><Icon name="reset" size={13} />Reset</button>}
          <div className={s.split}>
            <select className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Scenario">
              {SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
            </select>
            <button type="button" className="btn accent" disabled={!!busy || running} onClick={() => { void inject(); }}>
              <Icon name="play" size={14} />{busy === "run" ? "Starting…" : running ? "Running…" : "Start Analyzing"}
            </button>
          </div>
        </>}
      />
      {note && <p className={s.note} role="status">{note}</p>}

      {runId ? <RunView key={runId} runId={runId} /> : (
        <section className={`card ${s.empty}`}>
          <h2>No Incident Yet</h2>
          <p>Pick a scenario and click <b>Start Analyzing</b>. The analysis follows these steps:</p>
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
