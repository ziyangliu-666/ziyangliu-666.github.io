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

/* Each of these demonstrates a different thing the agent can actually do — breadth, a
 * number buried in the résumé, a paper's real result, and reading live code — rather than
 * four phrasings of "tell me about yourself". A visitor learns more from what the openers
 * imply is answerable than from any description of the site. */
const SEED_QUESTIONS = [
  "What has Ziyang built?",
  "How did he take transfer throughput from 70 to 290 MB/s?",
  "What does the copy-as-decode paper actually prove?",
  "Show me how the wallet's consent gate is implemented.",
];

/** Sources shown before the list is folded. */
const SOURCE_LIMIT = 12;

/* Plain "resume", for the same reason the nav says it: the ported design writes it without
 * the accents, and the accented form pulls the eye to the one word in the sentence that
 * least needs the attention. No em dash either, because the answers are held to a rule that
 * bans one and the interface should not break it in the footnote underneath them. */
const FOOTER_NOTE =
  "Retrieval over his resume, papers and repositories, plus live web search. The agent loop runs in your browser. Answers can be wrong; the sources are linked.";

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

/* ---------------------------------------------------------------- wordmark sheen
 * A highlight that follows the pointer across ZIYANG. The word itself does not move: only
 * the light on it does, tracking horizontally, eased so it trails the cursor slightly
 * rather than snapping to it.
 *
 * Written straight to a CSS custom property on the node. Putting it in React state would
 * re-render the whole thread at 60fps for a decoration. */
function useSheen() {
  const el = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return; // no pointer to follow
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ease = calm ? 1 : 0.12;

    let at = 50;
    let target = 50;
    let raf = 0;

    const loop = () => {
      at += (target - at) * ease;
      el.current?.style.setProperty("--sheen", `${at.toFixed(1)}%`);
      raf = Math.abs(target - at) > 0.15 ? requestAnimationFrame(loop) : 0;
    };

    const onPointer = (e: PointerEvent) => {
      if (!el.current) return;
      /* Mapped across the whole viewport rather than across the word: crossing the page
       * sweeps the highlight over the letters exactly once, so the light reads as a fixed
       * source in the room that the cursor moves past. Measuring against the word's own
       * box instead left the highlight parked at one end for most of the screen. */
      const across = e.clientX / Math.max(1, window.innerWidth);
      target = across * 130 - 15;
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

/* ------------------------------------------------------------- ambient light
 * The light source behind the page follows the pointer. Same shape as useSheen: write two
 * custom properties straight to the node, ease them in a rAF loop, never touch React state.
 * A light this soft costs nothing to move and is the reason the glass surfaces read as glass
 * — a frosted panel over a flat background is indistinguishable from a darker panel. */
function useAmbientLight(el: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ease = calm ? 1 : 0.09;

    let atX = 50;
    let atY = 34;
    let toX = 50;
    let toY = 34;
    let raf = 0;

    const loop = () => {
      atX += (toX - atX) * ease;
      atY += (toY - atY) * ease;
      el.current?.style.setProperty("--lx", `${atX.toFixed(2)}%`);
      el.current?.style.setProperty("--ly", `${atY.toFixed(2)}%`);
      raf =
        Math.abs(toX - atX) > 0.08 || Math.abs(toY - atY) > 0.08
          ? requestAnimationFrame(loop)
          : 0;
    };

    const onPointer = (e: PointerEvent) => {
      toX = (e.clientX / window.innerWidth) * 100;
      toY = (e.clientY / window.innerHeight) * 100;
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
              <Markdown text={seg.text} caret={running} />
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
  const sheenRef = useSheen();
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

  useAmbientLight(appRef);

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
            <span className="tilt" ref={sheenRef}>
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
