/* One answer to "should this page move", for the stylesheet and for every script.
 *
 * The default is the visitor's system setting. A full-screen zoom is exactly what
 * `prefers-reduced-motion` exists to stop, so a visitor who asked for less motion gets a still
 * frame of the city, the native pointer, and content that is simply there.
 *
 * The override exists because the setting is per machine, not per site. Someone with Reduce
 * Motion on for the sake of the operating system's own animations can still choose to see this
 * page move:
 *
 *   ?motion=on     move, and remember it on this machine
 *   ?motion=auto   forget the choice and follow the system again
 *
 * The answer is written to <html> as the class `calm`, and the stylesheet keys on that class
 * instead of on the media query. A media query cannot be overridden from script; a class can.
 */

const KEY = "ziyang-agent.motion";

let answer: boolean | null = null;

/** True when the page must hold still. Decided once per load. */
export function calmMotion(): boolean {
  if (answer !== null) return answer;

  let forced = false;
  try {
    const asked = new URLSearchParams(location.search).get("motion");
    if (asked === "on") localStorage.setItem(KEY, "on");
    if (asked === "auto") localStorage.removeItem(KEY);
    forced = localStorage.getItem(KEY) === "on";
  } catch {
    /* storage blocked: follow the system */
  }

  answer = !forced && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.toggle("calm", answer);
  return answer;
}
