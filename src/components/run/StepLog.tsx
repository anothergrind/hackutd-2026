"use client";

import { agentMeta } from "@/lib/roster";
import type { Step } from "@/lib/types";
import { summarize } from "@/lib/view";
import s from "./StepLog.module.css";

/** Every step, newest first. Tool rows expand to the exact arguments and result. */
export default function StepLog({ steps, t0 }: { steps: Step[]; t0: string }) {
  if (!steps.length) return <p className="empty">Steps appear here as the crew works.</p>;
  const base = Date.parse(t0);
  return (
    <div className={s.log}>
      {[...steps].reverse().map((st) => {
        const meta = agentMeta(st.agent);
        const at = `${((Date.parse(st.created_at) - base) / 1000).toFixed(1)}s`;
        const head = (
          <>
            <span className={s.at}>{at}</span>
            <span className="agent-tag" style={{ "--c": meta.color } as React.CSSProperties}>{meta.name}</span>
            <span className={`${s.kind} ${s[st.kind]}`}>{st.kind === "tool" ? st.content.name : st.kind}</span>
            <span className={s.text}>
              {st.kind === "tool" ? summarize(st) : st.kind === "start" ? st.content.task : st.content.text}
            </span>
          </>
        );
        return st.kind === "tool" ? (
          <details key={st.id} className={s.row}>
            <summary>{head}</summary>
            <pre className={s.pre}>{JSON.stringify({ args: st.content.args, result: st.content.result }, null, 2).slice(0, 4000)}</pre>
          </details>
        ) : (
          <div key={st.id} className={`${s.row} ${s.plain}`}>{head}</div>
        );
      })}
    </div>
  );
}
