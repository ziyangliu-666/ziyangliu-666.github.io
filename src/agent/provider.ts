/* DeepSeek client.
 *
 * One function, `chat()`, streaming normalised deltas. Everything provider-specific stops
 * here: the loop above it never sees an SSE frame or a `reasoning_content` field. Adding
 * another provider means another implementation of this file, not a rewrite of the loop.
 *
 * No SDK. The wire format is OpenAI-compatible chat completions, the proxy already
 * normalises errors, and an SSE reader is thirty lines — a dependency would be larger
 * than the code it replaced.
 */

import {
  DEEPSEEK_DIRECT_URL,
  PROXY_URL,
  byokKey,
} from "./config";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ProviderDelta =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool_call";
      index: number;
      id?: string;
      name?: string;
      args?: string;
    }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "finish"; reason: string };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  thinking?: boolean;
  effort?: "low" | "medium" | "high";
  maxTokens: number;
  signal?: AbortSignal;
}

interface StreamChoice {
  delta?: {
    content?: string | null;
    reasoning_content?: string | null;
    tool_calls?: {
      index: number;
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }[];
  };
  finish_reason?: string | null;
}

interface StreamChunk {
  choices?: StreamChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string } | string;
}

function endpointAndHeaders(): { url: string; headers: HeadersInit } {
  if (PROXY_URL) {
    return {
      url: `${PROXY_URL}/api/chat`,
      headers: { "content-type": "application/json" },
    };
  }
  const key = byokKey();
  if (!key) throw new Error("no model configured");
  return {
    url: DEEPSEEK_DIRECT_URL,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
  };
}

export async function* chat(req: ChatRequest): AsyncGenerator<ProviderDelta> {
  const { url, headers } = endpointAndHeaders();

  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: req.maxTokens,
    thinking: { type: req.thinking === false ? "disabled" : "enabled" },
  };
  if (req.thinking !== false && req.effort) body.reasoning_effort = req.effort;
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(await describeFailure(res));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Keep the trailing partial.
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        for (const line of frame.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(payload) as StreamChunk;
          } catch {
            continue; // a keep-alive comment or a truncated frame
          }

          if (chunk.error) {
            const msg =
              typeof chunk.error === "string"
                ? chunk.error
                : chunk.error.message ?? "upstream error";
            throw new Error(msg);
          }

          if (chunk.usage) {
            yield {
              type: "usage",
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
            };
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta;

          if (delta?.reasoning_content) {
            yield { type: "reasoning", text: delta.reasoning_content };
          }
          if (delta?.content) {
            yield { type: "text", text: delta.content };
          }
          for (const tc of delta?.tool_calls ?? []) {
            yield {
              type: "tool_call",
              index: tc.index ?? 0,
              id: tc.id,
              name: tc.function?.name,
              args: tc.function?.arguments,
            };
          }
          if (choice.finish_reason) {
            yield { type: "finish", reason: choice.finish_reason };
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

async function describeFailure(res: Response): Promise<string> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      detail =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error?.message ?? text.slice(0, 200);
    } catch {
      detail = text.slice(0, 200);
    }
  } catch {
    /* body already consumed or empty */
  }

  if (res.status === 429) {
    return `rate limited — this site caps how much it will spend per visitor (${detail || "try again shortly"})`;
  }
  if (res.status === 401 || res.status === 403) {
    return `the model endpoint rejected the request (${res.status}${detail ? `: ${detail}` : ""})`;
  }
  return `model request failed (${res.status}${detail ? `: ${detail}` : ""})`;
}

/** Non-streaming convenience call, for short side questions like follow-up generation. */
export async function complete(
  req: Omit<ChatRequest, "tools">,
): Promise<string> {
  let text = "";
  for await (const delta of chat({ ...req })) {
    if (delta.type === "text") text += delta.text;
  }
  return text.trim();
}
