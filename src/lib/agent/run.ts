import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, type Message } from "@/lib/nemotron";
import { toolSpecs, tools } from "./tools";

const MAX_TURNS = 10;

const SYSTEM = `You are the incident-prevention agent for a commercial real estate portfolio.
Building systems form a dependency graph (power -> cooling -> spaces -> tenants). A new signal just arrived.
Work like an engineer on call:
1. inspect_asset on the signal's asset (and its upstream dependencies if the root cause may be upstream).
2. blast_radius to see what cascades and the dollar exposure; pick a realistic outage_hours.
3. get_weather when heat, storms or wind could worsen it.
4. Act: create_work_order for the root-cause asset, and notify_tenant for each tenant with real exposure.
5. Finish with a short brief: root cause, predicted cascade, $ at risk, actions taken. No tool call in the final message.
Only use asset ids and tenant ids that tools returned. Be concise.`;

export async function runAgent(db: SupabaseClient, runId: string, signal: unknown) {
  const log = (kind: string, content: unknown) => db.from("agent_steps").insert({ run_id: runId, kind, content });
  const messages: Message[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `New signal:\n${JSON.stringify(signal, null, 2)}` },
  ];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const reply = await chat(messages, toolSpecs);
      messages.push(reply);

      if (!reply.tool_calls?.length) {
        await log("final", { text: reply.content ?? "" });
        await db.from("agent_runs").update({ status: "done", summary: reply.content }).eq("id", runId);
        return;
      }
      if (reply.content?.trim()) await log("thought", { text: reply.content });

      for (const call of reply.tool_calls) {
        let args: Record<string, unknown> = {};
        let result: unknown;
        try {
          args = JSON.parse(call.function.arguments || "{}");
          const tool = tools[call.function.name];
          if (!tool) throw new Error(`Unknown tool ${call.function.name}`);
          result = await tool(args, { db, runId });
        } catch (error) {
          // Hand errors back to the model so it can correct itself instead of crashing the run.
          result = { error: error instanceof Error ? error.message : String(error) };
        }
        await log("tool", { name: call.function.name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    throw new Error(`Agent stopped after ${MAX_TURNS} turns without finishing.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await log("error", { text: message });
    await db.from("agent_runs").update({ status: "error", summary: message }).eq("id", runId);
  }
}
