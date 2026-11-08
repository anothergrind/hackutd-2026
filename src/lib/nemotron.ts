// NVIDIA build.nvidia.com is OpenAI-compatible, so plain fetch is enough (no SDK).
const BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

// An empty NEMOTRON_MODEL= line counts as unset.
export const nemotronModel = () => process.env.NEMOTRON_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b";

/** Live Nemotron unless there is no key or OPSCREW_MODE=scripted. */
export const agentMode = (): "live" | "scripted" =>
  process.env.OPSCREW_MODE === "scripted" || !process.env.NVIDIA_API_KEY ? "scripted" : "live";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HOSTED_URL = "https://integrate.api.nvidia.com/v1";
const HOSTED_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
// When a self-hosted NIM (e.g. the Brev GPU through a tunnel) can't be reached, use NVIDIA's hosted
// Nemotron instead of dropping to scripted mode, and skip the self-hosted one for a minute.
const g = globalThis as unknown as { __nimDownUntil?: number };

/** Where a reply came from, shown in the Full Log: the self-hosted GPU or NVIDIA's hosted API. */
export type Via = "gpu" | "hosted";

export async function chat(messages: Message[], tools: ToolSpec[], model?: string) {
  const selfHosted = BASE_URL !== HOSTED_URL;
  // The GPU serves one model (NEMOTRON_MODEL). Any other model picked for an agent goes to the hosted API.
  const wantsGpu = selfHosted && (!model || model === nemotronModel());
  if (wantsGpu && Date.now() >= (g.__nimDownUntil ?? 0)) {
    try {
      return { ...(await chatAt(BASE_URL, nemotronModel(), messages, tools)), via: "gpu" as Via, model: nemotronModel() };
    } catch (e) {
      // Only a connection failure switches over; a real model error is reported as is.
      if (!(e instanceof TypeError) && !/fetch failed|ECONNREFUSED|timeout|aborted/i.test(String(e))) throw e;
      g.__nimDownUntil = Date.now() + 60_000;
      console.warn("[nemotron] self-hosted NIM unreachable, using hosted Nemotron for now");
    }
  }
  const id = wantsGpu ? HOSTED_MODEL : model || (selfHosted ? HOSTED_MODEL : nemotronModel());
  return { ...(await chatAt(HOSTED_URL, id, messages, tools)), via: "hosted" as Via, model: id };
}

async function chatAt(base: string, id: string, messages: Message[], tools: ToolSpec[]) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY.");

  // Nemotron Nano reasons out loud by default, which slows it down and pushes tool calls aside.
  // "/no_think" in the system prompt switches that off.
  if (/nano/i.test(id)) messages = messages.map((m, i) => (i === 0 && m.role === "system" && !m.content.startsWith("/no_think") ? { ...m, content: `/no_think\n${m.content}` } : m));

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model: id, messages, ...(tools.length ? { tools, tool_choice: "auto" } : {}), temperature: 0.2, max_tokens: 2048 }),
    });
    if (response.ok) {
      const data = (await response.json()) as { choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[] };
      const { content, tool_calls } = data.choices[0].message;
      // Some Nemotron variants prefix reasoning in <think> tags (sometimes without the opening tag); keep the visible answer only.
      return { role: "assistant" as const, content: content?.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim() ?? null, tool_calls };
    }
    lastError = `Nemotron ${response.status}: ${(await response.text()).slice(0, 300)}`;
    if (response.status !== 429 && response.status < 500) break; // bad request: retrying won't help
    await sleep(800 * 2 ** attempt);
  }
  throw new Error(lastError);
}

/** Can the configured Nemotron server be reached right now? Also says whether the hosted backup answers. */
export async function modelHealth(): Promise<{ selfHosted: boolean; primary: boolean; hosted: boolean | null }> {
  const key = process.env.NVIDIA_API_KEY;
  const ping = async (base: string, auth: boolean) => {
    try {
      const r = await fetch(`${base}/models`, { headers: auth && key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(4000), cache: "no-store" });
      return r.ok;
    } catch { return false; }
  };
  const selfHosted = BASE_URL !== HOSTED_URL;
  const primary = await ping(BASE_URL, !selfHosted);
  return { selfHosted, primary, hosted: selfHosted && !primary ? await ping(HOSTED_URL, true) : null };
}
