"use client";

import { useEffect, useRef, useState } from "react";
import Decision from "@/components/story/Decision";
import Stepper from "@/components/story/Stepper";
import Icon from "@/components/ui/Icon";
import { ago, hoursText, usd, usePoll, when } from "@/lib/client";
import type { RunDetail } from "@/lib/types";
import { STATUS, storyOf } from "@/lib/view";
import AgentDrawer from "./AgentDrawer";
import CrewGraph from "./CrewGraph";
import StepLog from "./StepLog";
import Timeline from "./Timeline";
import s from "./RunView.module.css";

type Detail = RunDetail & { run: RunDetail["run"] & { properties?: { name: string } | null; telemetry_events?: { asset_id: string; source: string; metric: string; message: string } | null } };
const ORDER = { work_order: 0, schedule_change: 1, tenant_notice: 2 } as const;

/** Where the run is now: the first step waiting on someone, else the furthest step reached. */
function autoStep(phases: string[]) {
  const waiting = phases.indexOf("waiting");
  if (waiting >= 0) return waiting;
  const active = phases.indexOf("active");
  if (active >= 0) return active;
  return Math.max(0, phases.lastIndexOf("done"));
}

/** One run, one step at a time: the stepper picks the panel, and follows the run unless you click. */
export default function RunView({ runId }: { runId: string }) {
  const { data, error, refresh } = usePoll<Detail>(`/api/runs/${runId}`, 1200);
  const [picked, setPicked] = useState<number | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const lastAuto = useRef(-1);

  const story = data ? storyOf(data.run, data.steps, [...data.approvals].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])) : null;
  const auto = story ? autoStep(story.stages.map((x) => x.phase)) : 0;
  // A manual pick holds until the run moves to a new step.
  useEffect(() => {
    if (!data || auto === lastAuto.current) return;
    const first = lastAuto.current === -1;
    lastAuto.current = auto;
    // ?step=2 opens a given step on load (handy for demos); later moves follow the run.
    const q = first ? Number(new URLSearchParams(location.search).get("step")) : 0;
    setPicked(q >= 1 && q <= 5 ? q - 1 : null);
  }, [auto, data]);

  if (error) return <section className="card"><p className="empty c-err">{error}</p></section>;
  if (!data || !story) return <section className="card"><p className="empty">Loading…</p></section>;

  const { run, steps } = data;
  const approvals = [...data.approvals].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const step = picked ?? auto;
  const st = STATUS[run.status];
  const signal = run.telemetry_events;
  const risk = story.risk;
  const selected = agent ? story.crew.find((c) => c.id === agent) : undefined;
  const wo = approvals.find((a) => a.kind === "work_order");

  return (
    <div className="stack">
      <div className={s.top}>
        <span className={s.title}><b>{run.title}</b><em>{run.properties?.name} · {ago(run.created_at)}</em></span>
        <span className={`tag ${st.tone}`}><i className={`dot${run.status === "running" ? " live" : ""}`} />{st.label}</span>
        <span className={`chip ${run.mode === "live" ? "nv" : ""}`}>{run.mode === "live" ? "Nemotron" : "Demo mode"}</span>
      </div>

      <Stepper stages={story.stages} live current={step} onPick={setPicked} />

      <section className={`card ${s.panel}`}>
        {step === 0 && (
          <div className={s.signal}>
            <span className={s.big}><Icon name={run.trigger === "sweep" ? "radar" : "zap"} size={22} /></span>
            <div>
              <span className="label">{run.trigger === "sweep" ? "Flagged by the nightly sweep" : "New incident"}</span>
              <p className={s.msg}>{signal?.message ?? run.title}</p>
              <div className={s.chips}>
                <span className="chip">{run.properties?.name}</span>
                {signal && <span className="chip">{signal.asset_id}</span>}
                {signal && <span className="chip">{signal.source}</span>}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="ch"><h2>The agents at work</h2><span className="n">click an agent to see exactly what it did</span></div>
            <CrewGraph run={run} crew={story.crew} agents={story.agents} approvals={approvals} risk={risk} onSelect={setAgent} selected={agent} />
            <div className={s.tiles}>
              {story.findings.map((f) => {
                const m = story.crew.find((c) => c.id === f.agent);
                return (
                  <button key={f.key} type="button" className={s.tile} data-phase={f.phase} style={{ "--c": m?.color } as React.CSSProperties} onClick={() => setAgent(f.agent)}>
                    <em>{f.label}</em><b>{f.value}</b>
                  </button>
                );
              })}
            </div>
            <details className={s.more}>
              <summary>Timeline and full log</summary>
              <Timeline run={run} steps={steps} agents={story.agents} crew={story.crew} />
              <StepLog steps={steps} t0={run.created_at} crew={story.crew} />
            </details>
          </>
        )}

        {step === 2 && (
          <div className={s.price}>
            {risk ? (
              <>
                <div className={s.money}>
                  <div className={s.wait}><span className="label">If we wait</span><b>{usd(risk.wait_usd)}</b></div>
                  <div className={s.fix}><span className="label">Fix now</span><b>{usd(risk.fix_usd)}</b></div>
                </div>
                <div className={s.facts}>
                  <span><em>Saves</em><b>{usd(risk.saved_usd)}</b></span>
                  <span><em>Fails in</em><b>{hoursText(risk.hours_until_failure)}</b></span>
                  <span><em>Urgency</em><b>{risk.urgency}</b></span>
                </div>
                <p className={s.formula}>{risk.formula}</p>
                {story.brief && <p className={s.brief}>{story.brief}</p>}
              </>
            ) : <p className="empty">Waiting for the agents to report.</p>}
          </div>
        )}

        {step === 3 && <Decision risk={null} approvals={approvals} running={run.status === "running"} onChange={refresh} bare />}

        {step === 4 && (
          <div className={s.done}>
            {story.counts.sent ? (
              <>
                <span className={s.ok}><Icon name="badge" size={26} /></span>
                <h2>Fixed before it failed</h2>
                <ul>
                  {wo?.status === "sent" && <li><Icon name="wrench" size={14} />{String(wo.payload.vendor_name)} booked for {when(String(wo.payload.scheduled_for ?? ""))}</li>}
                  {approvals.filter((a) => a.kind === "schedule_change" && a.status === "sent").map((a) => <li key={a.id}><Icon name="calendar" size={14} />{a.title}</li>)}
                  {approvals.filter((a) => a.kind === "tenant_notice" && a.status === "sent").map((a) => <li key={a.id}><Icon name="mail" size={14} />{String(a.payload.tenant_name)} notified</li>)}
                  <li><Icon name="brain" size={14} />Saved to building memory</li>
                </ul>
              </>
            ) : <p className="empty">{run.status === "running" || story.counts.pending ? "Not yet. Approve the fix first." : "Nothing was sent for this run."}</p>}
          </div>
        )}

        <footer className={s.nav}>
          <button type="button" className="btn sm ghost" disabled={step === 0} onClick={() => setPicked(step - 1)}><Icon name="arrow-left" size={13} />Back</button>
          <span className="muted mono">{step + 1} / 5</span>
          <button type="button" className="btn sm" disabled={step === 4} onClick={() => setPicked(step + 1)}>Next<Icon name="arrow-right" size={13} /></button>
        </footer>
      </section>

      {selected && <AgentDrawer m={selected} v={story.agents[selected.id]} t0={run.created_at} onClose={() => setAgent(null)} />}
    </div>
  );
}
