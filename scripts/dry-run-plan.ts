// Storm night end to end on the in-memory database: 3 incidents in parallel -> who pays -> tonight's plan -> apply -> fix check.
// Run: npm run dry-run:plan
import { startRun } from "@/lib/agent/orchestrate";
import { applyPlan, makePlan } from "@/lib/plan";
import { scenarioById } from "@/lib/scenarios";
import { memoryDb, memoryTables as T } from "@/lib/supabase/memory";
import { checkVerification } from "@/lib/verify";

process.env.OPSCREW_PACE_MS ??= "0";
const db = memoryDb();

async function main() {
  const runs = await Promise.all(["cooling-cascade", "office-ahu", "northstar-panel"].map(async (id) => {
    const sc = scenarioById(id)!;
    const r = await startRun(db, { signal: sc.signal, propertyId: sc.property_id, hints: sc.hints, trigger: "incident", title: sc.label });
    return { id: r.runId, title: sc.label, done: r.execute() };
  }));
  await Promise.all(runs.map((r) => r.done));
  for (const r of runs) {
    const run = T.agent_runs.find((x) => x.id === r.id)!;
    const lease = T.agent_steps.filter((s) => s.run_id === r.id && s.content.name === "lease_responsibility").pop();
    console.log(`${r.title.padEnd(16)} ${run.status.padEnd(18)} wait $${run.risk?.wait_usd} fix $${run.risk?.fix_usd}  payer: ${lease?.content.result.payer.name} (${lease?.content.result.payer.ref})`);
  }

  const plan = await makePlan(db, 2, 1500);
  console.log("\nPLAN (2 technicians, $1,500 budget):");
  for (const i of plan.items) console.log(` ${i.rank}. ${i.building.padEnd(16)} ${i.decision.padEnd(12)} landlord $${i.landlord_cost}  ${i.reason}`);
  console.log(" summary:", JSON.stringify(plan.summary));
  console.log(" explanation:", plan.explanation);

  await applyPlan(db, plan.id, "Dry run");
  for (const r of runs) {
    const ap = T.approvals.filter((a) => a.run_id === r.id).map((a) => `${a.kind}:${a.status}`).join(" ");
    console.log(` after apply ${r.title.padEnd(16)} ${T.agent_runs.find((x) => x.id === r.id)!.status.padEnd(18)} ${ap}`);
  }

  const fixed = runs.find((r) => T.verifications.some((v) => v.run_id === r.id))!;
  const v1 = await checkVerification(db, fixed.id, { force: true, outcome: "pass" });
  console.log(`\nverify ${fixed.title}: ${v1?.status} · ${v1?.note}`);
  const other = runs.find((r) => r.id !== fixed.id && T.verifications.some((v) => v.run_id === r.id));
  if (other) {
    const v2 = await checkVerification(db, other.id, { force: true, outcome: "fail" });
    console.log(`verify ${other.title}: ${v2?.status} · ${v2?.note}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
