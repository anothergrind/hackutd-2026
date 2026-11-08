"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FlowCanvas, { type NodeState, type Sel } from "@/components/flow/FlowCanvas";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/ui/Icon";
import { api, usePoll } from "@/lib/client";
import type { AgentConfig } from "@/lib/crew";
import { autoLayout, buildFlow, canConnect, levels, stagesOf, type FNode } from "@/lib/flow";
import type { ToolInfo } from "@/lib/roster";
import s from "./crew.module.css";

type Data = { crew: AgentConfig[]; tools: ToolInfo[]; models: { id: string; label: string }[]; templates: { id: string; name: string; role: string; icon: AgentConfig["icon"] }[] };
type Notice = { tone: "ok" | "err"; text: string } | null;
const ICON = { bot: "bot", ticket: "ticket", activity: "activity", scale: "scale", truck: "truck", zap: "zap", history: "history", shield: "shield", sparkles: "sparkles" } as const;
const layoutKey = (c: AgentConfig[]) => JSON.stringify(c.map((a) => [a.id, a.x, a.y, a.after, a.kind === "dispatch" ? a.enabled : 0, a.pins]));

/** The Agents canvas: drag agents around, connect them end to end, and edit any agent's job. */
export default function Agents() {
  const { data, refresh } = usePoll<Data>("/api/crew", 0, false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [baseline, setBaseline] = useState<AgentConfig[]>([]); // the crew as last saved, to spot unsaved changes
  const [sel, setSel] = useState<Sel>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [fitKey, setFitKey] = useState(0);

  // Take the server's crew, but keep unsaved positions and connections the user is still working on.
  useEffect(() => {
    if (!data) return;
    setAgents((prev) => {
      const dirty = prev.length > 0 && layoutKey(prev) !== layoutKey(baseline);
      if (!dirty) return data.crew;
      return data.crew.map((a) => { const l = prev.find((p) => p.id === a.id); return l ? { ...a, x: l.x, y: l.y, after: l.after, pins: l.pins, enabled: a.kind === "dispatch" ? l.enabled : a.enabled } : a; });
    });
    setBaseline((prev) => (prev.length ? data.crew.map((a) => { const b = prev.find((p) => p.id === a.id); return b ? { ...a, x: b.x, y: b.y, after: b.after, pins: b.pins, enabled: a.kind === "dispatch" ? b.enabled : a.enabled } : a; }) : data.crew));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data && !fitKey) setFitKey(1); }, [data, fitKey]);

  const dirty = agents.length > 0 && layoutKey(agents) !== layoutKey(baseline);
  const shown = useMemo(() => agents.filter((a) => !a.removed), [agents]);
  const flow = useMemo(() => buildFlow(shown), [shown]);
  const lv = useMemo(() => levels(agents), [agents]);
  const stages = useMemo(() => stagesOf(shown), [shown]);
  const loose = useMemo(() => new Set(shown.filter((a) => (a.kind === "specialist" && !lv.get(a.id)) || (a.kind === "dispatch" && a.enabled === false)).map((a) => a.id)), [shown, lv]);
  const stageOf = (id: string) => lv.get(id) ?? 0;

  const patchAgent = useCallback((id: string, change: Partial<AgentConfig>) => setAgents((xs) => xs.map((a) => (a.id === id ? { ...a, ...change } : a))), []);

  const move = useCallback((id: string, x: number, y: number) => {
    if (id === "report" || id === "decide" || id === "approve") setAgents((xs) => xs.map((a) => (a.kind === "lead" ? { ...a, pins: { ...(a.pins ?? {}), ...pinsNow(xs), [id]: { x, y } } } : a)));
    else patchAgent(id, { x, y });
  }, [patchAgent]);

  const connect = (from: string, to: string) => {
    const why = canConnect(shown, from, to);
    if (why) return setNotice({ tone: "err", text: why });
    setNotice(null);
    if (from === "decide") return setAgents((xs) => xs.map((a) => (a.kind === "dispatch" ? { ...a, enabled: true } : a)));
    setAgents((xs) => xs.map((a) => (a.id === to ? { ...a, after: [...(a.after ?? []), from] } : a)));
  };

  const removeEdge = (id: string) => {
    const [from, to] = id.split(">");
    if (from === "decide") setAgents((xs) => xs.map((a) => (a.kind === "dispatch" ? { ...a, enabled: false } : a)));
    else setAgents((xs) => xs.map((a) => (a.id === to ? { ...a, after: (a.after ?? []).filter((u) => u !== from) } : a)));
    setSel(null);
  };

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setNotice(null);
    try { await fn(); if (ok) setNotice({ tone: "ok", text: ok }); } catch (e) { setNotice({ tone: "err", text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  }

  const saveLayout = () => run(async () => {
    const lead = agents.find((a) => a.kind === "lead");
    const r = await api<{ crew: AgentConfig[] }>("/api/crew", { method: "PUT", json: {
      agents: agents.map((a) => ({ id: a.id, x: a.x, y: a.y, after: a.after })),
      dispatch_on: agents.find((a) => a.kind === "dispatch")?.enabled !== false,
      pins: lead?.pins ?? pinsNow(agents),
    } });
    setAgents(r.crew); setBaseline(r.crew);
    await refresh();
  }, "Workflow saved. The next incident runs in this order.");

  const addAgent = (templateId: string, at?: { x: number; y: number }) => run(async () => {
    const json = at ? { template_id: templateId, x: Math.round(at.x - 115), y: Math.round(at.y - 37), after: [] } : { template_id: templateId };
    const r = await api<{ agent: AgentConfig }>("/api/crew", { method: "POST", json });
    setAgents((xs) => { const next = [...xs]; next.splice(next.length - 1, 0, r.agent); return next; });
    setBaseline((xs) => { const next = [...xs]; next.splice(next.length - 1, 0, r.agent); return next; });
    setSel({ kind: "node", id: r.agent.id });
  }, at ? "Added. Drag from the dot under another agent onto it to connect it." : "Added after the Lead. It runs in stage 1.");

  // Custom agents are deleted; built-in ones (except the Lead) are removed and can be restored.
  const deleteAgent = (a: AgentConfig) => run(async () => {
    if (a.kind === "lead") throw new Error("The Lead coordinates every incident, so it can't be removed. You can reset it.");
    await api(`/api/crew/${a.id}`, { method: "DELETE" });
    const unlink = (x: AgentConfig) => ({ ...x, after: x.after?.filter((u) => u !== a.id) });
    const drop = (xs: AgentConfig[]) => (a.builtin
      ? xs.map((x) => (x.id === a.id ? { ...x, removed: true, after: [], enabled: false } : unlink(x)))
      : xs.filter((x) => x.id !== a.id).map(unlink));
    setAgents(drop); setBaseline(drop);
    setSel(null);
    await refresh();
  }, a.builtin ? `${a.name} removed. Restore it from the list on the left.` : `${a.name} deleted.`);

  const resetAgent = (a: AgentConfig) => run(async () => {
    await api(`/api/crew/${a.id}?reset=1`, { method: "DELETE" });
    await refresh();
  }, `${a.name} reset to its default settings.`);

  const restoreAgent = (a: AgentConfig) => run(async () => {
    const r = await api<{ agent: AgentConfig }>(`/api/crew/${a.id}`, { method: "PUT", json: { ...a, removed: false, enabled: true, after: a.kind === "specialist" ? ["lead"] : undefined, x: undefined, y: undefined } });
    const put = (xs: AgentConfig[]) => xs.map((x) => (x.id === a.id ? { ...r.agent, removed: false, enabled: true } : x));
    setAgents(put); setBaseline(put);
    setSel({ kind: "node", id: a.id });
  }, `${a.name} restored${a.kind === "specialist" ? " after the Lead" : ""}.`);

  const duplicateAgent = (a: AgentConfig) => run(async () => {
    const r = await api<{ agent: AgentConfig }>("/api/crew", { method: "POST", json: { duplicate_of: a.id } });
    const add = (xs: AgentConfig[]) => { const next = [...xs]; next.splice(next.length - 1, 0, r.agent); return next; };
    setAgents(add); setBaseline(add);
    setSel({ kind: "node", id: r.agent.id });
  }, `${a.name} duplicated. Edit the copy on the right.`);

  const tidy = () => {
    const lay = autoLayout(agents.map((a) => ({ ...a, x: undefined, y: undefined })));
    setAgents((xs) => xs.map((a) => ({ ...a, ...(lay.agents[a.id] ?? {}), ...(a.kind === "lead" ? { pins: lay.pins } : {}) })));
    setFitKey((n) => n + 1);
  };

  // Delete or Backspace removes the selected connection (or a custom agent).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        if (sel.kind === "edge") { e.preventDefault(); removeEdge(sel.id); }
        const a = sel.kind === "node" ? agents.find((x) => x.id === sel.id) : undefined;
        if (a && a.kind !== "lead") { e.preventDefault(); void deleteAgent(a); }
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !agents.length) return <PageHeader title="Agents" />;

  const selected = sel?.kind === "node" ? agents.find((a) => a.id === sel.id) : undefined;
  const selEdge = sel?.kind === "edge" ? flow.edges.find((e) => e.id === sel.id) : undefined;
  const label = (id: string) => (id === "decide" ? "Lead Decides" : id === "report" ? "Report" : id === "approve" ? "Approval" : agents.find((a) => a.id === id)?.name ?? id);
  const sub = (n: FNode) => {
    if (n.kind !== "agent") return undefined;
    const a = n.agent!;
    if (loose.has(a.id)) return "Not connected · switched off";
    if (a.kind === "specialist") { const st = stageOf(a.id); const together = stages[st - 1]?.length > 1; return `Stage ${st}${together ? " · runs in parallel" : ""}`; }
    return a.role;
  };
  const state = (n: FNode): NodeState => (n.kind === "agent" && loose.has(n.id) ? "off" : "idle");

  return (
    <>
      <PageHeader
        title="Agents"
        sub="Drag agents onto the canvas and connect them. Specialists connected from the same agent run at the same time; a specialist connected after another runs next and receives its findings."
        actions={<>
          {dirty && <span className="tag warn">Unsaved changes</span>}
          <button type="button" className="btn" disabled={busy || !dirty} onClick={() => { setAgents(baseline); setNotice(null); }}>Discard</button>
          <button type="button" className="btn accent" disabled={busy || !dirty} onClick={() => { void saveLayout(); }}><Icon name="check" size={14} />Save Workflow</button>
        </>}
      />
      {notice && <p className={`${s.notice} ${notice.tone === "ok" ? s.ok : s.err}`} role="status">{notice.text}</p>}

      <div className={s.shell}>
        <aside className={`card ${s.palette}`} aria-label="Add agents">
          <div className="ch"><h2>Add an Agent</h2><span className="n">{data.templates.length} templates</span></div>
          <p className={s.tip}>Drag onto the canvas, or click to add after the Lead.</p>
          <ul>
            {data.templates.map((t) => (
              <li key={t.id}>
                <button type="button" className={s.preset} draggable disabled={busy}
                  onDragStart={(e) => { e.dataTransfer.setData("text/template", t.id); e.dataTransfer.effectAllowed = "copy"; }}
                  onClick={() => { void addAgent(t.id); }}>
                  <span className={s.pico}><Icon name={ICON[t.icon]} size={16} /></span>
                  <span><b>{t.name}</b><small>{t.role}</small></span>
                </button>
              </li>
            ))}
          </ul>
          {agents.some((a) => a.removed) && (
            <>
              <div className="ch"><h2>Removed Agents</h2></div>
              <ul>
                {agents.filter((a) => a.removed).map((a) => (
                  <li key={a.id} className={s.removed}>
                    <span className={s.pico}><Icon name={ICON[a.icon]} size={16} /></span>
                    <span><b>{a.name}</b><small>{a.role}</small></span>
                    <button type="button" className="btn sm" disabled={busy} onClick={() => { void restoreAgent(a); }}>Restore</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={s.sep} />
          <button type="button" className="btn sm" onClick={tidy}>Auto-Arrange</button>
          <div className={s.legend}>
            <b>How to connect</b>
            <p>Drag from the dot under an agent onto the next agent.</p>
            <p>Click a connection and press Delete to remove it.</p>
            <p>Dotted lines are fixed steps.</p>
          </div>
        </aside>

        <FlowCanvas
          className={s.stage}
          nodes={flow.nodes}
          edges={flow.edges}
          editable
          sel={sel}
          onSelect={setSel}
          onMove={move}
          onConnect={connect}
          onDropTemplate={(id, at) => { void addAgent(id, at); }}
          nodeSub={sub}
          nodeState={state}
          loose={loose}
          fitKey={fitKey}
        />

        <aside className={`card ${s.inspector}`} aria-label="Details">
          {selected ? (
            <AgentForm key={selected.id} a={selected} data={data} stage={stageOf(selected.id)} busy={busy}
              upstream={(selected.after ?? []).map(label)}
              onSaved={(next) => { setAgents((xs) => xs.map((x) => (x.id === next.id ? { ...next, x: x.x, y: x.y, after: x.after, pins: x.pins } : x))); setNotice({ tone: "ok", text: `${next.name} saved.` }); void refresh(); }}
              onDelete={() => { void deleteAgent(selected); }}
              onReset={() => { void resetAgent(selected); }}
              onDuplicate={() => { void duplicateAgent(selected); }} />
          ) : selEdge ? (
            <>
              <div className="ch"><h2>Connection</h2></div>
              <div className={s.form}>
                <p className={s.edgeText}><b>{label(selEdge.from)}</b> → <b>{label(selEdge.to)}</b></p>
                <p className={s.help}>{selEdge.from === "decide" ? "Removing this means the AI writes a brief only and drafts no repair." : `${label(selEdge.to)} will no longer run after ${label(selEdge.from)}.`}</p>
                <button type="button" className="btn sm" onClick={() => removeEdge(selEdge.id)}><Icon name="trash" size={13} />Remove Connection</button>
              </div>
            </>
          ) : (
            <>
              <div className="ch"><h2>Run Order</h2></div>
              <div className={s.form}>
                <ol className={s.order}>
                  <li><b>Lead agent</b><span>Reads the building history</span></li>
                  {stages.map((g, i) => (
                    <li key={i}><b>{g.map((a) => a.name).join(" + ")}</b><span>Stage {i + 1}{g.length > 1 ? " · at the same time" : ""}</span></li>
                  ))}
                  <li><b>Lead decides</b><span>Prices the cost of delay against the repair</span></li>
                  {agents.find((a) => a.kind === "dispatch")?.enabled !== false ? <li><b>Dispatch</b><span>Prepares the repair for approval</span></li> : <li><b>Brief only</b><span>Dispatch is not connected</span></li>}
                </ol>
                {loose.size > 0 && <p className={s.help}>Not connected (switched off): {[...loose].map(label).join(", ")}</p>}
                <p className={s.help}>Select an agent to edit its job, or a connection to remove it.</p>
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

const pinsNow = (xs: AgentConfig[]) => { const p = buildFlow(xs).nodes.filter((n) => n.kind !== "agent"); return Object.fromEntries(p.map((n) => [n.id, { x: n.x, y: n.y }])); };

/** One agent's settings: name, job, instructions, model, turns and tools. */
const SWATCHES = ["#003f2d", "#538184", "#2f6f73", "#3e6e8e", "#4a5a8a", "#6b5a7a", "#7f5539", "#8a6a3a", "#a08a3c", "#5f7d4a"];
const ICONS = Object.keys(ICON) as AgentConfig["icon"][];
const RATIOS = [1, 2, 5, 10, 25, 50, 100];
const URGENT = [0, 6, 12, 24, 48, 72];

/** One agent's settings: appearance, job, instructions, model, turns, tools, and (Lead) the decision rule. */
function AgentForm({ a, data, stage, upstream, busy, onSaved, onDelete, onReset, onDuplicate }: { a: AgentConfig; data: Data; stage: number; upstream: string[]; busy: boolean; onSaved: (a: AgentConfig) => void; onDelete: () => void; onReset: () => void; onDuplicate: () => void }) {
  const [draft, setDraft] = useState<AgentConfig>(structuredClone(a));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(a);
  const groups = [...new Set(data.tools.map((t) => t.source))];
  const rules = draft.rules ?? { min_ratio: 1, urgent_hours: 24 };

  async function save() {
    setSaving(true); setErr("");
    try { const r = await api<{ agent: AgentConfig }>(`/api/crew/${a.id}`, { method: "PUT", json: draft }); onSaved(r.agent); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="ch" style={{ "--c": a.color } as React.CSSProperties}>
        <h2>{a.name}</h2>
      </div>
      <div className={s.actions}>
        {a.kind === "specialist" && <button type="button" className="btn sm" disabled={busy || saving} onClick={onDuplicate}><Icon name="plus" size={13} />Duplicate</button>}
        {a.builtin && <button type="button" className="btn sm" disabled={busy || saving} onClick={onReset}><Icon name="reset" size={13} />Reset to Default</button>}
        {a.kind !== "lead" && <button type="button" className="btn sm" disabled={busy || saving} onClick={onDelete}><Icon name="trash" size={13} />{a.builtin ? "Remove" : "Delete"}</button>}
        {a.kind === "lead" && <span className={s.help}>The Lead runs every incident, so it can&apos;t be removed.</span>}
      </div>
      <div className={s.form}>
        <div>
          <span className="label">Appearance</span>
          <div className={s.looks}>
            <div className={s.icons}>
              {ICONS.map((ic) => <button key={ic} type="button" aria-pressed={draft.icon === ic} aria-label={ic} onClick={() => setDraft({ ...draft, icon: ic })}><Icon name={ICON[ic]} size={16} /></button>)}
            </div>
            <div className={s.colors}>
              {SWATCHES.map((c) => <button key={c} type="button" aria-pressed={draft.color === c} aria-label={`Color ${c}`} style={{ background: c }} onClick={() => setDraft({ ...draft, color: c })} />)}
            </div>
          </div>
        </div>
        {a.kind === "lead" && (
          <div className={s.rules}>
            <span className="label">Decision Rule</span>
            <p className={s.help}>When should the AI prepare a repair instead of only writing a brief?</p>
            <label className={s.ruleRow}><span>Prepare a repair when the cost of delay is at least</span>
              <select className="input" value={rules.min_ratio} onChange={(e) => setDraft({ ...draft, rules: { ...rules, min_ratio: Number(e.target.value) } })}>
                {RATIOS.map((r) => <option key={r} value={r}>{r}× the repair cost</option>)}
              </select>
            </label>
            <label className={s.ruleRow}><span>Or always, when failure is expected within</span>
              <select className="input" value={rules.urgent_hours} onChange={(e) => setDraft({ ...draft, rules: { ...rules, urgent_hours: Number(e.target.value) } })}>
                {URGENT.map((h) => <option key={h} value={h}>{h ? `${h} hours` : "Off"}</option>)}
              </select>
            </label>
          </div>
        )}
        {a.kind === "specialist" && <p className={s.help}>{stage ? `Runs in stage ${stage}, after ${upstream.join(" and ")}.` : "Not connected. Drag from the Lead or another agent onto this one to switch it on."}</p>}
        <label><span className="label">Name</span><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label><span className="label">Job, One Line</span><input className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></label>
        <label><span className="label">Instructions</span><textarea className="input" rows={6} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} /></label>
        <div className={s.row2}>
          <label><span className="label">Model</span>
            <select className="input" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
              {data.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label><span className="label">Max Turns</span><input className="input" type="number" min={2} max={12} value={draft.max_turns} onChange={(e) => setDraft({ ...draft, max_turns: Number(e.target.value) })} /></label>
        </div>
        <div>
          <span className="label">Tools It Can Use</span>
          <div className={s.tools}>
            {groups.map((g) => {
              const list = data.tools.filter((t) => t.source === g && (draft.kind === "lead" || !t.leadOnly));
              if (!list.length) return null;
              return (
                <div key={g} className={s.group}>
                  <em>{g}</em>
                  {list.map((t) => {
                    const on = draft.tools.includes(t.name);
                    const locked = draft.kind === "lead" && t.leadOnly;
                    return (
                      <label key={t.name} className={s.tool} title={t.name}>
                        <input type="checkbox" checked={on} disabled={locked} onChange={() => setDraft({ ...draft, tools: on ? draft.tools.filter((x) => x !== t.name) : [...draft.tools, t.name] })} />
                        <span>{t.what}</span>
                        {t.writes && <span className="tag warn">Needs Approval</span>}
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <footer className={s.foot}>
        <button type="button" className="btn solid" disabled={saving || !dirty} onClick={() => { void save(); }}>Save Agent</button>
        <button type="button" className="btn ghost" disabled={saving || !dirty} onClick={() => setDraft(structuredClone(a))}>Discard</button>
        {err && <span className="c-err">{err}</span>}
      </footer>
    </>
  );
}
