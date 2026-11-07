"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${response.status})`);
  return data as T;
}

/** GET `url` now and every `ms` while `live` is true. Pass url = null to pause. */
export function usePoll<T>(url: string | null, ms = 1500, live = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    if (!url) return;
    const mine = ++seq.current;
    try {
      const d = await api<T>(url);
      if (mine === seq.current) { setData(d); setError(""); }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [url]);
  useEffect(() => {
    setData(null);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!url || !live) return;
    const t = setInterval(() => { void refresh(); }, ms);
    return () => clearInterval(t);
  }, [url, ms, live, refresh]);
  return { data, error, refresh };
}

export const usd = (n: number | null | undefined) => (n == null ? "–" : `$${Math.round(n).toLocaleString("en-US")}`);
export const usdShort = (n: number | null | undefined) => {
  if (n == null) return "–";
  const a = Math.abs(n);
  return a >= 1_000_000 ? `$${(n / 1e6).toFixed(1)}M` : a >= 10_000 ? `$${Math.round(n / 1000)}k` : usd(n);
};
export function ago(iso: string | null | undefined) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
export const hoursText = (h: number | null | undefined) => (h == null ? "unknown" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
