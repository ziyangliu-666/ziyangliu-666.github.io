/* The transport contract, copied from the design's agent-transport.js.
 *
 * The UI renders events; it never invents them. Anything that wants to drive the thread —
 * the real harness, the mock, a test — implements `Transport` and emits these events in
 * arrival order. Do not add fields the UI does not read, and do not change the names:
 * the interface was designed against exactly this vocabulary.
 *
 *   { type: 'status',         text }                   one-line "what I'm doing" label
 *   { type: 'reasoning_delta',text }                   extended thinking, streamed
 *   { type: 'reasoning_end' }
 *   { type: 'tool_start',     id, name, args }         args: short display string
 *   { type: 'tool_delta',     id, text }               partial tool output (optional)
 *   { type: 'tool_end',       id, status, result }
 *   { type: 'subagent_start', id, name, task }
 *   { type: 'subagent_step',  id, result }
 *   { type: 'subagent_end',   id, status, result }
 *   { type: 'text_delta',     text }                   answer tokens
 *   { type: 'sources',        items }
 *   { type: 'suggestions',    items }
 *   { type: 'usage',          model, inputTokens, outputTokens, ms }
 *   { type: 'error',          message }
 *   { type: 'done' }
 *
 * A tool_start after text has already streamed opens a new segment in the UI, so
 * interleaved tool → text → tool turns render correctly.
 */

export interface Source {
  label: string;
  url?: string;
}

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "reasoning_end" }
  | { type: "tool_start"; id: string; name: string; args?: string }
  | { type: "tool_delta"; id: string; text: string }
  | { type: "tool_end"; id: string; status: "ok" | "error"; result?: string }
  | { type: "subagent_start"; id: string; name: string; task?: string }
  | { type: "subagent_step"; id: string; result?: string }
  | { type: "subagent_end"; id: string; status: "ok" | "error"; result?: string }
  | { type: "text_delta"; text: string }
  | { type: "sources"; items: Source[] }
  | { type: "suggestions"; items: string[] }
  | {
      type: "usage";
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      ms?: number;
    }
  | { type: "error"; message: string }
  | { type: "done" };

export interface TransportRequest {
  message: string;
  history: { role: string; text: string }[];
  onEvent: (ev: AgentEvent) => void;
  isCancelled: () => boolean;
}

export type Transport = (req: TransportRequest) => Promise<void>;
