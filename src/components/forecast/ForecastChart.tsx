"use client";

import { useEffect, useRef, useState } from "react";
import { assetLabel, metricLabel } from "@/lib/plain";
import type { Forecast } from "@/lib/forecast";
import s from "./ForecastChart.module.css";

const H = 260, PAD = { l: 44, r: 150, t: 16, b: 30 };
const HOUR = 3_600_000, DAY = 24 * HOUR;
const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtWhen = (t: number) => new Date(t).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const fmtFull = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Hours and minutes until a moment, updated every second. */
export function useCountdown(at: string | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!at) return null;
  return Math.max(0, (Date.parse(at) - now) / HOUR);
}
export const hm = (h: number) => (h >= 48 ? `${Math.round(h / 24)} days` : `${Math.floor(h)} h ${String(Math.floor((h % 1) * 60)).padStart(2, "0")} m`);

/** Round, evenly spaced axis values covering [lo, hi]. */
function niceTicks(lo: number, hi: number, n = 3) {
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return { ticks: out, step };
}

/** Container width, so the chart draws at real pixel size. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** The planned repair, to draw what happens with it. */
export type RepairPlan = { at: string | null; hours: number; vendor: string; wait_usd: number; fix_usd: number; status: "pending" | "sent" | "rejected" | null };

const line = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`).join(" ");

/** Sensor readings, where the trend is heading if nothing is done, and what the planned repair changes. */
export default function ForecastChart({ f, plan }: { f: Forecast; plan?: RepairPlan | null }) {
  const [wrap, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const m = metricLabel(f.metric);
  const all = f.points.map((p) => ({ t: Date.parse(p.t), v: p.v }));
  const now = Date.now();
  const last = all[all.length - 1];
  const fail = f.fail_at ? Date.parse(f.fail_at) : null;
  const fitAt = (t: number) => (f.fit ? f.fit.value + f.fit.slope_per_hour * ((t - Date.parse(f.fit.at)) / HOUR) : last.v);

  // The planned repair starts at the vendor's slot (or soon, if none) and brings the reading back to its level two weeks ago.
  const rejected = plan?.status === "rejected";
  const rStart = plan && !rejected ? Math.max(now + 0.5 * HOUR, plan.at ? Date.parse(plan.at) : now + 2 * HOUR) : null;
  const rEnd = rStart != null ? rStart + Math.max(1, plan!.hours || 2) * HOUR : null;
  const healthy = fitAt(all[0].t);
  const fixedAt = (t: number) => {
    if (rStart == null || t <= rStart) return fitAt(t);
    const k = Math.min(1, (t - rStart) / (rEnd! - rStart));
    return fitAt(rStart) + (healthy - fitAt(rStart)) * (1 - (1 - k) ** 2);
  };

  // Zoom so the future gets real room: about twice as much history as forecast (3 to 14 days).
  const ahead = Math.max(fail ?? 0, rEnd ?? 0) - now;
  const histSpan = Math.min(now - all[0].t, Math.max(3 * DAY, ahead * 2.2));
  const t0 = now - histSpan;
  const t1 = ahead > 0 ? Math.min(now + ahead + histSpan * 0.04, now + histSpan * 1.2) : now + histSpan * 0.25;
  const pts = all.filter((p, i) => p.t >= t0 || all[i + 1]?.t >= t0);
  const projEnd = fail != null && fail <= t1 ? fail : t1;
  const fixEnd = rEnd != null ? Math.min(t1, rEnd + histSpan * 0.04) : null;

  const vals = [...pts.map((p) => p.v), f.limit, fitAt(projEnd), ...(fixEnd ? [fixedAt(fixEnd)] : [])];
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals), padV = (hi0 - lo0) * 0.12 || 1;
  const { ticks: yTicks, step } = niceTicks(lo0 - padV, hi0 + padV);
  const y0 = Math.min(lo0 - padV, yTicks[0]), y1 = Math.max(hi0 + padV, yTicks[yTicks.length - 1]);
  const decimals = Math.min(3, (String(step).split(".")[1] ?? "").length);
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const xNow = x(now), base = H - PAD.b;
  const dec = (v: number) => v.toFixed(Math.max(decimals, Math.abs(f.limit) < 10 ? 2 : 1));

  const readings = line(pts.map((p) => [x(p.t), y(p.v)]));
  const wait = f.fit ? line([[x(last.t), y(fitAt(last.t))], [x(projEnd), y(fitAt(projEnd))]]) : "";
  const fixT = rStart != null && fixEnd != null && rStart <= t1 ? Array.from({ length: 41 }, (_, i) => rStart + ((fixEnd - rStart) * i) / 40) : [];
  const fix = fixT.length ? line([[x(last.t), y(fitAt(last.t))], ...fixT.map((t) => [x(t), y(fixedAt(t))] as [number, number])]) : "";

  const dayStep = Math.max(1, Math.ceil(((t1 - t0) / DAY) / Math.max(2, Math.floor((W - PAD.l - PAD.r) / 110))));
  const firstDay = new Date(t0); firstDay.setHours(0, 0, 0, 0);
  const xTicks: number[] = [];
  for (let t = firstDay.getTime() + DAY; t < t1; t += DAY * dayStep) if (Math.abs(x(t) - xNow) > 40) xTicks.push(t);

  // End-of-line labels, nudged apart if they would overlap.
  let yWait = fail && fail <= t1 ? y(f.limit) : y(fitAt(projEnd));
  let yFix = fixEnd ? y(fixedAt(fixEnd)) : 0;
  if (fix && Math.abs(yWait - yFix) < 34) { const mid = (yWait + yFix) / 2, d = yWait < yFix ? -17 : 17; yWait = mid + d; yFix = mid - d; }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(px < PAD.l || px > W - PAD.r ? null : t0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0));
  };
  type Tip = { t: number; x: number; rows: { k: string; v: string; tone?: "bad" | "good" }[] };
  let tip: Tip | null = null;
  if (hover != null) {
    if (hover <= last.t) {
      const p = pts.reduce((b, q) => (Math.abs(q.t - hover) < Math.abs(b.t - hover) ? q : b), pts[0]);
      tip = { t: p.t, x: x(p.t), rows: [{ k: "Reading", v: `${dec(p.v)}${m.unit}` }] };
    } else if (f.fit) {
      const rows: Tip["rows"] = [];
      if (hover <= projEnd) rows.push({ k: "No repair", v: `${dec(fitAt(hover))}${m.unit}`, tone: "bad" });
      if (fix && hover <= fixEnd!) rows.push({ k: "With repair", v: `${dec(fixedAt(hover))}${m.unit}`, tone: "good" });
      if (rows.length) tip = { t: hover, x: x(hover), rows };
    }
  }

  const title = m.label.replace(/^./, (c) => c.toUpperCase());
  const slope = f.fit ? f.fit.slope_per_hour * 24 : 0;

  return (
    <section className={s.wrap}>
      <header className={s.head}>
        <div>
          <span className={s.k}>Sensor Forecast</span>
          <h3>{title}, {assetLabel(f.asset_id).toLowerCase()}</h3>
          <p className={s.sub}>
            {last.v}{m.unit} now{f.fit ? `, ${slope >= 0 ? "rising" : "falling"} ${Math.abs(slope).toFixed(decimals + 1)}${m.unit} a day` : ""} toward the {f.limit}{m.unit} limit.
            {f.fit ? ` The trend line matches ${Math.round(f.fit.r2 * 100)}% of the readings.` : ""}
          </p>
        </div>
        <ul className={s.key} aria-label="Legend">
          <li><i className={s.kRead} />Readings</li>
          <li><i className={s.kWait} />No repair</li>
          {fix && <li><i className={s.kFix} />With repair</li>}
        </ul>
      </header>

      <div ref={wrap} className={s.plot}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label={`${title} readings and forecast`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {yTicks.map((v) => <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={s.grid} />
            <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" className={s.axis}>{v.toFixed(decimals)}</text>
          </g>)}
          {xTicks.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className={s.axis}>{fmtDay(t)}</text>)}
          <line x1={xNow} x2={xNow} y1={PAD.t} y2={base} className={s.now} />
          <text x={xNow} y={H - 8} textAnchor="middle" className={s.axisNow}>Now</text>

          <line x1={PAD.l} x2={W - PAD.r} y1={y(f.limit)} y2={y(f.limit)} className={s.limit} />
          <text x={PAD.l + 4} y={y(f.limit) + (f.failing === "rising" ? -7 : 15)} className={s.limitLbl}>Limit {f.limit}{m.unit}</text>

          <path d={readings} className={s.readings} />
          {wait && <path d={wait} className={s.wait} />}
          {fix && <path d={fix} className={s.fix} />}
          <circle cx={x(last.t)} cy={y(last.v)} r={3.5} className={s.dotNow} />
          {fail != null && fail <= t1 && <circle cx={x(fail)} cy={y(f.limit)} r={4} className={s.dotBad} />}
          {fix && rStart != null && <circle cx={x(rStart)} cy={y(fitAt(rStart))} r={3.5} className={s.dotGood} />}

          {wait && <g transform={`translate(${x(projEnd) + 10}, ${yWait})`}>
            <text className={s.endBad} y={-2}>No repair</text>
            <text className={s.endSub} y={13}>{fail && fail <= t1 ? `Limit ${fmtWhen(fail)}` : `${dec(fitAt(projEnd))}${m.unit}`}</text>
          </g>}
          {fix && fixEnd && <g transform={`translate(${x(fixEnd) + 10}, ${yFix})`}>
            <text className={s.endGood} y={-2}>With repair</text>
            <text className={s.endSub} y={13}>Back to {dec(fixedAt(fixEnd))}{m.unit}</text>
          </g>}

          {tip && <line x1={tip.x} x2={tip.x} y1={PAD.t} y2={base} className={s.cross} pointerEvents="none" />}
        </svg>
        {tip && (
          <div className={s.tip} style={{ left: Math.min(Math.max(tip.x, 80), W - 80) }}>
            <span className={s.tipT}>{fmtFull(tip.t)}</span>
            {tip.rows.map((r) => <span key={r.k} className={s.tipRow} data-tone={r.tone}><i />{r.k}<b>{r.v}</b></span>)}
          </div>
        )}
      </div>
    </section>
  );
}
