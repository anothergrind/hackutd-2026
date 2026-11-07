"use client";

import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/ui/Icon";
import { usePoll } from "@/lib/client";
import { ROSTER } from "@/lib/roster";
import s from "./crew.module.css";

const ICON = { bot: "bot", ticket: "ticket", activity: "activity", scale: "scale", truck: "truck" } as const;

export default function Crew() {
  const { data } = usePoll<{ mode: string; model: string | null }>("/api/status", 30_000);
  return (
    <>
      <PageHeader
        title="Crew"
        sub="Five agents, each owning one fragment of the building's data and only the tools for it. Tools marked “writes” only draft; a manager approves before anything is sent."
        actions={<span className={`chip ${data?.mode === "live" ? "nv" : ""}`}>{data?.mode === "live" ? data.model : "Scripted demo mode · add NVIDIA_API_KEY for live Nemotron"}</span>}
      />
      <section className={s.grid}>
        {ROSTER.map((a, i) => (
          <article key={a.id} className={`card rise ${a.id === "lead" ? s.lead : ""}`} style={{ "--c": a.color, "--d": `${i * 60}ms` } as React.CSSProperties}>
            <div className={s.head}>
              <span className={s.ico}><Icon name={ICON[a.icon]} size={18} /></span>
              <div><b>{a.name}</b><p>{a.role}</p></div>
            </div>
            <p className={s.owns}><span className="label">Owns</span>{a.owns}</p>
            <div className="rows">
              {a.tools.map((t) => (
                <div key={t.name} className={s.tool}>
                  <span className="mono">{t.name}</span>
                  <span className="muted">{t.what}</span>
                  {t.writes && <span className="tag warn">writes</span>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
