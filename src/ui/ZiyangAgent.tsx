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
import { Markdown } from "./markdown";
import "./agent.css";

const SEED_QUESTIONS = [
  "What has Ziyang built?",
  "What is he working on now?",
  "Tell me about his systems experience.",
  "What makes his background different?",
];

const FOOTER_NOTE =
  "Retrieval over his résumé, papers, repos and writing — plus live web search. The agent loop runs in your browser. Answers can be wrong; the sources are linked.";

/* A build with no model configured answers from a handful of canned replies. Saying that
 * is better than a footnote promising retrieval and web search that cannot happen. */
const OFFLINE_NOTE =
  "This build has no model configured, so it is answering from a few canned replies. The résumé linked above is the real thing.";

interface Props {
  wordmark?: string;
  showSuggestions?: boolean;
  showUsage?: boolean;
  footerNote?: string;
  /** False when no model is reachable, which changes what the footnote may claim. */
  live?: boolean;
  transport: Transport;
}

/* ------------------------------------------------------------------- wordmark tilt
 * Pointer-driven 3D tilt on ZIYANG, plus the refraction that makes it read as a solid
 * pane of glass rather than a rotating label: two faint chromatic ghosts that separate
 * with the angle, and a specular sheen that sweeps across as the face turns.
 *
 * Everything is written straight to the node's style and CSS custom properties, eased
 * toward the target each frame. Putting it in React state would re-render the thread at
 * 60fps for a decoration.
 *
 * Reduce-motion is honoured by dropping the easing, not the effect. The rotation is the
 * reader's own pointer movement rendered back to them — the vestibular problem is motion
 * they did not ask for, so what gets removed is the animated glide, not the response. */
function useTilt() {
  const el = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ease = calm ? 1 : 0.09;

    const t = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;

    const paint = () => {
      const node = el.current;
      if (!node) return;
      const rotY = t.x * 46;
      const rotX = -t.y * 28;
      node.style.transform =
        `rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg) ` +
        `translateZ(${(Math.abs(t.x) * 26).toFixed(1)}px)`;
      // Chromatic separation grows with how far off-axis the face is turned, the way an
      // edge-lit pane splits light it passes at a steep angle.
      const split = Math.abs(t.x) * 3.2 + Math.abs(t.y) * 1.1;
      node.style.setProperty("--split", `${split.toFixed(2)}px`);
      node.style.setProperty("--split-sign", t.x < 0 ? "-1" : "1");
      // The highlight travels the opposite way to the rotation, so the glint stays put in
      // the room while the letters turn through it.
      node.style.setProperty("--sheen", `${(50 - t.x * 55).toFixed(1)}%`);
      node.style.setProperty(
        "--sheen-strength",
        Math.min(0.5, 0.06 + Math.abs(t.x) * 0.42).toFixed(3),
      );
    };

    const loop = () => {
      t.x += (t.tx - t.x) * ease;
      t.y += (t.ty - t.y) * ease;
      paint();
      raf =
        Math.abs(t.tx - t.x) > 0.001 || Math.abs(t.ty - t.y) > 0.001
          ? requestAnimationFrame(loop)
          : 0;
    };

    const track = (clientX: number, clientY: number) => {
      const node = el.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      t.tx = Math.max(-1, Math.min(1, (clientX - cx) / (window.innerWidth / 2)));
      t.ty = Math.max(-1, Math.min(1, (clientY - cy) / (window.innerHeight / 2)));
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const onPointer = (e: PointerEvent) => track(e.clientX, e.clientY);

    /* Touch has no hover, so the wordmark would sit flat on a phone forever. Tilting it
     * with the device instead keeps the effect on the surface where most visitors are. */
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      t.tx = Math.max(-1, Math.min(1, e.gamma / 45));
      t.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
      if (!raf) raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onOrient);
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
              <Markdown text={seg.text} caret={running} />
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
  live = true,
  footerNote = live ? FOOTER_NOTE : OFFLINE_NOTE,
  transport,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const tiltRef = useTilt();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const cancelled = useRef(false);
  const busyRef = useRef(false);
  const [override, setOverride] = useState<Transport | null>(null);

  /* Every turn takes a number, and stop/reset/a new question all bump it. A transport
   * cannot be forced to return the instant it is cancelled — it stops at its next poll —
   * so without this a stopped turn's tail events land on the turn that replaced it, and
   * its final `done` marks the new answer complete while it is still streaming. */
  const turn = useRef(0);

  const active = override ?? transport;

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busyRef.current) return;
      const myTurn = ++turn.current;
      const current = () => turn.current === myTurn;
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
        if (current() && !cancelled.current) dispatch({ type: "event", event });
      };

      try {
        await active({
          message: q,
          history,
          onEvent: emit,
          isCancelled: () => !current() || cancelled.current,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown error";
        emit({
          type: "error",
          message: `The agent stopped early: ${detail}. Try again, or ask something narrower.`,
        });
      }

      if (!current()) return; // stopped, reset, or superseded — that turn already settled
      dispatch({ type: "event", event: { type: "done" } });
      dispatch({ type: "settle" });
      busyRef.current = false;
    },
    [active, state.messages],
  );

  const stop = useCallback(() => {
    turn.current++;
    cancelled.current = true;
    dispatch({ type: "event", event: { type: "done" } });
    dispatch({ type: "settle" });
    busyRef.current = false;
  }, []);

  const reset = useCallback(() => {
    turn.current++;
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
