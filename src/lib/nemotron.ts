// NVIDIA build.nvidia.com is OpenAI-compatible, so plain fetch is enough (no SDK).
const BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export const nemotronModel = () => process.env.NEMOTRON_MODEL ?? "nvidia/llama-3.3-nemotron-super-49b-v1.5";

/** Live Nemotron unless there is no key or OPSCREW_MODE=scripted. */
export const agentMode = (): "live" | "scripted" =>
  process.env.OPSCREW_MODE === "scripted" || !process.env.NVIDIA_API_KEY ? "scripted" : "live";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(messages: Message[], tools: ToolSpec[]) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY.");

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model: nemotronModel(), messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: 2048 }),
    });
    if (response.ok) {
      const data = (await response.json()) as { choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[] };
      const { content, tool_calls } = data.choices[0].message;
      // Some Nemotron variants prefix reasoning in <think> tags; keep the visible answer only.
      return { role: "assistant" as const, content: content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() ?? null, tool_calls };
    }
    lastError = `Nemotron ${response.status}: ${(await response.text()).slice(0, 300)}`;
    if (response.status !== 429 && response.status < 500) break; // bad request: retrying won't help
    await sleep(800 * 2 ** attempt);
  }
  throw new Error(lastError);
}
