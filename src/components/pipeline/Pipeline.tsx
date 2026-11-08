"use client";

import { useCallback, useEffect, useState } from "react";
import ApprovalCard from "@/components/approvals/ApprovalCard";
import { nowDoing } from "@/components/run/LiveActivity";
import Icon from "@/components/ui/Icon";
import SidePanel from "@/components/ui/SidePanel";
import { api, hoursText, usd, when } from "@/lib/client";
import { assetName, payerOf, payerSentence, plainCall, plainFinding, plainText, titleCase } from "@/lib/plain";
import { scenarioByLabel } from "@/lib/scenarios";
import type { Approval, Run, Step } from "@/lib/types";
import type { AgentView, CrewMember } from "@/lib/view";
import type { Verification } from "@/lib/verify";
import VerifyStep from "./VerifyStep";
import s from "./Pipeline.module.css";

export type PStatus = "pending" | "running" | "done" | "waiting" | "skipped" | "failed";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const secs = (a?: number, b?: number) => (a && b ? `${((b - a) / 1000).toFixed(1)}s` : "");
const agentStatus = (v?: AgentView): PStatus => (!v || v.st === "PENDING" ? "pending" : v.st === "RUNNING" ? "running" : v.st === "FAILED" ? "failed" : "done");
const lastTool = (v: AgentView | undefined, name: string) => {
  const t = [...(v?.tools ?? [])].reverse().find((x) => x.content.name === name);
  return t ? { step: t, r: (t.content.result ?? {}) as R } : null;
};
const money = (n: number) => usd(n);

/** Status icon in the left gutter: check, spinner, waiting dot, empty circle, dash or cross. */
export function StatusIcon({ st, small }: { st: PStatus; small?: boolean }) {
  return (
    <span className={`${s.icon} ${small ? s.small : ""}`} data-st={st} aria-label={st}>
      {st === "done" && <Icon name="check" size={small ? 10 : 12} strokeWidth={3} />}
      {st === "failed" && <Icon name="x" size={small ? 10 : 12} strokeWidth={3} />}
      {st === "skipped" && <i className={s.dash} />}
    </span>
  );
}

const ST_LABEL: Record<PStatus, string> = { done: "Done", running: "Working", waiting: "Pending Approval", pending: "Not Started", skipped: "Not Needed", failed: "Failed" };

/** Details for one step, in a panel that slides in from the right over a softly blurred page. */
function StepPanel({ n, total, title, why, st, result, onClose, onGo, children }: {
  n: number; total: number; title: string; why: string; st: PStatus; result?: React.ReactNode; onClose: () => void; onGo: (n: number) => void; children: React.ReactNode;
}) {
  const onKey = useCallback((e: KeyboardEvent) => { if (e.key === "ArrowRight" && n < total) onGo(n + 1); if (e.key === "ArrowLeft" && n > 1) onGo(n - 1); }, [n, total, onGo]);
  return (
    <SidePanel eyebrow={`Step ${n} of ${total}`} label={title} onClose={onClose} onKey={onKey}
      footer={<>
        <button type="button" className="btn sm" disabled={n <= 1} onClick={() => onGo(n - 1)}><Icon name="arrow-right" size={13} className={s.flip} />Previous Step</button>
        <button type="button" className="btn sm" disabled={n >= total} onClick={() => onGo(n + 1)}>Next Step<Icon name="arrow-right" size={13} /></button>
      </>}>
      <div className={s.pTitle}>
        <StatusIcon st={st} />
        <div>
          <h2>{title}</h2>
          <p><b>Why:</b> {why}</p>
        </div>
      </div>
      <div className={s.pMeta}><span className={`tag ${st === "done" ? "ok" : st === "waiting" ? "warn" : st === "failed" ? "err" : st === "running" ? "accent" : ""}`}>{ST_LABEL[st]}</span>{result && <span className={s.pResult}>{result}</span>}</div>
      <div className={s.pBody}>{children}</div>
    </SidePanel>
  );
}

function Row({ n, title, why, st, result, time, open, onToggle, onGo, children, live }: {
  n: number; title: string; why: string; st: PStatus; result?: React.ReactNode; time?: string; open: boolean; onToggle: () => void; onGo: (n: number) => void; children?: React.ReactNode; live?: React.ReactNode;
}) {
  const t = titleCase(title);
  return (
    <li className={`${s.row} pipe-row`} data-st={st} data-open={open || undefined}>
      <button type="button" className={`${s.head} pipe-head`} onClick={onToggle} aria-expanded={open} aria-haspopup="dialog" disabled={!children}>
        <StatusIcon st={st} />
        <span className={s.n}>{n}</span>
        <span className={s.title}><b>{t}</b><em>{why}</em>{st === "running" && live ? <span className={s.live}>{live}</span> : null}</span>
        <span className={s.result}>{result}</span>
        <span className={s.time}>{time}</span>
        <span className={s.chev}>{children ? <Icon name="arrow-right" size={13} /> : null}</span>
      </button>
      {open && children && <StepPanel n={n} total={8} title={t} why={why} st={st} result={result} onClose={onToggle} onGo={onGo}>{children}</StepPanel>}
    </li>
  );
}

/** The run as an ordered list of steps: what the AI did, why, and what it found. */
export default function Pipeline({ run, steps, approvals, crew, agents, onAgent, refresh, focusApproval, verification }: {
  run: Run & { telemetry_events?: R | null; properties?: { name: string } | null };
  steps: Step[]; approvals: Approval[]; crew: CrewMember[]; agents: Record<string, AgentView>;
  onAgent: (id: string) => void; refresh: () => void; focusApproval: number; verification?: Verification | null;
}) {
  const lead = agents.lead;
  const specs = crew.filter((a) => a.kind === "specialist");
  const dispatch = crew.find((a) => a.kind === "dispatch");
  const memory = lastTool(lead, "read_building_memory");
  const price = lastTool(lead, "price_risk");
  const risk = run.risk;
  const finished = run.status !== "running";
  const pending = approvals.filter((a) => a.status === "pending");
  const sent = approvals.filter((a) => a.status === "sent");
  const sc = scenarioByLabel(run.title);

  const inv = specs.map((a) => agents[a.id]);
  const invSt: PStatus = !specs.length ? "skipped" : inv.every((v) => v?.st === "SUCCEEDED") ? "done" : inv.some((v) => v?.st === "FAILED") ? "failed" : inv.some((v) => v && v.st !== "PENDING") ? "running" : "pending";
  const invStart = Math.min(...inv.map((v) => v?.start ?? Infinity)), invEnd = Math.max(...inv.map((v) => v?.end ?? 0));
  const dv = dispatch ? agents[dispatch.id] : undefined;
  const dispSt: PStatus = !dispatch ? "skipped" : dv?.st === "PENDING" || !dv ? (finished ? "skipped" : "pending") : agentStatus(dv);
  const apprSt: PStatus = pending.length ? "waiting" : approvals.length ? "done" : finished ? "skipped" : "pending";
  const fixedSt: PStatus = approvals.length && !pending.length && sent.length ? "done" : finished && !approvals.length ? "skipped" : "pending";
  const statuses: PStatus[] = [
    "done",
    memory ? "done" : lead?.st === "RUNNING" ? "running" : "pending",
    invSt,
    risk ? "done" : invSt === "done" && !finished ? "running" : finished ? "skipped" : "pending",
    dispSt, apprSt, fixedSt,
    verification?.status === "passed" ? "done" : verification?.status === "failed" ? "failed" : verification ? "running" : fixedSt === "skipped" ? "skipped" : "pending",
  ];
  const repairApproved = approvals.some((a) => a.kind === "work_order" && a.status === "sent");
  const payer = payerOf(agents.lease);

  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useEffect(() => { const m = /^#step-(\d)$/.exec(location.hash); if (m) setOpenIdx(Number(m[1]) - 1); }, []);
  useEffect(() => { if (focusApproval) setOpenIdx(5); }, [focusApproval]);
  const open = { has: (i: number) => openIdx === i };
  const toggle = (i: number) => setOpenIdx((o) => (o === i ? null : i));
  const go = useCallback((n: number) => setOpenIdx(n - 1), []);

  const sig = run.telemetry_events;
  const liveOf = (list: CrewMember[]) => list.filter((a) => agents[a.id]?.st === "RUNNING").map((a) => {
    const d = nowDoing(agents[a.id], 0);
    const text = plainText(d.text);
    const line = d.verb === "Just did" ? text : d.verb === "Thinking" ? (text ? `Thinking: ${text}` : "Thinking") : `${d.verb} ${text}`;
    return <span key={a.id} className={s.liveRow}><i style={{ background: a.color }} /><b>{a.name}</b><span className={s.sep}>·</span>{line}</span>;
  });
  const callList = (v?: AgentView) => (v?.tools ?? []).filter((x) => !x.content.name?.startsWith("ask_"));

  return (
    <ol className={`${s.list} pipe`}>
      <Row n={1} title="Report Received" why="Every run starts from a real signal, not a question someone typed." st="done" time="0.0s" open={open.has(0)} onGo={go} onToggle={() => toggle(0)}
        result={run.trigger === "sweep" ? "Found by the nightly check" : "New report"}>
        <p className={s.quote}>{sc?.plain.reported ?? sig?.message}</p>
        <p className="muted">{run.properties?.name} · about {assetName(sig?.asset_id)}</p>
      </Row>

      <Row n={2} live={<span className={s.liveRow}><i /><b>Lead agent</b><span className={s.sep}>·</span>Reading past notes for this building</span>} title="History Review" why="Past problems help spot a repeat failure." st={statuses[1]} open={open.has(1)} onGo={go} onToggle={() => toggle(1)}
        result={memory ? `${memory.r.notes?.length ?? 0} past notes` : null} time={memory ? `${((memory.step.content.ms ?? 0) / 1000).toFixed(1)}s` : ""}>
        {memory?.r.notes?.length ? <ul className={s.notes}>{memory.r.notes.map((nt: R, i: number) => <li key={i}><span>{assetName(nt.asset_id)}</span>{plainText(nt.note)}</li>)}</ul> : <p className="muted">No notes yet.</p>}
      </Row>

      <Row n={3} live={liveOf(specs)} title={specs.length > 1 ? `Investigation (${specs.length} Agents)` : "Investigation"} why="Each agent reads a different kind of information, so nothing is missed." st={invSt} open={open.has(2)} onGo={go} onToggle={() => toggle(2)}
        result={invSt === "done" ? "All reported back" : null} time={invEnd ? secs(invStart, invEnd) : ""}>
        <ul className={s.sub}>
          {specs.map((a) => {
            const v = agents[a.id];
            const calls = callList(v);
            return (
              <li key={a.id} className={s.subrow}>
                <div className={s.subhead}>
                  <StatusIcon st={agentStatus(v)} small />
                  <span className={s.dot} style={{ background: a.color }} />
                  <span className={s.who}><b>{a.name}</b><em>{a.role}</em></span>
                  <span className={s.result}>{v?.st === "RUNNING" ? <span className={s.thinking}>Working</span> : null}</span>
                  <span className={s.time}>{secs(v?.start, v?.end)}</span>
                  <button type="button" className={s.link} onClick={() => onAgent(a.id)}>Details</button>
                </div>
                {v?.st === "RUNNING"
                  ? <p className={s.now}><em>{nowDoing(v, 0).verb}:</em> {plainText(nowDoing(v, 0).text)}</p>
                  : <p className={s.finding}>{plainFinding(a.id, v, a.name)}</p>}
                {calls.length > 0 && (
                  <ul className={s.calls}>
                    {calls.map((c) => <li key={c.id}><span>{plainCall(c)}</span></li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Row>

      <Row n={4} live={<span className={s.liveRow}><i /><b>Lead agent</b><span className={s.sep}>·</span>Calculating the cost of waiting versus fixing now</span>} title="Cost Analysis" why="To decide whether fixing it now is worth it." st={statuses[3]} open={open.has(3)} onGo={go} onToggle={() => toggle(3)}
        result={risk ? <><span className="c-err">{money(risk.wait_usd)}</span> if we wait · <span className="c-ok">{money(risk.fix_usd)}</span> to fix</> : null}
        time={price ? `${((price.step.content.ms ?? 0) / 1000).toFixed(1)}s` : ""}>
        {risk && (
          <>
            <table className={s.math}>
              <tbody>
                <tr><td>Lost service for tenants</td><td>{money(risk.penalty_per_hour ?? 0)} per hour × {risk.outage_hours ?? "?"} hours</td><td>{money(risk.penalties_usd)}</td></tr>
                <tr><td>Emergency repair later</td><td>about 2.5× a planned repair</td><td>{money(risk.emergency_repair_usd)}</td></tr>
                <tr className={s.total}><td>Cost if we wait</td><td /><td className="c-err">{money(risk.wait_usd)}</td></tr>
                <tr className={s.total}><td>Cost to fix now</td><td>planned repair</td><td className="c-ok">{money(risk.fix_usd)}</td></tr>
                <tr><td>Time left</td><td /><td>{hoursText(risk.hours_until_failure)}</td></tr>
                {payer && <tr><td>Who pays for the repair</td><td>{payer.ref}</td><td>{payer.name}</td></tr>}
              </tbody>
            </table>
            {payer && <p className={s.finding} style={{ padding: "8px 0 0" }}>{payerSentence(payer)}</p>}
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>These numbers come from a fixed formula, not from the AI guessing.</p>
          </>
        )}
      </Row>

      <Row n={5} live={dispatch ? liveOf([dispatch]) : null} title="Repair Plan" why="So a manager only has to say yes or no." st={dispSt} open={open.has(4)} onGo={go} onToggle={() => toggle(4)}
        result={approvals.length ? `${approvals.length} actions ready` : dispSt === "running" ? "Preparing…" : dispSt === "skipped" ? "Not needed" : null} time={secs(dv?.start, dv?.end)}>
        <ul className={s.calls}>
          {callList(dv).map((c) => <li key={c.id}><span>{plainCall(c)}</span></li>)}
        </ul>
      </Row>

      <Row n={6} title="Approval" why="The AI never acts on its own. A person decides." st={apprSt} open={open.has(5)} onGo={go} onToggle={() => toggle(5)}
        result={pending.length ? <b className="c-warn">{pending.length} pending</b> : approvals.length ? `${sent.length} approved` : null}>
        <Approvals approvals={approvals} refresh={refresh} />
      </Row>

      <Row n={7} title={fixedSt === "skipped" ? "Closed" : "Execution"} why={fixedSt === "skipped" ? "Nothing needed to be sent this time." : "Everything you approved has been sent."} st={fixedSt} open={open.has(6)} onGo={go} onToggle={() => toggle(6)}
        result={fixedSt === "done" ? "Done" : null}>
        {sent.length > 0 ? (
          <ul className={s.done}>
            {sent.map((a) => <li key={a.id}><Icon name="check" size={13} />{doneText(a)}</li>)}
            <li><Icon name="check" size={13} />Saved a note so it is recognized faster next time</li>
          </ul>
        ) : <p className="muted">{run.summary ? plainText(run.summary) : "Waiting for the steps above."}</p>}
      </Row>

      <Row n={8} title="Verification" why="Approving is not the end. The AI re-reads the sensors to confirm the problem is gone." st={statuses[7]} open={open.has(7)} onGo={go} onToggle={() => toggle(7)}
        result={verification?.status === "passed" ? <span className="c-ok">Confirmed fixed</span> : verification?.status === "failed" ? <span className="c-err">Didn&apos;t hold</span> : verification ? "Checking soon…" : null}>
        <VerifyStep runId={run.id} runTitle={run.title} v={verification} repairApproved={repairApproved} refresh={refresh} />
      </Row>
    </ol>
  );
}

function doneText(a: Approval) {
  const p = a.payload as R;
  if (a.kind === "work_order") return `${p.vendor_name} booked for ${when(p.scheduled_for)}`;
  if (a.kind === "tenant_notice") return `${p.tenant_name} notified`;
  return plainText(String(p.change));
}

/** Checklist of prepared actions: pick, then approve or reject; each can be opened to edit. */
function Approvals({ approvals, refresh }: { approvals: Approval[]; refresh: () => void }) {
  const pending = approvals.filter((a) => a.status === "pending");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(pending.map((a) => a.id)));
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pendingKey = pending.map((a) => a.id).join(",");
  useEffect(() => { setPicked(new Set(pendingKey ? pendingKey.split(",") : [])); }, [pendingKey]);

  if (!approvals.length) return <p className="muted">The prepared actions appear here.</p>;
  const chosen = pending.filter((a) => picked.has(a.id));

  async function decide(decision: "approve" | "reject") {
    setBusy(true); setErr("");
    try { for (const a of chosen) await api(`/api/approvals/${a.id}`, { method: "POST", json: { decision, by: "Facility manager" } }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); refresh(); }
  }

  const label = (a: Approval) => {
    const p = a.payload as R;
    if (a.kind === "work_order") return { what: `Book ${p.vendor_name} to repair it`, meta: `${when(p.scheduled_for)} · costs ${usd(a.cost_usd)}`, icon: "wrench" as const };
    if (a.kind === "tenant_notice") return { what: `Send a heads-up email to ${p.tenant_name}`, meta: plainText(String(p.subject ?? "")), icon: "mail" as const };
    return { what: plainText(String(p.change ?? a.title)), meta: `for ${p.hours} hours`, icon: "calendar" as const };
  };

  return (
    <div className={s.appr}>
      <ul>
        {approvals.map((a) => {
          const l = label(a);
          const isPending = a.status === "pending";
          return (
            <li key={a.id}>
              <div className={s.item}>
                {isPending
                  ? <input type="checkbox" checked={picked.has(a.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} aria-label={l.what} />
                  : <StatusIcon st={a.status === "sent" ? "done" : "failed"} small />}
                <Icon name={l.icon} size={14} />
                <span className={s.what}><b>{l.what}</b><em>{l.meta}</em></span>
                {a.protects_usd > 0 && <span className={s.prot}>avoids up to {usd(a.protects_usd)}</span>}
                {isPending ? <button type="button" className={s.link} onClick={() => setEdit(edit === a.id ? null : a.id)}>{edit === a.id ? "Close" : "Read / edit"}</button>
                  : <span className={`tag ${a.status === "sent" ? "ok" : "err"}`}>{a.status === "sent" ? "Sent" : "Rejected"}</span>}
              </div>
              {edit === a.id && <div className={s.edit}><ApprovalCard a={a} onDone={() => { setEdit(null); refresh(); }} /></div>}
            </li>
          );
        })}
      </ul>
      {pending.length > 0 && (
        <div className={s.actions}>
          <button type="button" className="btn accent" disabled={busy || !chosen.length} onClick={() => { void decide("approve"); }}>
            <Icon name="check" size={14} />{busy ? "Sending…" : `Approve ${chosen.length} and send`}
          </button>
          <button type="button" className="btn" disabled={busy || !chosen.length} onClick={() => { void decide("reject"); }}>Don&apos;t send</button>
          {err && <span className="c-err">{err}</span>}
        </div>
      )}
    </div>
  );
}
