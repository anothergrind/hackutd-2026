import type { AgentConfig } from "@/lib/crew";
import { levels, stagesOf } from "@/lib/flow";
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
        let task = typeof args.task === "string" && args.task.trim() ? args.task.trim().slice(0, 800) : "Investigate the signal.";
        // A specialist connected after others on the Agents canvas gets their findings with its task.
        const earlier = (sub.after ?? []).filter((u) => u !== "lead" && ctx.reports?.[u])
          .map((u) => `- ${ctx.crew.find((a) => a.id === u)?.name ?? u}: ${ctx.reports![u]}`);
        if (earlier.length) task += `\n\nFindings from the agents before you:\n${earlier.join("\n")}`;
        if (sub.kind === "dispatch") task += tenantsAtRisk(ctx);
        const report = await runAgent(sub.id, task, ctx, mode);
        (ctx.reports ??= {})[sub.id] = report;
        return { report };
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
  // Run order comes from the connections drawn on the Agents canvas.
  const stages = stagesOf(ctx.crew);
  const plan = stages.map((g, i) => `Stage ${i + 1}${g.length > 1 ? " (call these together in ONE turn so they run in parallel)" : ""}${i ? ", only after every Stage " + i + " report is back" : ""}:\n${g.map((a) => `- ask_${a.id}: ${a.name} - ${a.role}`).join("\n")}`).join("\n");
  const dispatch = ctx.crew.find((a) => a.kind === "dispatch" && a.enabled);
  const list = `${plan || "No specialists are connected; investigate with your own tools."}${dispatch ? `\nAfter pricing the risk: ask_${dispatch.id}: ${dispatch.name} (drafts the fix; call last) - ${dispatch.role}` : "\nNo Dispatch agent is connected: finish with a brief only."}`;
  const rules = cfg.rules ?? { min_ratio: 1, urgent_hours: 24 };
  const rule = `Decision rule: call Dispatch only if waiting costs at least ${rules.min_ratio}× the repair cost, or failure is expected within ${rules.urgent_hours} hours. Otherwise finish with a brief only.`;
  return `${cfg.instructions}\n\nYour specialists, in run order:\n${list}\n\n${rule}\n\n${RULES}`;
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
    let filledIn = false;
    let pendingNote = "";
    try {
      for (let turn = 0; turn < cfg.max_turns; turn++) {
        const t0 = Date.now();
        const reply = await chat(messages, Object.values(tools).map((t) => t.spec), cfg.model);
        const llm = { model: reply.model, via: reply.via, ms: Date.now() - t0 };
        // Every specialist connected on the Agents canvas runs. If the Lead is about to wrap up or hand off to
        // Dispatch without asking some of them, ask them now (in canvas order) and give the Lead their findings.
        if (cfg.kind === "lead" && !filledIn) {
          const dispatchTool = ctx.crew.find((a) => a.kind === "dispatch") ? `ask_${ctx.crew.find((a) => a.kind === "dispatch")!.id}` : "";
          const finishing = !reply.tool_calls?.length || reply.tool_calls.some((c) => c.function.name === dispatchTool);
          const lv = levels(ctx.crew);
          const missing = ctx.crew.filter((a) => a.kind === "specialist" && a.enabled !== false && (lv.get(a.id) ?? 0) > 0 && !ctx.reports?.[a.id]);
          if (finishing && missing.length) {
            filledIn = true;
            const brief = task.slice(0, 600);
            for (const l of [...new Set(missing.map((a) => lv.get(a.id)!))].sort((a, b) => a - b)) {
              await Promise.all(missing.filter((a) => lv.get(a.id) === l).map((a) =>
                execute(agent, { name: `ask_${a.id}`, args: { task: `Check this incident from your side and report what matters:\n${brief}` } }, tools, ctx)));
            }
            const found = missing.map((a) => `- ${a.name}: ${ctx.reports?.[a.id] ?? "no report"}`).join("\n");
            // Wrapping up: give the Lead the new findings and let it decide again (it can still call Dispatch).
            // Handing off to Dispatch: let that call go ahead; the new findings follow its result.
            const note = `These connected specialists have also reported:\n${found}\n\nTake their findings into account. ${dispatchTool ? `If the decision rule says to fix it and you have not yet, call ${dispatchTool} now.` : ""}`;
            if (!reply.tool_calls?.length) { messages.push({ role: "user", content: note }); continue; }
            pendingNote = note;
          }
        }
        messages.push({ role: "assistant", content: reply.content, tool_calls: reply.tool_calls });
        if (!reply.tool_calls?.length) {
          const text = reply.content?.trim() || "Done.";
          await ctx.log(agent, "final", { text, llm });
          return text;
        }
        await ctx.log(agent, "thought", { text: reply.content?.trim() || "", llm });
        const calls = reply.tool_calls.map((c: ToolCall) => {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(c.function.arguments || "{}"); } catch { args = { _unparsed: c.function.arguments }; }
          return { id: c.id, name: c.function.name, args };
        });
        if (calls.some((c) => WRITE_TOOLS.has(c.name) || c.name === "ask_dispatch")) wroteSomething = true;
        const results = await Promise.all(calls.map((c) => execute(agent, c, tools, ctx)));
        calls.forEach((c, i) => messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(results[i]).slice(0, 6000) }));
        if (pendingNote) { messages.push({ role: "user", content: pendingNote }); pendingNote = ""; }
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
    // Log the reasoning when tools run, or when the agent deliberately runs none (e.g. a decision rule).
    if (move.thought && (calls.length || !move.calls.length)) await ctx.log(cfg.id, "thought", { text: move.thought });
    const results = await Promise.all(calls.map((c) => execute(cfg.id, c, tools, ctx)));
    ctx.facts.byAgent ??= {};
    (ctx.facts.byAgent[cfg.id] ??= []).push(...calls.map((c, i) => ({ name: c.name, result: results[i] })));
  }
  return "Done.";
}
