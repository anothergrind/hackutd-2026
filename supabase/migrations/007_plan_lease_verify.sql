-- OpsCrew: lease responsibility (who pays), fix verification, and portfolio night plans.
-- Run after 006. Safe to re-run.

-- ---------- Leases: who maintains what ----------
create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lease_ref text not null,
  -- [{ "assets": ["CRAH-A1"] | "kinds": ["cooling"], "party": "tenant" | "landlord", "ref": "§8.2", "text": "..." }]
  clauses jsonb not null default '[]'
);

-- ---------- Did the fix work? ----------
create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  asset_id text not null,
  metric text not null,
  limit_value numeric not null,
  direction text not null check (direction in ('below', 'above')),
  due_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'passed', 'failed')),
  before jsonb not null default '[]',
  after jsonb not null default '[]',
  note text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Tonight's plan across buildings ----------
create table if not exists public.triage_plans (
  id uuid primary key default gen_random_uuid(),
  technicians integer not null,
  budget_usd numeric not null,
  items jsonb not null,
  summary jsonb not null,
  explanation text not null,
  status text not null default 'proposed' check (status in ('proposed', 'applied')),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['leases','verifications','triage_plans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

insert into public.leases (tenant_id, lease_ref, clauses)
select t.id, v.lease_ref, v.clauses::jsonb from public.tenants t join (values
  ('Lonestar Cloud', 'DC1-HALL-A-2024', '[{"assets":["CRAH-A1"],"party":"tenant","ref":"§8.2","text":"Tenant shall maintain, repair and replace the supplemental cooling units installed for Tenant''s exclusive use in Data Hall A, at Tenant''s sole cost."},{"kinds":["cooling","power","controls"],"party":"landlord","ref":"§7.1","text":"Landlord shall maintain the base building systems, including the central chiller plant, electrical service and building controls."}]'),
  ('MedRecords Health', 'DC1-HALL-B-2023', '[{"kinds":["cooling","power","controls"],"party":"landlord","ref":"§7.1","text":"Landlord shall maintain all base building systems serving Data Hall B, including cooling, power and controls."}]'),
  ('Brightline Legal', 'AVON-F4E-2022', '[{"assets":["AHU-04"],"party":"landlord","ref":"§10.4","text":"Landlord is responsible for the building HVAC, including air handlers serving the Premises; costs are recoverable as operating expenses."}]'),
  ('Parkway Capital', 'NST-F12-2025', '[{"assets":["PANEL-12B"],"party":"tenant","ref":"§9.3","text":"Tenant is responsible for electrical panels and distribution installed within the Premises after the Commencement Date."},{"kinds":["hvac"],"party":"landlord","ref":"§9.1","text":"Landlord maintains base building HVAC serving Floor 12."}]')
) as v(name, lease_ref, clauses) on t.name = v.name
where not exists (select 1 from public.leases);
