"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { usd } from "@/lib/client";
import type { Approval, Risk, Run } from "@/lib/types";
import { approvalCounts, summarize, type AgentView, type CrewMember } from "@/lib/view";
import s from "./CrewGraph.module.css";

type Box = { x: number; y: number; w: number; h: number };
type EdgeState = "" | "on" | "done" | "wait";

const W = 1320, TOP = 40, ROW = 122, NODE_H = 110;
const pos = (b: Box) => ({ left: b.x, top: b.y, width: b.w, height: b.h });
const mid = (b: Box) => b.y + b.h / 2;
const curve = (x1: number, y1: number, x2: number, y2: number) => { const dx = (x2 - x1) * 0.5; return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`; };

/** A quiet base line plus a bright dash that travels along it while work flows. */
function Edge({ d, state, arrow = true }: { d: string; state: EdgeState; arrow?: boolean }) {
  const flow = useRef<SVGPathElement>(null);
  useLayoutEffect(() => {
    const el = flow.current;
    if (!el || state !== "on") return;
    const L = el.getTotalLength(), dash = Math.min(24, L * 0.35);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.strokeDasharray = `${dash} ${L}`;
    const anim = el.animate([{ strokeDashoffset: L + dash }, { strokeDashoffset: 0 }], { duration: Math.max(700, L * 4), iterations: Infinity });
    return () => anim.cancel();
  }, [d, state]);
  return (
    <g>
      <path className={`${s.edge} ${state ? s[state] : ""}`} d={d} markerEnd={arrow ? `url(#cg-${state || "idle"})` : undefined} />
      {state === "on" && <path ref={flow} className={s.flow} d={d} />}
    </g>
  );
}

const st = (v?: AgentView): EdgeState => (v?.st === "RUNNING" ? "on" : v?.st === "SUCCEEDED" ? "done" : "");

/** The run drawn as the workflow: trigger → lead → parallel specialists → merge → price → decide → dispatch → approval. */
export default function CrewGraph({ run, crew, agents, approvals, risk, onSelect, selected }: {
  run: Run; crew: CrewMember[]; agents: Record<string, AgentView>; approvals: Approval[]; risk: Risk | null;
  onSelect: (id: string) => void; selected: string | null;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(W);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => { setWidth(el.clientWidth); setScale(Math.max(0.42, Math.min(1, (el.clientWidth - 24) / W))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const specs = crew.filter((a) => a.kind === "specialist");
  const dispatch = crew.find((a) => a.kind === "dispatch");
  const rows = Math.max(specs.length, 3);
  const H = TOP + rows * ROW + 30;
  const center = TOP + (rows * ROW - (ROW - NODE_H)) / 2;

  const TRIG: Box = { x: 0, y: center - 30, w: 140, h: 60 };
  const LEAD: Box = { x: 180, y: center - 48, w: 170, h: 96 };
  const spec = (i: number): Box => ({ x: 410, y: TOP + i * ROW + (rows - specs.length) * ROW / 2, w: 250, h: NODE_H });
  const BAR = { x: 382, y0: specs.length ? spec(0).y + 10 : center - 10, y1: specs.length ? spec(specs.length - 1).y + NODE_H - 10 : center + 10 };
  const TRI = { x: 700, y: center, r: 22 };
  const PRICE: Box = { x: 760, y: center - 44, w: 160, h: 88 };
  const DEC = { x: 1010, y: center, rx: 58, ry: 40 };
  const DISP: Box = { x: 1110, y: center - 55, w: 200, h: 110 };
  const APPR: Box = { x: 1110, y: center + 84, w: 200, h: 58 };
  const NOPE: Box = { x: 952, y: center - 120, w: 116, h: 40 };

  const lead = agents.lead;
  const counts = approvalCounts(approvals);
  const allChecked = specs.length > 0 && specs.every((a) => agents[a.id]?.st === "SUCCEEDED");
  const dispV = dispatch ? agents[dispatch.id] : undefined;
  const decided = Boolean(dispV && dispV.st !== "PENDING") || run.status !== "running";
  const wentNo = run.status !== "running" && (!dispV || dispV.st === "PENDING");

  return (
    <div className={s.stage} ref={stage} style={{ height: Math.round(H * scale) + 8 }}>
      <div className={s.canvas} style={{ width: W, height: H, transform: `scale(${scale})`, marginLeft: Math.max(0, (width - W * scale) / 2) }}>
        <svg className={s.wires} aria-hidden>
          <defs>
            {(["idle", "on", "done", "wait"] as const).map((k) => (
              <marker key={k} id={`cg-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" className={s[`m_${k}`]} />
              </marker>
            ))}
          </defs>
          <Edge d={`M${TRIG.x + TRIG.w} ${mid(TRIG)}H${LEAD.x}`} state={lead?.st === "PENDING" ? "" : "done"} />
          <Edge d={`M${LEAD.x + LEAD.w} ${center}H${BAR.x}`} state={specs.some((a) => agents[a.id]?.st !== "PENDING") ? "done" : st(lead)} arrow={false} />
          {specs.map((a, i) => <Edge key={a.id} d={`M${BAR.x + 6} ${mid(spec(i))}H${spec(i).x}`} state={st(agents[a.id])} />)}
          {specs.map((a, i) => <Edge key={`m${a.id}`} d={curve(spec(i).x + spec(i).w, mid(spec(i)), TRI.x - TRI.r * 0.6, TRI.y)} state={agents[a.id]?.st === "SUCCEEDED" ? "done" : ""} />)}
          <Edge d={`M${TRI.x + TRI.r} ${TRI.y}H${PRICE.x}`} state={risk ? "done" : allChecked ? "on" : ""} />
          <Edge d={`M${PRICE.x + PRICE.w} ${center}H${DEC.x - DEC.rx}`} state={decided ? "done" : risk ? "on" : ""} />
          <Edge d={`M${DEC.x} ${DEC.y - DEC.ry}V${NOPE.y + NOPE.h}`} state={wentNo ? "done" : ""} />
          {dispatch && <Edge d={`M${DEC.x + DEC.rx} ${center}H${DISP.x}`} state={st(dispV)} />}
          {dispatch && <Edge d={`M${DISP.x + DISP.w / 2} ${DISP.y + DISP.h}V${APPR.y}`} state={counts.pending ? "wait" : counts.sent ? "done" : ""} />}
        </svg>

        {specs.length > 1 && <span className={s.lbl} style={{ left: BAR.x - 22, top: BAR.y0 - 24 }}>in parallel</span>}
        <span className={s.lbl} style={{ left: DEC.x + 6, top: NOPE.y + NOPE.h + 4 }}>no</span>
        {dispatch && <span className={s.lbl} style={{ left: DEC.x + DEC.rx + 6, top: center - 22 }}>yes</span>}

        <div className={`${s.oval} ${s.start}`} style={pos(TRIG)}>
          <Icon name={run.trigger === "sweep" ? "radar" : "zap"} size={15} />
          <span><b>{run.trigger === "sweep" ? "Sweep" : "Incident"}</b><em>start</em></span>
        </div>

        <Node id="lead" m={crew.find((a) => a.id === "lead")} v={lead} box={LEAD} onSelect={onSelect} selected={selected} big />
        {specs.length > 0 && <div className={s.bar} style={{ left: BAR.x, top: BAR.y0, height: Math.max(6, BAR.y1 - BAR.y0) }} />}
        {specs.map((a, i) => <Node key={a.id} id={a.id} m={a} v={agents[a.id]} box={spec(i)} onSelect={onSelect} selected={selected} tools />)}

        <svg className={s.tri} style={{ left: TRI.x - TRI.r, top: TRI.y - TRI.r, width: TRI.r * 2, height: TRI.r * 2 }} viewBox="0 0 44 44" aria-label="merge">
          <path d="M4 4L40 22L4 40Z" className={allChecked ? s.triDone : ""} />
        </svg>

        <button type="button" className={`${s.box} ${risk ? s.done : allChecked ? s.running : ""}`} style={pos(PRICE)} onClick={() => onSelect("lead")}>
          <span className={s.k}>Price it</span>
          {risk ? <><b className="c-err">{usd(risk.wait_usd)}</b><span className={s.vs}>vs <b className="c-ok">{usd(risk.fix_usd)}</b></span></> : <span className={s.vs}>waiting for reports</span>}
        </button>

        <svg className={s.dec} style={{ left: DEC.x - DEC.rx, top: DEC.y - DEC.ry, width: DEC.rx * 2, height: DEC.ry * 2 }} viewBox={`0 0 ${DEC.rx * 2} ${DEC.ry * 2}`}>
          <path d={`M${DEC.rx} 1L${DEC.rx * 2 - 1} ${DEC.ry}L${DEC.rx} ${DEC.ry * 2 - 1}L1 ${DEC.ry}Z`} className={decided ? s.decDone : ""} />
          <text x={DEC.rx} y={DEC.ry - 3} textAnchor="middle">Worth</text>
          <text x={DEC.rx} y={DEC.ry + 11} textAnchor="middle">fixing?</text>
        </svg>
        <div className={`${s.oval} ${s.end} ${wentNo ? s.endOn : ""}`} style={pos(NOPE)}><span><b>Brief only</b></span></div>

        {dispatch && <Node id={dispatch.id} m={dispatch} v={dispV} box={DISP} onSelect={onSelect} selected={selected} tools />}
        {dispatch && (
          <a href="/approvals" className={`${s.box} ${s.appr} ${counts.pending ? s.waiting : counts.sent ? s.done : ""}`} style={pos(APPR)}>
            <Icon name="inbox" size={15} />
            <span><b>Approval queue</b><em>{approvals.length ? `${counts.pending} waiting · ${counts.sent} sent` : "nothing sent without you"}</em></span>
          </a>
        )}
      </div>
    </div>
  );
}

const ICON = { bot: "bot", ticket: "ticket", activity: "activity", scale: "scale", truck: "truck", zap: "zap", history: "history", shield: "shield", sparkles: "sparkles" } as const;

function Node({ id, m, v, box, onSelect, selected, tools, big }: { id: string; m?: CrewMember; v?: AgentView; box: Box; onSelect: (id: string) => void; selected: string | null; tools?: boolean; big?: boolean }) {
  const calls = (v?.tools ?? []).filter((t) => !t.content.name?.startsWith("ask_"));
  return (
    <button type="button" className={`${s.node} ${selected === id ? s.sel : ""} ${big ? s.big : ""}`} data-st={v?.st ?? "PENDING"} style={{ ...pos(box), "--c": m?.color ?? "var(--ink-3)" } as React.CSSProperties} onClick={() => onSelect(id)} title="Click for details">
      <span className={s.head}>
        <span className={s.ico}><Icon name={ICON[m?.icon ?? "sparkles"]} size={15} /><i className={s.badge}><Icon name="check" size={8} strokeWidth={3.5} /></i></span>
        <span className={s.name}><b>{m?.name ?? id}</b><em>{v?.st === "PENDING" || !v ? (m?.role ?? "") : v.st === "RUNNING" ? "working…" : v.st === "FAILED" ? "failed" : "done"}</em></span>
      </span>
      {tools ? (
        <span className={s.calls}>
          {calls.slice(-3).map((t) => (
            <span key={t.id} className={`${s.call} ${(t.content.result as { error?: unknown })?.error ? s.err : ""}`}>
              <i className="mono">{t.content.name}</i><span>{summarize(t)}</span>
            </span>
          ))}
          {!calls.length && <span className={s.call}><span className="muted">{v?.st === "RUNNING" ? "starting…" : "not started"}</span></span>}
        </span>
      ) : (
        <span className={s.now}>{v?.st === "PENDING" || !v ? "plans and delegates" : v.now}</span>
      )}
    </button>
  );
}
