"use client";

import Link from "next/link";
import { useEffect } from "react";
import Icon from "@/components/ui/Icon";
import { summarize, type AgentView, type CrewMember } from "@/lib/view";
import s from "./AgentDrawer.module.css";

const ICON = { bot: "bot", ticket: "ticket", activity: "activity", scale: "scale", truck: "truck", zap: "zap", history: "history", shield: "shield", sparkles: "sparkles" } as const;

/** Everything one agent did in this run: its task, each tool call (expandable) and its report. */
export default function AgentDrawer({ m, v, t0, onClose }: { m: CrewMember; v?: AgentView; t0: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const base = Date.parse(t0);
  const secs = v?.start && v.end ? ((v.end - v.start) / 1000).toFixed(1) : null;

  return (
    <>
      <div className={s.scrim} onClick={onClose} />
      <aside className={s.drawer} style={{ "--c": m.color } as React.CSSProperties} aria-label={`${m.name} details`}>
        <header className={s.head}>
          <span className={s.ico}><Icon name={ICON[m.icon]} size={18} /></span>
          <div><b>{m.name}</b><em>{m.role}</em></div>
          <button type="button" className="ibtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </header>
        <div className={s.meta}>
          <span className={`tag ${v?.st === "SUCCEEDED" ? "ok" : v?.st === "RUNNING" ? "accent" : v?.st === "FAILED" ? "err" : ""}`}>{v?.st === "SUCCEEDED" ? "DONE" : v?.st ?? "NOT STARTED"}</span>
          {secs && <span className="mono muted">{secs}s</span>}
          <span className="mono muted">{(v?.tools ?? []).length} tool calls</span>
          <Link href={`/crew?agent=${m.id}`} className={`btn sm ${s.edit}`}><Icon name="sliders" size={13} />Edit agent</Link>
        </div>

        {v?.task && <section className={s.sec}><span className="label">Task from the lead</span><p className={s.task}>{v.task.split("\n")[0]}</p></section>}

        <section className={s.sec}>
          <span className="label">What it did</span>
          {!v?.steps.length && <p className="muted">Has not started in this run.</p>}
          <ol className={s.steps}>
            {v?.steps.filter((x) => x.kind !== "start").map((x) => (
              <li key={x.id} data-kind={x.kind}>
                <span className={s.at}>{((Date.parse(x.created_at) - base) / 1000).toFixed(1)}s</span>
                {x.kind === "tool" ? (
                  <details>
                    <summary><b className="mono">{x.content.name}</b> <span>{summarize(x)}</span></summary>
                    <pre>{JSON.stringify({ args: x.content.args, result: x.content.result }, null, 2).slice(0, 3000)}</pre>
                  </details>
                ) : (
                  <p>{x.content.text}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </>
  );
}
