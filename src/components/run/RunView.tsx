"use client";

import { useEffect, useState } from "react";
import Pipeline from "@/components/pipeline/Pipeline";
import { ago, usd, usePoll } from "@/lib/client";
import type { RunDetail } from "@/lib/types";
import { scenarioByLabel } from "@/lib/scenarios";
import { assetName, metricLabel, reportType, titleCase } from "@/lib/plain";
import { STATUS, storyOf } from "@/lib/view";
import ForecastChart, { hm, useCountdown } from "@/components/forecast/ForecastChart";
import AgentDrawer from "./AgentDrawer";
import MathTip from "./MathTip";
import CrewGraph from "./CrewGraph";
import Recommendation from "./Recommendation";
import StepLog from "./StepLog";
import Timeline from "./Timeline";
import s from "./RunView.module.css";

type Detail = RunDetail & { run: RunDetail["run"] & { properties?: { name: string } | null; telemetry_events?: Record<string, any> | null } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const ORDER = { work_order: 0, schedule_change: 1, tenant_notice: 2 } as const;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const TABS = [{ id: "steps", label: "What the AI Did" }, { id: "map", label: "Agent Map" }, { id: "log", label: "Full Log" }] as const;

/** One incident: a header with the facts that matter, then the run as numbered steps. */
export default function RunView({ runId }: { runId: string }) {
  const { data, error, refresh } = usePoll<Detail>(`/api/runs/${runId}`, 1200);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("steps");
  const [agent, setAgent] = useState<string | null>(null);
  const [review, setReview] = useState(0);
  const left = useCountdown(data?.forecast?.fail_at);
  useEffect(() => { const h = location.hash.slice(1); if (h === "map" || h === "log") setTab(h); }, []); // #map / #log open that tab

  if (error) return <section className="card"><p className="empty c-err">{error}</p></section>;
  if (!data) return <section className="card"><p className="empty">Loading…</p></section>;

  const { run, steps } = data;
  const approvals = [...data.approvals].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const story = storyOf(run, steps, approvals);
  const st = STATUS[run.status];
  const risk = run.risk;
  const fc = data.forecast;
  const woA = approvals.find((a) => a.kind === "work_order");
  const wo = woA?.payload as Record<string, unknown> | undefined;
  const workOrder = wo ? { vendor: String(wo.vendor_name ?? "Vendor"), hours: Number(wo.est_hours ?? 0) || "the estimated" } : null;
  const sc = scenarioByLabel(run.title);
  const equipment = cap(assetName(run.telemetry_events?.asset_id).replace(/^the /, ""));
  const selected = agent ? story.crew.find((c) => c.id === agent) : undefined;

  return (
    <div className="stack run">
      <section className={`${s.header} run-head`}>
        <div className={s.hMain}>
          <dl className={s.tags}>
            <div><dt>Building</dt><dd>{run.properties?.name ?? "Unknown"}</dd></div>
            <div><dt>Report Type</dt><dd>{reportType(run.trigger, run.telemetry_events?.source)}</dd></div>
            <div><dt>Status</dt><dd><span className={`tag ${st.tone}`}>{st.label}</span></dd></div>
          </dl>
          <h2 className={`${s.h2} run-title`}>{titleCase(run.title ?? "Incident")}</h2>
          <dl className={s.facts}>
            <dt>Reported</dt><dd>{sc?.plain.reported ?? run.telemetry_events?.message}</dd>
            <dt>Equipment</dt><dd>{equipment}</dd>
            {sc?.plain.problem && <><dt>Diagnosis</dt><dd>{cap(sc.plain.problem)}.</dd></>}
          </dl>
        </div>
        <dl className={`${s.stats} run-stats`}>
          <div data-k="wait"><dt>Cost of Delay</dt><dd>{risk ? (
            <MathTip lines={[
              risk.penalty_per_hour != null && risk.outage_hours != null && `Tenant penalties: ${usd(risk.penalty_per_hour)} per hour × ${risk.outage_hours} h outage = ${usd(risk.penalties_usd)}`,
              `Emergency repair: ${usd(risk.fix_usd)} × 2.5 = ${usd(risk.emergency_repair_usd)}`,
              `Total if we wait: ${usd(risk.wait_usd)}`,
            ]}>{usd(risk.wait_usd)}</MathTip>
          ) : "…"}</dd></div>
          <div data-k="fix"><dt>Repair Cost</dt><dd>{risk ? (
            <MathTip lines={[
              workOrder ? `${workOrder.vendor} estimate: callout fee + hourly rate × ${workOrder.hours} h of work` : "Planned repair: vendor callout fee + hourly rate × hours of work",
              `Planned repair now: ${usd(risk.fix_usd)}`,
            ]}>{usd(risk.fix_usd)}</MathTip>
          ) : "…"}</dd></div>
          <div><dt>Time to Failure</dt><dd>{left != null && fc?.fit ? (
            <MathTip lines={[
              `${metricLabel(fc.metric).label}: ${fc.fit.value.toFixed(2)}${metricLabel(fc.metric).unit} now, safe limit ${fc.limit}${metricLabel(fc.metric).unit}`,
              `Trend: ${(fc.fit.slope_per_hour * 24).toFixed(3)}${metricLabel(fc.metric).unit} per day (best-fit line through ${fc.points.length} readings)`,
              `(${fc.limit} − ${fc.fit.value.toFixed(2)}) ÷ ${(fc.fit.slope_per_hour * 24).toFixed(3)} per day ≈ ${hm(left)}`,
              `Fit quality ${Math.round(fc.fit.r2 * 100)}%. Updates as new readings arrive.`,
            ]}>{hm(left)}</MathTip>
          ) : risk?.hours_until_failure != null ? `${Math.round(risk.hours_until_failure)} hours` : risk ? <span className={s.none} title="The sensors show no trend toward a failure limit">No deadline</span> : "…"}</dd></div>
        </dl>
        {run.status === "error" && <p className={`${s.brief} c-err`}>{run.summary}</p>}
      </section>

      {fc && <ForecastChart f={fc} plan={risk && woA ? {
        at: ((woA.payload as Record<string, unknown>).scheduled_for as string | null) ?? null,
        hours: Number((woA.payload as Record<string, unknown>).est_hours ?? 0),
        vendor: String((woA.payload as Record<string, unknown>).vendor_name ?? "Vendor"),
        wait_usd: risk.wait_usd, fix_usd: risk.fix_usd, status: woA.status as "pending" | "sent" | "rejected",
      } : null} />}

      <div className={s.body}>
      {run.status !== "error" && <Recommendation run={run} approvals={approvals} agents={story.agents} crew={story.crew} verification={data.verification} onChange={refresh} onReview={() => { setTab("steps"); setReview((n) => n + 1); }} />}

      <section className="card run-main">
        <div className={`${s.tabs} run-tabs`} role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={s.tab} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
          <span className={s.meta}>
                      </span>
        </div>
        <p className={s.howto}>{tab === "steps" ? "What the AI did, in order. Click any step to open its details." : tab === "map" ? "How the AI agents passed work between each other. Click an agent for details." : `Every step the AI took, with exact timing. ${run.mode === "live" ? "Powered by NVIDIA Nemotron." : "Demo mode."} Started ${ago(run.created_at)}.`}</p>
        {tab === "steps" && <Pipeline run={run} steps={steps} approvals={approvals} crew={story.crew} agents={story.agents} onAgent={setAgent} refresh={refresh} focusApproval={review} verification={data.verification} />}
        {tab === "map" && <CrewGraph run={run} crew={story.crew} agents={story.agents} approvals={approvals} risk={risk} onSelect={setAgent} selected={agent} verification={data.verification} />}
        {tab === "log" && (
          <>
            <Timeline run={run} steps={steps} agents={story.agents} crew={story.crew} />
            <StepLog steps={steps} t0={run.created_at} crew={story.crew} />
          </>
        )}
      </section>
      </div>

      {selected && <AgentDrawer m={selected} v={story.agents[selected.id]} t0={run.created_at} onClose={() => setAgent(null)} />}
    </div>
  );
}
