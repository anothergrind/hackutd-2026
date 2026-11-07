-- OpsCrew: multi-agent runs, the human approval gate, vendors and parts, building memory, nightly sweeps.
-- Run after 001-004. Safe to re-run.

-- ---------- Runs and steps carry the agent that did the work ----------

alter table public.agent_runs add column if not exists trigger text not null default 'incident';
alter table public.agent_runs add column if not exists title text;
alter table public.agent_runs add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.agent_runs add column if not exists risk jsonb;
alter table public.agent_runs add column if not exists mode text not null default 'live';
alter table public.agent_runs add column if not exists finished_at timestamptz;
alter table public.agent_runs drop constraint if exists agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check
  check (status in ('running', 'awaiting_approval', 'done', 'error'));
alter table public.agent_runs drop constraint if exists agent_runs_trigger_check;
alter table public.agent_runs add constraint agent_runs_trigger_check
  check (trigger in ('incident', 'sweep', 'manual'));

alter table public.agent_steps add column if not exists agent text not null default 'lead';
alter table public.agent_steps drop constraint if exists agent_steps_kind_check;
alter table public.agent_steps add constraint agent_steps_kind_check
  check (kind in ('start', 'thought', 'tool', 'final', 'error'));

-- ---------- Vendors and parts (Dispatch reads these) ----------

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade text not null check (trade in ('hvac', 'electrical', 'plumbing', 'controls', 'general')),
  certified_kinds text[] not null default '{}',
  response_hours integer not null,
  hourly_rate numeric not null,
  callout_fee numeric not null default 0,
  next_available timestamptz not null default now() + interval '12 hours',
  rating numeric not null default 4.5,
  phone text not null default ''
);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.assets(id) on delete cascade,
  part text not null,
  on_hand integer not null default 0,
  unit_cost numeric not null default 0,
  lead_days integer not null default 0
);

-- ---------- The human gate: every side effect starts as a pending approval ----------

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  kind text not null check (kind in ('work_order', 'tenant_notice', 'schedule_change')),
  title text not null,
  payload jsonb not null,
  protects_usd numeric not null default 0,
  cost_usd numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'sent', 'rejected')),
  decided_by text,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists approvals_status_idx on public.approvals (status, created_at desc);

alter table public.work_orders add column if not exists approval_id uuid references public.approvals(id) on delete set null;
alter table public.work_orders add column if not exists vendor_id uuid references public.vendors(id) on delete set null;
alter table public.work_orders add column if not exists scheduled_for timestamptz;
alter table public.tenant_notices add column if not exists approval_id uuid references public.approvals(id) on delete set null;
alter table public.tenant_notices add column if not exists subject text;

create table if not exists public.schedule_changes (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid references public.approvals(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  asset_id text not null references public.assets(id) on delete cascade,
  change text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Building memory: what past runs learned, read at the start of the next one ----------

create table if not exists public.building_memory (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  asset_id text references public.assets(id) on delete set null,
  note text not null,
  source text not null default 'agent' check (source in ('agent', 'manager', 'seed')),
  run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Nightly sweep: score every building, start a run on the worst one ----------

create table if not exists public.sweeps (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  scores jsonb not null default '[]',
  started_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['vendors','parts','approvals','schedule_changes','building_memory','sweeps'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

-- ---------- Seed: the demo story at Avon DC1 ----------
-- Three small tickets on CRAH-A1, a chiller drifting hot for two weeks, and building memory of a past repair.

insert into public.maintenance_tickets
  (property_id, building, floor, equipment, title, notes, status, urgency, risk_score, predicted_impact, reported_at)
select * from (values
  ('00000000-0000-0000-0000-000000000003'::uuid, 'Avon DC1', 'Data hall A', 'CRAH-A1', 'Water on raised floor near CRAH-A1', 'Small puddle under the unit. Wiped up, no source found.', 'open', 2, 35, 'Unclear', now() - interval '13 days'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'Avon DC1', 'Data hall A', 'CRAH-A1', 'Musty smell in hall A cold aisle', 'Night shift reports damp smell near rows 4-6.', 'open', 2, 30, 'Unclear', now() - interval '6 days'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'Avon DC1', 'Data hall A', 'HALL-A', 'Hot aisle warmer than usual', 'Customer Lonestar Cloud asked why inlet temps rose 2F this week.', 'open', 3, 45, 'Unclear', now() - interval '20 hours')
) as v(property_id, building, floor, equipment, title, notes, status, urgency, risk_score, predicted_impact, reported_at)
where not exists (select 1 from public.maintenance_tickets where equipment = 'CRAH-A1');

-- 14 days of chilled-water supply temperature drifting up ~0.4F/day from a 44F setpoint (limit 50F).
insert into public.telemetry_events (asset_id, source, metric, value, message, created_at)
select 'CHILLER-1', 'sensor', 'supply_temp_f',
       round((44 + 0.41 * d + (case when d % 3 = 0 then 0.15 else -0.05 end))::numeric, 2),
       'Daily average chilled water supply temperature',
       now() - make_interval(days => 14 - d)
from generate_series(0, 14) as d
where not exists (select 1 from public.telemetry_events where asset_id = 'CHILLER-1' and metric = 'supply_temp_f');

insert into public.telemetry_events (asset_id, source, metric, value, message, created_at)
select * from (values
  ('CRAH-A1', 'sensor', 'condensate_pump_amps', 0.2, 'Condensate pump drawing almost no current (normal 1.4 A)', now() - interval '2 days'),
  ('HALL-A', 'sensor', 'inlet_temp_f', 76.5, 'Average rack inlet temperature (ASHRAE limit 80.6F)', now() - interval '1 hour')
) as v(asset_id, source, metric, value, message, created_at)
where not exists (select 1 from public.telemetry_events where metric = 'condensate_pump_amps');

insert into public.vendors (name, trade, certified_kinds, response_hours, hourly_rate, callout_fee, next_available, rating, phone)
select * from (values
  ('Lone Star Mechanical', 'hvac', '{cooling,hvac}'::text[], 4, 165, 350, now() + interval '14 hours', 4.8, '(214) 555-0141'),
  ('Metroplex Chiller Service', 'hvac', '{cooling}'::text[], 8, 140, 250, now() + interval '30 hours', 4.4, '(972) 555-0177'),
  ('Trinity Electric', 'electrical', '{power}'::text[], 3, 150, 300, now() + interval '6 hours', 4.7, '(469) 555-0190'),
  ('Prairie Controls', 'controls', '{controls}'::text[], 6, 175, 200, now() + interval '10 hours', 4.6, '(214) 555-0123'),
  ('DFW Facility Pros', 'general', '{hvac,space}'::text[], 12, 95, 120, now() + interval '20 hours', 4.1, '(817) 555-0166')
) as v(name, trade, certified_kinds, response_hours, hourly_rate, callout_fee, next_available, rating, phone)
where not exists (select 1 from public.vendors);

insert into public.parts (asset_id, part, on_hand, unit_cost, lead_days)
select * from (values
  ('CRAH-A1', 'Condensate pump assembly', 1, 420, 0),
  ('CHILLER-1', 'Compressor bearing kit', 0, 1850, 2),
  ('CHILLER-1', 'Refrigerant charge (R-134a, 50 lb)', 2, 380, 0),
  ('UPS-A', 'Battery string module', 4, 900, 0),
  ('AHU-04', 'Condensate drain pan', 0, 260, 3)
) as v(asset_id, part, on_hand, unit_cost, lead_days)
where not exists (select 1 from public.parts);

insert into public.building_memory (property_id, asset_id, note, source, created_at)
select * from (values
  ('00000000-0000-0000-0000-000000000003'::uuid, 'CHILLER-1', 'Oct 2026: compressor bearing replaced after vibration alarm. Vendor said refrigerant was 15% low at the time.', 'seed', now() - interval '28 days'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'CRAH-A1', 'Condensate pump on CRAH-A1 is original equipment (2017). Flagged as end-of-life in the last audit.', 'seed', now() - interval '60 days'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'AHU-04', 'AHU-04 drain pan cracked in 2025 and was patched, not replaced.', 'seed', now() - interval '200 days')
) as v(property_id, asset_id, note, source, created_at)
where not exists (select 1 from public.building_memory);
