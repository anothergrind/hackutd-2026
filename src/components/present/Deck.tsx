"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon, { type IconName } from "@/components/ui/Icon";
import { usePoll } from "@/lib/client";
import Logo from "@/components/ui/Logo";
import s from "./Deck.module.css";

type Run = { status: string; risk: { wait_usd: number; fix_usd: number } | null };
const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n).toLocaleString("en-US")}`);

/* ---------- Slide 1: the problem ---------- */
function Problem() {
  const signals: { icon: IconName; k: string; v: string }[] = [
    { icon: "ticket", k: "Work ticket", v: "Water on the floor in Data hall A" },
    { icon: "activity", k: "Sensor", v: "Chiller water warming 0.4°F a day" },
    { icon: "scale", k: "Lease", v: "Who pays if it breaks?" },
  ];
  return (
    <div className={s.slide}>
      <span className={s.eyebrow}>The Problem</span>
      <h1 className={s.h1}>Small warnings.<br />Expensive outages.</h1>
      <div className={s.converge}>
        <ul className={s.signals}>
          {signals.map((x, i) => (
            <li key={x.k} style={{ animationDelay: `${150 + i * 120}ms` }}>
              <Icon name={x.icon} size={18} />
              <span><em>{x.k}</em>{x.v}</span>
            </li>
          ))}
        </ul>
        <svg className={s.lines} viewBox="0 0 200 240" preserveAspectRatio="none" aria-hidden>
          <path d="M0 40 C 110 40, 90 120, 200 120" /><path d="M0 120 L 200 120" /><path d="M0 200 C 110 200, 90 120, 200 120" />
        </svg>
        <div className={s.outage}>
          <span className={s.oK}>Nobody connects them</span>
          <b>Chiller fails Monday</b>
          <span className={s.oV}>$150,938</span>
          <em>tenant penalties and an emergency repair</em>
        </div>
      </div>
      <p className={s.foot}>Each signal lives in a different system, so the pattern is only obvious after the failure.</p>
    </div>
  );
}

/* ---------- Slide 2: Canary ---------- */
function Solution() {
  const steps: { icon: IconName; t: string; d: string }[] = [
    { icon: "inbox", t: "Report", d: "A ticket, alarm or nightly check" },
    { icon: "users", t: "Agents analyze", d: "Tickets, sensors and leases at once" },
    { icon: "gauge", t: "Price the risk", d: "Cost of waiting vs. cost to fix" },
    { icon: "wrench", t: "Draft the fix", d: "Vendor, schedule and tenant notices" },
    { icon: "check", t: "You approve", d: "The facility manager signs off" },
  ];
  return (
    <div className={s.slide}>
      <span className={s.eyebrow}>Our Solution</span>
      <div className={s.brand}><span className={s.mark}><Logo size={62} /></span><h1 className={s.name}>Canary</h1></div>
      <p className={s.lede}>A crew of AI agents that connects the warnings, prices the risk and drafts the repair, before anything breaks.</p>
      <ol className={s.flow}>
        {steps.map((x, i) => (
          <li key={x.t} style={{ animationDelay: `${200 + i * 110}ms` }}>
            <span className={s.fIcon}><Icon name={x.icon} size={20} /></span>
            <b>{x.t}</b><em>{x.d}</em>
          </li>
        ))}
      </ol>
      <p className={s.stack}><span>NVIDIA Nemotron</span><span>Served on Brev</span><span>Data in Supabase</span></p>
    </div>
  );
}

/* ---------- Slide 3: demo ---------- */
function Demo({ onStart }: { onStart: () => void }) {
  const watch = [
    { n: "01", t: "The forecast", d: "When the equipment hits its limit" },
    { n: "02", t: "The agents", d: "What each one finds, live" },
    { n: "03", t: "The approval", d: "One click to send the fix" },
  ];
  return (
    <div className={`${s.slide} ${s.dark}`}>
      <span className={s.live}><i />Live Demo</span>
      <h1 className={s.h1}>Let&apos;s watch the<br />crew work.</h1>
      <ol className={s.watch}>
        {watch.map((x, i) => <li key={x.n} style={{ animationDelay: `${200 + i * 120}ms` }}><span>{x.n}</span><b>{x.t}</b><em>{x.d}</em></li>)}
      </ol>
      <button type="button" className={s.start} onClick={onStart}><Icon name="play" size={16} />Start the Demo</button>
    </div>
  );
}

/* ---------- Slide 4: impact ---------- */
function Impact() {
  const { data } = usePoll<{ runs: Run[] }>("/api/runs", 0, false);
  const priced = (data?.runs ?? []).filter((r) => r.risk);
  const wait = priced.reduce((n, r) => n + (r.risk?.wait_usd ?? 0), 0);
  const fix = priced.reduce((n, r) => n + (r.risk?.fix_usd ?? 0), 0);
  const who: { icon: IconName; t: string; d: string }[] = [
    { icon: "building", t: "Facility managers", d: "See it, decide and approve in one place." },
    { icon: "users", t: "Tenants", d: "Warned before downtime, not after it." },
    { icon: "scale", t: "Building owners", d: "Every repair priced against the cost of waiting." },
  ];
  return (
    <div className={s.slide}>
      <span className={s.eyebrow}>The Impact</span>
      <h1 className={s.h1}>Fix it early.<br />Spend far less.</h1>
      <div className={s.nums}>
        <div><span>Cost of waiting</span><b className={s.bad}>{priced.length ? usd(wait) : "–"}</b></div>
        <div><span>Cost to fix now</span><b className={s.good}>{priced.length ? usd(fix) : "–"}</b></div>
        <div><span>Cheaper to act</span><b>{fix > 0 ? `${Math.round(wait / fix)}×` : "–"}</b></div>
      </div>
      <p className={s.numNote}>{priced.length ? `Across the ${priced.length} incidents Canary has analyzed in this demo portfolio.` : ""}</p>
      <ul className={s.who}>
        {who.map((x, i) => <li key={x.t} style={{ animationDelay: `${250 + i * 110}ms` }}><Icon name={x.icon} size={18} /><b>{x.t}</b><em>{x.d}</em></li>)}
      </ul>
    </div>
  );
}

/** Full-screen, four-slide pitch. Arrow keys or the side arrows move between slides; Esc closes. */
export default function Deck({ onClose, start: first = 0 }: { onClose: () => void; start?: number }) {
  const router = useRouter();
  const [i, setI] = useState(first);
  const total = 4;
  const go = useCallback((n: number) => setI(Math.max(0, Math.min(total - 1, n))), []);
  const start = useCallback(() => { onClose(); router.push("/"); }, [onClose, router]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); setI((n) => Math.min(total - 1, n + 1)); }
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [onClose]);

  const slides = [<Problem key="p" />, <Solution key="s" />, <Demo key="d" onStart={start} />, <Impact key="i" />];
  return createPortal(
    <div className={s.deck} data-dark={i === 2 || undefined} role="dialog" aria-label="Canary presentation">
      <header className={s.top}>
        <span className={s.topBrand}><span className={s.markSm}><Logo size={21} /></span>Canary</span>
        <span className={s.count}>{String(i + 1).padStart(2, "0")} <i>/ {String(total).padStart(2, "0")}</i></span>
        <button type="button" className={s.close} onClick={onClose} aria-label="Close presentation"><Icon name="x" size={18} /></button>
      </header>
      <div className={s.stage} key={i}>{slides[i]}</div>
      <button type="button" className={`${s.arrow} ${s.prev}`} disabled={i === 0} onClick={() => go(i - 1)} aria-label="Previous slide"><Icon name="arrow-left" size={20} /></button>
      <button type="button" className={`${s.arrow} ${s.next}`} disabled={i === total - 1} onClick={() => go(i + 1)} aria-label="Next slide"><Icon name="arrow-right" size={20} /></button>
      <div className={s.dots}>{Array.from({ length: total }, (_, n) => <button key={n} type="button" aria-label={`Slide ${n + 1}`} data-on={n === i || undefined} onClick={() => go(n)} />)}</div>
    </div>,
    document.body,
  );
}
