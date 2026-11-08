"use client";

import { useEffect, useState } from "react";
import RunView from "@/components/run/RunView";
import { StatusIcon } from "@/components/pipeline/Pipeline";
import NewIncident from "@/components/incident/NewIncident";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/ui/Icon";
import { api, usePoll } from "@/lib/client";
import { SCENARIOS, scenarioByLabel } from "@/lib/scenarios";
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

type Row = Run & { properties?: { name: string } | null; pending?: number };

/** Which problem type an incident is: a scenario id, "custom" (from your data) or "sweep" (nightly check). */
const typeOf = (r: Row) => scenarioByLabel(r.title)?.id ?? (r.trigger === "sweep" || r.title?.startsWith("Sweep:") ? "sweep" : "custom");

export default function Home() {
  const runs = usePoll<{ runs: Row[] }>("/api/runs", 4000);
  const status = usePoll<{ reset_enabled: boolean }>("/api/status", 60_000);
  const [runId, setRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [custom, setCustom] = useState(false);

  const all = runs.data?.runs ?? [];
  const count = (t: string) => all.filter((r) => typeOf(r) === t).length;
  // The incident type picked in the dropdown decides which incidents the arrows move through.
  const list = filter === "all" ? all : all.filter((r) => typeOf(r) === filter);
  useEffect(() => { const q = new URLSearchParams(location.search).get("run"); if (q) setRunId(q); }, []);
  useEffect(() => {
    if (!runs.data) return;
    if (!runId || (filter !== "all" && !list.some((r) => r.id === runId) && all.some((r) => r.id === runId))) setRunId(list[0]?.id ?? null);
  }, [runs.data, runId, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = list.findIndex((r) => r.id === runId);
  const show = (i: number) => {
    const r = list[i];
    if (!r) return;
    setRunId(r.id);
    history.replaceState(null, "", `/?run=${r.id}`);
  };
  const pick = (t: string) => {
    setFilter(t);
    const first = (t === "all" ? all : all.filter((r) => typeOf(r) === t))[0];
    setRunId(first?.id ?? null);
    if (first) history.replaceState(null, "", `/?run=${first.id}`);
  };
  const near = (i: number) => list[i] ? `${list[i].properties?.name ?? ""}: ${list[i].title ?? ""}` : undefined;
  const switcher = list.length > 0 && idx >= 0 ? (
    <nav className={s.switch} aria-label="Move between incidents">
      <button type="button" disabled={idx <= 0} onClick={() => show(idx - 1)} title={near(idx - 1)} aria-label="Previous incident"><Icon name="arrow-left" size={16} /></button>
      <span className={s.count}><b>Incident {idx + 1}</b> of {list.length}</span>
      <button type="button" disabled={idx >= list.length - 1} onClick={() => show(idx + 1)} title={near(idx + 1)} aria-label="Next incident"><Icon name="arrow-right" size={16} /></button>
    </nav>
  ) : null;
  const running = Boolean(all.some((r) => r.status === "running"));

  async function go(fn: () => Promise<string | null>, key: string) {
    setBusy(key); setNote("");
    try { const id = await fn(); if (id) { setRunId(id); history.replaceState(null, "", `/?run=${id}`); } void runs.refresh(); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }
  // Start a new incident of the selected type; with "All" selected, a random problem type.
  const inject = () => {
    if (filter === "custom") return setCustom(true);
    const id = filter !== "all" && filter !== "sweep" ? filter : SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)].id;
    return go(async () => (await api<{ run_id: string }>("/api/incidents", { method: "POST", json: { scenario_id: id } })).run_id, "run");
  };
  const loadDemo = () => go(async () => {
    const r = await api<{ run_ids: string[] }>("/api/incidents/demo", { method: "POST", json: { per_type: 2 } });
    setFilter("all");
    setNote(`Started ${r.run_ids.length} demo incidents across every problem type. They finish in about a minute.`);
    return r.run_ids[0] ?? null;
  }, "demo");
  const reset = () => { if (confirm("Clear all runs?")) void go(async () => { await api("/api/reset", { method: "POST" }); setRunId(null); return null; }, "reset"); };
  const label = filter === "all" ? "All Incident Types" : filter === "custom" ? "From Your Data" : filter === "sweep" ? "Nightly Check" : SCENARIOS.find((x) => x.id === filter)?.label ?? filter;

  return (
    <>
      <PageHeader
        title="Live Incident"
        sub="AI agents analyze an incident, price the risk of waiting and prepare the repair for your approval."
        actions={<>
          {switcher}
          {status.data?.reset_enabled && runId && <button type="button" className="btn ghost sm" disabled={!!busy} onClick={reset}><Icon name="reset" size={13} />Reset</button>}
          <button type="button" className="btn" disabled={!!busy || running} onClick={() => setCustom(true)}><Icon name="plus" size={14} />New Incident From Data</button>
          <div className={s.split}>
            <select className="input" value={filter} onChange={(e) => pick(e.target.value)} aria-label="Incident type">
              <option value="all">All Incident Types ({all.length})</option>
              {SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.label} ({count(sc.id)})</option>)}
              <option value="custom">From Your Data ({count("custom")})</option>
              {count("sweep") > 0 && <option value="sweep">Nightly Check ({count("sweep")})</option>}
            </select>
            <button type="button" className="btn accent" disabled={!!busy || (running && filter !== "custom")} title={filter === "all" ? "Starts a random problem type" : `Starts a new ${label} incident`} onClick={() => { void inject(); }}>
              <Icon name="play" size={14} />{busy === "run" ? "Starting…" : running && filter !== "custom" ? "Running…" : "Start Analyzing"}
            </button>
          </div>
        </>}
      />
      {note && <p className={s.note} role="status">{note}</p>}
      {custom && <NewIncident onClose={() => setCustom(false)} onStarted={(id) => { setCustom(false); setRunId(id); history.replaceState(null, "", `/?run=${id}`); void runs.refresh(); }} />}

      {runId ? <RunView key={runId} runId={runId} /> : (
        <section className={`card ${s.empty}`}>
          <h2>{filter === "all" ? "No Incidents Yet" : `No ${label} Incidents Yet`}</h2>
          <p>Click <b>Start Analyzing</b> to create one{filter === "all" ? ", or load a set of demo incidents covering every problem type" : ""}. The analysis follows these steps:</p>
          {filter === "all" && <p><button type="button" className="btn" disabled={!!busy} onClick={() => { void loadDemo(); }}><Icon name="zap" size={14} />{busy === "demo" ? "Starting…" : "Load Demo Incidents"}</button></p>}
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
