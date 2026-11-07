import { agentMode, chat, type Message, type ToolCall } from "@/lib/nemotron";
import { ROSTER, type AgentId } from "@/lib/roster";
import { SYSTEM } from "./prompts";
import { scriptedMove, type Call } from "./scripted";
import { leadTools, specialistTools, type RunCtx, type Tool } from "./tools";

const MAX_TURNS: Record<AgentId, number> = { lead: 10, triage: 5, sensor: 5, lease: 5, dispatch: 6 };
const WRITE_TOOLS = new Set(ROSTER.flatMap((a) => a.tools.filter((t) => t.writes).map((t) => t.name)));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Scripted mode pauses between turns so the live view is followable; set OPSCREW_PACE_MS=0 in tests.
const PACE = Number(process.env.OPSCREW_PACE_MS ?? 700);

function toolsFor(agent: AgentId, ctx: RunCtx, mode: "live" | "scripted"): Record<string, Tool> {
  if (agent !== "lead") return specialistTools[agent];
  const delegate = (to: Exclude<AgentId, "lead">, what: string): Tool => ({
    spec: { type: "function", function: { name: `ask_${to}`, description: what, parameters: { type: "object", properties: { task: { type: "string", description: "What you need, one or two sentences" } }, required: ["task"] } } },
    async run(args) {
      const task = typeof args.task === "string" && args.task.trim() ? args.task.trim().slice(0, 800) : "Investigate the signal.";
      return { report: await runAgent(to, task, ctx, mode) };
    },
  });
  return {
    ...leadTools,
    ask_triage: delegate("triage", "Ticket Triage reads work orders and technician notes and links tickets that share a root cause."),
    ask_sensor: delegate("sensor", "Sensor Watch maps dependencies and fits trends on telemetry to estimate hours until a limit."),
    ask_lease: delegate("lease", "Lease / SLA finds affected tenants, SLA penalties per hour, and the weather forecast."),
    ask_dispatch: delegate("dispatch", "Dispatch finds a vendor and parts and drafts the work order, schedule change and tenant notices for approval."),
  };
}

async function execute(agent: AgentId, call: Call, tools: Record<string, Tool>, ctx: RunCtx) {
  const started = Date.now();
  let result: unknown;
  try {
    const tool = tools[call.name];
    if (!tool) throw new Error(`Unknown tool ${call.name}. Available: ${Object.keys(tools).join(", ")}`);
    result = await tool.run(call.args, ctx);
  } catch (error) {
    // Errors go back to the model so it can correct itself instead of crashing the run.
    result = { error: error instanceof Error ? error.message : String(error) };
  }
  // Delegation results are the specialist's whole run; that run logged its own steps.
  await ctx.log(agent, "tool", { name: call.name, args: call.args, result, ms: Date.now() - started });
  return result;
}

/** One agent's loop. The lead's ask_* tools call this recursively, and calls in one turn run in parallel. */
export async function runAgent(agent: AgentId, task: string, ctx: RunCtx, mode: "live" | "scripted" = agentMode()): Promise<string> {
  await ctx.log(agent, "start", { task, mode });
  const tools = toolsFor(agent, ctx, mode);
  let wroteSomething = false;

  if (mode === "live") {
    const messages: Message[] = [{ role: "system", content: SYSTEM[agent] }, { role: "user", content: task }];
    try {
      for (let turn = 0; turn < MAX_TURNS[agent]; turn++) {
        const reply = await chat(messages, Object.values(tools).map((t) => t.spec));
        messages.push(reply);
        if (!reply.tool_calls?.length) {
          const text = reply.content?.trim() || "Done.";
          await ctx.log(agent, "final", { text });
          return text;
        }
        if (reply.content?.trim()) await ctx.log(agent, "thought", { text: reply.content.trim() });
        const calls = reply.tool_calls.map((c: ToolCall) => {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(c.function.arguments || "{}"); } catch { args = { _unparsed: c.function.arguments }; }
          return { id: c.id, name: c.function.name, args };
        });
        if (calls.some((c) => WRITE_TOOLS.has(c.name) || c.name === "ask_dispatch")) wroteSomething = true;
        const results = await Promise.all(calls.map((c) => execute(agent, c, tools, ctx)));
        calls.forEach((c, i) => messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(results[i]).slice(0, 6000) }));
      }
      const text = "Stopped after the turn limit; see the steps above.";
      await ctx.log(agent, "final", { text });
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Fall back to the scripted policy if nothing irreversible has been drafted by this agent yet.
      if (wroteSomething || process.env.OPSCREW_FALLBACK === "false") throw error;
      await ctx.log(agent, "error", { text: `Nemotron unavailable (${message.slice(0, 160)}). Continuing in scripted mode.` });
      return runScripted(agent, ctx, tools);
    }
  }
  return runScripted(agent, ctx, tools);
}

async function runScripted(agent: AgentId, ctx: RunCtx, tools: Record<string, Tool>) {
  for (let turn = 0; turn < MAX_TURNS[agent] + 2; turn++) {
    if (PACE) await pause(PACE);
    const move = scriptedMove(agent, turn, ctx);
    if ("final" in move) {
      await ctx.log(agent, "final", { text: move.final });
      return move.final;
    }
    if (move.thought) await ctx.log(agent, "thought", { text: move.thought });
    await Promise.all(move.calls.map((c) => execute(agent, c, tools, ctx)));
  }
  return "Done.";
}
