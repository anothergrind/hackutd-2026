# Canary — HackUTD 2026 (CBRE × NVIDIA × NMC²)

**Live on Vercel: [hackutd-2026-liard.vercel.app](https://hackutd-2026-liard.vercel.app)**. It's password-protected, so ask the team for the login.

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

On **Live Incident**, click **Start Analyzing**, or **Fresh Demo** for one incident of every problem type. Then approve
the drafts on **Approvals**. `npm run dry-run` runs the same flow in the terminal and prints every step.

## Go live

1. Copy `.env.example` to `.env.local`.
2. **Nemotron:** set `NVIDIA_API_KEY` to an `nvapi-...` key from build.nvidia.com, then run `npm run smoke` to check tool calling.
   The status in the nav bar then reads **Nemotron live**.
   The default model is `nvidia/nemotron-3.5-super-vl-120b-a12b`; override it with `NEMOTRON_MODEL` or per agent on `/crew`.
   Leave `NVIDIA_BASE_URL` unset (an empty value breaks every call); set it only to point at your own NIM (see below).
3. **Supabase:** set the URL plus the anon and service-role keys, and run `supabase/migrations/001`–`007` in order in the SQL editor.
4. Restart `npm run dev`.

If Nemotron errors mid-run, that agent falls back to the scripted policy (same tools, same data) unless it has
already drafted something. Set `OPSCREW_MODE=scripted` to force the fallback on stage.

### Self-hosted Nemotron on the Brev GPU (optional)

The team's Brev instance `opscrew-nim` (L40S) serves `nvidia/nvidia-nemotron-nano-9b-v2` on port 8000.

1. Install the Brev CLI, `brev login`, and get SSH access to the instance. `brev ls` should list it as yours, and
   `brev refresh` writes its SSH entry. On Windows, do all of this inside WSL (Ubuntu).
2. Add to `.env.local`:
   ```
   NVIDIA_BASE_URL=http://localhost:8000/v1
   NEMOTRON_MODEL=nvidia/nvidia-nemotron-nano-9b-v2
   ```
3. Keep `bash scripts/tunnel.sh` running in its own terminal (`npm run tunnel` also works on macOS/Linux), then run `npm run dev`.

The status reads **Nemotron live** / "GPU server reachable" when it works. If the tunnel drops, calls switch to NVIDIA's
hosted model for a minute and then retry the GPU. An agent given a different model on `/crew` always uses the hosted API.

## Deployment

Production runs on Vercel at https://hackutd-2026-liard.vercel.app (project `hackutd-2026`).

- **Deploy:** `npx vercel login` once, then `npx vercel deploy --prod`. Pushes to GitHub don't deploy on their own yet.
- **Environment:** the Supabase keys, `NVIDIA_API_KEY`, `SITE_USER`/`SITE_PASSWORD`, `CRON_SECRET` and `ALLOW_DEMO_RESET`, set with `npx vercel env add <NAME> production`.
  `NVIDIA_BASE_URL` is left unset, so production uses NVIDIA's hosted Nemotron. The Brev GPU is only reachable through a laptop's tunnel.
- **Cron:** Vercel Cron calls `/api/sweep/cron` daily at 07:00 UTC (`vercel.json`) with `CRON_SECRET`.
- **Shared data:** production and local dev share one Supabase project, so runs, approvals and **Reset demo** affect both.

## Pages

| Page | What |
|---|---|
| `/overview` | Landing page (click the Canary logo): what Canary does, savings so far, how an incident is handled |
| `/` Live Incident | One incident at a time: the report, a sensor forecast with and without the repair, the recommendation, and **What the AI Did** / **Agent Map** / **Full Log** tabs. Start an analysis, load a fresh demo set, or create an incident from your own readings |
| `/approvals` | Every incident with its drafted actions: edit, approve (executes) or reject. Also **Tonight's Plan** (`#plan`): given technicians and a budget, the AI picks what to fix tonight vs make safe until morning, and **Start Storm Night**, which raises a problem in every building at once |
| `/portfolio` Buildings | Sweep scores, each building's dependency chain, tenants and $/hr, work orders sent, and building notes (the memory the lead reads first) |
| `/crew` Agents | Crew builder: edit any agent's instructions, tools, model and turn limit, switch specialists on/off, add specialists from templates (Energy Watch, Repeat-Failure Check, Second Opinion, Weather Watch, Tenant Impact, Vendor Scout, Dependency Mapper, Ticket Scanner, Trend Analyst) |
| `/runs/[id]` | Step-by-step replay of one run |

`/runs`, `/memory` and `/plan` redirect to Approvals, Buildings and Tonight's Plan.

The nav bar also has:
- **Ask Canary:** questions answered by Nemotron, grounded only in the live portfolio data.
- **Present:** a six-slide pitch covering the problem, the solution, the architecture, the live demo, the impact and the tracks. `?present=1`–`6` opens a slide directly.
- **Light / Dark:** switches the theme. `?theme=light` or `?theme=dark` sets it from a link.

## Code map

```
src/lib/roster.ts            built-in agents, tool library, models, specialist templates
src/lib/crew.ts, crewStore.ts  editable crew: defaults + saved agent_configs; snapshot stored per run
src/lib/scenarios.ts         demo incidents + hints for the scripted mode
src/lib/sites.ts             the demo buildings
src/lib/nemotron.ts          Nemotron client: self-hosted NIM first, NVIDIA hosted API as fallback
src/lib/agent/run.ts         agent loop: Nemotron tool calling, parallel calls, ask_* delegation, fallback
src/lib/agent/tools.ts       every tool, with argument validation
src/lib/agent/math.ts        trend fit, hours-to-limit, risk pricing, sweep score (deterministic, tested)
src/lib/agent/scripted.ts    no-key policy that calls the same tools, one function per agent
src/lib/agent/prompts.ts     system prompts
src/lib/agent/orchestrate.ts starts a run and finishes it
src/lib/approvals.ts         approve = execute side effect; claim-first so a double click can't send twice
src/lib/plan.ts              Tonight's Plan: candidates, choosing within technicians and budget, applying
src/lib/verify.ts            after-repair check that re-reads the sensors
src/lib/sweep.ts             nightly portfolio scoring, auto-starts the crew
src/lib/supabase/admin.ts    server-side Supabase client (service role)
src/lib/supabase/memory.ts   in-memory Supabase stand-in used when no keys are set
src/proxy.ts                 optional site password (HTTP Basic Auth)
src/components/run/*         crew graph, timeline, risk card, step log
src/components/ask/*         Ask Canary panel
src/components/present/*     presentation deck
supabase/migrations/005_opscrew.sql   approvals, vendors, parts, memory, sweeps + demo seed
scripts/                     dry runs, Nemotron smoke test, GPU tunnel, one-time building rename
```

**API routes**

| Area | Routes |
|---|---|
| Incidents | `POST /api/incidents {scenario_id}`, `POST /api/incidents/custom` (your own readings), `POST /api/incidents/demo {per_type?}`, `POST /api/demo/fresh`, `POST /api/storm` |
| Runs | `GET /api/runs`, `GET /api/runs/:id` |
| Approvals | `GET /api/approvals`, `POST /api/approvals/:id {decision, edits?}` |
| Plan and verify | `GET\|POST /api/plan`, `POST /api/plan/:id/apply`, `POST /api/verify {run_id, outcome?}` |
| Sweep | `GET /api/sweep`, `GET /api/sweep/cron` (Vercel Cron, `CRON_SECRET`) |
| Data | `GET /api/portfolio`, `GET\|POST /api/memory`, `GET /api/leases?ref=` |
| Crew | `GET\|POST /api/crew`, `PUT\|DELETE /api/crew/:id` |
| Other | `POST /api/ask`, `POST /api/reset`, `GET /api/status` |

Each run also says **who pays** for the repair (Lease agent's `lease_responsibility` tool quotes the lease clause) and, after a repair is approved, **checks the fix worked** by re-reading the sensors (simulated readings in demo mode, `OPSCREW_VERIFY_DELAY_S`).

## Scripts

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | graph and math unit tests |
| `npm run typecheck` | type check |
| `npm run smoke` | checks your Nemotron key and model can do tool calling |
| `npm run dry-run` | one incident end to end in the terminal |
| `npm run dry-run:plan` | Storm night → plan → apply → fix checks in the terminal |
| `npm run tunnel` | keeps the Brev GPU reachable at `localhost:8000` |

## Recent changes

- **Deployed on Vercel** behind the site password (see Deployment).
- **Self-hosted Nemotron on Brev:** the crew runs on the team's L40S through `scripts/tunnel.sh`, falling back to NVIDIA's hosted API.
- **Ask Canary** answers questions about the portfolio, and the **presentation** now has architecture and tracks slides.
- **Dark theme** uses near-black and greys instead of dark teal.
- **Cleanup:** removed the old starter-template routes (`/api/projects`, `/api/tracks`, `/api/dashboard`, `/api/health`, `/api/simulate`). `/api/status` is the health check.
- **NWS weather alerts:** the Lease / SLA agent's `get_weather_alerts` tool pulls active heat, storm and flood warnings for each building from api.weather.gov (free, no key, US only).
- **Retired models:** `llama-3.3-nemotron-super-49b-v1.5` and `nvidia-nemotron-nano-9b-v2` are retired on NVIDIA's hosted API (`410`).
  `nano-9b-v2` still works on the self-hosted GPU.

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
