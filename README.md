# Invisible Network — HackUTD 2026 (CBRE × NVIDIA)

Building systems (power → cooling → spaces → tenants) modeled as a dependency graph.
When a signal arrives (sensor anomaly, BMS cyber event, maintenance ticket), a **Nemotron agent**
inspects the asset across data sources, walks the graph to predict the cascade, prices the
SLA exposure, checks live weather, and **executes** work orders and tenant notices.
See [PLAN.md](PLAN.md) for the pitch, demo script and task split.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already done)
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API Keys → `service_role`/secret key.
     Server-only; never prefix with `NEXT_PUBLIC_`, never commit it.
   - `NVIDIA_API_KEY`: build.nvidia.com → open any Nemotron model → "Get API Key".
3. In the Supabase SQL Editor, run the migrations **in order**: `001` … `004_invisible_network.sql`.
4. `npm run smoke`: lists the Nemotron models your key can use and checks that tool calling works.
   If it prints FAIL, set `NEMOTRON_MODEL` to another model from the list and rerun.
5. Restart `npm run dev` (env changes need a restart), open http://localhost:3000 → **Simulate** tab → click a scenario.

`npm test` runs the graph unit test. `npm run typecheck` checks types.

**Reset demo state** (run in SQL Editor before judging):

```sql
update assets set status = 'ok';
delete from work_orders; delete from tenant_notices;
delete from telemetry_events where id in (select event_id from agent_runs); -- injected signals only
delete from agent_runs;
```

**If you deploy publicly:** `/api/simulate` writes with the service-role key and spends NVIDIA credits, so anyone can trigger it. That's fine for judging; take it down afterwards.

## Code map

```
supabase/migrations/
  003_risk_platform.sql        properties, maintenance_tickets, energy_readings, incidents
  004_invisible_network.sql    assets (graph nodes), dependencies (edges), tenants (SLA $/hr),
                               telemetry_events, agent_runs, agent_steps, work_orders, tenant_notices + seed
src/lib/
  nemotron.ts                  chat() — fetch to NVIDIA's OpenAI-compatible endpoint
  agent/graph.ts               blastRadius() — BFS over dependency edges (pure, tested)
  agent/tools.ts               tool schemas + implementations the model can call
  agent/run.ts                 the agent loop: chat → tool calls → log step → repeat (max 10 turns)
  supabase/admin.ts            service-role client for server writes
src/app/
  api/simulate/route.ts        POST signal → insert event → start agent in background → {run_id}
  api/agent/runs/[id]/route.ts GET run + steps (UI polls this)
  SimulatePanel.tsx            scenario buttons + live agent trace
  page.tsx                     dashboard tabs
scripts/nemotron-smoke.mjs     run first: verifies key, model, tool calling
```

**Adding a tool:** add a spec to `toolSpecs` and a function with the same name to `tools` in
`src/lib/agent/tools.ts`, and mention it in the system prompt in `run.ts`. Validate every argument;
they come from the model.

**Adding data:** asset ids are equipment tags, so any table with an `equipment`/`asset_id` text
column joins to the graph. If CBRE posts datasets, load them into new tables and read them in `inspect_asset`.

## API

- `GET /api/health`: env + DB check
- `GET /api/dashboard`: properties, tickets, energy, incidents
- `POST /api/simulate`: `{ asset_id, source: sensor|bms|cyber|ticket|weather, metric, value?, message }`
- `GET /api/agent/runs/:id`: run status + steps
