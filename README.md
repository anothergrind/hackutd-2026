# OpsCrew — HackUTD 2026 (CBRE × NVIDIA × NMC²)

Five Nemotron agents that catch a building failure early, price it, and fix it after a manager approves.
A **Lead agent** reads building memory, sends **Ticket Triage**, **Sensor Watch** and **Lease / SLA** off in
parallel, prices the cost of waiting vs fixing now, and has **Dispatch** draft the work order, schedule change and
tenant notices. Every side effect waits in the **approval queue**. A **nightly sweep** scores every building and
starts the crew on its own, with no prompt typed. The UI reuses the HackTX NMC³ console design.

## Run it (zero setup)

```bash
npm install
npm run dev          # http://localhost:3000, in-memory data, scripted agents
```

Click **Inject** on *Cooling cascade*, watch the graph, then approve the drafts. `npm run dry-run` runs the same
flow in the terminal and prints every step.

## Go live

1. Copy `.env.example` to `.env.local`.
2. **Nemotron:** set `NVIDIA_API_KEY`, then `npm run smoke` to check tool calling. The rail badge switches from `DEMO` to `NIM`.
3. **Supabase:** set the URL plus the anon and service-role keys, and run `supabase/migrations/001`–`005` in order in the SQL editor.
4. Restart `npm run dev`.

If Nemotron errors mid-run, that agent falls back to the scripted policy (same tools, same data) unless it has
already drafted something. Set `OPSCREW_MODE=scripted` to force the fallback on stage.

## Pages

| Page | What |
|---|---|
| `/` | Incident console: scenarios, sweep, live crew graph, lane timeline, risk, drafts, step log |
| `/approvals` | Queue: edit, approve (executes) or reject every drafted action |
| `/portfolio` | Sweep scores, each building's dependency chain, tenants and $/hr, work orders sent |
| `/runs`, `/runs/[id]` | History and step-by-step replay |
| `/memory` | What past runs learned plus manager notes; the lead reads this first |
| `/crew` | Agents, what each owns, and their tools |

## Code map

```
src/lib/roster.ts            agents and their tools (UI and server share it)
src/lib/scenarios.ts         demo incidents + hints for the scripted mode
src/lib/agent/run.ts         agent loop: Nemotron tool calling, parallel calls, ask_* delegation, fallback
src/lib/agent/tools.ts       every tool, with argument validation
src/lib/agent/math.ts        trend fit, hours-to-limit, risk pricing, sweep score (deterministic, tested)
src/lib/agent/scripted.ts    no-key policy that calls the same tools
src/lib/agent/prompts.ts     system prompts
src/lib/agent/orchestrate.ts starts a run and finishes it
src/lib/approvals.ts         approve = execute side effect; claim-first so a double click can't send twice
src/lib/sweep.ts             nightly portfolio scoring, auto-starts the crew
src/lib/supabase/memory.ts   in-memory Supabase stand-in used when no keys are set
src/components/run/*         crew graph, timeline, risk card, step log
supabase/migrations/005_opscrew.sql   approvals, vendors, parts, memory, sweeps + demo seed
```

API: `POST /api/incidents {scenario_id}`, `GET /api/runs[/id]`, `GET /api/approvals`, `POST /api/approvals/:id {decision, edits?}`,
`POST /api/sweep`, `GET /api/sweep/cron` (Vercel Cron, `CRON_SECRET`), `GET /api/portfolio`, `GET|POST /api/memory`, `POST /api/reset`, `GET /api/status`.

`npm test` runs the graph and math unit tests. `npm run typecheck` checks types.

**If you deploy publicly:** `/api/incidents` and `/api/sweep` spend NVIDIA credits and anyone can call them.
That's fine for judging; take it down afterwards.
