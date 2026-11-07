// Scripted policy: plays each agent's part without an API key, calling the SAME tools against the SAME data.
// It exists so the demo never depends on rate limits or Wi-Fi. Live Nemotron uses prompts.ts instead.

import type { AgentId } from "@/lib/roster";
import type { RunCtx } from "./tools";

export type Call = { name: string; args: Record<string, unknown> };
export type Move = { thought?: string; calls: Call[] } | { final: string };

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const hrs = (h: number | null | undefined) => (h == null ? "unknown time" : h < 48 ? `~${Math.round(h)} h` : `~${Math.round(h / 24)} days`);

export function scriptedMove(agent: AgentId, turn: number, ctx: RunCtx): Move {
  const { hints: h, facts: f } = ctx;
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
      if (turn === 1) return { thought: "Checking the forecast; heat raises cooling load and storms threaten power.", calls: [{ name: "get_weather", args: { asset_id: h.root } }] };
      const ts = f.tenants ?? [];
      const w = f.weather;
      return { final: `${ts.length} tenant${ts.length === 1 ? "" : "s"} exposed (${ts.map((t) => t.name).join(", ") || "none"}), ${usd(f.penaltyPerHour ?? 0)}/hr in SLA penalties combined.${w?.max_f != null ? ` Forecast high ${Math.round(w.max_f)}°F, rain ${w.rain_pct ?? 0}%, gusts ${Math.round(w.gust_mph ?? 0)} mph.` : ""}` };
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
        return {
          thought: "Running three checks at the same time.",
          calls: [
            { name: "ask_triage", args: { task: `Find open tickets related to ${ctx.signal.asset_id} and link any that share a root cause.` } },
            { name: "ask_sensor", args: { task: `Map dependencies of ${h.root}${h.trend ? ` and estimate hours until ${h.trend.asset_id} ${h.trend.metric} crosses ${h.trend.limit}` : ""}.` } },
            { name: "ask_lease", args: { task: `Which tenants are hurt if ${h.price_asset} is out for ${h.outage_hours} h, and what is the forecast?` } },
          ],
        };
      }
      if (turn === 2) {
        const repair = f.vendors?.[0]?.est_cost_usd ?? 350 + 165 * h.repair_hours;
        return { thought: "Pricing the cost of waiting against fixing now.", calls: [{ name: "price_risk", args: { asset_id: h.price_asset, outage_hours: h.outage_hours, hours_until_failure: f.trend?.hours_to_limit ?? null, repair_cost_usd: repair } }] };
      }
      if (turn === 3) {
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
  }
}
