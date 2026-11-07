"use client";

import { ROSTER, type AgentId } from "@/lib/roster";
import type { Run, Step } from "@/lib/types";
import type { AgentView } from "@/lib/view";
import s from "./Timeline.module.css";

const tone = { start: s.run, thought: "", tool: s.ok, final: s.ok, error: s.err } as const;

/** One lane per agent: how long it ran, with every step as a dot. Parallel work shows as overlapping bars. */
export default function Timeline({ run, steps, agents }: { run: Run; steps: Step[]; agents: Record<AgentId, AgentView> }) {
  const t0 = Date.parse(run.created_at);
  const live = run.status === "running";
  const last = steps.length ? Date.parse(steps[steps.length - 1].created_at) : t0;
  const now = live ? Math.max(Date.now(), last) : last;
  const elapsed = Math.max(1, (now - t0) / 1000);
  const span = live ? Math.max(20, Math.ceil((elapsed + 3) / 5) * 5) : Math.max(5, Math.ceil(elapsed));
  const x = (ms: number) => `${(Math.min(Math.max(0, ms - t0) / 1000, span) / span) * 100}%`;
  const step = span <= 20 ? 5 : span <= 60 ? 10 : span <= 180 ? 30 : 60;
  const ticks: number[] = [];
  for (let v = 0; v <= span + 0.01; v += step) ticks.push(v);

  return (
    <div className={s.lanes}>
      {ROSTER.map((a) => {
        const v = agents[a.id];
        const end = v.end ?? now;
        return (
          <div key={a.id} className={s.ln}>
            <span className="agent-tag" style={{ "--c": a.color } as React.CSSProperties}>{a.name}</span>
            <div className={s.track}>
              {v.start !== undefined && (
                <i className={`${s.bar} ${v.st === "RUNNING" ? s.barRun : ""} ${v.st === "FAILED" ? s.barErr : ""}`}
                  style={{ left: x(v.start), width: `calc(${x(end)} - ${x(v.start)})`, "--c": a.color } as React.CSSProperties} />
              )}
              {steps.filter((e) => e.agent === a.id).map((e) => (
                <i key={e.id} className={`${s.ev} ${tone[e.kind] ?? ""}`} style={{ left: x(Date.parse(e.created_at)) }}
                  data-tip={`${e.kind}${e.content.name ? " · " + e.content.name : ""}`} />
              ))}
            </div>
          </div>
        );
      })}
      <div className={s.axis}>
        <span />
        <div className={s.ticks}>{ticks.map((v) => <span key={v} style={{ left: `${(v / span) * 100}%` }}>{v}s</span>)}</div>
      </div>
    </div>
  );
}
