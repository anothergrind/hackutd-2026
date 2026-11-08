"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ApprovalCard from "@/components/approvals/ApprovalCard";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/ui/Icon";
import SidePanel from "@/components/ui/SidePanel";
import { ago, api, usd, usePoll } from "@/lib/client";
import { titleCase } from "@/lib/plain";
import { scenarioByLabel } from "@/lib/scenarios";
import type { Approval, Run } from "@/lib/types";
import s from "./approvals.module.css";

type Problem = Run & { properties?: { name: string } | null; pending?: number };
type Row = Approval & { agent_runs?: { title: string | null; properties?: { name: string } | null } | null };
type Status = "needs" | "working" | "resolved" | "failed";
type SortKey = "risk" | "time" | "newest" | "actions" | "building";

const STATUS: Record<Status, { label: string; tone: string }> = {
  needs: { label: "Pending Approval", tone: "warn" },
  working: { label: "Analyzing", tone: "accent" },
  resolved: { label: "Resolved", tone: "ok" },
  failed: { label: "Failed", tone: "err" },
};
const FILTERS: { id: "all" | Status; label: string }[] = [
  { id: "all", label: "All" }, { id: "needs", label: "Pending Approval" }, { id: "working", label: "Analyzing" }, { id: "resolved", label: "Resolved" },
];
const SORTS: { id: SortKey; label: string }[] = [
  { id: "risk", label: "Most at risk" }, { id: "time", label: "Least time left" }, { id: "actions", label: "Most actions waiting" }, { id: "newest", label: "Newest first" }, { id: "building", label: "Building A–Z" },
];
const ORDER = { work_order: 0, schedule_change: 1, tenant_notice: 2 } as const;

const statusOf = (r: Problem): Status => r.status === "running" ? "working" : r.status === "error" ? "failed" : (r.pending ?? 0) > 0 ? "needs" : "resolved";
const summaryOf = (r: Problem) => scenarioByLabel(r.title)?.plain.problem ?? r.summary ?? "";
const hoursLeft = (r: Problem) => r.risk?.hours_until_failure ?? null;

/** Every incident in one list: filter, sort, and open one to approve its actions. */
export default function Approvals() {
  const runs = usePoll<{ runs: Problem[] }>("/api/runs", 3000);
  const appr = usePoll<{ approvals: Row[] }>("/api/approvals?status=all", 3000);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [building, setBuilding] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("risk");
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => runs.data?.runs ?? [], [runs.data]);
  const buildings = [...new Set(all.map((r) => r.properties?.name).filter(Boolean))] as string[];
  const counts = { all: all.length, needs: 0, working: 0, resolved: 0, failed: 0 } as Record<"all" | Status, number>;
  for (const r of all) counts[statusOf(r)]++;
  
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = all.filter((r) =>
      (filter === "all" || statusOf(r) === filter) &&
      (building === "all" || r.properties?.name === building) &&
      (!term || `${r.title} ${r.properties?.name} ${summaryOf(r)}`.toLowerCase().includes(term)));
    const by: Record<SortKey, (a: Problem, b: Problem) => number> = {
      risk: (a, b) => (b.risk?.wait_usd ?? -1) - (a.risk?.wait_usd ?? -1),
      time: (a, b) => (hoursLeft(a) ?? Infinity) - (hoursLeft(b) ?? Infinity),
      actions: (a, b) => (b.pending ?? 0) - (a.pending ?? 0),
      newest: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
      building: (a, b) => (a.properties?.name ?? "").localeCompare(b.properties?.name ?? ""),
    };
    return [...list].sort(by[sort]);
  }, [all, filter, building, q, sort]);

  const open = all.find((r) => r.id === openId);
  const actions = (appr.data?.approvals ?? []).filter((a) => a.run_id === openId).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const pendingIds = actions.filter((a) => a.status === "pending").map((a) => a.id);
  const refresh = () => { void runs.refresh(); void appr.refresh(); };

  return (
    <>
      <PageHeader title="Approvals" sub="Every problem the AI found, in one list. Open one to review and approve its actions." />

      <section className="card">
        <div className={s.bar}>
          <div className={s.seg} role="tablist" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}<span>{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className={s.tools}>
            <label className={s.search}><Icon name="search" size={14} /><input className="input" placeholder="Search problems" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <select className="input" value={building} onChange={(e) => setBuilding(e.target.value)} aria-label="Building">
              <option value="all">All buildings</option>
              {buildings.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              {SORTS.map((o) => <option key={o.id} value={o.id}>Sort: {o.label}</option>)}
            </select>
          </div>
        </div>
        <p className={s.showing}>Showing {shown.length} of {counts.all} problems · {counts.needs} pending approval</p>

        {shown.length ? (
          <table className={s.table}>
            <thead>
              <tr><th>Status</th><th>Problem</th><th className="num">Actions Waiting</th><th className="num">Could Cost If We Wait</th><th className="num">Cost to Fix</th><th className="num">Time Left</th><th>Reported</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = STATUS[statusOf(r)];
                const h = hoursLeft(r);
                return (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} data-open={openId === r.id || undefined}>
                    <td><span className={`tag ${st.tone}`}>{st.label}</span></td>
                    <td><span className={s.problem}><b>{r.properties?.name} · {titleCase(r.title ?? "Incident")}</b><em>{summaryOf(r)}</em></span></td>
                    <td className="num">{r.pending ? <b className="c-warn">{r.pending}</b> : "–"}</td>
                    <td className="num c-err">{usd(r.risk?.wait_usd)}</td>
                    <td className="num">{usd(r.risk?.fix_usd)}</td>
                    <td className="num">{h != null ? `${Math.round(h)} h` : "–"}</td>
                    <td className="muted">{ago(r.created_at)}</td>
                    <td className={s.go}><Icon name="arrow-right" size={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="empty">{all.length ? "No problems match these filters." : "No problems yet. Start an incident or a storm night."}</p>}
      </section>

      {open && (
        <SidePanel eyebrow={open.properties?.name} label={open.title ?? "Problem"} onClose={() => setOpenId(null)}
          footer={<>
            <Link className="btn sm" href={`/?run=${open.id}`}>Open Full Incident<Icon name="arrow-right" size={13} /></Link>
            {pendingIds.length > 0 && <ApproveAll ids={pendingIds} onDone={refresh} />}
          </>}>
          <div className={s.pHead}>
            <span className={`tag ${STATUS[statusOf(open)].tone}`}>{STATUS[statusOf(open)].label}</span>
            <h2>{titleCase(open.title ?? "Incident")}</h2>
            <p>{summaryOf(open)}</p>
            <dl className={s.pStats}>
              <div><dt>Could Cost If We Wait</dt><dd className="c-err">{usd(open.risk?.wait_usd)}</dd></div>
              <div><dt>Cost to Fix</dt><dd className="c-ok">{usd(open.risk?.fix_usd)}</dd></div>
              <div><dt>Time Left</dt><dd>{hoursLeft(open) != null ? `${Math.round(hoursLeft(open) ?? 0)} hours` : "–"}</dd></div>
            </dl>
          </div>
          <div className={s.pBody}>
            <h3>Actions ({actions.length})</h3>
            {actions.length ? actions.map((a) => <ApprovalCard key={a.id} a={a} onDone={refresh} />) : <p className="muted">The AI prepared no actions for this problem.</p>}
          </div>
        </SidePanel>
      )}
    </>
  );
}

function ApproveAll({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { for (const id of ids) await api(`/api/approvals/${id}`, { method: "POST", json: { decision: "approve", by: "Facility manager" } }); }
    finally { setBusy(false); onDone(); }
  }
  return <button type="button" className="btn sm accent" disabled={busy} onClick={() => { void go(); }}><Icon name="check" size={13} />{busy ? "Sending…" : `Approve All ${ids.length}`}</button>;
}
