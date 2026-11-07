"use client";

import { useEffect, useState } from "react";

// Demo signals to inject. Add more here; asset_id must exist in the assets table.
const SCENARIOS = [
  { label: "Chiller vibration spike", asset_id: "CHILLER-1", source: "sensor", metric: "vibration_mm_s", value: 11.4, message: "Compressor vibration 11.4 mm/s, 5x baseline and rising for 20 min" },
  { label: "BMS zero-day: setpoints changed", asset_id: "BMS-1", source: "cyber", metric: "unauthorized_write", value: 14, message: "14 unauthorized setpoint writes to CRAH units from unknown IP 185.220.x.x" },
  { label: "Utility feed sag", asset_id: "UTIL-FEED-1", source: "sensor", metric: "voltage_pct", value: 82, message: "Feed A voltage sag to 82% nominal; storms in forecast" },
  { label: "AHU-04 condensation", asset_id: "AHU-04", source: "ticket", metric: "leak_report", value: 1, message: "Third report this morning: moisture under AHU-04 supply vent" },
] as const;

type Step = { id: number; kind: "thought" | "tool" | "final" | "error"; content: { text?: string; name?: string; args?: unknown; result?: unknown } };
type Run = { id: string; status: "running" | "done" | "error"; summary: string | null };

export function SimulatePanel() {
  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState("");

  async function start(scenario: (typeof SCENARIOS)[number]) {
    setError(""); setSteps([]); setRun(null);
    const response = await fetch("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scenario) });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not start run.");
    setRunId(result.run_id);
  }

  useEffect(() => {
    if (!runId) return;
    // shortcut: polling every 1.5s; switch to Supabase Realtime on agent_steps if it feels laggy.
    const timer = setInterval(async () => {
      const response = await fetch(`/api/agent/runs/${runId}`);
      const result = await response.json();
      if (!response.ok) { clearInterval(timer); return setError(result.error); }
      setRun(result.run); setSteps(result.steps);
      if (result.run.status !== "running") clearInterval(timer);
    }, 1500);
    return () => clearInterval(timer);
  }, [runId]);

  return (
    <section className="panel">
      <p className="kicker">Inject a signal · Nemotron plans, calls tools, acts</p>
      <h2>Cascade simulator</h2>
      <div className="tabs">
        {SCENARIOS.map((s) => (
          <button key={s.label} disabled={run?.status === "running"} onClick={() => start(s)}>{s.label}</button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {runId && !run && <p className="empty">Starting agent…</p>}
      {run && <p className="signal">● {run.status.toUpperCase()}</p>}
      <div className="table">
        {steps.map((step) => (
          <div className="table-row" key={step.id}>
            <div>
              <span className={`badge ${step.kind === "error" ? "high" : "medium"}`}>{step.kind === "tool" ? step.content.name : step.kind.toUpperCase()}</span>
              {step.kind === "tool"
                ? <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#aab4c5" }}>{JSON.stringify(step.content.args)}{"\n→ "}{JSON.stringify(step.content.result, null, 1).slice(0, 1200)}</pre>
                : <p style={{ whiteSpace: "pre-wrap" }}>{step.content.text}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
