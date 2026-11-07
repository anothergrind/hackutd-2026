import { hoursText, usd } from "@/lib/client";
import type { Risk } from "@/lib/types";
import s from "./RiskCard.module.css";

/** Cost of waiting vs fixing now, with the formula so judges can check the math. */
export default function RiskCard({ risk, running }: { risk: Risk | null; running: boolean }) {
  if (!risk) {
    return (
      <section className="card">
        <div className="ch"><h2>Risk</h2></div>
        <p className="empty">{running ? "The lead prices the risk after the specialists report." : "Not priced for this run."}</p>
      </section>
    );
  }
  const max = Math.max(risk.wait_usd, risk.fix_usd, 1);
  return (
    <section className="card rise">
      <div className="ch">
        <h2>Risk</h2>
        <span className="right"><span className={`tag ${risk.urgency === "act today" ? "err" : risk.urgency === "act this week" ? "warn" : ""}`}>{risk.urgency.toUpperCase()}</span></span>
      </div>
      <div className={s.body}>
        <div className={s.row}>
          <span className={s.k}>If we wait</span>
          <div className={s.track}><i className={s.wait} style={{ width: `${(risk.wait_usd / max) * 100}%` }} /></div>
          <b className={`${s.v} c-err`}>{usd(risk.wait_usd)}</b>
        </div>
        <div className={s.row}>
          <span className={s.k}>If we fix now</span>
          <div className={s.track}><i className={s.fix} style={{ width: `${Math.max(1.5, (risk.fix_usd / max) * 100)}%` }} /></div>
          <b className={`${s.v} c-ok`}>{usd(risk.fix_usd)}</b>
        </div>
        <dl className={s.facts}>
          <div><dt>Saved</dt><dd>{usd(risk.saved_usd)}</dd></div>
          <div><dt>Time to failure</dt><dd>{hoursText(risk.hours_until_failure)}</dd></div>
          <div><dt>SLA penalties</dt><dd>{usd(risk.penalties_usd)}</dd></div>
        </dl>
        <p className={s.formula}>{risk.formula}</p>
      </div>
    </section>
  );
}
