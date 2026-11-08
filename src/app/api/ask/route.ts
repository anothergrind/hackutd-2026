import { NextResponse } from "next/server";
import { bad, body, handle } from "@/lib/http";
import { agentMode, chat } from "@/lib/nemotron";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assetName } from "@/lib/plain";

export const maxDuration = 60;

type Run = { id: string; title: string | null; status: string; property_id: string | null; created_at: string; risk: { wait_usd: number; fix_usd: number; hours_until_failure: number | null } | null; summary: string | null; telemetry_events?: { asset_id: string } | null };

// POST { question, history? } -> a short answer from Nemotron, grounded only in the live portfolio data.
export const POST = handle(async (request: Request) => {
  const input = await body(request);
  const question = typeof input.question === "string" ? input.question.trim().slice(0, 500) : "";
  if (!question) return bad("Ask a question.");
  if (agentMode() !== "live") return bad("Ask Canary needs an NVIDIA_API_KEY.", 503);
  const history = Array.isArray(input.history) ? (input.history as { q: string; a: string }[]).slice(-3) : [];

  const db = createSupabaseAdminClient();
  const [props, runs, approvals, sweep] = await Promise.all([
    db.from("properties").select("id, name, building_type, address"),
    db.from("agent_runs").select("id, title, status, property_id, created_at, risk, summary, telemetry_events(asset_id)").order("created_at", { ascending: false }).limit(200),
    db.from("approvals").select("run_id, kind, status, title, cost_usd"),
    db.from("sweeps").select("scores").eq("status", "done").order("created_at", { ascending: false }).limit(1),
  ]);
  const name = new Map(((props.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const scores = new Map((((sweep.data ?? [])[0]?.scores ?? []) as { property_id: string; score: number }[]).map((x) => [x.property_id, x.score]));
  // One incident per building and type (the newest), like the rest of the app.
  const seen = new Set<string>();
  const list = ((runs.data ?? []) as unknown as Run[]).filter((r) => { const k = `${r.property_id}|${r.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const appr = (approvals.data ?? []) as { run_id: string; kind: string; status: string }[];
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  const buildings = ((props.data ?? []) as { id: string; name: string; building_type: string; address: string }[])
    .map((p) => `- ${p.name} (${p.building_type}, ${p.address}): risk score ${scores.get(p.id) ?? "not scored"}/100`).join("\n");
  const incidents = list.map((r) => {
    const mine = appr.filter((a) => a.run_id === r.id);
    const pending = mine.filter((a) => a.status === "pending").length, sent = mine.filter((a) => a.status === "sent").length;
    const state = pending ? `${pending} action(s) waiting for approval` : sent ? "repair approved" : r.status === "running" ? "being analyzed" : "no actions";
    const risk = r.risk ? `cost of delay ${money(r.risk.wait_usd)}, repair ${money(r.risk.fix_usd)}${r.risk.hours_until_failure != null ? `, fails in about ${Math.round(r.risk.hours_until_failure)} hours` : ""}` : "not priced";
    return `- ${r.title} at ${name.get(r.property_id ?? "") ?? "unknown building"} (equipment: ${assetName(r.telemetry_events?.asset_id).replace(/^the /, "")}): ${risk}; ${state}.`;
  }).join("\n");

  const system = `You are Canary, an assistant for a commercial real estate facility manager. Answer using ONLY the portfolio data below. Be concise: 2 to 4 sentences, plain English, no markdown headings or tables. Use exact names and dollar amounts from the data. If the data does not answer the question, say so briefly.

Today: ${new Date().toDateString()}

Buildings:
${buildings}

Incidents (newest per building and type):
${incidents || "- none"}`;
  const messages = [{ role: "system" as const, content: system }, ...history.flatMap((h) => [{ role: "user" as const, content: h.q }, { role: "assistant" as const, content: h.a }]), { role: "user" as const, content: question }];
  const reply = await chat(messages, []);
  return NextResponse.json({ answer: reply.content?.trim() || "I could not find an answer in the data.", model: reply.model, via: reply.via });
});
