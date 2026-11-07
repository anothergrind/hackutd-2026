"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { ROSTER, type AgentId } from "@/lib/roster";
import type { Approval, Run } from "@/lib/types";
import { approvalCounts, summarize, type AgentView } from "@/lib/view";
import s from "./CrewGraph.module.css";

type Box = { x: number; y: number; w: number; h: number };
type EdgeState = "" | "on" | "done" | "fail" | "wait";

const W = 1240, ROW = 96, TOP = 44;
const SPECS: Exclude<AgentId, "lead">[] = ["triage", "sensor", "lease", "dispatch"];
const specBox = (i: number): Box => ({ x: 520, y: TOP + i * ROW, w: 250, h: 78 });
const chipBox = (i: number, j: number): Box => ({ x: 830 + j * 206, y: TOP + i * ROW + 13, w: 190, h: 52 });
const midY = TOP + (3 * ROW + 78) / 2;
const LEAD: Box = { x: 200, y: midY - 45, w: 260, h: 90 };
const TRIGGER: Box = { x: 0, y: midY - 34, w: 150, h: 68 };
const APPROVAL: Box = { x: 830, y: TOP + 4 * ROW + 6, w: 396, h: 66 };
const H = APPROVAL.y + APPROVAL.h + 20;

const curve = (a: Box, b: Box) => {
  const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, dx = (x2 - x1) * 0.55;
  return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};
const pos = (b: Box) => ({ left: b.x, top: b.y, width: b.w, height: b.h });
const edgeOf = (v: AgentView | undefined): EdgeState => (v?.st === "RUNNING" ? "on" : v?.st === "SUCCEEDED" ? "done" : v?.st === "FAILED" ? "fail" : "");

/** A quiet base line plus a bright dash that travels along it while work flows. */
function Edge({ d, state }: { d: string; state: EdgeState }) {
  const flow = useRef<SVGPathElement>(null);
  useLayoutEffect(() => {
    const el = flow.current;
    if (!el) return;
    const L = el.getTotalLength(), dash = Math.min(26, L * 0.3);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.style.strokeDasharray = "none"; return; }
    el.style.strokeDasharray = `${dash} ${L}`;
    const anim = el.animate([{ strokeDashoffset: L + dash }, { strokeDashoffset: 0 }], { duration: Math.max(700, L * 4.2), iterations: Infinity });
    return () => anim.cancel();
  }, [d]);
  return (
    <g>
      <path className={`${s.edge} ${state ? s[state] : ""}`} d={d} />
      <path ref={flow} className={`${s.flow} ${state === "on" ? s.on : ""}`} d={d} />
    </g>
  );
}

const ICON = { lead: "bot", triage: "ticket", sensor: "activity", lease: "scale", dispatch: "truck" } as const;

export default function CrewGraph({ run, agents, approvals, signal }: { run?: Run; agents: Record<AgentId, AgentView>; approvals: Approval[]; signal?: { asset_id: string; source: string } | null }) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(W);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => { setWidth(el.clientWidth); setScale(Math.max(0.45, Math.min(1.05, (el.clientWidth - 24) / W))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const counts = approvalCounts(approvals);
  const lead = agents.lead;
  const triggerOn: EdgeState = run ? (run.status === "running" && lead.st !== "SUCCEEDED" ? (lead.st === "RUNNING" ? "done" : "on") : "done") : "";
  const approvalState: EdgeState = counts.pending ? "wait" : counts.sent ? "done" : agents.dispatch.st === "RUNNING" ? "on" : "";

  return (
    <div className={s.stage} ref={stage} style={{ height: Math.round(H * scale) + 8 }}>
      <div className={s.canvas} style={{ width: W, height: H, transform: `scale(${scale})`, marginLeft: Math.max(0, (width - W * scale) / 2) }}>
        {[["Trigger", 0], ["Lead · Nemotron", 200], ["Specialists", 520], ["Tool calls", 830]].map(([label, x]) => (
          <div key={label} className={s.colh} style={{ left: x as number }}>{label}</div>
        ))}
        <svg className={s.wires} aria-hidden>
          <Edge d={curve(TRIGGER, LEAD)} state={triggerOn} />
          {SPECS.map((id, i) => <Edge key={id} d={curve(LEAD, specBox(i))} state={edgeOf(agents[id])} />)}
          {SPECS.map((id, i) => agents[id].tools.slice(-2).map((t, j) => (
            <Edge key={`${id}-${t.id}`} d={curve(specBox(i), chipBox(i, j))} state={agents[id].st === "RUNNING" && j === Math.min(1, agents[id].tools.length - 1) ? "on" : "done"} />
          )))}
          <Edge d={curve(specBox(3), APPROVAL)} state={approvalState} />
        </svg>

        <div className={`${s.node} ${s.trigger}`} style={pos(TRIGGER)} data-st={run ? "SUCCEEDED" : "PENDING"}>
          <span className={s.ico}><Icon name={run?.trigger === "sweep" ? "radar" : "zap"} size={17} /></span>
          <b>{run?.trigger === "sweep" ? "Nightly sweep" : "Incident"}</b>
          <span className={s.now}>{signal ? `${signal.asset_id} · ${signal.source}` : "Waiting"}</span>
        </div>

        <AgentNode id="lead" box={LEAD} v={lead} />
        {SPECS.map((id, i) => <AgentNode key={id} id={id} box={specBox(i)} v={agents[id]} />)}

        {SPECS.map((id, i) => {
          const tools = agents[id].tools;
          return tools.slice(-2).map((t, j) => {
            const err = Boolean((t.content.result as { error?: unknown } | undefined)?.error);
            const writes = t.content.name?.startsWith("draft_");
            return (
              <div key={t.id} className={`${s.tool} ${err ? s.deny : ""} ${writes ? s.write : ""}`} style={pos(chipBox(i, j))} title={`${t.content.name} · ${t.content.ms ?? 0} ms`}>
                <span className={s.t}>{err ? "×" : writes ? "✎" : "→"}</span>
                <span className={s.nm}>{t.content.name}{j === 0 && tools.length > 2 ? <em className={s.more}> +{tools.length - 2}</em> : null}</span>
                <span className={s.rs}>{summarize(t)}</span>
              </div>
            );
          });
        })}

        <div className={`${s.approval} ${counts.pending ? s.waiting : counts.sent ? s.sent : ""}`} style={pos(APPROVAL)}>
          <span className={s.ico}><Icon name="inbox" size={17} /></span>
          <div>
            <b>Approval queue</b>
            <span className={s.now}>{approvals.length ? `${counts.pending} waiting · ${counts.sent} sent${counts.rejected ? ` · ${counts.rejected} rejected` : ""}` : "Nothing is sent without a manager"}</span>
          </div>
          {counts.pending > 0 && <span className="tag warn">MANAGER</span>}
        </div>
      </div>
    </div>
  );
}

function AgentNode({ id, box, v }: { id: AgentId; box: Box; v: AgentView }) {
  const meta = ROSTER.find((a) => a.id === id)!;
  return (
    <div className={s.node} data-st={v.st} style={{ ...pos(box), "--c": meta.color } as React.CSSProperties} title={v.final ?? meta.role}>
      <span className={s.ico}><Icon name={ICON[id]} size={18} /><span className={s.badge}><Icon name="check" size={9} strokeWidth={3.5} /></span></span>
      <b>{meta.name}</b>
      <span className={s.now}>{v.st === "PENDING" ? meta.role : v.now}</span>
    </div>
  );
}
