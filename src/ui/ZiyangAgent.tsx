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
import { startFavicon } from "./favicon";
import { Stickers } from "./Stickers";
import "./agent.css";

/* Four openers a visitor can ask on arrival, knowing nothing.
 *
 * The first set asked about transfer throughput going from 70 to 290 MB/s, what the
 * copy-as-decode paper proves, and how the wallet's consent gate is implemented. Every one of
 * those is a question you can only think of after you already know the answer exists. They
 * demonstrated the agent's range to someone who did not need the demonstration, and told a
 * recruiter opening the page cold that they were in the wrong place.
 *
 * These still cover four different capabilities — a summary, a chronology, current work, and
 * reading the live repositories — because a visitor learns more from what the openers imply is
 * answerable than from any description of the site. The difference is that each one is now a
 * question a stranger would actually have. */
const SEED_QUESTIONS = [
  "Who is Ziyang?",
  "Walk me through his career.",
  "What is he researching?",
  "Show me some of his actual code.",
];

/** Sources shown before the list is folded. */
const SOURCE_LIMIT = 12;

/* One sentence. The earlier version listed what the index holds and where the loop runs, which
 * is all true and none of it the reader's problem: a visitor can ask the agent either question.
 * What a footnote owes them is the caveat they cannot discover for themselves. */
const FOOTER_NOTE = "Answers can be wrong; the sources are linked.";

/* A build with no model configured answers from a handful of canned replies. Saying that
 * is better than a footnote promising retrieval and web search that cannot happen. */
const OFFLINE_NOTE = "No model configured, so these are canned replies. The resume above is real.";

interface Props {
  wordmark?: string;
  showSuggestions?: boolean;
  showUsage?: boolean;
  footerNote?: string;
  /** False when no model is reachable, which changes what the footnote may claim. */
  live?: boolean;
  transport: Transport;
}

/* ----------------------------------------------------------------------- rays
 * The background line field answers the pointer on three axes. Vertical position sets the gap
 * and slides the field along its own normal, so moving down spreads the lines and pushes them
 * past you. Horizontal position tilts the field.
 *
 * Same shape as useSheen: custom properties written straight to the node, eased in a rAF loop,
 * never in React state. The easing is far slower than the sheen's 0.12 on purpose. The sheen is
 * a highlight the eye expects to keep up with the cursor; this is a room the page sits in, and
 * a room that answers instantly reads as a gimmick.
 *
 * Lines are a hard 2px, so the gap can run tighter than it could when each one carried a
 * soft shoulder and neighbours merged into haze. */
const GAP_NEAR = 54;
const GAP_FAR = 22;
const TILT = 11;

function useRays(el: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ease = calm ? 1 : 0.032;

    let gap = 32;
    let slide = 0;
    let angle = 0;
    let toGap = 32;
    let toSlide = 0;
    let toAngle = 0;
    let raf = 0;

    const loop = () => {
      gap += (toGap - gap) * ease;
      slide += (toSlide - slide) * ease;
      angle += (toAngle - angle) * ease;
      const node = el.current;
      if (node) {
        node.style.setProperty("--gap", `${gap.toFixed(2)}px`);
        node.style.setProperty("--slide", `${slide.toFixed(1)}px`);
        node.style.setProperty("--angle", `${angle.toFixed(2)}deg`);
      }
      raf =
        Math.abs(toGap - gap) > 0.04 ||
        Math.abs(toSlide - slide) > 0.3 ||
        Math.abs(toAngle - angle) > 0.02
          ? requestAnimationFrame(loop)
          : 0;
    };

    const onPointer = (e: PointerEvent) => {
      const down = e.clientY / Math.max(1, window.innerHeight);
      const across = e.clientX / Math.max(1, window.innerWidth);
      // Top of the screen is the far field, bottom is the near field.
      toGap = GAP_FAR + down * (GAP_NEAR - GAP_FAR);
      toSlide = down * 260 - 130;
      toAngle = (across * 2 - 1) * TILT;
      if (!raf) raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [el]);
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
  const [allSources, setAllSources] = useState(false);
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
              {/* Only the live segment carries the cursor. `running` alone put one at the end
                  of every segment, so the moment the model wrote a paragraph and then reached
                  for a tool, that finished paragraph kept blinking for the rest of the turn. */}
              <Markdown
                text={seg.text}
                caret={running && si === message.segments.length - 1}
              />
            </div>
          )}
        </div>
      ))}

      {message.error && <div className="err">{message.error}</div>}

      {message.sources.length > 0 && (
        <div className="sources">
          <span className="sources-label">Sources</span>
          {(allSources ? message.sources : message.sources.slice(0, SOURCE_LIMIT)).map(
            (src, i) => (
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
            ),
          )}
          {/* A deep question can touch twenty-odd files. Hiding none of them is honest but
              unreadable, so the count stays visible and the rest are one click away. */}
          {!allSources && message.sources.length > SOURCE_LIMIT && (
            <button className="source source--more" onClick={() => setAllSources(true)}>
              +{message.sources.length - SOURCE_LIMIT} more
            </button>
          )}
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
  showUsage = false,
  live = true,
  footerNote = live ? FOOTER_NOTE : OFFLINE_NOTE,
  transport,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const cancelled = useRef(false);
  const appRef = useRef<HTMLDivElement | null>(null);
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

  /* The tab icon spins while a turn is in flight. Reading `busyRef` through a getter rather
   * than passing a boolean keeps this effect out of the render path: the icon loop starts once
   * and polls, instead of being torn down and rebuilt on every token that arrives. */
  useEffect(() => startFavicon(() => (busyRef.current ? "busy" : "idle")), []);

  useRays(appRef);

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
    <div className="app" ref={appRef}>
      <header className="hdr">
        <div className="hdr-left">
          {/* The wordmark is the way back to the start, the way a masthead is on any site.
              A separate "New thread" button said the same thing twice. */}
          {state.started ? (
            <button
              className="wordmark wordmark--home"
              onClick={reset}
              title="Start a new thread"
            >
              {wordmark}
            </button>
          ) : (
            <div className="wordmark">{wordmark}</div>
          )}
        </div>
        <nav className="nav">
          {/* Plain "Resume", as the design has it. The accents read as noise beside
              "GitHub" and "LinkedIn" at 13.5px. */}
          <a href="/resume.pdf" target="_blank" rel="noreferrer">
            Resume
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
          <Stickers onPick={(q) => void send(q)} />

          <h1 className="h1">
            Ask anything about{" "}
            <span className="tilt">
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
