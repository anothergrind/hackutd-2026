"use client";

import { agentMeta } from "@/lib/roster";
import Md from "@/components/ui/Md";
import { plainText } from "@/lib/plain";
import type { CrewMember } from "@/lib/view";
import type { Step } from "@/lib/types";
import { summarize } from "@/lib/view";
import s from "./StepLog.module.css";

type Llm = { model: string; via: "gpu" | "hosted"; ms: number };
const llmOf = (st: Step) => (st.content as { llm?: Llm }).llm;
/** Which model answered and how long it took, e.g. "Nano 9B on Brev GPU, 1.4 s". */
function llmLabel(l: Llm) {
  const name = l.model.split("/").pop()!.replace(/^nvidia-/, "").replace(/^nemotron-/i, "Nemotron ").replace(/-/g, " ")
    .replace(/\bnano 9b v2\b/i, "Nano 9B").replace(/\bsuper vl 120b a12b\b/i, "Super 120B");
  return `${name} ${l.via === "gpu" ? "on Brev GPU" : "hosted"}, ${(l.ms / 1000).toFixed(1)} s`;
}

/** Every step, newest first. Tool rows expand to the exact arguments and result. */
export default function StepLog({ steps, t0, crew }: { steps: Step[]; t0: string; crew?: CrewMember[] }) {
  if (!steps.length) return <p className="empty">Steps appear here as the crew works.</p>;
  const base = Date.parse(t0);
  return (
    <div className={s.log}>
      {[...steps].reverse().map((st) => {
        const meta = crew?.find((c) => c.id === st.agent) ?? agentMeta(st.agent);
        const at = `${((Date.parse(st.created_at) - base) / 1000).toFixed(1)}s`;
        const head = (
          <>
            <span className={s.at}>{at}</span>
            <span className="agent-tag" style={{ "--c": meta.color } as React.CSSProperties}>{meta.name}</span>
            <span className={`${s.kind} ${s[st.kind]}`}>{st.kind === "tool" ? st.content.name : st.kind}</span>
            <span className={s.text}>
              {st.kind === "tool" ? summarize(st) : st.kind === "thought" && !st.content.text ? <em className={s.quiet}>Chose the next tools</em> : <Md text={plainText((st.kind === "start" ? st.content.task : st.content.text) ?? "")} />}
              {llmOf(st) && <span className={s.llm} data-via={llmOf(st)!.via} title={`Answered by ${llmOf(st)!.model}`}>{llmLabel(llmOf(st)!)}</span>}
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
