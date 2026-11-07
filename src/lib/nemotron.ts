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

export async function chat(messages: Message[], tools: ToolSpec[]) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY.");

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.NEMOTRON_MODEL ?? "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!response.ok) throw new Error(`Nemotron ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as {
    choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
  };
  const { content, tool_calls } = data.choices[0].message;
  return { role: "assistant" as const, content, tool_calls };
}
