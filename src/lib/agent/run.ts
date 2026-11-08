import type { AgentConfig } from "@/lib/crew";
import { agentMode, chat, type Message, type ToolCall } from "@/lib/nemotron";
import { TOOL_LIBRARY, type AgentId } from "@/lib/roster";
import { RULES } from "./prompts";
import { scriptedMove, type Call } from "./scripted";
import { ALL_TOOLS, type RunCtx, type Tool } from "./tools";

const WRITE_TOOLS = new Set(TOOL_LIBRARY.filter((t) => t.writes).map((t) => t.name));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Scripted mode pauses between turns so the live view is followable; set OPSCREW_PACE_MS=0 in tests.
const PACE = Number(process.env.OPSCREW_PACE_MS ?? 1200);

export const configOf = (ctx: RunCtx, id: AgentId): AgentConfig => {
  const c = ctx.crew.find((a) => a.id === id);
  if (!c) throw new Error(`Agent "${id}" is not in the crew.`);
  return c;
};

/** The tools this agent may call: its configured tools, plus (lead only) one ask_* per enabled specialist. */
function toolsFor(cfg: AgentConfig, ctx: RunCtx, mode: "live" | "scripted"): Record<string, Tool> {
  const tools: Record<string, Tool> = {};
  for (const name of cfg.tools) if (ALL_TOOLS[name]) tools[name] = ALL_TOOLS[name];
  if (cfg.kind !== "lead") return tools;
  for (const sub of ctx.crew.filter((a) => a.kind !== "lead" && a.enabled)) {
    tools[`ask_${sub.id}`] = {
      spec: { type: "function", function: { name: `ask_${sub.id}`, description: `${sub.name}: ${sub.role}. Tools: ${sub.tools.join(", ")}.`, parameters: { type: "object", properties: { task: { type: "string", description: "What you need, one or two sentences" } }, required: ["task"] } } },
      async run(args) {
        const task = typeof args.task === "string" && args.task.trim() ? args.task.trim().slice(0, 800) : "Investigate the signal.";
        const extra = sub.kind === "dispatch" ? tenantsAtRisk(ctx) : "";
        return { report: await runAgent(sub.id, task + extra, ctx, mode) };
      },
    };
  }
  return tools;
}

/** Dispatch has no tenant lookup of its own, so hand it the at-risk tenants this run already found (notices need their ids). */
function tenantsAtRisk(ctx: RunCtx) {
  const tenants = ctx.facts.tenants ?? [];
  if (!tenants.length) return "";
  const lines = tenants.map((t) => `- ${t.id}: ${t.name}, exposure $${Math.round(t.exposure_usd).toLocaleString("en-US")}`);
  return `\n\nTenants at risk (from tenants_at_risk); draft one notice for each:\n${lines.join("\n")}`;
}

function systemPrompt(cfg: AgentConfig, ctx: RunCtx) {
  if (cfg.kind !== "lead") return `${cfg.instructions}\n\n${RULES}`;
  const subs = ctx.crew.filter((a) => a.kind !== "lead" && a.enabled);
  const list = subs.map((a) => `- ask_${a.id}: ${a.name} (${a.kind === "dispatch" ? "drafts the fix; call last" : "investigates"}) - ${a.role}`).join("\n");
  return `${cfg.instructions}\n\nYour specialists:\n${list || "- none enabled; investigate with your own tools"}\n\n${RULES}`;
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
  await ctx.log(agent, "tool", { name: call.name, args: call.args, result, ms: Date.now() - started });
  return result;
}

/** One agent's loop. The lead's ask_* tools call this recursively, and calls in one turn run in parallel. */
export async function runAgent(agent: AgentId, task: string, ctx: RunCtx, mode: "live" | "scripted" = agentMode()): Promise<string> {
  const cfg = configOf(ctx, agent);
  await ctx.log(agent, "start", { task, mode, model: cfg.model || null });
  const tools = toolsFor(cfg, ctx, mode);
  let wroteSomething = false;

  if (mode === "live") {
    const messages: Message[] = [{ role: "system", content: systemPrompt(cfg, ctx) }, { role: "user", content: task }];
    try {
      for (let turn = 0; turn < cfg.max_turns; turn++) {
        const reply = await chat(messages, Object.values(tools).map((t) => t.spec), cfg.model);
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
      return runScripted(cfg, ctx, tools);
    }
  }
  return runScripted(cfg, ctx, tools);
}

async function runScripted(cfg: AgentConfig, ctx: RunCtx, tools: Record<string, Tool>) {
  for (let turn = 0; turn < cfg.max_turns + 3; turn++) {
    if (PACE) await pause(PACE);
    const move = scriptedMove(cfg, turn, ctx, Object.keys(tools));
    if ("final" in move) {
      await ctx.log(cfg.id, "final", { text: move.final });
      return move.final;
    }
    // An edited crew may have removed a tool the script wanted; skip those calls.
    const calls = move.calls.filter((c) => tools[c.name]);
    if (move.thought && calls.length) await ctx.log(cfg.id, "thought", { text: move.thought });
    const results = await Promise.all(calls.map((c) => execute(cfg.id, c, tools, ctx)));
    ctx.facts.byAgent ??= {};
    (ctx.facts.byAgent[cfg.id] ??= []).push(...calls.map((c, i) => ({ name: c.name, result: results[i] })));
  }
  return "Done.";
}
