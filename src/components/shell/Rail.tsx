"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Deck from "@/components/present/Deck";
import AskPanel from "@/components/ask/AskPanel";
import Logo from "@/components/ui/Logo";
import Icon, { type IconName } from "@/components/ui/Icon";
import { usePoll } from "@/lib/client";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Live Incident", icon: "activity" },
  { href: "/approvals", label: "Approvals", icon: "inbox" },
  { href: "/portfolio", label: "Buildings", icon: "building" },
  { href: "/crew", label: "Agents", icon: "users" },
];

function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("opscrew-theme", next); } catch {}
}

export default function Rail() {
  const path = usePathname();
  const { data } = usePoll<{ runs: { pending?: number }[] }>("/api/runs", 4000);
  const { data: status } = usePoll<{ mode: "live" | "scripted"; model: string | null; database: string; health?: { ok: boolean; label: string; detail: string; checks: { name: string; ok: boolean; note: string }[] } }>("/api/status", 15_000);
  const waiting = data?.runs.filter((r) => (r.pending ?? 0) > 0).length ?? 0; // problems needing an OK, not single actions
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const h = status?.health;
  const live = Boolean(h?.ok);
  const [presenting, setPresenting] = useState<number | false>(false);
  const [asking, setAsking] = useState(false);
  // ?present=1-6 opens the deck on that slide.
  useEffect(() => { const n = Number(new URLSearchParams(location.search).get("present")); if (n >= 1 && n <= 6) setPresenting(n - 1); }, []);

  return (
    <nav className="rail" aria-label="Primary">
      <Link href="/overview" className="rail-brand" aria-label="Canary overview">
        <span className="mark"><Logo size={22} /></span>
        <span className="rail-name"><b>Canary</b><em>Building operations</em></span>
      </Link>
      <div className="rail-nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="rail-item" aria-current={active(n.href) ? "page" : undefined}>
            <Icon name={n.icon} size={16} />
            <span className="rail-label">{n.label}</span>
            {n.href === "/approvals" && waiting > 0 && <i className="rail-badge">{waiting}</i>}
          </Link>
        ))}
      </div>
      <div className="rail-bot">
        {/* Green only when the database and the AI model both answer; red with the problem otherwise. */}
        <div className="rail-mode" data-live={live || undefined} data-down={(h && !h.ok) || undefined}
          title={h ? h.checks.map((c) => `${c.ok ? "OK" : "Problem"}: ${c.name}. ${c.note}`).join("\n") : "Checking connections…"}>
          <i className="dot" />
          <span>
            <b>{h ? h.label : "Checking…"}</b>
            <em>{h?.detail}</em>
          </span>
        </div>
        <button type="button" className="rail-present" onClick={() => setAsking(true)}>
          <Icon name="sparkles" size={15} />Ask Canary
        </button>
        <button type="button" className="rail-present" onClick={() => setPresenting(0)}>
          <Icon name="present" size={15} />Present
        </button>
        <button type="button" className="rail-item" onClick={toggleTheme} aria-label="Switch light or dark">
          <Icon name="moon" size={16} />
          <span className="rail-label">Light / Dark</span>
        </button>
      </div>
      {asking && <AskPanel onClose={() => setAsking(false)} />}
      {presenting !== false && <Deck start={presenting} onClose={() => setPresenting(false)} />}
    </nav>
  );
}
