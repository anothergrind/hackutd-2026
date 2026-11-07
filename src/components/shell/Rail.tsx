"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/ui/Icon";
import { usePoll } from "@/lib/client";
import s from "./Rail.module.css";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Live incident", icon: "activity" },
  { href: "/approvals", label: "Approvals", icon: "inbox" },
  { href: "/portfolio", label: "Buildings", icon: "building" },
  { href: "/runs", label: "History", icon: "history" },
  { href: "/memory", label: "Memory", icon: "brain" },
  { href: "/crew", label: "The agents", icon: "users" },
];

function toggleTheme(e: React.MouseEvent<HTMLButtonElement>) {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  const apply = () => { root.dataset.theme = next; };
  try { localStorage.setItem("opscrew-theme", next); } catch {}
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
  const r = e.currentTarget.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(apply).ready.then(() =>
    root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }));
}

export default function Rail() {
  const path = usePathname();
  const { data } = usePoll<{ approvals: unknown[] }>("/api/approvals?status=pending", 4000);
  const { data: status } = usePoll<{ mode: "live" | "scripted"; model: string | null; database: string }>("/api/status", 60_000);
  const waiting = data?.approvals.length ?? 0;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className={s.rail} aria-label="Primary">
      <Link href="/" className={s.brand}>
        <span className="mark">OC</span>
        <span className={s.name}><b>OpsCrew</b><em>Building ops agents</em></span>
      </Link>
      <div className={s.group}>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={s.item} aria-current={active(n.href) ? "page" : undefined}>
            <Icon name={n.icon} size={16} />
            <span>{n.label}</span>
            {n.href === "/approvals" && waiting > 0 && <i className={s.badge}>{waiting}</i>}
          </Link>
        ))}
      </div>
      <div className={s.bot}>
        <div className={`${s.mode} ${status?.mode === "live" ? s.live : ""}`}>
          <i className="dot" />
          <span>
            <b>{status?.mode === "live" ? "Nemotron live" : "Demo mode"}</b>
            <em>{status?.mode === "live" ? status.model?.split("/").pop() : "Scripted agents, no API key"}</em>
          </span>
        </div>
        <button type="button" className={s.item} onClick={toggleTheme} aria-label="Switch theme">
          <span className={s.moon}><Icon name="moon" size={16} /></span>
          <span className={s.sun}><Icon name="sun" size={16} /></span>
          <span>Theme</span>
        </button>
      </div>
    </nav>
  );
}
