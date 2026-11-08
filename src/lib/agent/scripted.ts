// Scripted policy: plays each agent's part without an API key, calling the SAME tools against the SAME data.
// It exists so the demo never depends on rate limits or Wi-Fi. Live Nemotron uses prompts.ts instead.
//
// Each agent works in turns. On every turn it either calls tools ({ thought, calls }) or finishes ({ final }).
// Tool results are saved in ctx.facts, so a later turn can read what an earlier turn found.

import { DEFAULT_RULES, type AgentConfig } from "@/lib/crew";
import { stagesOf } from "@/lib/flow";
import type { Facts, RunCtx } from "./tools";

export type Call = { name: string; args: Record<string, unknown> };
export type Move = { thought?: string; calls: Call[] } | { final: string };

type AgentMove = (turn: number, ctx: RunCtx, available: string[], cfg: AgentConfig) => Move;
type Tenant = NonNullable<Facts["tenants"]>[number];
type Vendor = NonNullable<Facts["vendors"]>[number];

// ---------------- Formatting helpers ----------------

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** plural(1, "tenant") -> "1 tenant", plural(3, "tenant") -> "3 tenants" */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "~18 h" under two days, "~3 days" after that. */
function hrs(h: number | null | undefined) {
  if (h == null) return "unknown time";
  if (h < 48) return `~${Math.round(h)} h`;
  return `~${Math.round(h / 24)} days`;
}

// ---------------- Lead agent ----------------

/** The task the lead hands each built-in specialist. */
const BUILTIN_TASK: Record<string, (ctx: RunCtx) => string> = {
  triage: (c) => `Find open tickets related to ${c.signal.asset_id} and link any that share a root cause.`,
  sensor: (c) => {
    const trend = c.hints.trend;
    const trendPart = trend ? ` and estimate hours until ${trend.asset_id} ${trend.metric} crosses ${trend.limit}` : "";
    return `Map dependencies of ${c.hints.root}${trendPart}.`;
  },
  lease: (c) => `Which tenants are hurt if ${c.hints.price_asset} is out for ${c.hints.outage_hours} h, and what is the forecast?`,
};

/** Built-in specialists get a fixed task; custom ones get a task built from their role. */
function taskFor(agent: AgentConfig, ctx: RunCtx) {
  const builtin = BUILTIN_TASK[agent.id];
  if (builtin) return builtin(ctx);
  const role = agent.role.replace(/[.?!]+$/, "");
  return `${role}. The signal is on ${ctx.signal.asset_id}; the likely root is ${ctx.hints.root}.`;
}

/**
 * Lead: read memory, run the specialists stage by stage (as drawn on the Agents canvas), price the risk,
 * hand off to Dispatch if the decision rule says the repair is worth it, then save what it learned.
 */
function leadMove(turn: number, ctx: RunCtx, available: string[]): Move {
  const { hints: h, facts: f } = ctx;
  const stages = stagesOf(ctx.crew);
  const S = stages.length; // turns 1..S run one stage each

  if (turn === 0) {
    return {
      thought: `New signal on ${ctx.signal.asset_id}. Checking what we already know about this building.`,
      calls: [{ name: "read_building_memory", args: {} }],
    };
  }

  if (turn <= S) {
    const group = stages[turn - 1];
    const after = turn > 1 ? `, after stage ${turn - 1} reported back` : "";
    const thought = group.length > 1
      ? `Stage ${turn}${after}: running ${group.map((a) => a.name).join(", ")} at the same time.`
      : `Stage ${turn}${after}: asking ${group[0].name}.`;
    return { thought, calls: group.map((a) => ({ name: `ask_${a.id}`, args: { task: taskFor(a, ctx) } })) };
  }

  if (turn === S + 1) {
    // No vendor quote yet: rough estimate of $350 plus $165 per repair hour.
    const repairCost = f.vendors?.[0]?.est_cost_usd ?? 350 + 165 * h.repair_hours;
    return {
      thought: "Pricing the cost of waiting against fixing now.",
      calls: [{
        name: "price_risk",
        args: {
          asset_id: h.price_asset,
          outage_hours: h.outage_hours,
          hours_until_failure: f.trend?.hours_to_limit ?? null,
          repair_cost_usd: repairCost,
        },
      }],
    };
  }

  if (turn === S + 2) {
    const dispatch = available.find((n) => n.startsWith("ask_") && ctx.crew.find((a) => `ask_${a.id}` === n)?.kind === "dispatch");
    if (!dispatch) return { calls: [] }; // Dispatch is switched off

    // The Lead's decision rule from the Agents page: repair only when delay costs enough, or failure is close.
    const rules = ctx.crew.find((a) => a.kind === "lead")?.rules ?? DEFAULT_RULES;
    const r = f.risk;
    const urgent = r?.hours_until_failure != null && r.hours_until_failure <= rules.urgent_hours;
    if (r && !urgent && r.wait_usd < rules.min_ratio * r.fix_usd) {
      return {
        thought: `Delay costs ${usd(r.wait_usd)}, under ${rules.min_ratio}× the ${usd(r.fix_usd)} repair, and failure is not within ${rules.urgent_hours} h. Not preparing a repair; reporting a brief.`,
        calls: [],
      };
    }
    const task = `Fix ${h.root} before it fails. Protects ${usd(f.risk?.wait_usd ?? 0)}. Draft the work order, any schedule change, and notices for affected tenants.`;
    return { thought: "Worth fixing now. Handing the fix to Dispatch.", calls: [{ name: dispatch, args: { task } }] };
  }

  if (turn === S + 3) {
    const month = new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const note = `${month}: ${h.problem}. Caught ${hrs(f.risk?.hours_until_failure)} before the limit; fix drafted for approval.`;
    return { calls: [{ name: "save_memory", args: { asset_id: h.root, note } }] };
  }

  // Final summary for the manager.
  const r = f.risk;
  const lines = [`Root cause: ${f.linked?.problem ?? h.problem}.`];
  if (f.trend) lines.push(`${f.trend.asset_id} crosses its limit in ${hrs(f.trend.hours_to_limit)}.`);
  if (r) lines.push(`Waiting risks ${usd(r.wait_usd)}; fixing now costs ${usd(r.fix_usd)} (saves ${usd(r.saved_usd)}).`);
  lines.push(`${plural(f.drafts, "action")} are waiting for your approval.`);
  return { final: lines.join(" ") };
}

// ---------------- Specialists ----------------

/** Ticket Triage: pull recent tickets, link the ones on the root or impacted asset, report the shared problem. */
function triageMove(turn: number, ctx: RunCtx): Move {
  const { hints: h, facts: f } = ctx;

  if (turn === 0) {
    return {
      thought: "Pulling every open ticket in the building from the last 30 days.",
      calls: [{ name: "search_tickets", args: { days: 30 } }],
    };
  }

  const related = (f.tickets ?? []).filter((t) => [h.root, h.impacted].includes(t.equipment));
  if (!related.length) return { final: `No related open tickets. The signal on ${ctx.signal.asset_id} looks new.` };

  if (turn === 1) {
    return {
      thought: `${related.length} of them sit on ${h.root} or ${h.impacted}. Linking them.`,
      calls: [{ name: "link_tickets", args: { ticket_ids: related.map((t) => t.id), problem: h.problem, root_asset_id: h.root } }],
    };
  }

  const period = f.tickets?.length ? "the last 30 days" : "recent days";
  return { final: `${related.length} small tickets over ${period} are one problem: ${h.problem}. Root asset: ${h.root}.` };
}

/** Sensor Watch: map dependencies, fit a trend (or read raw readings), report hours until the limit. */
function sensorMove(turn: number, ctx: RunCtx): Move {
  const { hints: h, facts: f } = ctx;

  if (turn === 0) {
    return {
      thought: `Mapping what ${h.root} depends on and what it feeds.`,
      calls: [{ name: "get_dependencies", args: { asset_id: h.root } }],
    };
  }

  if (turn === 1 && h.trend) {
    return {
      thought: `Fitting a trend on ${h.trend.asset_id} ${h.trend.metric}.`,
      calls: [{ name: "detect_trend", args: { ...h.trend } }],
    };
  }

  if (turn === 1) {
    const asset = ctx.signal.asset_id;
    return {
      thought: `Checking the last 3 days of readings on ${asset}.`,
      calls: [{ name: "get_readings", args: { asset_id: asset, days: 3 } }],
    };
  }

  const feeds = `${h.root} feeds ${plural(f.deps?.downstream.length ?? 0, "downstream asset")}.`;
  const t = f.trend;
  if (!t) return { final: `No trend history for this asset; treating the signal as acute. ${feeds}` };

  return {
    final: `${t.asset_id} ${t.metric} is ${t.slope_per_day < 0 ? "falling" : "rising"} ${Math.abs(t.slope_per_day)}/day (r² ${t.r2}). ` +
      `At ${t.latest} now, it crosses the ${t.limit} limit in ${hrs(t.hours_to_limit)}. ${feeds}`,
  };
}

/** Lease / SLA: who gets hurt and for how much, who pays for the repair, and whether the weather makes it worse. */
function leaseMove(turn: number, ctx: RunCtx): Move {
  const { hints: h, facts: f } = ctx;

  if (turn === 0) {
    return {
      thought: `Finding tenants downstream of ${h.price_asset}.`,
      calls: [{ name: "tenants_at_risk", args: { asset_id: h.price_asset, outage_hours: h.outage_hours } }],
    };
  }

  if (turn === 1) {
    // Three independent lookups, so they run in parallel.
    return {
      thought: `Reading the leases to see who pays for ${h.root}, and checking the forecast.`,
      calls: [
        { name: "lease_responsibility", args: { asset_id: h.root } },
        { name: "get_weather", args: { asset_id: h.root } },
        { name: "get_weather_alerts", args: { asset_id: h.root } },
      ],
    };
  }

  const tenants = f.tenants ?? [];
  const names = tenants.map((t) => t.name).join(", ") || "none";
  const lines = [`${plural(tenants.length, "tenant")} exposed (${names}), ${usd(f.penaltyPerHour ?? 0)}/hr in SLA penalties combined.`];

  const w = f.weather;
  if (w?.max_f != null) lines.push(`Forecast high ${Math.round(w.max_f)}°F, rain ${w.rain_pct ?? 0}%, gusts ${Math.round(w.gust_mph ?? 0)} mph.`);
  if (f.alerts?.length) lines.push(`Active NWS alerts: ${f.alerts.join(", ")}.`);
  if (f.payer) lines.push(`Repair is paid by ${f.payer.name} (${f.payer.ref}).`);

  return { final: lines.join(" ") };
}

/** A calm "we're fixing it before it affects you" email to one tenant. */
function tenantNotice(tenant: Tenant, vendor: Vendor, asset: string) {
  const windowStart = new Date(vendor.next_available).toLocaleString("en-US", {
    weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
  });
  return {
    tenant_id: tenant.id,
    protects_usd: tenant.exposure_usd,
    subject: `Planned maintenance on ${asset}: no action needed`,
    message: [
      `Hi ${tenant.name} team,`,
      "",
      `Our monitoring found an early issue with ${asset} that serves your space. We have booked ${vendor.name} to fix it before it affects you (window starts ${windowStart} CT). We expect no impact to your service. We will confirm when the work is verified.`,
      "",
      "Avon Facilities",
    ].join("\n"),
  };
}

/** Dispatch: find a vendor and parts, then draft the work order, an optional schedule change and tenant notices. */
function dispatchMove(turn: number, ctx: RunCtx): Move {
  const { hints: h, facts: f } = ctx;

  if (turn === 0) {
    return {
      thought: `Looking up certified vendors and spare parts for ${h.root}.`,
      calls: [
        { name: "find_vendor", args: { asset_id: h.root, est_hours: h.repair_hours } },
        { name: "check_parts", args: { asset_id: h.root } },
      ],
    };
  }

  if (turn === 1) {
    const vendor = f.vendors?.[0]; // find_vendor sorts soonest first
    if (!vendor) return { final: `No certified vendor found for ${h.root}. Escalate to the facility manager.` };

    const protects = f.risk?.wait_usd ?? 0;
    const failsWithinADay = (f.risk?.hours_until_failure ?? 99) <= 24;
    const calls: Call[] = [{
      name: "draft_work_order",
      args: {
        asset_id: h.root,
        vendor_id: vendor.id,
        priority: failsWithinADay ? 5 : 4,
        title: `${h.root}: ${h.steps[0]}`,
        steps: h.steps,
        est_hours: h.repair_hours,
        protects_usd: protects,
      },
    }];

    if (h.schedule) {
      calls.push({
        name: "draft_schedule_change",
        args: { asset_id: h.schedule_asset ?? h.root, change: h.schedule, hours: 24, protects_usd: Math.round(protects * 0.5) },
      });
    }

    for (const tenant of f.tenants ?? []) {
      calls.push({ name: "draft_tenant_notice", args: tenantNotice(tenant, vendor, h.root) });
    }

    const scheduleNote = h.schedule ? ", a schedule change" : "";
    return {
      thought: `${vendor.name} is soonest (${usd(vendor.est_cost_usd)}). Drafting the work order${scheduleNote} and ${f.tenants?.length ?? 0} tenant notice(s).`,
      calls,
    };
  }

  const partsOnSite = (f.parts ?? []).some((p) => p.on_hand > 0) ? " Spare parts are on site." : "";
  return { final: `Drafted ${plural(f.drafts, "action")} for approval: vendor ${f.vendors?.[0]?.name ?? "n/a"}.${partsOnSite}` };
}

// ---------------- Custom specialists ----------------

/** Reasonable arguments for any read-only tool, so a custom specialist can run without an API key. */
function defaultArgs(tool: string, ctx: RunCtx): Record<string, unknown> | null {
  const h = ctx.hints;
  switch (tool) {
    case "search_tickets":
      return { days: 30 };
    case "past_incidents":
      return { asset_id: h.price_asset };
    case "get_dependencies":
    case "get_weather":
    case "get_weather_alerts":
    case "find_vendor":
    case "check_parts":
      return { asset_id: h.root };
    case "get_readings":
      return { asset_id: ctx.signal.asset_id, days: 14 };
    case "detect_trend":
      return h.trend ? { ...h.trend } : null;
    case "get_energy":
      return {};
    case "tenants_at_risk":
      return { asset_id: h.price_asset, outage_hours: h.outage_hours };
    case "lease_responsibility":
      return { asset_id: h.price_asset };
    default:
      return null; // writes and linking need real reasoning
  }
}

/** One short clause per tool result, used to write a custom specialist's report. */
function brief(name: string, result: unknown): string {
  const x = (result ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (x.error) return `${name} failed (${String(x.error).slice(0, 60)})`;

  switch (name) {
    case "get_energy": {
      const top = x.readings?.[0];
      if (!top) return "no energy anomalies";
      return `${top.equipment} is ${top.over_baseline_pct}% over baseline (anomaly ${top.anomaly_score})`;
    }
    case "past_incidents": {
      if (!x.repeat) return `no earlier work orders on ${(x.checked ?? []).join(", ")}`;
      const latest = x.work_orders[0];
      return `repeat failure: ${x.work_orders.length} earlier work order(s), latest "${latest.title}" ${latest.days_ago} days ago`;
    }
    case "detect_trend": {
      const limit = x.hours_to_limit == null ? "no crossing" : `limit in ~${Math.round(x.hours_to_limit)} h`;
      return `trend ${x.slope_per_day}/day, ${limit} (r² ${x.r2})`;
    }
    case "tenants_at_risk":
      return `${x.tenants?.length ?? 0} tenants, ${usd(x.penalty_per_hour_usd ?? 0)}/hr`;
    case "get_dependencies":
      return `${x.feeds?.length ?? 0} assets downstream`;
    case "get_readings":
      return `${x.count ?? 0} recent readings`;
    case "search_tickets":
      return `${x.count ?? 0} open tickets`;
    case "get_weather":
      if (x.summary?.max_f == null) return "forecast checked";
      return `forecast high ${Math.round(x.summary.max_f)}°F`;
    case "get_weather_alerts": {
      if (!x.count) return "no active weather alerts";
      const events = x.alerts.map((a: { event: string }) => a.event);
      return `NWS: ${events.join(", ")}`;
    }
    case "find_vendor":
      return x.vendors?.[0] ? `${x.vendors[0].name} available` : "no vendor";
    case "check_parts":
      return `${(x.parts ?? []).length} parts listed`;
    default:
      return "";
  }
}

/** Custom specialists: call every read-only tool once, then report one clause per result. */
function genericMove(cfg: AgentConfig, turn: number, ctx: RunCtx, available: string[]): Move {
  if (turn === 0) {
    const calls = available
      .map((name) => ({ name, args: defaultArgs(name, ctx) }))
      .filter((c): c is Call => c.args !== null);
    if (calls.length) return { thought: `Checking ${calls.map((c) => c.name).join(", ")}.`, calls };
  }

  const results = ctx.facts.byAgent?.[cfg.id] ?? [];
  const clauses = results.map((r) => brief(r.name, r.result)).filter(Boolean);
  if (!clauses.length) return { final: `${cfg.name}: nothing to report for this signal.` };
  return { final: `${cfg.name}: ${clauses.join("; ")}.` };
}

// ---------------- Entry point ----------------

const BUILTIN_MOVES: Record<string, AgentMove> = {
  lead: leadMove,
  triage: triageMove,
  sensor: sensorMove,
  lease: leaseMove,
  dispatch: dispatchMove,
};

export function scriptedMove(cfg: AgentConfig, turn: number, ctx: RunCtx, available: string[]): Move {
  const builtinMove = cfg.builtin ? BUILTIN_MOVES[cfg.id] : undefined;
  if (builtinMove) return builtinMove(turn, ctx, available, cfg);
  return genericMove(cfg, turn, ctx, available);
}
