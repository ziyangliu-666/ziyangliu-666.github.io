/* Thread state and the event reducer.
 *
 * Ported from the `apply(ev)` / `segments()` / `patch()` methods of the design's
 * DCLogic class, with one deliberate change: the original mutated activity items in
 * place (`prev.text += ev.text`). React's StrictMode invokes reducers twice in
 * development, which would double every streamed character, so every write here is a
 * copy. The state shapes and the branching are otherwise identical.
 *
 * The one non-obvious rule, and the reason segments exist at all: a tool call that
 * arrives *after* text has streamed opens a NEW segment. That is what lets a turn read
 * as "thought, called a tool, answered, called another tool, answered again" instead of
 * collapsing into one activity blob.
 */

import type { AgentEvent, Source } from "../agent/events";

export interface ActivityItem {
  kind: "reasoning" | "tool" | "subagent";
  id?: string;
  name?: string;
  args?: string;
  task?: string;
  text?: string;
  result?: string;
  done: boolean;
  failed?: boolean;
}

export interface Segment {
  items: ActivityItem[];
  text: string;
  expanded: boolean;
  startedAt: number;
  endedAt: number;
}

export interface Usage {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  ms?: number;
}

export interface UserMessage {
  role: "user";
  text: string;
}

export interface AgentMessage {
  role: "agent";
  segments: Segment[];
  status: string;
  phase: "running" | "done";
  sources: Source[];
  followUps: string[];
  usage: Usage | null;
  error: string;
  startedAt: number;
}

export type Message = UserMessage | AgentMessage;

export interface State {
  started: boolean;
  messages: Message[];
  draft: string;
  busy: boolean;
}

export type Action =
  | { type: "draft"; value: string }
  | { type: "ask"; text: string }
  | { type: "event"; event: AgentEvent }
  | { type: "settle" }
  | { type: "reset" }
  | { type: "toggle"; message: number; segment: number };

export const initialState: State = {
  started: false,
  messages: [],
  draft: "",
  busy: false,
};

function freshSegment(expanded: boolean): Segment {
  return {
    items: [],
    text: "",
    expanded,
    startedAt: Date.now(),
    endedAt: 0,
  };
}

function newAgentMessage(): AgentMessage {
  return {
    role: "agent",
    segments: [],
    status: "",
    phase: "running",
    sources: [],
    followUps: [],
    usage: null,
    error: "",
    startedAt: Date.now(),
  };
}

/** Copy the segment list, guaranteeing a live last segment to write into. */
function openSegment(
  m: AgentMessage,
  opts: { newIfText?: boolean } = {},
): { segs: Segment[]; last: Segment } {
  const segs = m.segments.map((s) => ({ ...s, items: s.items.slice() }));
  let last = segs[segs.length - 1];
  if (!last || (opts.newIfText && last.text)) {
    last = freshSegment(true);
    segs.push(last);
  }
  return { segs, last };
}

function replaceLast(segs: Segment[], last: Segment): Segment[] {
  segs[segs.length - 1] = last;
  return segs;
}

/** Update the activity item carrying `id`, wherever it lives. */
function patchItem(
  m: AgentMessage,
  id: string,
  fn: (item: ActivityItem) => ActivityItem,
): Segment[] {
  return m.segments.map((seg) => ({
    ...seg,
    items: seg.items.map((it) => (it.id === id ? fn(it) : it)),
  }));
}

function applyEvent(m: AgentMessage, ev: AgentEvent): AgentMessage {
  switch (ev.type) {
    case "status":
      return { ...m, status: ev.text };

    case "reasoning_delta": {
      const { segs, last } = openSegment(m, { newIfText: true });
      const prev = last.items[last.items.length - 1];
      const items = last.items.slice();
      if (prev && prev.kind === "reasoning" && !prev.done) {
        items[items.length - 1] = { ...prev, text: (prev.text ?? "") + ev.text };
      } else {
        items.push({ kind: "reasoning", text: ev.text, done: false });
      }
      return {
        ...m,
        segments: replaceLast(segs, { ...last, items }),
        status: m.status || "Thinking",
      };
    }

    case "reasoning_end": {
      const { segs, last } = openSegment(m);
      const prev = last.items[last.items.length - 1];
      if (!prev || prev.kind !== "reasoning") return m;
      const items = last.items.slice();
      items[items.length - 1] = { ...prev, done: true };
      return { ...m, segments: replaceLast(segs, { ...last, items }) };
    }

    case "tool_start": {
      const { segs, last } = openSegment(m, { newIfText: true });
      const items = last.items.concat({
        kind: "tool",
        id: ev.id,
        name: ev.name,
        args: ev.args ?? "",
        result: "",
        done: false,
      });
      return {
        ...m,
        segments: replaceLast(segs, { ...last, items }),
        status: ev.name,
      };
    }

    case "tool_delta":
      return {
        ...m,
        segments: patchItem(m, ev.id, (it) => ({
          ...it,
          result: (it.result ?? "") + ev.text,
        })),
      };

    case "tool_end":
      return {
        ...m,
        segments: patchItem(m, ev.id, (it) => ({
          ...it,
          result: ev.result ?? it.result,
          done: true,
          failed: ev.status === "error",
        })),
      };

    case "subagent_start": {
      const { segs, last } = openSegment(m, { newIfText: true });
      const items = last.items.concat({
        kind: "subagent",
        id: ev.id,
        name: ev.name,
        task: ev.task ?? "",
        result: "",
        done: false,
      });
      return {
        ...m,
        segments: replaceLast(segs, { ...last, items }),
        status: ev.name,
      };
    }

    case "subagent_step":
      return {
        ...m,
        segments: patchItem(m, ev.id, (it) => ({
          ...it,
          result: ev.result ?? it.result,
        })),
      };

    case "subagent_end":
      return {
        ...m,
        segments: patchItem(m, ev.id, (it) => ({
          ...it,
          result: ev.result ?? it.result,
          done: true,
          failed: ev.status === "error",
        })),
      };

    case "text_delta": {
      const segs = m.segments.map((s) => ({ ...s, items: s.items.slice() }));
      let last = segs[segs.length - 1];
      if (!last) {
        last = freshSegment(false);
        segs.push(last);
      }
      // First token of the answer collapses the activity above it and stops its clock.
      if (!last.text) last = { ...last, expanded: false, endedAt: Date.now() };
      last = { ...last, text: last.text + ev.text };
      return { ...m, segments: replaceLast(segs, last), status: "" };
    }

    case "sources":
      return { ...m, sources: ev.items ?? [] };

    case "suggestions":
      return { ...m, followUps: ev.items ?? [] };

    case "usage":
      return {
        ...m,
        usage: {
          model: ev.model,
          inputTokens: ev.inputTokens,
          outputTokens: ev.outputTokens,
          ms: ev.ms,
        },
      };

    case "error":
      return { ...m, error: ev.message, phase: "done" };

    case "done":
      return {
        ...m,
        phase: "done",
        status: "",
        segments: m.segments.map((s) =>
          s.endedAt ? s : { ...s, endedAt: Date.now() },
        ),
      };

    default:
      return m;
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "draft":
      return { ...state, draft: action.value };

    case "ask":
      return {
        started: true,
        draft: "",
        busy: true,
        messages: state.messages.concat(
          { role: "user", text: action.text },
          newAgentMessage(),
        ),
      };

    case "event": {
      const i = state.messages.length - 1;
      const last = state.messages[i];
      if (!last || last.role !== "agent") return state;
      const messages = state.messages.slice();
      messages[i] = applyEvent(last, action.event);
      return { ...state, messages };
    }

    case "settle":
      return { ...state, busy: false };

    case "reset":
      return { ...initialState };

    case "toggle": {
      const messages = state.messages.slice();
      const m = messages[action.message];
      if (!m || m.role !== "agent") return state;
      const segments = m.segments.slice();
      const seg = segments[action.segment];
      if (!seg) return state;
      segments[action.segment] = { ...seg, expanded: !seg.expanded };
      messages[action.message] = { ...m, segments };
      return { ...state, messages };
    }

    default:
      return state;
  }
}
