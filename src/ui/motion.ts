/* One answer to "should this page move", for the stylesheet and for every script.
 *
 * The page moves by default, for every visitor. That includes a visitor whose system asks for
 * reduced motion. This is a deliberate choice by the owner of the site and it has a cost: a
 * full-screen zoom is the kind of motion that setting exists to stop. The first version
 * followed the system setting, and the owner's own machine had it on, so the owner saw a still
 * frame of a page whose whole point was the movement.
 *
 * A visitor who needs the page to hold still can say so:
 *
 *   ?motion=off    hold still, and remember it on this machine
 *   ?motion=on     move again, and forget the choice
 *
 * Still means one frame of the scene, no arrival animations, and content that is simply there.
 *
 * The answer is written to <html> as the class `calm`, and the stylesheet keys on that class
 * instead of on the media query. A media query cannot be overridden from script; a class can.
 */

const KEY = "ziyang-agent.motion";

let answer: boolean | null = null;

/** True when the page must hold still. Decided once per load. */
export function calmMotion(): boolean {
  if (answer !== null) return answer;

  let still = false;
  try {
    const asked = new URLSearchParams(location.search).get("motion");
    if (asked === "off") localStorage.setItem(KEY, "off");
    if (asked === "on" || asked === "auto") localStorage.removeItem(KEY);
    still = localStorage.getItem(KEY) === "off";
  } catch {
    /* storage blocked: move */
  }

  answer = still;
  document.documentElement.classList.toggle("calm", answer);
  return answer;
}
