/* The words after the name in the heading, which take turns: "in Singapore", "at NUS",
 * "building FastMM". The heading names him, and the tail says in passing where he is and what
 * he does, so a visitor learns the two facts most of them came for before asking anything.
 *
 * Each change is the heading's own arrival in small: the old words go up and out of focus, the
 * new ones come in letter by letter out of a blur. The tail's width slides to the new words'
 * width, so the centred heading glides to its new place instead of jumping.
 *
 * The tail is smaller and greyer than the name, a note on it. At the heading's full size the
 * longest tail made the heading wider than the composer, into the side bands of cards.
 *
 * Every phrase is a fact from the corpus notes (corpus/src/about.md). Keep them true. */

import { calmMotion } from "./motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type React from "react";

const TAILS = ["in Singapore", "at NUS", "building FastMM", "on LLM systems", "ex-SmartX"];

/** The heading arrives first; the tail starts after it. */
const FIRST_MS = 2600;
const EVERY_MS = 3400;

type CharStyle = React.CSSProperties & Record<`--${string}`, string>;

function Letters({ text, className }: { text: string; className: string }) {
  return (
    <span className={className}>
      {Array.from(text).map((ch, k) => (
        <span className="tail-ch" style={{ "--k": String(k) } as CharStyle} key={k}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

export function NameTail() {
  const still = calmMotion();
  const [shown, setShown] = useState<{ cur: number; prev: number | null }>(() =>
    still ? { cur: 0, prev: null } : { cur: -1, prev: null },
  );
  const [width, setWidth] = useState(0);
  const ghost = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (still) return;
    let every = 0;
    const next = () =>
      setShown(({ cur }) => ({ cur: (cur + 1) % TAILS.length, prev: cur >= 0 ? cur : null }));
    const first = window.setTimeout(() => {
      next();
      every = window.setInterval(next, EVERY_MS);
    }, FIRST_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [still]);

  // Measured from a hidden copy in the same face, so the width slides to the exact new width.
  useLayoutEffect(() => {
    setWidth(shown.cur < 0 ? 0 : (ghost.current?.offsetWidth ?? 0));
  }, [shown.cur]);

  const text = shown.cur >= 0 ? TAILS[shown.cur]! : "";
  return (
    <span className="tail" style={{ width }} aria-hidden="true">
      <span className="tail-ghost" ref={ghost}>
        {text}
      </span>
      {shown.prev !== null && (
        <Letters key={`out${shown.prev}-${shown.cur}`} className="tail-text tail-text--out" text={TAILS[shown.prev]!} />
      )}
      {shown.cur >= 0 && <Letters key={`in${shown.cur}`} className="tail-text tail-text--in" text={text} />}
    </span>
  );
}
