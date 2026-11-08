"use client";

import { useEffect, useState } from "react";
import RunView from "@/components/run/RunView";
import Stepper from "@/components/story/Stepper";
import Icon from "@/components/ui/Icon";
import { api, usePoll } from "@/lib/client";
import { SCENARIOS } from "@/lib/scenarios";
import type { Run } from "@/lib/types";
import { storyOf } from "@/lib/view";
import s from "./console.module.css";

const INTRO = storyOf(undefined, [], []).stages;

export default function Home() {
  const runs = usePoll<{ runs: Run[] }>("/api/runs", 4000);
  const status = usePoll<{ reset_enabled: boolean }>("/api/status", 60_000);
  const [runId, setRunId] = useState<string | null>(null);
  const [scenario, setScenario] = useState(SCENARIOS[0].id);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const latest = runs.data?.runs[0]?.id ?? null;
  useEffect(() => { if (!runId && latest) setRunId(latest); }, [latest, runId]);
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
    setNote(r.run_id ? `Sweep flagged ${r.scores[0].name} (${r.scores[0].score}/100)` : "Sweep: nothing urgent");
    return r.run_id;
  }, "sweep");
  const reset = () => { if (confirm("Clear all runs?")) void go(async () => { await api("/api/reset", { method: "POST" }); setRunId(null); return null; }, "reset"); };

  return (
    <>
      <header className={`${s.hero} rise`}>
        <div>
          <h1>Catch building failures before they happen.</h1>
          <p>AI agents connect tickets, sensors, leases and weather, price the risk, and draft the fix. You approve.</p>
        </div>
        <div className={s.actions}>
          <select className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Scenario">
            {SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
          </select>
          <button type="button" className={`btn accent ${s.big}`} disabled={!!busy || running} onClick={() => { void inject(); }}>
            <Icon name="play" size={15} />{busy === "run" ? "Starting…" : running ? "Running…" : "Run"}
          </button>
          <button type="button" className="btn" disabled={!!busy || running} onClick={() => { void sweep(); }} title="Score every building; start the agents on the worst one">
            <Icon name="radar" size={14} />Sweep
          </button>
          {status.data?.reset_enabled && runId && <button type="button" className="ibtn" disabled={!!busy} onClick={reset} aria-label="Reset demo" data-tip="Reset demo"><Icon name="reset" size={15} /></button>}
        </div>
      </header>
      {note && <p className={s.note} role="status">{note}</p>}

      {runId ? <RunView key={runId} runId={runId} /> : <Stepper stages={INTRO} live={false} />}
    </>
  );
}
