/* A word in the header that opens a short panel of links: Resume and Friends.
 *
 * Each row is one link, with a round face, a name, one line, and where it goes. The whole row
 * is the link, and it opens in a new tab, as every link on the page does. The panel closes on
 * a click outside it, on Escape, on a second click of the word, and when a row is followed.
 * Two menus share this one component so they cannot drift apart in how they behave. */

import { useEffect, useId, useRef, useState } from "react";
import type React from "react";

export interface MenuRow {
  href: string;
  /** A small round picture, or a short word in a ring. */
  face: React.ReactNode;
  name: string;
  line: string;
  /** Where the link goes, as the row's last line. */
  dest: string;
}

type RowStyle = React.CSSProperties & Record<`--${string}`, string>;

export function HeaderMenu({
  button,
  title,
  rows,
  count = false,
}: {
  /** What sits in the header. */
  button: React.ReactNode;
  title: string;
  rows: MenuRow[];
  /** Show the number of rows in the panel's head. */
  count?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);
  const id = useId();

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

  return (
    <span className="menu" ref={wrap}>
      <button className="menu-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {button}
      </button>
      {open && (
        <div className="menu-panel" id={id} role="dialog" aria-label={title}>
          <div className="menu-head">
            <span>{title}</span>
            {count && <span>{rows.length}</span>}
          </div>
          {rows.map((row, i) => (
            <a
              className="menu-row"
              href={row.href}
              target="_blank"
              rel="noreferrer"
              key={row.href}
              style={{ "--i": String(i) } as RowStyle}
              onClick={() => setOpen(false)}
            >
              {row.face}
              <span className="menu-text">
                <span className="menu-name">{row.name}</span>
                <span className="menu-bio">{row.line}</span>
                <span className="menu-host">
                  {row.dest}
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
