// Deterministic math the agents call as tools. The model decides what to ask; these decide the numbers,
// so the dollar figures and hours on screen are reproducible and checkable.

export type Point = { t: number; value: number }; // t = epoch ms

/** Least-squares line through the points. Slope is per hour. */
export function linearTrend(points: Point[]) {
  if (points.length < 3) return null;
  const xs = points.map((p) => p.t / 3_600_000);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  const lastX = xs[n - 1];
  const fitted = my + slope * (lastX - mx);
  return { slopePerHour: slope, slopePerDay: slope * 24, r2, fittedLatest: fitted, latest: ys[n - 1] };
}

/** Hours until a rising (or falling) series crosses `limit`, or null if it is moving away from it. */
export function hoursToLimit(latest: number, slopePerHour: number, limit: number) {
  const gap = limit - latest;
  if (gap === 0) return 0;
  if (slopePerHour === 0 || Math.sign(gap) !== Math.sign(slopePerHour)) return null;
  return gap / slopePerHour;
}

export const EMERGENCY_MULTIPLIER = 2.5;

/**
 * Cost of waiting vs fixing now.
 * wait = SLA penalties for the outage + the same repair done as an emergency (premium labor, expedited parts).
 * fix  = the planned repair.
 */
export function priceRisk(input: { penaltyPerHour: number; outageHours: number; repairCostUsd: number; hoursUntilFailure: number | null }) {
  const penalties = Math.round(input.penaltyPerHour * input.outageHours);
  const emergencyRepair = Math.round(input.repairCostUsd * EMERGENCY_MULTIPLIER);
  const waitUsd = penalties + emergencyRepair;
  const fixUsd = Math.round(input.repairCostUsd);
  const urgency =
    input.hoursUntilFailure == null ? "watch" : input.hoursUntilFailure <= 24 ? "act today" : input.hoursUntilFailure <= 72 ? "act this week" : "plan";
  return {
    wait_usd: waitUsd,
    fix_usd: fixUsd,
    saved_usd: waitUsd - fixUsd,
    penalties_usd: penalties,
    emergency_repair_usd: emergencyRepair,
    hours_until_failure: input.hoursUntilFailure == null ? null : Math.round(input.hoursUntilFailure * 10) / 10,
    urgency,
    formula: `wait = $${input.penaltyPerHour.toLocaleString("en-US")}/hr SLA x ${input.outageHours} h outage + repair x ${EMERGENCY_MULTIPLIER} emergency premium`,
  };
}

/** 0-100 building risk score used by the nightly sweep. Each reason carries the points it added. */
/**
 * NWS alert types that stress building systems, and the sweep points each adds. It's an allowlist: alert text is
 * outside data, so unknown types score 0 and only these fixed names ever reach a prompt.
 */
export const ALERT_POINTS: Record<string, number> = {
  "Extreme Heat Warning": 20, "Excessive Heat Warning": 20, "Heat Advisory": 12,
  "Extreme Heat Watch": 8, "Excessive Heat Watch": 8,
  "Tornado Warning": 20, "Hurricane Warning": 20, "Tropical Storm Warning": 15,
  "Severe Thunderstorm Warning": 15, "Ice Storm Warning": 15, "Flash Flood Warning": 15,
  "Winter Storm Warning": 12, "High Wind Warning": 12, "Flood Warning": 10,
};

export function sweepScore(signals: { openTicketUrgency: number[]; anomalies: number; degradedAssets: number; hoursToLimit: number | null; forecastMaxF: number | null; alerts?: string[] }) {
  const reasons: { text: string; points: number }[] = [];
  const add = (points: number, text: string) => { if (points > 0) reasons.push({ text, points }); };
  const tickets = signals.openTicketUrgency;
  add(Math.min(30, tickets.reduce((a, u) => a + u * 3, 0)), `${tickets.length} open ticket${tickets.length === 1 ? "" : "s"}`);
  add(Math.min(20, signals.anomalies * 8), `${signals.anomalies} sensor anomal${signals.anomalies === 1 ? "y" : "ies"} in 72 h`);
  add(Math.min(20, signals.degradedAssets * 10), `${signals.degradedAssets} degraded asset${signals.degradedAssets === 1 ? "" : "s"}`);
  if (signals.hoursToLimit != null) {
    add(signals.hoursToLimit <= 24 ? 30 : signals.hoursToLimit <= 72 ? 18 : 6, `trend crosses limit in ~${Math.round(signals.hoursToLimit)} h`);
  }
  if (signals.forecastMaxF != null) add(signals.forecastMaxF >= 95 ? 10 : signals.forecastMaxF >= 88 ? 5 : 0, `forecast high ${Math.round(signals.forecastMaxF)}°F`);
  // Only the worst known alert counts, so a pile of alerts can't stack up a run on its own.
  const worst = (signals.alerts ?? []).filter((e) => Object.prototype.hasOwnProperty.call(ALERT_POINTS, e)).sort((a, b) => ALERT_POINTS[b] - ALERT_POINTS[a])[0];
  if (worst) add(ALERT_POINTS[worst], `NWS ${worst}`);
  const score = Math.min(100, reasons.reduce((a, r) => a + r.points, 0));
  return { score, reasons };
}
