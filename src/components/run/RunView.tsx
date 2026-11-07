"use client";

import Decision from "@/components/story/Decision";
import Findings from "@/components/story/Findings";
import Stepper from "@/components/story/Stepper";
import Icon from "@/components/ui/Icon";
import { ago, usePoll } from "@/lib/client";
import type { RunDetail } from "@/lib/types";
import { STATUS, storyOf } from "@/lib/view";
import CrewGraph from "./CrewGraph";
import StepLog from "./StepLog";
import Timeline from "./Timeline";
import s from "./RunView.module.css";

type Detail = RunDetail & { run: RunDetail["run"] & { properties?: { name: string; building_type: string } | null; telemetry_events?: { asset_id: string; source: string; message: string } | null } };
const ORDER = { work_order: 0, schedule_change: 1, tenant_notice: 2 } as const;

/** One incident told as a story (stages, findings, decision), with the agent mechanics underneath. */
export default function RunView({ runId }: { runId: string }) {
  const { data, error, refresh } = usePoll<Detail>(`/api/runs/${runId}`, 1200);
  if (error) return <section className="card"><p className="empty c-err">{error}</p></section>;
  if (!data) return <section className="card"><p className="empty">Loading…</p></section>;

  const { run, steps } = data;
  const approvals = [...data.approvals].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const story = storyOf(run, steps, approvals);
  const st = STATUS[run.status];
  const signal = run.telemetry_events ?? null;

  return (
    <div className="stack">
      <section className={`card rise ${s.incident}`}>
        <span className={s.zap}><Icon name={run.trigger === "sweep" ? "radar" : "zap"} size={18} /></span>
        <div className={s.what}>
          <span className="label">{run.trigger === "sweep" ? "Flagged by the nightly sweep" : "Incident"} · {run.properties?.name} · {ago(run.created_at)}</span>
          <b>{signal?.message ?? run.title}</b>
        </div>
        <span className={`tag ${st.tone}`}><i className={`dot${run.status === "running" ? " live" : ""}`} />{st.label}</span>
      </section>

      <Stepper stages={story.stages} live />

      <div className={s.main}>
        <Findings findings={story.findings} brief={story.brief} />
        <Decision risk={story.risk} approvals={approvals} running={run.status === "running"} onChange={refresh} />
      </div>

      <section className="card">
        <div className="ch">
          <h2>How the agents worked it out</h2>
          <span className="n">a lead agent hands work to 4 specialists; each chip is a real tool call</span>
          <span className="right"><span className={`chip ${run.mode === "live" ? "nv" : ""}`}>{run.mode === "live" ? "Nemotron" : "Scripted demo"}</span></span>
        </div>
        <CrewGraph run={run} agents={story.agents} approvals={approvals} signal={signal} />
        <Timeline run={run} steps={steps} agents={story.agents} />
        <details className={s.log}>
          <summary>Full step log ({steps.length})</summary>
          <StepLog steps={steps} t0={run.created_at} />
        </details>
      </section>
    </div>
  );
}
