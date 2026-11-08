"use client";

import { useEffect, useState } from "react";
import SidePanel from "@/components/ui/SidePanel";
import { api, usd } from "@/lib/client";
import { assetLabel } from "@/lib/plain";
import type { PayerInfo } from "@/lib/plain";
import s from "./LeaseRef.module.css";

type Clause = { assets?: string[]; kinds?: string[]; party: "tenant" | "landlord"; ref: string; text: string };
type Lease = {
  lease_ref: string; clauses: Clause[];
  tenant: { name: string; asset_id: string; sla_penalty_per_hour: number; contact_email: string } | null;
  property: { name: string; address: string; building_type: string } | null;
};

/** The whole lease agreement, with the clause the agents relied on highlighted. */
function LeasePanel({ leaseRef, clause, onClose }: { leaseRef: string; clause?: string; onClose: () => void }) {
  const [lease, setLease] = useState<Lease | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<Lease>(`/api/leases?ref=${encodeURIComponent(leaseRef)}`).then(setLease, (e: Error) => setErr(e.message)); }, [leaseRef]);
  const t = lease?.tenant;
  const used = lease?.clauses.find((c) => c.ref === clause);
  return (
    <SidePanel eyebrow="Lease Agreement" label={leaseRef} onClose={onClose}>
      <header className={s.head}>
        <h2>{t?.name ?? leaseRef}</h2>
        <p>Lease {leaseRef}{lease?.property ? ` at ${lease.property.name}` : ""}</p>
        {used && (
          <p className={s.verdict}>
            <i data-party={used.party} />
            <span><b>{used.party === "tenant" ? `${t?.name ?? "The tenant"} pays` : "The landlord pays"}</b> for this repair, under {used.ref}.</span>
          </p>
        )}
      </header>
      <div className={s.body}>
        {err && <p className="c-err">{err}</p>}
        {!lease && !err && <p className="muted">Loading the lease…</p>}
        {lease && <>
          <h3 className={s.h3}>Agreement</h3>
          <dl className={s.facts}>
            <dt>Landlord</dt><dd>Building owner</dd>
            <dt>Tenant</dt><dd>{t?.name ?? "–"}{t?.contact_email && <em>{t.contact_email}</em>}</dd>
            <dt>Building</dt><dd>{lease.property?.name ?? "–"}{lease.property?.address && <em>{lease.property.address}</em>}</dd>
            <dt>Premises</dt><dd>{t ? assetLabel(t.asset_id) : "–"}</dd>
            <dt>Downtime Penalty</dt><dd>{t ? `${usd(t.sla_penalty_per_hour)} per hour` : "–"}<em>Owed to the tenant while their space is down</em></dd>
          </dl>

          <h3 className={s.h3}>Maintenance Clauses</h3>
          <ol className={s.clauses}>
            {lease.clauses.map((c) => {
              const cited = clause === c.ref;
              const covers = [...(c.assets ?? []).map(assetLabel), ...(c.kinds ?? []).map((k) => `all ${k} systems`)];
              return (
                <li key={c.ref} className={s.clause} data-cited={cited || undefined}>
                  <span className={s.ref}>{c.ref}</span>
                  <div>
                    <p className={s.text}>{c.text}</p>
                    <p className={s.meta}>
                      <span className={s.party}><i data-party={c.party} />{c.party === "tenant" ? `${t?.name ?? "Tenant"} pays` : "Landlord pays"}</span>
                      {covers.length > 0 && <span>Covers {covers.join(", ")}</span>}
                      {cited && <span className={s.cited}>Applied to this incident</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className={s.note}>The Lease agent reads this agreement to decide who pays. A clause that names the exact equipment takes priority over a general one.</p>
        </>}
      </div>
    </SidePanel>
  );
}

/** A clickable lease reference such as "DC1-HALL-A-2024 §7.1". Opens the whole agreement. */
export default function LeaseRef({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [leaseRef, clause] = [text.split(/\s+/)[0], text.match(/§[\d.]+/)?.[0]];
  if (!/^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(leaseRef)) return <>{text}</>;
  return (
    <>
      <button type="button" className={s.link} onClick={(e) => { e.stopPropagation(); setOpen(true); }} title="Open the lease agreement">{text}</button>
      {open && <LeasePanel leaseRef={leaseRef} clause={clause} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "Who pays" as a sentence, with the lease reference clickable. */
export function PayerSentence({ p }: { p: PayerInfo }) {
  return p.party === "tenant"
    ? <>{p.name} pays for this repair under their lease <span className={s.nw}>(<LeaseRef text={p.ref} />)</span>, not the landlord.</>
    : <>The landlord pays for this repair <span className={s.nw}>(<LeaseRef text={p.ref} />)</span>.</>;
}
