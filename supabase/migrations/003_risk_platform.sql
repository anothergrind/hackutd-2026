create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  building_type text not null default 'Commercial',
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  building text not null,
  floor text not null,
  equipment text not null,
  title text not null,
  notes text not null,
  status text not null default 'open' check (status in ('open', 'monitoring', 'resolved')),
  urgency integer not null check (urgency between 1 and 5),
  risk_score integer not null check (risk_score between 0 and 100),
  predicted_impact text not null,
  reported_at timestamptz not null default now()
);

create table if not exists public.energy_readings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  zone text not null,
  equipment text not null,
  reading_date date not null,
  usage_kwh numeric not null,
  baseline_kwh numeric not null,
  anomaly_score integer not null check (anomaly_score between 0 and 100)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  category text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  probability integer not null check (probability between 0 and 100),
  affected_zones text[] not null default '{}',
  response_plan text[] not null default '{}',
  status text not null default 'predicted' check (status in ('predicted', 'active', 'contained')),
  created_at timestamptz not null default now()
);

alter table public.properties enable row level security;
alter table public.maintenance_tickets enable row level security;
alter table public.energy_readings enable row level security;
alter table public.incidents enable row level security;

create policy "Properties are publicly readable" on public.properties for select using (true);
create policy "Tickets are publicly readable" on public.maintenance_tickets for select using (true);
create policy "Energy readings are publicly readable" on public.energy_readings for select using (true);
create policy "Incidents are publicly readable" on public.incidents for select using (true);

insert into public.properties (id, name, address, building_type)
values
  ('00000000-0000-0000-0000-000000000001', 'Avon Center', '100 Market Street, Dallas, TX', 'Mixed-use'),
  ('00000000-0000-0000-0000-000000000002', 'Northstar Tower', '2500 Innovation Drive, Dallas, TX', 'Office')
on conflict (id) do nothing;

insert into public.maintenance_tickets
  (property_id, building, floor, equipment, title, notes, status, urgency, risk_score, predicted_impact, reported_at)
values
  ('00000000-0000-0000-0000-000000000001', 'Avon Center', 'Floor 4', 'AHU-04', 'Warm air in east corridor', 'Three offices report rising temperature and weak airflow since 08:15.', 'open', 3, 74, 'Potential HVAC failure affecting the east wing', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', 'Avon Center', 'Floor 4', 'AHU-04', 'Condensation near supply vent', 'Technician found moisture beneath the same air handler. No visible ceiling damage yet.', 'open', 4, 88, 'Water damage and mold risk if left untreated', now() - interval '55 minutes'),
  ('00000000-0000-0000-0000-000000000002', 'Northstar Tower', 'Floor 12', 'PANEL-12B', 'Lights flickering', 'Two tenants report intermittent flicker near the west conference rooms.', 'monitoring', 2, 42, 'Electrical fault may spread to adjacent circuits', now() - interval '4 hours'),
  ('00000000-0000-0000-0000-000000000002', 'Northstar Tower', 'Floor 12', 'HVAC-12', 'Energy usage above baseline', 'Nighttime load remained high despite low occupancy.', 'open', 3, 67, 'Inefficient HVAC cycle driving avoidable cost', now() - interval '90 minutes');

insert into public.energy_readings
  (property_id, zone, equipment, reading_date, usage_kwh, baseline_kwh, anomaly_score)
values
  ('00000000-0000-0000-0000-000000000001', 'East wing', 'AHU-04', current_date, 842, 590, 86),
  ('00000000-0000-0000-0000-000000000001', 'West wing', 'AHU-02', current_date, 544, 520, 18),
  ('00000000-0000-0000-0000-000000000002', 'Floor 12', 'HVAC-12', current_date, 713, 480, 79),
  ('00000000-0000-0000-0000-000000000002', 'Floor 8', 'HVAC-08', current_date, 462, 450, 8);

insert into public.incidents
  (property_id, title, category, severity, probability, affected_zones, response_plan, status)
values
  ('00000000-0000-0000-0000-000000000001', 'East wing HVAC escalation', 'Mechanical', 'high', 82, '{"Floor 4 east corridor","Floor 5 offices"}', '{"Dispatch HVAC technician to AHU-04","Inspect condensate line and ceiling void","Notify affected tenants","Recheck sensor readings in 30 minutes"}', 'predicted'),
  ('00000000-0000-0000-0000-000000000002', 'Floor 12 energy anomaly', 'Energy', 'medium', 68, '{"Floor 12 west conference rooms"}', '{"Compare HVAC-12 schedule with occupancy","Inspect controls and damper position","Apply temporary overnight schedule","Review utility impact tomorrow"}', 'predicted');
