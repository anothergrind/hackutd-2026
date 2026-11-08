-- OpsCrew crew builder: saved agent settings, a crew snapshot per run, and seed data for the custom-agent templates.
-- Run after 005. Safe to re-run.

create table if not exists public.agent_configs (
  id text primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.agent_configs enable row level security;
drop policy if exists "public read" on public.agent_configs;
create policy "public read" on public.agent_configs for select using (true);

alter table public.agent_runs add column if not exists crew jsonb;

-- Energy Watch template: DC1 meters (AHU-04 / HVAC-12 rows already exist from 003).
insert into public.energy_readings (property_id, zone, equipment, reading_date, usage_kwh, baseline_kwh, anomaly_score)
select * from (values
  ('00000000-0000-0000-0000-000000000003'::uuid, 'Roof', 'CHILLER-1', current_date, 2380, 1900, 72),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'Data hall A', 'CRAH-A1', current_date, 410, 395, 12)
) as v(property_id, zone, equipment, reading_date, usage_kwh, baseline_kwh, anomaly_score)
where not exists (select 1 from public.energy_readings where equipment = 'CHILLER-1');

-- Repeat-Failure template: the October chiller repair as a real past work order.
insert into public.work_orders (asset_id, priority, title, steps, status, created_at)
select 'CHILLER-1', 4, 'Replace CHILLER-1 compressor bearing', '{"Replace bearing","Check refrigerant charge"}', 'done', now() - interval '28 days'
where not exists (select 1 from public.work_orders where title = 'Replace CHILLER-1 compressor bearing');
