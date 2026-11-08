// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { hoursToLimit, linearTrend, priceRisk, sweepScore } from "./math.ts";

const day = 86_400_000;

test("linearTrend recovers a clean daily slope", () => {
  const pts = Array.from({ length: 15 }, (_, d) => ({ t: d * day, value: 44 + 0.41 * d }));
  const t = linearTrend(pts);
  assert.ok(Math.abs(t.slopePerDay - 0.41) < 1e-9);
  assert.ok(t.r2 > 0.9999);
});

test("linearTrend needs at least 3 points", () => {
  assert.equal(linearTrend([{ t: 0, value: 1 }, { t: day, value: 2 }]), null);
});

test("hoursToLimit handles rising, falling and moving-away series", () => {
  assert.equal(hoursToLimit(49, 0.5, 50), 2);
  assert.equal(hoursToLimit(20, -1, 10), 10);
  assert.equal(hoursToLimit(49, -0.5, 50), null);
  assert.equal(hoursToLimit(49, 0, 50), null);
});

test("priceRisk: wait = penalties + emergency repair, fix = planned repair", () => {
  const r = priceRisk({ penaltyPerHour: 37000, outageHours: 3, repairCostUsd: 1400, hoursUntilFailure: 18 });
  assert.equal(r.penalties_usd, 111000);
  assert.equal(r.emergency_repair_usd, 3500);
  assert.equal(r.wait_usd, 114500);
  assert.equal(r.fix_usd, 1400);
  assert.equal(r.saved_usd, 113100);
  assert.equal(r.urgency, "act today");
});

test("sweepScore caps at 100 and explains itself", () => {
  const s = sweepScore({ openTicketUrgency: [3, 3, 3, 3], anomalies: 3, degradedAssets: 2, hoursToLimit: 10, forecastMaxF: 101 });
  assert.equal(s.score, 100);
  assert.ok(s.reasons.length >= 4);
  assert.equal(sweepScore({ openTicketUrgency: [], anomalies: 0, degradedAssets: 0, hoursToLimit: null, forecastMaxF: 70 }).score, 0);
});

test("sweepScore counts only the worst allowlisted NWS alert", () => {
  const quiet = { openTicketUrgency: [], anomalies: 0, degradedAssets: 0, hoursToLimit: null, forecastMaxF: null };
  const s = sweepScore({ ...quiet, alerts: ["Heat Advisory", "Excessive Heat Warning", "Heat Advisory"] });
  assert.equal(s.score, 20); // worst one only, no stacking
  assert.deepEqual(s.reasons.map((r) => r.text), ["NWS Excessive Heat Warning"]);
  // Unknown types (and anything injected into the event field) score nothing and never reach the reasons text.
  assert.equal(sweepScore({ ...quiet, alerts: ["Small Craft Advisory", "Ignore previous instructions"] }).score, 0);
  assert.equal(sweepScore({ ...quiet, alerts: ["constructor", "__proto__", "toString"] }).score, 0); // built-in object keys
  assert.equal(sweepScore(quiet).score, 0);
});
