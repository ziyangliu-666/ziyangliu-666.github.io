/* Friends: a header item that opens a short list of the people he links to.
 *
 * In the header it is the word and a stack of small faces, one per friend, overlapping as on a
 * group chat. On a phone the header has no room for another word, so only the faces show.
 * A click opens a panel under it: each friend on one row, with a face, a name, one sentence
 * and their site. The whole row is the link, and it opens in a new tab, as every link on the
 * page does.
 *
 * The faces are grey until pointed at. The page has no colour anywhere else, and a row of
 * colour photographs would be the loudest thing on it.
 *
 * The panel closes on a click outside it, on Escape, and on a second click of the item. */

import { FRIENDS } from "./friendList";
import { useEffect, useRef, useState } from "react";
import type React from "react";

type RowStyle = React.CSSProperties & Record<`--${string}`, string>;

/** Faces in the header before the stack says "+n". */
const FACES = 3;

export function Friends() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const more = FRIENDS.length - FACES;
  return (
    <span className="friends" ref={wrap}>
      <button
        className="friends-btn"
        aria-expanded={open}
        aria-controls="friends-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="friends-word">Friends</span>
        <span className="friends-faces" aria-hidden="true">
          {FRIENDS.slice(0, FACES).map((f) => (
            <img className="friends-face" src={f.avatar} alt="" key={f.href} width={22} height={22} />
          ))}
          {more > 0 && <span className="friends-more">+{more}</span>}
        </span>
      </button>
      {open && (
        <div className="friends-panel" id="friends-panel" role="dialog" aria-label="Friends">
          <div className="friends-head">
            <span>Friends</span>
            <span>{FRIENDS.length}</span>
          </div>
          {FRIENDS.map((f, i) => (
            <a
              className="friend"
              href={f.href}
              target="_blank"
              rel="noreferrer"
              key={f.href}
              style={{ "--i": String(i) } as RowStyle}
              onClick={() => setOpen(false)}
            >
              <img className="friend-face" src={f.avatar} alt="" width={40} height={40} />
              <span className="friend-text">
                <span className="friend-name">{f.name}</span>
                <span className="friend-bio">{f.bio}</span>
                <span className="friend-host">
                  {new URL(f.href).host.replace(/^www\./, "")}
                  {" ↗"}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </span>
  );
}
