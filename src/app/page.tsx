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
  const runs = usePoll<{ runs: (Run & { pending: number })[] }>("/api/runs", 4000);
  const status = usePoll<{ mode: string; reset_enabled: boolean }>("/api/status", 60_000);
  const [runId, setRunId] = useState<string | null>(null);
  const [other, setOther] = useState(SCENARIOS[1].id);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  // Follow the newest run unless the user just started one.
  const latest = runs.data?.runs[0]?.id ?? null;
  useEffect(() => { if (!runId && latest) setRunId(latest); }, [latest, runId]);
  const running = Boolean(runs.data?.runs.some((r) => r.status === "running"));

  async function inject(id: string) {
    setBusy(id); setNote("");
    try {
      const r = await api<{ run_id: string }>("/api/incidents", { method: "POST", json: { scenario_id: id } });
      setRunId(r.run_id);
      void runs.refresh();
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }
  async function sweep() {
    setBusy("sweep"); setNote("");
    try {
      const r = await api<{ run_id: string | null; scores: { name: string; score: number }[] }>("/api/sweep", { method: "POST", json: {} });
      const top = r.scores[0];
      setNote(r.run_id ? `The sweep scored every building and flagged ${top.name} (${top.score}/100), so the agents started on their own.` : `Sweep done. Highest risk: ${top?.name ?? "none"} (${top?.score ?? 0}/100), below the bar.`);
      if (r.run_id) setRunId(r.run_id);
      void runs.refresh();
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }
  async function reset() {
    if (!confirm("Clear all runs and approvals? The demo buildings stay.")) return;
    setBusy("reset");
    try { await api("/api/reset", { method: "POST" }); setRunId(null); void runs.refresh(); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  const demo = SCENARIOS[0];
  return (
    <>
      <header className={`${s.hero} rise`}>
        <span className={s.kicker}>HackUTD 2026 · CBRE · NVIDIA Nemotron · NMC²</span>
        <h1>Catch building failures before they happen.</h1>
        <p>
          OpsCrew is a team of AI agents for property and data center managers. It connects the data that usually lives in separate
          systems (maintenance tickets, sensor readings, leases and the weather), predicts what is about to break, shows what waiting
          would cost, and drafts the fix. <b>You approve it with one click.</b>
        </p>
        <div className={s.actions}>
          <button type="button" className={`btn accent ${s.big}`} disabled={!!busy || running} onClick={() => { void inject(demo.id); }}>
            <Icon name="play" size={15} />{busy === demo.id ? "Starting…" : running ? "Agents are working…" : "Run the demo incident"}
          </button>
          <span className={s.demoNote}>{demo.blurb} at Avon DC1</span>
          <span className={s.spacer} />
          <div className={s.more}>
            <select className="input" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Other scenarios">
              {SCENARIOS.slice(1).map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
            </select>
            <button type="button" className="btn sm" disabled={!!busy || running} onClick={() => { void inject(other); }}>Run</button>
          </div>
          <button type="button" className="btn sm" disabled={!!busy || running} onClick={() => { void sweep(); }}><Icon name="radar" size={13} />{busy === "sweep" ? "Sweeping…" : "Nightly sweep"}</button>
          {status.data?.reset_enabled && runId && <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => { void reset(); }}><Icon name="reset" size={13} />Reset</button>}
        </div>
        {note && <p className={s.note} role="status">{note}</p>}
      </header>

      {runId ? <RunView key={runId} runId={runId} /> : (
        <>
          <h2 className={s.h2}>How it works</h2>
          <Stepper stages={INTRO} live={false} />
          {runs.error && <p className="c-err">{runs.error}</p>}
        </>
      )}
    </>
  );
}
