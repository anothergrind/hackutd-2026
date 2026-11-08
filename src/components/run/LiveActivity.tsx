"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import type { Step } from "@/lib/types";
import { plainCall, plainText } from "@/lib/plain";
import type { AgentView, CrewMember } from "@/lib/view";
import s from "./LiveActivity.module.css";

const ICON = { bot: "bot", ticket: "ticket", activity: "activity", scale: "scale", truck: "truck", zap: "zap", history: "history", shield: "shield", sparkles: "sparkles" } as const;

/** What an agent is doing right now, in plain words. */
export function nowDoing(v: AgentView, waitingOn: number): { verb: string; text: string } {
  if (waitingOn > 0) return { verb: "Waiting", text: `for ${waitingOn} agent${waitingOn === 1 ? "" : "s"} to report` };
  const last: Step | undefined = [...v.steps].reverse().find((x) => x.kind !== "start");
  if (!last) return { verb: "Thinking", text: "reading the task" };
  if (last.kind === "thought") return { verb: "Thinking", text: plainText(last.content.text ?? "") };
  if (last.kind === "tool") {
    if (last.content.name?.startsWith("ask_")) return { verb: "Reading", text: "a report from its team" };
    return { verb: "Just did", text: plainCall(last) };
  }
  return { verb: "Thinking", text: "" };
}

/** Types text out once per new value, like the agent is writing it. */
function Typed({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(text.length); return; }
    const t = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(t); return x; } return x + 2; }), 18);
    return () => clearInterval(t);
  }, [text]);
  return <>{text.slice(0, n)}</>;
}

/** A strip of the agents working right now. Shown only while the run is going. */
export default function LiveActivity({ crew, agents, onAgent }: { crew: CrewMember[]; agents: Record<string, AgentView>; onAgent: (id: string) => void }) {
  const specs = crew.filter((a) => a.kind === "specialist");
  const active = crew.filter((a) => agents[a.id]?.st === "RUNNING");
  if (!active.length) return null;
  const busySpecs = specs.filter((a) => agents[a.id]?.st === "RUNNING").length;
  const dispatchBusy = crew.some((a) => a.kind === "dispatch" && agents[a.id]?.st === "RUNNING");

  return (
    <section className={`card ${s.strip} run-live`} aria-live="polite">
      <span className={s.label}><i className={s.pulse} />AI agents working now</span>
      <div className={s.agents}>
        {active.map((a) => {
          const waiting = a.kind === "lead" ? busySpecs + (dispatchBusy ? 1 : 0) : 0;
          const d = nowDoing(agents[a.id], waiting);
          return (
            <button key={a.id} type="button" className={s.agent} onClick={() => onAgent(a.id)} style={{ "--c": a.color } as React.CSSProperties} data-waiting={waiting > 0 || undefined}>
              <span className={s.avatar}><Icon name={ICON[a.icon]} size={15} /></span>
              <span className={s.text}>
                <b>{a.name}</b>
                <span className={s.doing}>
                  <em>{d.verb}</em>
                  {d.verb === "Thinking" || d.verb === "Waiting" ? <span className={s.dots}><i /><i /><i /></span> : null}
                  <span className={s.line}><Typed text={d.text} /></span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
