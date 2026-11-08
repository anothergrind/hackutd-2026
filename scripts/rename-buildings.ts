// One-time cleanup: replaces the earlier made-up building names with the real buildings in src/lib/sites.ts,
// in every stored note, ticket, incident summary, approval and agent step. Safe to run again.
// Usage: npx tsx --env-file=.env.local scripts/rename-buildings.ts
import { createClient } from "@supabase/supabase-js";
import { OLD_NAMES } from "../src/lib/sites";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const names = Object.entries(OLD_NAMES).sort((a, b) => b[0].length - a[0].length);
const fix = (v: unknown) => {
  let json = JSON.stringify(v);
  for (const [from, to] of names) json = json.split(from).join(to);
  return JSON.parse(json);
};

const TABLES: Record<string, string[]> = {
  building_memory: ["note"],
  maintenance_tickets: ["building", "title", "notes", "predicted_impact"],
  agent_runs: ["summary"],
  approvals: ["title", "payload"],
  agent_steps: ["content"],
  tenant_notices: ["subject"],
};

async function main() {
for (const [table, cols] of Object.entries(TABLES)) {
  let changed = 0, from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select(["id", ...cols].join(", ")).range(from, from + 999);
    if (error) { console.log(`${table}: skipped (${error.message})`); break; }
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of rows) {
      const patch: Record<string, unknown> = {};
      for (const c of cols) if (r[c] != null) { const next = fix(r[c]); if (JSON.stringify(next) !== JSON.stringify(r[c])) patch[c] = next; }
      if (Object.keys(patch).length) { await db.from(table).update(patch).eq("id", r.id as string); changed++; }
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  console.log(`${table}: ${changed} rows updated`);
}
}

main().catch((e) => { console.error(e); process.exit(1); });
