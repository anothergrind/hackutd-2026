"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/ui/Icon";
import { api, usePoll } from "@/lib/client";
import type { AgentConfig } from "@/lib/crew";
import type { ToolInfo } from "@/lib/roster";
import s from "./crew.module.css";

type Data = { crew: AgentConfig[]; tools: ToolInfo[]; models: { id: string; label: string }[]; templates: { id: string; name: string; role: string; icon: AgentConfig["icon"] }[] };
const ICON = { bot: "bot", ticket: "ticket", activity: "activity", scale: "scale", truck: "truck", zap: "zap", history: "history", shield: "shield", sparkles: "sparkles" } as const;

export default function Crew() {
  const { data, refresh } = usePoll<Data>("/api/crew", 0, false);
  const [sel, setSel] = useState<string>("lead");
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { const q = new URLSearchParams(location.search).get("agent"); if (q) setSel(q); }, []);
  const current = data?.crew.find((a) => a.id === sel) ?? data?.crew[0];
  useEffect(() => { if (current) setDraft(structuredClone(current)); setMsg(""); }, [current?.id, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(current), [draft, current]);

  async function act(fn: () => Promise<void>, done: string) {
    setBusy(true); setMsg("");
    try { await fn(); await refresh(); setMsg(done); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  const save = () => draft && act(async () => { await api(`/api/crew/${draft.id}`, { method: "PUT", json: draft }); }, "Saved. The next run uses it.");
  const toggle = (a: AgentConfig) => act(async () => { await api(`/api/crew/${a.id}`, { method: "PUT", json: { ...a, enabled: !a.enabled } }); }, a.enabled ? `${a.name} switched off` : `${a.name} switched on`);
  const add = (template_id: string) => act(async () => { const r = await api<{ agent: AgentConfig }>("/api/crew", { method: "POST", json: { template_id } }); setSel(r.agent.id); }, "Added. Edit it, then run an incident.");
  const remove = () => current && act(async () => { await api(`/api/crew/${current.id}`, { method: "DELETE" }); if (!current.builtin) setSel("lead"); }, current.builtin ? "Reset to default" : "Deleted");

  if (!data || !draft || !current) return <PageHeader title="The agents" />;
  const lead = data.crew.find((a) => a.kind === "lead")!;
  const specs = data.crew.filter((a) => a.kind === "specialist");
  const disp = data.crew.find((a) => a.kind === "dispatch");
  const groups = [...new Set(data.tools.map((t) => t.source))];

  return (
    <>
      <PageHeader title="The agents" sub="Pick an agent to change what it does. Add specialists from templates." />
      <div className={s.builder}>
        <aside className={`card ${s.palette}`}>
          <div className="ch"><h2>Add a specialist</h2></div>
          {data.templates.map((t) => (
            <button key={t.id} type="button" className={s.tpl} disabled={busy} onClick={() => { void add(t.id); }}>
              <span className={s.tico}><Icon name={ICON[t.icon]} size={15} /></span>
              <span><b>{t.name}</b><em>{t.role}</em></span>
              <Icon name="plus" size={14} />
            </button>
          ))}
        </aside>

        <section className={`card ${s.map}`}>
          <Card a={lead} sel={sel} onSel={setSel} />
          <div className={s.arrow} />
          <div className={s.fork}><span>in parallel</span></div>
          <div className={s.specs}>
            {specs.map((a) => <Card key={a.id} a={a} sel={sel} onSel={setSel} onToggle={() => { void toggle(a); }} busy={busy} />)}
          </div>
          <div className={s.tri} />
          <div className={s.arrow} />
          {disp && <Card a={disp} sel={sel} onSel={setSel} onToggle={() => { void toggle(disp); }} busy={busy} />}
          <div className={s.arrow} />
          <div className={s.gate}><Icon name="inbox" size={14} />Approval queue · nothing is sent without you</div>
        </section>

        <aside className={`card ${s.inspector}`} style={{ "--c": draft.color } as React.CSSProperties}>
          <div className="ch">
            <h2>{current.name}</h2>
            {dirty && <span className="tag warn">unsaved</span>}
            <span className="right">
              {(current.kind !== "lead" || !current.builtin) && (
                <button type="button" className="btn sm ghost" disabled={busy} onClick={() => { void remove(); }}>
                  <Icon name={current.builtin ? "reset" : "trash"} size={13} />{current.builtin ? "Reset" : "Delete"}
                </button>
              )}
            </span>
          </div>
          <div className={s.form}>
            <label><span className="label">Name</span><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label><span className="label">Job, one line</span><input className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></label>
            <label><span className="label">Instructions</span><textarea className="input" rows={7} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} /></label>
            <div className={s.row2}>
              <label><span className="label">Model</span>
                <select className="input" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
                  {data.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label><span className="label">Max turns</span><input className="input" type="number" min={2} max={12} value={draft.max_turns} onChange={(e) => setDraft({ ...draft, max_turns: Number(e.target.value) })} /></label>
            </div>
            <div>
              <span className="label">Tools it can use</span>
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
                          <label key={t.name} className={s.tool} title={t.what}>
                            <input type="checkbox" checked={on} disabled={locked} onChange={() => setDraft({ ...draft, tools: on ? draft.tools.filter((x) => x !== t.name) : [...draft.tools, t.name] })} />
                            <span className="mono">{t.name}</span>
                            {t.writes && <span className="tag warn">needs OK</span>}
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
                {draft.kind === "lead" && <p className={s.hint}>Plus one <span className="mono">ask_…</span> tool for each switched-on agent.</p>}
              </div>
            </div>
          </div>
          <footer className={s.foot}>
            <button type="button" className="btn solid" disabled={busy || !dirty} onClick={() => { void save(); }}>Save</button>
            <button type="button" className="btn ghost" disabled={busy || !dirty} onClick={() => setDraft(structuredClone(current))}>Discard</button>
            {msg && <span className={s.msg}>{msg}</span>}
          </footer>
        </aside>
      </div>
    </>
  );
}

function Card({ a, sel, onSel, onToggle, busy }: { a: AgentConfig; sel: string; onSel: (id: string) => void; onToggle?: () => void; busy?: boolean }) {
  return (
    <div className={`${s.agent} ${sel === a.id ? s.on : ""} ${a.enabled ? "" : s.off}`} style={{ "--c": a.color } as React.CSSProperties}>
      <button type="button" className={s.pick} onClick={() => onSel(a.id)}>
        <span className={s.ico}><Icon name={ICON[a.icon]} size={15} /></span>
        <span className={s.nm}><b>{a.name}</b><em>{a.tools.length} tools{a.model ? " · custom model" : ""}{a.builtin ? "" : " · custom"}</em></span>
      </button>
      {onToggle && <button type="button" className="switch" role="switch" aria-checked={a.enabled} aria-label={`${a.name} on/off`} disabled={busy} onClick={onToggle} />}
    </div>
  );
}
