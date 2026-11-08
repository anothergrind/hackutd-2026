# Canary — HackUTD 2026 (CBRE × NVIDIA × NMC²)

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
2. **Nemotron:** set `NVIDIA_API_KEY` to an `nvapi-...` key from build.nvidia.com, then `npm run smoke` to check tool calling. The rail badge switches from `DEMO` to `NIM`.
   The default model is `nvidia/nemotron-3.5-super-vl-120b-a12b`; override it with `NEMOTRON_MODEL` or per agent on `/crew`.
   Leave `NVIDIA_BASE_URL` unset (an empty value breaks every call); set it only to point at your own NIM, e.g. on Brev.
3. **Supabase:** set the URL plus the anon and service-role keys, and run `supabase/migrations/001`–`007` in order in the SQL editor.
4. Restart `npm run dev`.

If Nemotron errors mid-run, that agent falls back to the scripted policy (same tools, same data) unless it has
already drafted something. Set `OPSCREW_MODE=scripted` to force the fallback on stage.

## Pages

| Page | What |
|---|---|
| `/` | Live incident, one step at a time: Signal → Investigate (agent graph; click an agent for details) → Price → Approve → Fixed. `?step=2` opens a step directly |
| `/plan` | Tonight's plan: Storm night raises problems in 3 buildings; given technicians and a budget, the AI picks what to fix tonight vs make safe until morning, explains why, and applies the plan on approval |
| `/approvals` | Queue: edit, approve (executes) or reject every drafted action |
| `/portfolio` | Sweep scores, each building's dependency chain, tenants and $/hr, work orders sent |
| `/runs`, `/runs/[id]` | History and step-by-step replay |
| `/memory` | What past runs learned plus manager notes; the lead reads this first |
| `/crew` | Crew builder: edit any agent's instructions, tools, model and turn limit, switch specialists on/off, add specialists from templates (Energy Watch, Repeat-Failure Check, Second Opinion) |

## Code map

```
src/lib/roster.ts            built-in agents, tool library, models, specialist templates
src/lib/crew.ts, crewStore.ts  editable crew: defaults + saved agent_configs; snapshot stored per run
src/lib/scenarios.ts         demo incidents + hints for the scripted mode
src/lib/agent/run.ts         agent loop: Nemotron tool calling, parallel calls, ask_* delegation, fallback
src/lib/agent/tools.ts       every tool, with argument validation
src/lib/agent/math.ts        trend fit, hours-to-limit, risk pricing, sweep score (deterministic, tested)
src/lib/agent/scripted.ts    no-key policy that calls the same tools, one function per agent
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

Each run also says **who pays** for the repair (Lease agent's `lease_responsibility` tool quotes the lease clause) and, after a repair is approved, **checks the fix worked** by re-reading the sensors (step 8; simulated readings in demo mode, `OPSCREW_VERIFY_DELAY_S`).

## Recent changes

- **NWS weather alerts:** the Lease / SLA agent's new `get_weather_alerts` tool pulls active heat, storm and flood warnings for each building from api.weather.gov (free, no key, US only) and reports any that make an outage worse.
- **New default model:** `llama-3.3-nemotron-super-49b-v1.5` was retired in Aug 2026 and now returns `410`. The default is `nemotron-3.5-super-vl-120b-a12b`, which ran the full crew live; the `/crew` model list only offers models that pass `npm run smoke`.
- **Readable scripted mode:** `scripted.ts` is split into one function per agent with named pieces instead of long one-liners. Scripted output is unchanged across all 5 scenarios.

`npm run dry-run:plan` runs Storm night → plan → apply → fix checks in the terminal. `npm test` runs the graph and math unit tests. `npm run typecheck` checks types.

## Security

- **Site password:** set `SITE_PASSWORD` (and `SITE_USER`, default `opscrew`) before deploying. `src/proxy.ts` then puts
  every page and API route behind HTTP Basic Auth, so strangers can't spend NVIDIA credits, edit agents or approve
  actions. Unset, the app is open (local dev). `/api/sweep/cron` is exempt and checks `CRON_SECRET` instead. Only use it over HTTPS.
- **Human approval for every side effect:** agents only draft. Work orders, schedule changes and tenant notices run only
  when a person approves them, and edits at approval time can't change the recipient, vendor or amount.
- **Untrusted input is capped and validated:** tool arguments from the model, manager notes and crew instructions are
  type-checked and length-limited before use.
- **Headers:** no framing by other sites, no MIME sniffing, strict referrer policy (`next.config.ts`).
- The Supabase service-role key is server-only; the browser never sees it.
