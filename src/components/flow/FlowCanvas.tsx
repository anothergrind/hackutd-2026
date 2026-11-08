"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import type { FEdge, FNode } from "@/lib/flow";
import s from "./FlowCanvas.module.css";

export type Sel = { kind: "node" | "edge"; id: string } | null;
export type NodeState = "idle" | "running" | "done" | "waiting" | "failed" | "off";
export type EdgeState = "" | "on" | "done" | "wait";

const ICON: Record<string, IconName> = { bot: "bot", ticket: "ticket", activity: "activity", scale: "scale", truck: "truck", zap: "zap", history: "history", shield: "shield", sparkles: "sparkles" };
const PILL: Record<string, { label: string; sub: string; icon: IconName }> = {
  report: { label: "Report", sub: "Incident starts", icon: "zap" },
  decide: { label: "Lead Decides", sub: "Prices the risk", icon: "scale" },
  approve: { label: "Approval", sub: "Facility manager", icon: "users" },
};
const GRID = 24;
const clampK = (k: number) => Math.min(1.8, Math.max(0.35, k));
// Connections leave from the bottom of one shape and enter the top of the next.
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dy = Math.max(30, Math.abs(y2 - y1) * 0.5);
  return `M${x1} ${y1} C${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
};

/** Pan/zoom canvas of agents and connections, after the HackTX builder.
 *  Editable: drag nodes, drag from the dot under a node onto another node to connect, select and Delete.
 *  Read-only: pan, zoom and click an agent; states and moving connections show the live run. */
export default function FlowCanvas({ nodes, edges, editable = false, sel = null, onSelect, onMove, onConnect, onDropTemplate, nodeState, nodeSub, edgeState, fitKey = 0, className = "", loose }: {
  nodes: FNode[]; edges: FEdge[]; editable?: boolean; sel?: Sel;
  onSelect?: (sel: Sel) => void; onMove?: (id: string, x: number, y: number) => void; onConnect?: (from: string, to: string) => void;
  onDropTemplate?: (templateId: string, at: { x: number; y: number }) => void;
  nodeState?: (n: FNode) => NodeState; nodeSub?: (n: FNode) => string | undefined; edgeState?: (e: FEdge) => EdgeState;
  fitKey?: number; className?: string; loose?: Set<string>;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Frame everything ("zoom to fit"), on load, when asked, and when a read-only map is resized.
  const fit = useCallback(() => {
    const el = stage.current; const ns = nodesRef.current;
    if (!el || !ns.length) return;
    const x0 = Math.min(...ns.map((n) => n.x)), y0 = Math.min(...ns.map((n) => n.y));
    const x1 = Math.max(...ns.map((n) => n.x + n.w)), y1 = Math.max(...ns.map((n) => n.y + n.h));
    const pad = 40, w = el.clientWidth, h = el.clientHeight;
    const k = clampK(Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0), 1.1));
    setView({ k, x: (w - (x1 - x0) * k) / 2 - x0 * k, y: (h - (y1 - y0) * k) / 2 - y0 * k });
  }, []);
  useEffect(() => { fit(); }, [fit, fitKey]);
  useEffect(() => {
    const el = stage.current;
    if (!el || editable) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, editable]);

  // Trackpad scroll pans; pinch or ctrl+scroll zooms around the cursor.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
        const k = clampK(v.k * Math.exp(-e.deltaY * 0.01));
        setView({ k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k });
      } else setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const zoomBy = (f: number) => {
    const el = stage.current!, v = viewRef.current, cx = el.clientWidth / 2, cy = el.clientHeight / 2, k = clampK(v.k * f);
    setView({ k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k });
  };
  const point = (cx: number, cy: number) => {
    const r = stage.current!.getBoundingClientRect(), v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };

  const startMove = (e: React.PointerEvent, n: FNode) => {
    if ((e.target as HTMLElement).closest("[data-port]")) return;
    e.stopPropagation();
    onSelect?.({ kind: "node", id: n.id });
    if (!editable) return;
    const p = point(e.clientX, e.clientY), dx = p.x - n.x, dy = p.y - n.y;
    const move = (ev: PointerEvent) => { const q = point(ev.clientX, ev.clientY); onMove?.(n.id, Math.round(q.x - dx), Math.round(q.y - dy)); };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  const startPan = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-node], [data-ui]") || e.button > 1) return;
    onSelect?.(null);
    const sx = e.clientX, sy = e.clientY, v0 = viewRef.current;
    setPanning(true);
    const move = (ev: PointerEvent) => setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy });
    const up = () => { setPanning(false); removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  const startLink = (e: React.PointerEvent, from: FNode) => {
    e.stopPropagation(); e.preventDefault();
    const move = (ev: PointerEvent) => setLink({ from: from.id, ...point(ev.clientX, ev.clientY) });
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      setLink(null);
      const q = point(ev.clientX, ev.clientY);
      const hit = nodesRef.current.find((n) => q.x >= n.x - 12 && q.x <= n.x + n.w + 12 && q.y >= n.y - 6 && q.y <= n.y + n.h + 6);
      if (hit && hit.id !== from.id) onConnect?.(from.id, hit.id);
    };
    move(e.nativeEvent);
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };

  // Lead, specialists and the decision can start new connections; Report → Lead and Dispatch → Approval are fixed.
  const canLinkFrom = (n: FNode) => editable && (n.kind === "decide" || (n.kind === "agent" && n.agent?.kind !== "dispatch"));

  return (
    <div
      ref={stage}
      className={`${s.stage} ${panning ? s.panning : ""} ${className}`}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${GRID * view.k}px ${GRID * view.k}px` }}
      onPointerDown={startPan}
      onDragOver={(e) => { if (onDropTemplate && e.dataTransfer.types.includes("text/template")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(e) => { const id = e.dataTransfer.getData("text/template"); if (!id || !onDropTemplate) return; e.preventDefault(); onDropTemplate(id, point(e.clientX, e.clientY)); }}
    >
      <div className={s.canvas} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className={s.wires} width={1} height={1} aria-hidden>
          <defs>
            {(["idle", "on", "done", "wait", "sel"] as const).map((k) => (
              <marker key={k} id={`fc-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" className={s[`m_${k}`]} />
              </marker>
            ))}
          </defs>
          {edges.map((e) => {
            const a = byId.get(e.from), b = byId.get(e.to);
            if (!a || !b) return null;
            const d = curve(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y - 2);
            const on = sel?.kind === "edge" && sel.id === e.id;
            const st = edgeState?.(e) ?? "";
            return (
              <g key={e.id}>
                <path className={`${s.edge} ${st ? s[st] : ""} ${on ? s.edgeSel : ""} ${e.locked && editable ? s.locked : ""}`} d={d} markerEnd={`url(#fc-${on ? "sel" : st || "idle"})`} />
                {st === "on" && <path className={s.flow} d={d} />}
                {editable && !e.locked && <path className={s.hit} d={d} data-ui onPointerDown={(ev) => { ev.stopPropagation(); onSelect?.({ kind: "edge", id: e.id }); }} />}
              </g>
            );
          })}
          {link && byId.get(link.from) && (() => { const a = byId.get(link.from)!; return <path className={`${s.edge} ${s.edgeSel} ${s.ghost}`} d={curve(a.x + a.w / 2, a.y + a.h, link.x, link.y)} />; })()}
        </svg>

        {nodes.map((n) => {
          const on = sel?.kind === "node" && sel.id === n.id;
          const st = nodeState?.(n) ?? "idle";
          const style = { left: n.x, top: n.y, width: n.w, height: n.h, "--c": n.agent?.color ?? "var(--accent)" } as React.CSSProperties;
          const ports = (
            <>
              {n.kind !== "report" && <i data-port="in" className={`${s.port} ${s.in}`} />}
              {canLinkFrom(n)
                ? <i data-port="out" className={`${s.port} ${s.out}`} onPointerDown={(e) => startLink(e, n)} title="Drag down onto the next agent to connect" />
                : n.kind !== "approve" && <i className={`${s.port} ${s.out} ${s.static}`} />}
            </>
          );
          if (n.kind !== "agent") {
            const p = PILL[n.kind];
            return (
              <div key={n.id} data-node className={`${s.pill} ${s[n.kind]} ${on ? s.on : ""}`} data-st={st} style={style} onPointerDown={(e) => startMove(e, n)}>
                {ports}
                <span className={s.pico}><Icon name={p.icon} size={15} /></span>
                <span className={s.ptext}><b>{p.label}</b><em>{nodeSub?.(n) ?? p.sub}</em></span>
              </div>
            );
          }
          const a = n.agent!;
          const isLoose = loose?.has(n.id);
          return (
            <div key={n.id} data-node className={`${s.node} ${on ? s.on : ""} ${isLoose ? s.loose : ""}`} data-st={st} style={style} onPointerDown={(e) => startMove(e, n)}>
              {ports}
              <span className={s.ico}><Icon name={ICON[a.icon] ?? "sparkles"} size={17} /></span>
              <b>{a.name}</b>
              <span className={s.sub}>{nodeSub?.(n) ?? a.role}</span>
              {st !== "idle" && st !== "off" && <span className={s.state} aria-label={st}><i /></span>}
            </div>
          );
        })}
      </div>

      <div className={s.zoom} data-ui onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>−</button>
        <span>{Math.round(view.k * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>+</button>
        <button type="button" onClick={fit}>Fit</button>
      </div>
    </div>
  );
}
