/* The interface, ported from `Ziyang Agent.dc.html`.
 *
 * It renders the transport's event stream and owns no timing of its own. Swap the
 * transport and this file does not change — which is the whole point of the contract in
 * src/agent/events.ts.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { AgentEvent, Transport } from "../agent/events";
import { initialState, reducer, type AgentMessage, type Segment } from "./state";
import "./agent.css";

const SEED_QUESTIONS = [
  "What has Ziyang built?",
  "What is he working on now?",
  "Tell me about his systems experience.",
  "What makes his background different?",
];

const FOOTER_NOTE =
  "Retrieval over his résumé, papers, repos and writing — plus live web search. The agent loop runs in your browser. Answers can be wrong; the sources are linked.";

interface Props {
  wordmark?: string;
  showSuggestions?: boolean;
  showUsage?: boolean;
  footerNote?: string;
  transport: Transport;
}

/* ------------------------------------------------------------------- wordmark tilt
 * Pointer-driven 3D tilt on ZIYANG. The transform is written straight to the node and
 * eased toward the target each frame — putting it in state would re-render the whole
 * thread at 60fps for a decoration. */
function useTilt() {
  const el = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const t = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;

    const loop = () => {
      t.x += (t.tx - t.x) * 0.09;
      t.y += (t.ty - t.y) * 0.09;
      const node = el.current;
      if (node) {
        node.style.transform =
          `rotateY(${(t.x * 46).toFixed(2)}deg) ` +
          `rotateX(${(-t.y * 28).toFixed(2)}deg) ` +
          `translateZ(${(Math.abs(t.x) * 26).toFixed(1)}px)`;
      }
      raf =
        Math.abs(t.tx - t.x) > 0.001 || Math.abs(t.ty - t.y) > 0.001
          ? requestAnimationFrame(loop)
          : 0;
    };

    const onPointer = (e: PointerEvent) => {
      const node = el.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      t.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      t.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
      if (!raf) raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return el;
}

/* --------------------------------------------------------------------- composer */

function Composer({
  value,
  placeholder,
  rows,
  busy,
  dock,
  onChange,
  onSend,
  onStop,
}: {
  value: string;
  placeholder: string;
  rows: number;
  busy: boolean;
  dock?: boolean;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const ta = useRef<HTMLTextAreaElement | null>(null);

  // The design caps the textarea at a max-height, which only means something if the
  // field grows. Reset to auto first so deleting text shrinks it again.
  useEffect(() => {
    const node = ta.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <div className={dock ? "composer composer--dock" : "composer"}>
      <textarea
        ref={ta}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      {busy ? (
        <button className="iconbtn" aria-label="Stop" onClick={onStop}>
          <span className="stop-square" />
        </button>
      ) : (
        <button
          className="iconbtn"
          aria-label="Send"
          disabled={!value.trim()}
          onClick={onSend}
        >
          <svg
            width={dock ? 15 : 16}
            height={dock ? 15 : 16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 13V3" />
            <path d="M3.5 7.5L8 3l4.5 4.5" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- activity */

function Activity({
  segment,
  running,
  status,
  onToggle,
}: {
  segment: Segment;
  running: boolean;
  status: string;
  onToggle: () => void;
}) {
  const segRunning = running && !segment.endedAt;
  const n = segment.items.length;
  const secs = ((segment.endedAt || Date.now()) - segment.startedAt) / 1000;
  const label = segRunning
    ? status || "Working"
    : `Ran ${n} ${n === 1 ? "step" : "steps"} · ${secs.toFixed(1)}s`;

  return (
    <div className="activity">
      <button
        className="act-toggle"
        onClick={onToggle}
        aria-expanded={segment.expanded}
      >
        <span className={segRunning ? "pulse pulse--live" : "pulse"} />
        <span>{label}</span>
        <span className={segment.expanded ? "chev chev--open" : "chev"}>›</span>
      </button>

      {segment.expanded && (
        <div className="act-items">
          {segment.items.map((it, i) => (
            <div className="act-item" key={it.id ?? i}>
              <span className={it.done ? "dot" : "dot dot--live"} />
              <div className="act-body">
                {it.kind === "reasoning" && (
                  <div className="reasoning">{it.text}</div>
                )}

                {it.kind === "tool" && (
                  <div className="tool">
                    <div className="tool-head">
                      <span className="tool-name">{it.name}</span>
                      <span className="tool-args">{it.args}</span>
                    </div>
                    {it.result && <div className="tool-result">{it.result}</div>}
                  </div>
                )}

                {it.kind === "subagent" && (
                  <div className="tool">
                    <div className="tool-head">
                      <span className="sub-label">sub-agent</span>
                      <span className="tool-name">{it.name}</span>
                      <span className="sub-task">{it.task}</span>
                    </div>
                    {it.result && <div className="tool-result">{it.result}</div>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ agent */

function AgentTurn({
  message,
  isLast,
  showUsage,
  onToggle,
  onFollowUp,
}: {
  message: AgentMessage;
  isLast: boolean;
  showUsage: boolean;
  onToggle: (segment: number) => void;
  onFollowUp: (text: string) => void;
}) {
  const running = message.phase !== "done";
  const u = message.usage;
  const usageLine = u
    ? [
        u.model,
        u.inputTokens != null ? `${(u.inputTokens / 1000).toFixed(1)}k in` : null,
        u.outputTokens != null ? `${u.outputTokens} out` : null,
        u.ms != null ? `${(u.ms / 1000).toFixed(1)}s` : null,
      ]
        .filter(Boolean)
        .join("  ·  ")
    : "";

  return (
    <div className="agent">
      {message.segments.map((seg, si) => (
        <div className="seg" key={si}>
          {seg.items.length > 0 && (
            <Activity
              segment={seg}
              running={running}
              status={message.status}
              onToggle={() => onToggle(si)}
            />
          )}
          {seg.text && (
            <div className="answer">
              {seg.text}
              {running && <span className="caret" />}
            </div>
          )}
        </div>
      ))}

      {message.error && <div className="err">{message.error}</div>}

      {message.sources.length > 0 && (
        <div className="sources">
          <span className="sources-label">Sources</span>
          {message.sources.map((src, i) => (
            <a
              className="source"
              key={`${src.url ?? src.label}-${i}`}
              href={src.url ?? "#"}
              target={src.url?.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
            >
              <span className="source-n">{i + 1}</span>
              <span>{src.label}</span>
            </a>
          ))}
        </div>
      )}

      {showUsage && usageLine && !running && (
        <div className="usage">{usageLine}</div>
      )}

      {isLast && !running && message.followUps.length > 0 && (
        <div className="followups">
          {message.followUps.map((label) => (
            <button
              className="followup"
              key={label}
              onClick={() => onFollowUp(label)}
            >
              <span className="arrow">→</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- root */

export default function ZiyangAgent({
  wordmark = "ZIYANG",
  showSuggestions = true,
  showUsage = true,
  footerNote = FOOTER_NOTE,
  transport,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const tiltRef = useTilt();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const cancelled = useRef(false);
  const busyRef = useRef(false);
  const [override, setOverride] = useState<Transport | null>(null);

  const active = override ?? transport;

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busyRef.current) return;
      busyRef.current = true;
      cancelled.current = false;
      stickToBottom.current = true;

      // History as the transport sees it: the turns before this question.
      const history = state.messages.map((m) => ({
        role: m.role,
        text: m.role === "user" ? m.text : agentText(m),
      }));

      dispatch({ type: "ask", text: q });

      const emit = (event: AgentEvent) => {
        if (!cancelled.current) dispatch({ type: "event", event });
      };

      try {
        await active({
          message: q,
          history,
          onEvent: emit,
          isCancelled: () => cancelled.current,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown error";
        emit({
          type: "error",
          message: `The agent stopped early: ${detail}. Try again, or ask something narrower.`,
        });
      }
      dispatch({ type: "event", event: { type: "done" } });
      dispatch({ type: "settle" });
      busyRef.current = false;
    },
    [active, state.messages],
  );

  const stop = useCallback(() => {
    cancelled.current = true;
    dispatch({ type: "event", event: { type: "done" } });
    dispatch({ type: "settle" });
    busyRef.current = false;
  }, []);

  const reset = useCallback(() => {
    cancelled.current = true;
    busyRef.current = false;
    dispatch({ type: "reset" });
  }, []);

  // External control surface: any host page, or a test, can drive the thread.
  useEffect(() => {
    window.ziyangAgent = {
      send: (t: string) => void send(t),
      stop,
      reset,
      setTransport: (fn: Transport) => setOverride(() => fn),
    };
    return () => {
      delete window.ziyangAgent;
    };
  }, [send, stop, reset]);

  // Follow the stream, but let go the moment the reader scrolls up to re-read something.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [state.messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const suggestions = useMemo(() => SEED_QUESTIONS, []);
  const lastIndex = state.messages.length - 1;

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-left">
          <div className="wordmark">{wordmark}</div>
          {state.started && (
            <button className="linkbtn" onClick={reset}>
              New thread
            </button>
          )}
        </div>
        <nav className="nav">
          <a href="/resume.pdf" target="_blank" rel="noreferrer">
            Résumé
          </a>
          <a
            href="https://github.com/ziyangliu-666"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/ziyangliu666"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
        </nav>
      </header>

      {!state.started ? (
        <main className="landing">
          <h1 className="h1">
            Ask anything about{" "}
            <span className="tilt" ref={tiltRef}>
              ZIYANG
            </span>
          </h1>

          <div className="composer-wrap">
            <Composer
              value={state.draft}
              placeholder="Ask anything about Ziyang…"
              rows={2}
              busy={false}
              onChange={(v) => dispatch({ type: "draft", value: v })}
              onSend={() => void send(state.draft)}
              onStop={stop}
            />

            {showSuggestions && (
              <div className="suggestions">
                {suggestions.map((label) => (
                  <button
                    className="chip"
                    key={label}
                    onClick={() => void send(label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="chat">
          <div className="scroll" ref={scrollRef} onScroll={onScroll}>
            <div className="thread">
              {state.messages.map((m, mi) =>
                m.role === "user" ? (
                  <div className="msg" key={mi}>
                    <div className="user-row">
                      <div className="user-bubble">{m.text}</div>
                    </div>
                  </div>
                ) : (
                  <div className="msg" key={mi}>
                    <AgentTurn
                      message={m}
                      isLast={mi === lastIndex}
                      showUsage={showUsage}
                      onToggle={(segment) =>
                        dispatch({ type: "toggle", message: mi, segment })
                      }
                      onFollowUp={(text) => void send(text)}
                    />
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="dock">
            <Composer
              value={state.draft}
              placeholder="Ask a follow-up…"
              rows={1}
              busy={state.busy}
              dock
              onChange={(v) => dispatch({ type: "draft", value: v })}
              onSend={() => void send(state.draft)}
              onStop={stop}
            />
            <div className="footnote">{footerNote}</div>
          </div>
        </main>
      )}
    </div>
  );
}

/** The visible answer of an agent turn, for history sent back to the model. */
function agentText(m: AgentMessage): string {
  return m.segments
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n");
}

declare global {
  interface Window {
    ziyangAgent?: {
      send: (text: string) => void;
      stop: () => void;
      reset: () => void;
      setTransport: (fn: Transport) => void;
    };
  }
}
