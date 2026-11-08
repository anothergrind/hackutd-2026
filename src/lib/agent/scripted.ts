// Scripted policy: plays each agent's part without an API key, calling the SAME tools against the SAME data.
// It exists so the demo never depends on rate limits or Wi-Fi. Live Nemotron uses prompts.ts instead.

import type { AgentConfig } from "@/lib/crew";
import type { RunCtx } from "./tools";

export type Call = { name: string; args: Record<string, unknown> };
export type Move = { thought?: string; calls: Call[] } | { final: string };

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const hrs = (h: number | null | undefined) => (h == null ? "unknown time" : h < 48 ? `~${Math.round(h)} h` : `~${Math.round(h / 24)} days`);

const BUILTIN_TASK: Record<string, (ctx: RunCtx) => string> = {
  triage: (c) => `Find open tickets related to ${c.signal.asset_id} and link any that share a root cause.`,
  sensor: (c) => `Map dependencies of ${c.hints.root}${c.hints.trend ? ` and estimate hours until ${c.hints.trend.asset_id} ${c.hints.trend.metric} crosses ${c.hints.trend.limit}` : ""}.`,
  lease: (c) => `Which tenants are hurt if ${c.hints.price_asset} is out for ${c.hints.outage_hours} h, and what is the forecast?`,
};

/** Reasonable arguments for any read-only tool, so a custom specialist can run without an API key. */
function defaultArgs(tool: string, ctx: RunCtx): Record<string, unknown> | null {
  const h = ctx.hints;
  switch (tool) {
    case "search_tickets": return { days: 30 };
    case "past_incidents": return { asset_id: h.price_asset };
    case "get_dependencies": case "get_weather": case "find_vendor": case "check_parts": return { asset_id: h.root };
    case "get_readings": return { asset_id: ctx.signal.asset_id, days: 14 };
    case "detect_trend": return h.trend ? { ...h.trend } : null;
    case "get_energy": return {};
    case "tenants_at_risk": return { asset_id: h.price_asset, outage_hours: h.outage_hours };
    default: return null; // writes and linking need real reasoning
  }
}

function genericMove(cfg: AgentConfig, turn: number, ctx: RunCtx, available: string[]): Move {
  if (turn === 0) {
    const calls = available.map((name) => ({ name, args: defaultArgs(name, ctx) })).filter((c): c is Call => c.args !== null);
    if (calls.length) return { thought: `Checking ${calls.map((c) => c.name).join(", ")}.`, calls };
  }
  const got = ctx.facts.byAgent?.[cfg.id] ?? [];
  const bits = got.map((g) => brief(g.name, g.result)).filter(Boolean);
  return { final: bits.length ? `${cfg.name}: ${bits.join("; ")}.` : `${cfg.name}: nothing to report for this signal.` };
}

/** One clause per tool result for generic reports. */
function brief(name: string, r: unknown): string {
  const x = (r ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (x.error) return `${name} failed (${String(x.error).slice(0, 60)})`;
  switch (name) {
    case "get_energy": { const top = x.readings?.[0]; return top ? `${top.equipment} is ${top.over_baseline_pct}% over baseline (anomaly ${top.anomaly_score})` : "no energy anomalies"; }
    case "past_incidents": return x.repeat ? `repeat failure: ${x.work_orders.length} earlier work order(s), latest "${x.work_orders[0].title}" ${x.work_orders[0].days_ago} days ago` : `no earlier work orders on ${(x.checked ?? []).join(", ")}`;
    case "detect_trend": return `trend ${x.slope_per_day}/day, ${x.hours_to_limit == null ? "no crossing" : `limit in ~${Math.round(x.hours_to_limit)} h`} (r² ${x.r2})`;
    case "tenants_at_risk": return `${x.tenants?.length ?? 0} tenants, ${usd(x.penalty_per_hour_usd ?? 0)}/hr`;
    case "get_dependencies": return `${x.feeds?.length ?? 0} assets downstream`;
    case "get_readings": return `${x.count ?? 0} recent readings`;
    case "search_tickets": return `${x.count ?? 0} open tickets`;
    case "get_weather": return x.summary?.max_f != null ? `forecast high ${Math.round(x.summary.max_f)}°F` : "forecast checked";
    case "find_vendor": return x.vendors?.[0] ? `${x.vendors[0].name} available` : "no vendor";
    case "check_parts": return `${(x.parts ?? []).length} parts listed`;
    default: return "";
  }
}

export function scriptedMove(cfg: AgentConfig, turn: number, ctx: RunCtx, available: string[]): Move {
  const { hints: h, facts: f } = ctx;
  const agent = cfg.builtin ? cfg.id : "custom";
  switch (agent) {
    case "triage": {
      if (turn === 0) return { thought: "Pulling every open ticket in the building from the last 30 days.", calls: [{ name: "search_tickets", args: { days: 30 } }] };
      const related = (f.tickets ?? []).filter((t) => [h.root, h.impacted].includes(t.equipment));
      if (turn === 1 && related.length) {
        return { thought: `${related.length} of them sit on ${h.root} or ${h.impacted}. Linking them.`, calls: [{ name: "link_tickets", args: { ticket_ids: related.map((t) => t.id), problem: h.problem, root_asset_id: h.root } }] };
      }
      return related.length
        ? { final: `${related.length} small tickets over ${f.tickets?.length ? "the last 30 days" : "recent days"} are one problem: ${h.problem}. Root asset: ${h.root}.` }
        : { final: `No related open tickets. The signal on ${ctx.signal.asset_id} looks new.` };
    }
    case "sensor": {
      if (turn === 0) return { thought: `Mapping what ${h.root} depends on and what it feeds.`, calls: [{ name: "get_dependencies", args: { asset_id: h.root } }] };
      if (turn === 1) {
        return h.trend
          ? { thought: `Fitting a trend on ${h.trend.asset_id} ${h.trend.metric}.`, calls: [{ name: "detect_trend", args: { ...h.trend } }] }
          : { thought: `Checking the last 3 days of readings on ${ctx.signal.asset_id}.`, calls: [{ name: "get_readings", args: { asset_id: ctx.signal.asset_id, days: 3 } }] };
      }
      const t = f.trend;
      const down = f.deps?.downstream.length ?? 0;
      return t
        ? { final: `${t.asset_id} ${t.metric} is rising ${t.slope_per_day}/day (r² ${t.r2}). At ${t.latest} now, it crosses the ${t.limit} limit in ${hrs(t.hours_to_limit)}. ${h.root} feeds ${down} downstream asset${down === 1 ? "" : "s"}.` }
        : { final: `No trend history for this asset; treating the signal as acute. ${h.root} feeds ${down} downstream asset${down === 1 ? "" : "s"}.` };
    }
    case "lease": {
      if (turn === 0) return { thought: `Finding tenants downstream of ${h.price_asset}.`, calls: [{ name: "tenants_at_risk", args: { asset_id: h.price_asset, outage_hours: h.outage_hours } }] };
      if (turn === 1) return { thought: `Reading the leases to see who pays for ${h.root}, and checking the forecast.`, calls: [{ name: "lease_responsibility", args: { asset_id: h.root } }, { name: "get_weather", args: { asset_id: h.root } }] };
      const ts = f.tenants ?? [];
      const w = f.weather;
      const pay = f.payer ? ` Repair is paid by ${f.payer.name} (${f.payer.ref}).` : "";
      return { final: `${ts.length} tenant${ts.length === 1 ? "" : "s"} exposed (${ts.map((t) => t.name).join(", ") || "none"}), ${usd(f.penaltyPerHour ?? 0)}/hr in SLA penalties combined.${w?.max_f != null ? ` Forecast high ${Math.round(w.max_f)}°F, rain ${w.rain_pct ?? 0}%, gusts ${Math.round(w.gust_mph ?? 0)} mph.` : ""}${pay}` };
    }
    case "dispatch": {
      if (turn === 0) return { thought: `Looking up certified vendors and spare parts for ${h.root}.`, calls: [{ name: "find_vendor", args: { asset_id: h.root, est_hours: h.repair_hours } }, { name: "check_parts", args: { asset_id: h.root } }] };
      if (turn === 1) {
        const v = f.vendors?.[0];
        if (!v) return { final: `No certified vendor found for ${h.root}. Escalate to the facility manager.` };
        const protect = f.risk?.wait_usd ?? 0;
        const calls: Call[] = [{
          name: "draft_work_order",
          args: { asset_id: h.root, vendor_id: v.id, priority: (f.risk?.hours_until_failure ?? 99) <= 24 ? 5 : 4, title: `${h.root}: ${h.steps[0]}`, steps: h.steps, est_hours: h.repair_hours, protects_usd: protect },
        }];
        if (h.schedule) calls.push({ name: "draft_schedule_change", args: { asset_id: h.schedule_asset ?? h.root, change: h.schedule, hours: 24, protects_usd: Math.round(protect * 0.5) } });
        for (const t of f.tenants ?? []) {
          calls.push({
            name: "draft_tenant_notice",
            args: {
              tenant_id: t.id, protects_usd: t.exposure_usd,
              subject: `Planned maintenance on ${h.root}: no action needed`,
              message: `Hi ${t.name} team,\n\nOur monitoring found an early issue with ${h.root} that serves your space. We have booked ${v.name} to fix it before it affects you (window starts ${new Date(v.next_available).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} CT). We expect no impact to your service. We will confirm when the work is verified.\n\nAvon Facilities`,
            },
          });
        }
        return { thought: `${v.name} is soonest (${usd(v.est_cost_usd)}). Drafting the work order${h.schedule ? ", a schedule change" : ""} and ${f.tenants?.length ?? 0} tenant notice(s).`, calls };
      }
      return { final: `Drafted ${f.drafts} action${f.drafts === 1 ? "" : "s"} for approval: vendor ${f.vendors?.[0]?.name ?? "n/a"}.${(f.parts ?? []).some((p) => p.on_hand > 0) ? " Spare parts are on site." : ""}` };
    }
    case "lead": {
      if (turn === 0) return { thought: `New signal on ${ctx.signal.asset_id}. Checking what we already know about this building.`, calls: [{ name: "read_building_memory", args: {} }] };
      if (turn === 1) {
        const checkers = ctx.crew.filter((a) => a.kind === "specialist" && a.enabled);
        return {
          thought: `Running ${checkers.length} check${checkers.length === 1 ? "" : "s"} at the same time.`,
          calls: checkers.map((a) => ({ name: `ask_${a.id}`, args: { task: BUILTIN_TASK[a.id]?.(ctx) ?? `${a.role.replace(/[.?!]+$/, "")}. The signal is on ${ctx.signal.asset_id}; the likely root is ${h.root}.` } })),
        };
      }
      if (turn === 2) {
        const repair = f.vendors?.[0]?.est_cost_usd ?? 350 + 165 * h.repair_hours;
        return { thought: "Pricing the cost of waiting against fixing now.", calls: [{ name: "price_risk", args: { asset_id: h.price_asset, outage_hours: h.outage_hours, hours_until_failure: f.trend?.hours_to_limit ?? null, repair_cost_usd: repair } }] };
      }
      if (turn === 3) {
        if (!available.includes("ask_dispatch")) return { calls: [] };
        return { thought: "Worth fixing now. Handing the fix to Dispatch.", calls: [{ name: "ask_dispatch", args: { task: `Fix ${h.root} before it fails. Protects ${usd(f.risk?.wait_usd ?? 0)}. Draft the work order, any schedule change, and notices for affected tenants.` } }] };
      }
      if (turn === 4) {
        return { calls: [{ name: "save_memory", args: { asset_id: h.root, note: `${new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}: ${h.problem}. Caught ${hrs(f.risk?.hours_until_failure)} before the limit; fix drafted for approval.` } }] };
      }
      const r = f.risk;
      return {
        final: [
          `Root cause: ${f.linked?.problem ?? h.problem}.`,
          f.trend ? `${f.trend.asset_id} crosses its limit in ${hrs(f.trend.hours_to_limit)}.` : "",
          r ? `Waiting risks ${usd(r.wait_usd)}; fixing now costs ${usd(r.fix_usd)} (saves ${usd(r.saved_usd)}).` : "",
          `${f.drafts} action${f.drafts === 1 ? "" : "s"} are waiting for your approval.`,
        ].filter(Boolean).join(" "),
      };
    }
    default:
      return genericMove(cfg, turn, ctx, available);
  }
}
