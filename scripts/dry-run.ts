// Dry run without Supabase: the in-memory database (src/lib/supabase/memory.ts) runs the real orchestrator,
// tools, approval executor and sweep end to end, then prints every step.
// Run: npm run dry-run            (scripted policy)
//      NVIDIA_API_KEY=... npm run dry-run   (live Nemotron against the same fake data)
import { startRun } from "@/lib/agent/orchestrate";
import { decide } from "@/lib/approvals";
import { SCENARIOS } from "@/lib/scenarios";
import { memoryDb, memoryTables as T } from "@/lib/supabase/memory";
import { runSweep } from "@/lib/sweep";

process.env.OPSCREW_PACE_MS ??= "0";
const db = memoryDb();
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
async function main() {
  const scenario = SCENARIOS.find((s) => s.id === (process.argv[2] ?? "cooling-cascade"))!;
  console.log(`\n=== Incident: ${scenario.label} ===`);
  const { runId, execute } = await startRun(db, { signal: scenario.signal, propertyId: scenario.property_id, hints: scenario.hints, trigger: "incident", title: scenario.label });
  await execute();

  for (const s of T.agent_steps.filter((x) => x.run_id === runId)) {
    const c = s.content;
    const line = s.kind === "tool" ? `${c.name}(${JSON.stringify(c.args).slice(0, 90)}) -> ${JSON.stringify(c.result).slice(0, 140)}` : (c.text ?? c.task ?? "");
    console.log(`${String(s.agent).padEnd(9)} ${String(s.kind).padEnd(7)} ${line}`);
  }
  const run = T.agent_runs.find((r) => r.id === runId)!;
  console.log(`\nstatus: ${run.status}  mode: ${run.mode}`);
  console.log(`risk: wait ${money(run.risk?.wait_usd ?? 0)} vs fix ${money(run.risk?.fix_usd ?? 0)} · ${run.risk?.formula}`);
  console.log(`brief: ${run.summary}`);

  const drafts = T.approvals.filter((a) => a.run_id === runId);
  console.log(`\n${drafts.length} drafts:`, drafts.map((a) => `${a.kind}: ${a.title}`));
  const notice = drafts.find((a) => a.kind === "tenant_notice");
  for (const a of drafts) {
    await decide(db, a.id, { decision: "approve", by: "Dry run", edits: a === notice ? { subject: "Edited subject" } : undefined });
  }
  try { await decide(db, drafts[0].id, { decision: "approve", by: "Dry run" }); console.log("FAIL: double approve allowed"); }
  catch (e) { console.log(`double approve blocked: ${(e as Error).message}`); }
  console.log(`after approval: run ${T.agent_runs.find((r) => r.id === runId)!.status}; work_orders ${T.work_orders.length}, notices ${T.tenant_notices.length} (subject: ${T.tenant_notices[0]?.subject}), schedule_changes ${T.schedule_changes.length}`);

  console.log("\n=== Nightly sweep ===");
  const sweep = await runSweep(db, { autostart: true });
  for (const s of sweep.scores) console.log(`${String(s.score).padStart(3)}  ${s.name.padEnd(16)} ${s.reasons.map((r) => `${r.text} +${r.points}`).join("; ")}`);
  if (sweep.started) {
    await sweep.started.execute();
    const r = T.agent_runs.find((x) => x.id === sweep.started!.runId)!;
    console.log(`sweep started run ${r.title}: ${r.status}, ${T.approvals.filter((a) => a.run_id === r.id).length} drafts`);
  } else console.log("sweep did not start a run");
}
main().catch((e) => { console.error(e); process.exit(1); });
