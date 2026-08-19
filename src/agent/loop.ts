/* The agent loop. Runs in the browser.
 *
 * call the model → stream deltas out as events → if it asked for tools, run them and
 * loop → otherwise the answer is done. Sub-agents are the same loop with a smaller tool
 * set and a smaller budget.
 *
 * The loop's only job besides control flow is translation: provider deltas in, contract
 * events out (src/agent/events.ts). Nothing here knows what DeepSeek's wire format looks
 * like, and nothing here knows what the UI looks like.
 */

import type { Corpus } from "../rag/corpus";
import { LIMITS, MODELS } from "./config";
import type { AgentEvent, Source } from "./events";
import { FOLLOWUP_PROMPT, subagentPrompt, systemPrompt } from "./prompt";
import { chat, complete, type ChatMessage, type ToolCall } from "./provider";
import {
  SUBAGENT_TOOLS,
  TOOLS,
  specsFor,
  type ToolContext,
  type ToolDef,
} from "./tools";

export interface RunOptions {
  question: string;
  history: { role: string; text: string }[];
  corpus: Corpus;
  emit: (ev: AgentEvent) => void;
  isCancelled: () => boolean;
}

interface Accumulating {
  id?: string;
  name?: string;
  args: string;
}

/** Assemble streamed tool-call fragments, which arrive split across deltas by index. */
class ToolCallBuffer {
  private byIndex = new Map<number, Accumulating>();

  add(index: number, part: { id?: string; name?: string; args?: string }) {
    const entry = this.byIndex.get(index) ?? { args: "" };
    if (part.id) entry.id = part.id;
    if (part.name) entry.name = part.name;
    if (part.args) entry.args += part.args;
    this.byIndex.set(index, entry);
  }

  finish(): ToolCall[] {
    return [...this.byIndex.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, e]) => e.name)
      .map(([index, e]) => ({
        id: e.id ?? `call_${index}`,
        type: "function" as const,
        function: { name: e.name!, arguments: e.args || "{}" },
      }));
  }

  get size(): number {
    return this.byIndex.size;
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Prior turns, trimmed. Assistant turns carry only the visible answer, not the tools. */
function replayHistory(history: { role: string; text: string }[]): ChatMessage[] {
  return history
    .slice(-LIMITS.historyTurns * 2)
    .filter((m) => m.text.trim())
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));
}

export async function runAgent(o: RunOptions): Promise<void> {
  const { corpus, emit, isCancelled } = o;
  const controller = new AbortController();
  const t0 = Date.now();

  const sources: Source[] = [];
  const addSources = (items?: Source[]) => {
    for (const s of items ?? []) {
      const key = s.url ?? s.label;
      if (!sources.some((x) => (x.url ?? x.label) === key)) sources.push(s);
    }
  };

  let inputTokens = 0;
  let outputTokens = 0;
  let subagents = 0;
  let answer = "";

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(corpus) },
    ...replayHistory(o.history),
    { role: "user", content: o.question },
  ];

  const stop = () => {
    if (isCancelled()) {
      controller.abort();
      return true;
    }
    return false;
  };

  emit({ type: "status", text: "Thinking" });

  try {
    let answered = false;

    for (let iteration = 0; iteration < LIMITS.maxIterations; iteration++) {
      if (stop()) return;

      const calls = new ToolCallBuffer();
      let text = "";
      let reasoningOpen = false;
      let truncated = false;

      for await (const delta of chat({
        model: MODELS.main,
        messages,
        tools: specsFor(TOOLS),
        thinking: true,
        /* Medium on the opening round, low after it. The opening round is the one with a real
         * decision in it: which tools to call, and with which keywords, against an index the
         * model cannot see. Every later round already holds the retrieved text, so the only
         * choices left are "search once more" and "which shape fits", and both are one line of
         * thinking. Medium on the final round has nothing to spend the budget on, and it spent
         * it drafting the answer in full before writing it. */
        effort: iteration === 0 ? "medium" : "low",
        maxTokens: LIMITS.maxTokens,
        signal: controller.signal,
      })) {
        if (stop()) return;

        switch (delta.type) {
          case "reasoning":
            reasoningOpen = true;
            emit({ type: "reasoning_delta", text: delta.text });
            break;

          case "text":
            if (reasoningOpen) {
              emit({ type: "reasoning_end" });
              reasoningOpen = false;
            }
            text += delta.text;
            emit({ type: "text_delta", text: delta.text });
            break;

          case "tool_call":
            calls.add(delta.index, delta);
            break;

          case "usage":
            inputTokens += delta.inputTokens ?? 0;
            outputTokens += delta.outputTokens ?? 0;
            break;

          case "finish":
            /* "length" means the model was cut off at max_tokens. On DeepSeek that budget
             * covers reasoning_content and the answer together, so a long deliberation can
             * consume all of it and leave nothing to say. Discarding this reason cost a
             * visitor a whole answer: the run emitted no tool calls, the check below read
             * that as "it has finished", and the retry built for exactly this case never
             * fired. */
            truncated = delta.reason === "length";
            break;
        }
      }

      if (reasoningOpen) emit({ type: "reasoning_end" });
      answer += text;

      const toolCalls = calls.finish();
      if (!toolCalls.length) {
        /* No tool calls and no text is not an answer. Leave `answered` false so the
         * tools-withheld retry below runs, which is the recovery path. */
        answered = Boolean(text.trim()) || !truncated;
        break;
      }

      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls,
      });

      // Run this round's tools together — the model asked for them in one turn because
      // they do not depend on each other.
      const results = await Promise.all(
        toolCalls.map(async (call) => {
          const def: ToolDef | undefined = TOOLS[call.function.name];
          const args = parseArgs(call.function.arguments);

          if (!def) {
            return {
              call,
              result: `No tool named "${call.function.name}". Available: ${Object.keys(TOOLS).join(", ")}.`,
            };
          }

          const isSub = def.activity === "subagent";
          const display = safeDisplay(def, args);

          if (isSub) {
            emit({
              type: "subagent_start",
              id: call.id,
              name: String(args.name ?? "sub-agent"),
              task: display,
            });
          } else {
            emit({
              type: "tool_start",
              id: call.id,
              name: call.function.name,
              args: display,
            });
          }

          const ctx: ToolContext = {
            corpus,
            signal: controller.signal,
            callId: call.id,
            subagentsUsed: () => subagents,
            runSubagent: async (name, task, callId) => {
              subagents++;
              return runSubagent({
                name,
                task,
                callId,
                corpus,
                emit,
                signal: controller.signal,
                isCancelled,
                onUsage: (i, out) => {
                  inputTokens += i;
                  outputTokens += out;
                },
              });
            },
          };

          try {
            const outcome = await def.run(args, ctx);
            addSources(outcome.sources);
            emit(
              isSub
                ? {
                    type: "subagent_end",
                    id: call.id,
                    status: "ok",
                    result: outcome.display ?? outcome.result.slice(0, 140),
                  }
                : {
                    type: "tool_end",
                    id: call.id,
                    status: "ok",
                    result: outcome.display ?? outcome.result.slice(0, 140),
                  },
            );
            return { call, result: outcome.result };
          } catch (err) {
            if (controller.signal.aborted) throw err;
            const message = err instanceof Error ? err.message : String(err);
            emit(
              isSub
                ? { type: "subagent_end", id: call.id, status: "error", result: message }
                : { type: "tool_end", id: call.id, status: "error", result: message },
            );
            // Hand the failure back rather than aborting: the model can try another way.
            return { call, result: `Tool failed: ${message}` };
          }
        }),
      );

      for (const { call, result } of results) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
    }

    /* No answer written, because the tool rounds ran out or a pass was truncated. Ask once
     * more with tools withheld and thinking off, so the visitor gets a conclusion from what
     * was already retrieved instead of a column of activity rows and nothing under them.
     *
     * Thinking off is the load-bearing part. If the previous pass died because reasoning ate
     * the whole token budget, repeating it with reasoning on would fail the same way. */
    if ((!answered || !answer.trim()) && !stop()) {
      emit({ type: "status", text: "Wrapping up" });
      messages.push({
        role: "user",
        content:
          "Answer now, in prose, from what you already retrieved. Do not call another tool. Say plainly anything you could not confirm.",
      });

      for await (const delta of chat({
        model: MODELS.main,
        messages,
        thinking: false,
        maxTokens: LIMITS.retryMaxTokens,
        signal: controller.signal,
      })) {
        if (stop()) return;
        if (delta.type === "text") {
          answer += delta.text;
          emit({ type: "text_delta", text: delta.text });
        } else if (delta.type === "usage") {
          inputTokens += delta.inputTokens ?? 0;
          outputTokens += delta.outputTokens ?? 0;
        }
      }
    }

    if (stop()) return;

    if (!answer.trim()) {
      emit({
        type: "text_delta",
        text: "I could not put an answer together for that one. Try asking it a different way, or read the résumé linked at the top.",
      });
    }

    if (sources.length) emit({ type: "sources", items: sources });

    emit({
      type: "usage",
      model: MODELS.main,
      inputTokens,
      outputTokens,
      ms: Date.now() - t0,
    });

    if (answer.trim()) {
      const followUps = await deriveFollowUps(
        o.question,
        answer,
        controller.signal,
      ).catch(() => []);
      if (followUps.length && !isCancelled()) {
        emit({ type: "suggestions", items: followUps });
      }
    }
  } finally {
    controller.abort();
  }
}

function safeDisplay(def: ToolDef, args: Record<string, unknown>): string {
  try {
    return def.display(args);
  } catch {
    return "";
  }
}

/* -------------------------------------------------------------------- sub-agent */

interface SubagentOptions {
  name: string;
  task: string;
  callId: string;
  corpus: Corpus;
  emit: (ev: AgentEvent) => void;
  signal: AbortSignal;
  isCancelled: () => boolean;
  onUsage: (input: number, output: number) => void;
}

async function runSubagent(o: SubagentOptions): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: subagentPrompt() },
    { role: "user", content: o.task },
  ];

  let report = "";

  for (let i = 0; i < LIMITS.maxSubagentIterations; i++) {
    if (o.isCancelled()) break;

    const calls = new ToolCallBuffer();
    let text = "";

    for await (const delta of chat({
      model: MODELS.fast,
      messages,
      tools: specsFor(SUBAGENT_TOOLS),
      thinking: false,
      maxTokens: LIMITS.subagentMaxTokens,
      signal: o.signal,
    })) {
      if (o.isCancelled()) break;
      if (delta.type === "text") text += delta.text;
      else if (delta.type === "tool_call") calls.add(delta.index, delta);
      else if (delta.type === "usage") {
        o.onUsage(delta.inputTokens ?? 0, delta.outputTokens ?? 0);
      }
    }

    report += text;
    const toolCalls = calls.finish();
    if (!toolCalls.length) break;

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const def = SUBAGENT_TOOLS[call.function.name];
      const args = parseArgs(call.function.arguments);
      if (!def) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Sub-agents may only use: ${Object.keys(SUBAGENT_TOOLS).join(", ")}.`,
        });
        continue;
      }

      // The visitor sees the sub-agent's progress on its own row, not as extra rows.
      o.emit({
        type: "subagent_step",
        id: o.callId,
        result: `${call.function.name} ${safeDisplay(def, args)}`,
      });

      try {
        const outcome = await def.run(args, {
          corpus: o.corpus,
          signal: o.signal,
          callId: o.callId,
          subagentsUsed: () => LIMITS.maxSubagents, // no nesting
          runSubagent: async () => "Sub-agents cannot spawn sub-agents.",
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: outcome.result,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Tool failed: ${message}`,
        });
      }
    }
  }

  const trimmed = report.trim();
  return trimmed || "The sub-agent found nothing usable in the index for that task.";
}

/* ------------------------------------------------------------------ follow-ups */

async function deriveFollowUps(
  question: string,
  answer: string,
  signal: AbortSignal,
): Promise<string[]> {
  const text = await complete({
    model: MODELS.fast,
    thinking: false,
    maxTokens: 120,
    signal,
    messages: [
      { role: "system", content: FOLLOWUP_PROMPT },
      {
        role: "user",
        content: `Question: ${question}\n\nAnswer: ${answer.slice(0, 1500)}`,
      },
    ],
  });

  return text
    .split("\n")
    .map((l) => l.replace(/^[-•\d.\s"']+/, "").replace(/["']$/, "").trim())
    .filter((l) => l.length > 8 && l.length < 90)
    // The prompt asks for the third person and the model still slips into addressing
    // Ziyang directly — "your error analysis cases" — which reads as though the visitor
    // were talking to him. Dropping those is better than rewriting them: one good
    // suggestion, or none, beats a grammatically mangled one.
    .filter((l) => !/\b(you|your|yours|yourself)\b/i.test(l) && !/[你您]/.test(l))
    .slice(0, 2);
}
