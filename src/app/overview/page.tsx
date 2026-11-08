"use client";

import Link from "next/link";
import Icon, { type IconName } from "@/components/ui/Icon";
import { usd, usePoll } from "@/lib/client";
import type { Run, SweepScore } from "@/lib/types";
import s from "./overview.module.css";

type Runs = { runs: (Run & { pending?: number; repaired?: boolean; properties?: { name: string } | null })[] };
type Portfolio = { properties: { id: string; name: string; building_type: string }[]; sweep: { scores: SweepScore[] } | null };

const FLOW: { icon: IconName; title: string; text: string }[] = [
  { icon: "zap", title: "Report", text: "A staff report, sensor alarm or nightly check starts an incident." },
  { icon: "users", title: "Agents Analyze", text: "Specialist agents read tickets, sensors and leases at the same time." },
  { icon: "scale", title: "Cost of Delay", text: "The lead agent compares the cost of waiting with the repair cost." },
  { icon: "check", title: "You Approve", text: "The repair, schedule change and tenant emails wait for your approval." },
  { icon: "badge", title: "Verified", text: "After the repair, the sensors are checked again to confirm the fix." },
];

/** The landing view behind the Canary logo: what the product does, live totals, and every building at a glance. */
export default function Overview() {
  const runs = usePoll<Runs>("/api/runs", 6000);
  const port = usePoll<Portfolio>("/api/portfolio", 30_000);
  const list = runs.data?.runs ?? [];
  const pending = list.filter((r) => (r.pending ?? 0) > 0);
  const atRisk = pending.reduce((n, r) => n + (r.risk?.wait_usd ?? 0), 0);
  // Approved repairs: what waiting would have cost, minus what the repair cost.
  const fixed = list.filter((r) => r.repaired && r.risk);
  const saved = fixed.reduce((n, r) => n + Math.max(0, (r.risk!.wait_usd ?? 0) - (r.risk!.fix_usd ?? 0)), 0);
  const savedIn = new Set(fixed.map((r) => r.property_id)).size;
  const scores = new Map((port.data?.sweep?.scores ?? []).map((x) => [x.property_id, x.score]));
  const buildings = port.data?.properties ?? [];

  return (
    <div className={s.page}>
      <section className={s.hero}>
        <div className={s.heroText}>
          <span className={s.kicker}>Powered by NVIDIA Nemotron</span>
          <h1>Catch building failures before they happen.</h1>
          <p>Canary&apos;s AI agents analyze every incident, price the cost of delay against the repair, and prepare the fix. A facility manager approves with one click.</p>
          <div className={s.ctas}>
            <Link href="/" className={`btn ${s.primary}`}><Icon name="play" size={15} />Analyze an Incident</Link>
            <Link href="/approvals" className={`btn ${s.secondary}`}>Review Approvals</Link>
          </div>
        </div>
        <dl className={s.kpis}>
          <div className={s.saved}><dt>Saved by Repairing Early</dt><dd>{usd(saved)}</dd><em>{fixed.length ? `${fixed.length} approved repair${fixed.length === 1 ? "" : "s"} across ${savedIn} building${savedIn === 1 ? "" : "s"}` : "Approve a repair to start counting"}</em></div>
          <div><dt>Incidents Analyzed</dt><dd>{list.length}</dd></div>
          <div><dt>Pending Approval</dt><dd>{pending.length}</dd></div>
          <div><dt>Cost of Delay at Stake</dt><dd>{usd(atRisk)}</dd></div>
        </dl>
      </section>

      <section className={s.section}>
        <h2>How an Incident Is Handled</h2>
        <ol className={s.flow}>
          {FLOW.map((f, i) => (
            <li key={f.title} style={{ "--i": i } as React.CSSProperties}>
              <span className={s.num}>{i + 1}</span>
              <span className={s.ico}><Icon name={f.icon} size={22} /></span>
              <b>{f.title}</b>
              <p>{f.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.section}>
        <div className={s.secHead}><h2>Buildings</h2><Link className="link" href="/portfolio">View all buildings</Link></div>
        <div className={s.bldgs}>
          {buildings.map((b) => {
            const score = scores.get(b.id);
            const open = list.filter((r) => r.property_id === b.id && (r.pending ?? 0) > 0).length;
            const tone = score == null ? "" : score >= 60 ? "err" : score >= 35 ? "warn" : "ok";
            return (
              <Link key={b.id} href={`/portfolio?building=${b.id}`} className={s.bldg}>
                <span className={s.bTop}><b>{b.name}</b><em>{b.building_type}</em></span>
                <span className={s.meter}><i data-tone={tone} style={{ width: `${score ?? 0}%` }} /></span>
                <span className={s.bFoot}><span>Risk {score ?? "–"}/100</span><span>{open ? `${open} pending approval` : "No pending incidents"}</span></span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
