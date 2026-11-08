"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/ui/Icon";
import { usePoll } from "@/lib/client";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Live Incident", icon: "activity" },
  { href: "/plan", label: "Tonight's Plan", icon: "calendar" },
  { href: "/approvals", label: "Approvals", icon: "inbox" },
  { href: "/portfolio", label: "Buildings", icon: "building" },
  { href: "/runs", label: "History", icon: "history" },
  { href: "/memory", label: "Memory", icon: "brain" },
  { href: "/crew", label: "The Agents", icon: "users" },
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
  const { data: status } = usePoll<{ mode: "live" | "scripted"; model: string | null; database: string }>("/api/status", 60_000);
  const waiting = data?.runs.filter((r) => (r.pending ?? 0) > 0).length ?? 0; // problems needing an OK, not single actions
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const live = status?.mode === "live";

  return (
    <nav className="rail" aria-label="Primary">
      <Link href="/" className="rail-brand">
        <span className="mark">OC</span>
        <span className="rail-name"><b>OpsCrew</b><em>Building operations</em></span>
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
        <div className="rail-mode" data-live={live || undefined}>
          <i className="dot" />
          <span>
            <b>{live ? "Nemotron live" : "Demo mode"}</b>
            <em>{live ? status?.model?.split("/").pop() : "Scripted agents"}</em>
          </span>
        </div>
        <button type="button" className="rail-item" onClick={toggleTheme} aria-label="Switch light or dark">
          <Icon name="moon" size={16} />
          <span className="rail-label">Light / Dark</span>
        </button>
      </div>
    </nav>
  );
}
