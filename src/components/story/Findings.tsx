import Icon, { type IconName } from "@/components/ui/Icon";
import { agentMeta } from "@/lib/roster";
import type { Finding } from "@/lib/view";
import s from "./Findings.module.css";

const ICON: Record<string, IconName> = { history: "brain", tickets: "ticket", sensors: "activity", tenants: "users" };

/** What each agent found, as one headline number and one sentence. */
export default function Findings({ findings, brief }: { findings: Finding[]; brief: string | null }) {
  return (
    <section className="card rise">
      <div className="ch"><h2>What the crew found</h2><span className="n">each card is one AI agent reading one data source</span></div>
      <div className={s.grid}>
        {findings.map((f) => {
          const meta = agentMeta(f.agent);
          return (
            <article key={f.key} className={s.f} data-phase={f.phase} style={{ "--c": meta.color } as React.CSSProperties}>
              <header>
                <Icon name={ICON[f.key]} size={14} />
                <span>{f.label}</span>
                <em>{f.phase === "active" ? "checking…" : meta.name}</em>
              </header>
              <b>{f.value}</b>
              <p>{f.detail}</p>
            </article>
          );
        })}
      </div>
      {brief && (
        <div className={s.brief}>
          <span className="label">Lead agent&apos;s summary</span>
          <p>{brief}</p>
        </div>
      )}
    </section>
  );
}
