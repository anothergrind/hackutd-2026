# Plan

## The idea: "Invisible Network"

CBRE's brief says property networks are *too fragmented to detect hidden dependencies* and asks for
something that predicts cascades and **acts** ("move beyond passive dashboards"). NVIDIA wants Nemotron
doing **multi-step work with tools on a real problem**, not chatting.

One product hits both:

1. **Connect the fragments.** Tickets, energy readings, sensor telemetry, BMS/cyber alerts, leases (SLA $)
   and weather all attach to nodes of one **dependency graph** (utility → switchgear → chiller → CRAH → data hall → tenant).
2. **Predict the cascade.** A signal on one node → BFS downstream → every at-risk system and tenant, with $ exposure.
3. **Act before it spreads.** Nemotron plans, calls tools, and *executes* work orders + tenant notices. Each step
   is logged and shown live, so judges see the reasoning rather than a canned answer.

The three Copilot ideas fold in as inputs: tickets (escalation), energy anomalies (waste), catastrophe (blast radius).

## 3-minute demo script

1. "This data center looks fine on every separate dashboard." Show the overview.
2. Click **BMS zero-day**. The agent inspects BMS-1, finds it controls the chiller and both CRAHs, runs blast
   radius → Lonestar Cloud + MedRecords at risk, **$37k/hr**, checks the live forecast, opens a P5 work order, notifies both tenants.
3. Click **AHU-04 condensation**. The agent connects 3 small tickets on one air handler into one water-damage risk.
4. Close: "Small signals, one graph, actions taken before anything failed."

## Who does what (4 people)

| Person | Owns | Done when |
|---|---|---|
| A | Agent: `run.ts`, `tools.ts`, prompt tuning, `npm run smoke` | All 4 scenarios end with work orders + notices |
| B | Graph view: `@xyflow/react`, nodes colored by blast radius from the latest `blast_radius` step | Clicking a scenario lights up the graph |
| C | Data: richer seed in `004` (or CBRE's Discord data), more scenarios in `SimulatePanel.tsx` | Demo story feels real |
| D | Pitch/Devpost/video, work-orders + notices tab, polish | Submitted |

## Timeline (CT)

- **Now**: everyone runs setup in README; A runs `npm run smoke` first.
- **Sat 11:00 pm**: initial Devpost submission. Submit a placeholder; don't miss it.
- **Sun 8:00 am**: feature freeze, only demo fixes.
- **Sun 12:00 pm**: final submission. Judging 1–4 pm.

## Stretch (only once the above works)

- Graph view (highest value for judges)
- Supabase Realtime instead of polling
- Second external API: NWS alerts (`api.weather.gov/alerts/active?point=lat,lon`)
- "Approve before executing" toggle for actions
