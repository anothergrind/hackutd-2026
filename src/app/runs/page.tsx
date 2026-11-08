"use client";

import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import { ago, usdShort, usePoll } from "@/lib/client";
import type { Run } from "@/lib/types";
import { STATUS } from "@/lib/view";
import s from "./runs.module.css";

type Row = Run & { pending: number; properties?: { name: string } | null };

export default function Runs() {
  const { data, error } = usePoll<{ runs: Row[] }>("/api/runs", 4000);
  return (
    <>
      <PageHeader title="Run History" sub="Every run. Click one to replay it." />
      <section className="card">
        {error && <p className="empty c-err">{error}</p>}
        {data && !data.runs.length && <p className="empty">No runs yet.</p>}
        <div className={s.table}>
          {data?.runs.length ? (
            <div className={`${s.row} ${s.head}`}><span>Run</span><span>Building</span><span>Status</span><span>At risk</span><span>Saved</span><span>Started</span></div>
          ) : null}
          {data?.runs.map((r) => {
            const st = STATUS[r.status];
            return (
              <Link key={r.id} href={`/runs/${r.id}`} className={s.row}>
                <span className={s.title}><b>{r.title ?? "Run"}</b><em>{r.trigger}{r.mode === "live" ? " · Nemotron" : " · scripted"}</em></span>
                <span>{r.properties?.name ?? "–"}</span>
                <span><span className={`tag ${st.tone}`}>{st.label}</span>{r.pending > 0 && <span className="muted mono" style={{ fontSize: 11, marginLeft: 6 }}>{r.pending} waiting</span>}</span>
                <span className="mono c-err">{usdShort(r.risk?.wait_usd)}</span>
                <span className="mono c-ok">{usdShort(r.risk?.saved_usd)}</span>
                <span className="muted mono">{ago(r.created_at)}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
