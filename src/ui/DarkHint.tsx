/* A pointer to the theme button, for a visitor whose page opens on white.
 *
 * The page was drawn for black: the scene behind it is light on a dark sky, and the light
 * theme is the same picture inverted. A visitor whose page opens light, from the system
 * setting or from a stored choice, often never looks at a small sun in the corner of the
 * header. So the page says that it is best seen in dark, with an arrow to the button.
 *
 * Rules:
 * - Every visit that opens light. The owner wants each such visitor to get the advice. An
 *   earlier version showed it once per machine and only for the system setting, and the owner
 *   opened the page light and never saw it.
 * - It waits for the header to arrive, then stays until the visitor switches or closes it.
 * - A click on the hint switches the theme, the same as the button. The × only closes it.
 */

import type { Theme } from "./theme";
import { useEffect, useState } from "react";

/** The header fades in from 0.5 s to 1.6 s after the content arrives. The hint comes after. */
const ARRIVE_MS = 1900;

export function DarkHint({ theme, onSwitch }: { theme: Theme; onSwitch: () => void }) {
  // Decided once, from how the page opened. A later change back to light does not bring it back.
  const [wanted] = useState(() => theme === "light");
  const [shown, setShown] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!wanted) return;
    const show = window.setTimeout(() => setShown(true), ARRIVE_MS);
    return () => window.clearTimeout(show);
  }, [wanted]);

  if (!wanted || !shown || gone || theme !== "light") return null;

  return (
    <div className="dark-hint" role="note">
      {/* From the plate up to the button, as one hairline with a head. */}
      <svg className="dark-hint-arrow" viewBox="0 0 48 40" aria-hidden="true">
        <path d="M 6 38 C 14 26, 30 26, 38 6" pathLength={1} />
        <path d="M 32 10 L 38 4 L 42 12" pathLength={1} />
      </svg>
      <div className="dark-hint-plate">
        <button
          className="dark-hint-go"
          onClick={() => {
            setGone(true);
            onSwitch();
          }}
        >
          <span className="dark-hint-title">Best viewed in dark</span>
          <span className="dark-hint-sub">Click here or the sun to switch</span>
        </button>
        <button className="dark-hint-close" aria-label="Close" onClick={() => setGone(true)}>
          ×
        </button>
      </div>
    </div>
  );
}
