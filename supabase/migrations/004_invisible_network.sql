-- The "invisible network": building systems as a dependency graph, plus the agent's
-- inputs (telemetry), outputs (work orders, tenant notices) and its trace (runs, steps).
-- Asset ids are equipment tags (e.g. 'AHU-04') so maintenance_tickets.equipment and
-- energy_readings.equipment already join to them with no schema change.

alter table public.properties add column if not exists lat double precision;
alter table public.properties add column if not exists lon double precision;

create table if not exists public.assets (
  id text primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('power', 'cooling', 'hvac', 'controls', 'space')),
  location text not null default '',
  status text not null default 'ok' check (status in ('ok', 'degraded', 'failed'))
);

-- upstream -> downstream: "if upstream fails, downstream is at risk"
create table if not exists public.dependencies (
  upstream text not null references public.assets(id) on delete cascade,
  downstream text not null references public.assets(id) on delete cascade,
  relation text not null check (relation in ('powers', 'cools', 'controls', 'serves')),
  primary key (upstream, downstream)
);

-- shortcut: one tenant occupies one space asset; add a join table if a tenant spans spaces.
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  asset_id text not null references public.assets(id) on delete cascade,
  name text not null,
  sla_penalty_per_hour numeric not null default 0,
  contact_email text not null default ''
);

create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.assets(id) on delete cascade,
  source text not null check (source in ('sensor', 'bms', 'cyber', 'ticket', 'weather')),
  metric text not null,
  value numeric,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.telemetry_events(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_steps (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  kind text not null check (kind in ('thought', 'tool', 'final', 'error')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete set null,
  asset_id text not null references public.assets(id) on delete cascade,
  priority integer not null check (priority between 1 and 5),
  title text not null,
  steps text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'dispatched', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_notices (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete set null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

-- Public read for the demo UI. Writes go through the server's service-role key (bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array['assets','dependencies','tenants','telemetry_events','agent_runs','agent_steps','work_orders','tenant_notices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

-- ---------- Seed: a data-center-heavy portfolio in Dallas ----------

update public.properties set lat = 32.7767, lon = -96.7970 where id = '00000000-0000-0000-0000-000000000001';
update public.properties set lat = 32.9857, lon = -96.7502 where id = '00000000-0000-0000-0000-000000000002';

insert into public.properties (id, name, address, building_type, lat, lon)
values ('00000000-0000-0000-0000-000000000003', 'Avon DC1', '4000 Data Way, Richardson, TX', 'Data center', 32.9483, -96.7299)
on conflict (id) do nothing;

insert into public.assets (id, property_id, name, kind, location) values
  -- Avon DC1: power + cooling + controls feeding two data halls
  ('UTIL-FEED-1', '00000000-0000-0000-0000-000000000003', 'Oncor utility feed A', 'power', 'Yard'),
  ('SWGR-1',      '00000000-0000-0000-0000-000000000003', 'Main switchgear', 'power', 'Electrical room'),
  ('GEN-1',       '00000000-0000-0000-0000-000000000003', 'Backup diesel generator', 'power', 'Yard'),
  ('UPS-A',       '00000000-0000-0000-0000-000000000003', 'UPS string A', 'power', 'Electrical room'),
  ('UPS-B',       '00000000-0000-0000-0000-000000000003', 'UPS string B', 'power', 'Electrical room'),
  ('BMS-1',       '00000000-0000-0000-0000-000000000003', 'Building management system', 'controls', 'NOC'),
  ('CHILLER-1',   '00000000-0000-0000-0000-000000000003', 'Centrifugal chiller 1', 'cooling', 'Roof'),
  ('CW-LOOP-1',   '00000000-0000-0000-0000-000000000003', 'Chilled water loop', 'cooling', 'Mechanical'),
  ('CRAH-A1',     '00000000-0000-0000-0000-000000000003', 'CRAH unit A1', 'cooling', 'Data hall A'),
  ('CRAH-B1',     '00000000-0000-0000-0000-000000000003', 'CRAH unit B1', 'cooling', 'Data hall B'),
  ('HALL-A',      '00000000-0000-0000-0000-000000000003', 'Data hall A', 'space', 'Floor 1'),
  ('HALL-B',      '00000000-0000-0000-0000-000000000003', 'Data hall B', 'space', 'Floor 1'),
  -- Existing equipment from 003 so tickets/energy readings join in
  ('AHU-04',      '00000000-0000-0000-0000-000000000001', 'Air handler 4', 'hvac', 'Floor 4'),
  ('FLOOR-4-EAST','00000000-0000-0000-0000-000000000001', 'Floor 4 east offices', 'space', 'Floor 4'),
  ('PANEL-12B',   '00000000-0000-0000-0000-000000000002', 'Electrical panel 12B', 'power', 'Floor 12'),
  ('HVAC-12',     '00000000-0000-0000-0000-000000000002', 'Floor 12 HVAC', 'hvac', 'Floor 12'),
  ('FLOOR-12',    '00000000-0000-0000-0000-000000000002', 'Floor 12 offices', 'space', 'Floor 12')
on conflict (id) do nothing;

insert into public.dependencies (upstream, downstream, relation) values
  ('UTIL-FEED-1', 'SWGR-1', 'powers'),
  ('GEN-1', 'SWGR-1', 'powers'),
  ('SWGR-1', 'UPS-A', 'powers'),
  ('SWGR-1', 'UPS-B', 'powers'),
  ('SWGR-1', 'CHILLER-1', 'powers'),
  ('UPS-A', 'HALL-A', 'powers'),
  ('UPS-B', 'HALL-B', 'powers'),
  ('BMS-1', 'CHILLER-1', 'controls'),
  ('BMS-1', 'CRAH-A1', 'controls'),
  ('BMS-1', 'CRAH-B1', 'controls'),
  ('CHILLER-1', 'CW-LOOP-1', 'cools'),
  ('CW-LOOP-1', 'CRAH-A1', 'cools'),
  ('CW-LOOP-1', 'CRAH-B1', 'cools'),
  ('CRAH-A1', 'HALL-A', 'cools'),
  ('CRAH-B1', 'HALL-B', 'cools'),
  ('AHU-04', 'FLOOR-4-EAST', 'serves'),
  ('PANEL-12B', 'HVAC-12', 'powers'),
  ('PANEL-12B', 'FLOOR-12', 'powers'),
  ('HVAC-12', 'FLOOR-12', 'serves')
on conflict do nothing;

insert into public.tenants (property_id, asset_id, name, sla_penalty_per_hour, contact_email)
select * from (values
  ('00000000-0000-0000-0000-000000000003'::uuid, 'HALL-A', 'Lonestar Cloud', 25000, 'noc@lonestar.example'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'HALL-B', 'MedRecords Health', 12000, 'it-ops@medrecords.example'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'FLOOR-4-EAST', 'Brightline Legal', 800, 'office@brightline.example'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'FLOOR-12', 'Parkway Capital', 1500, 'facilities@parkway.example')
) as v(property_id, asset_id, name, sla_penalty_per_hour, contact_email)
where not exists (select 1 from public.tenants);

insert into public.telemetry_events (asset_id, source, metric, value, message, created_at)
select * from (values
  ('CHILLER-1', 'sensor', 'vibration_mm_s', 6.8, 'Compressor vibration trending up (baseline 2.1 mm/s)', now() - interval '3 hours'),
  ('CW-LOOP-1', 'sensor', 'supply_temp_f', 47.5, 'Chilled water supply 3.5F above setpoint', now() - interval '40 minutes'),
  ('UPS-A', 'sensor', 'battery_health_pct', 71, 'Battery string A health below 75%', now() - interval '1 day')
) as v(asset_id, source, metric, value, message, created_at)
where not exists (select 1 from public.telemetry_events);
