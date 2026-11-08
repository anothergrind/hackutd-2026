// National Weather Service active alerts (api.weather.gov): free, no key, US only.
// Alert text is outside data that ends up in agent prompts, so only short, structured fields are kept.

export type NwsAlert = { event: string; severity: string | null; headline: string | null; ends: string | null };

export async function activeAlerts(lat: number, lon: number, timeoutMs = 6000): Promise<NwsAlert[]> {
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "OpsCrew (HackUTD demo)", Accept: "application/geo+json" }, // NWS rejects requests without one
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`NWS alerts ${response.status}`);

  const data = await response.json();
  const features: { properties: Record<string, string | null> }[] = data.features ?? [];
  return features.slice(0, 20).map(({ properties: a }) => ({
    event: String(a.event ?? "").slice(0, 80),
    severity: a.severity ?? null,
    headline: a.headline?.slice(0, 200) ?? null,
    ends: a.ends ?? a.expires ?? null,
  }));
}
