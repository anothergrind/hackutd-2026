// Run FIRST: npm run smoke
// 1) lists Nemotron models your key can use, 2) checks the chosen model returns tool_calls.
const key = process.env.NVIDIA_API_KEY;
const base = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const model = process.env.NEMOTRON_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b";
if (!key) throw new Error("Set NVIDIA_API_KEY in .env.local (get one at build.nvidia.com)");

const models = await (await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } })).json();
console.log("Nemotron models:\n " + models.data.map((m) => m.id).filter((id) => /nemotron/i.test(id)).join("\n "));

const tools = [{ type: "function", function: { name: "blast_radius", description: "Downstream impact of an asset failing", parameters: { type: "object", properties: { asset_id: { type: "string" }, outage_hours: { type: "integer" } }, required: ["asset_id", "outage_hours"] } } }];
const messages = [{ role: "user", content: "What is the blast radius of CHILLER-1 for a 4 hour outage? Use the tool." }];
async function complete() {
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0, messages, tools }),
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return (await response.json()).choices[0].message;
}

// Turn 1: model must emit a tool call.
const message = await complete();
console.log(`\n${model} ->`, JSON.stringify(message.tool_calls ?? message.content, null, 2));
if (!message.tool_calls?.length) throw new Error("FAIL: no tool_calls. Try another model from the list via NEMOTRON_MODEL.");
console.log("OK: tool calling works.");

// Turn 2: model must accept the tool result the same way src/lib/agent/run.ts sends it.
messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });
messages.push({ role: "tool", tool_call_id: message.tool_calls[0].id, content: JSON.stringify({ total_exposure_usd: 37000, tenants: ["Lonestar Cloud", "MedRecords Health"] }) });
console.log("\nTurn 2 ->", (await complete()).content);
console.log("OK: multi-turn works. The agent loop should run.");
