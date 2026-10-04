/* Light and dark.
 *
 * The page follows the visitor's system setting unless they choose otherwise. The choice is
 * one button in the header: a sun on the light theme, a moon on the dark one, and a click
 * switches to the other. A reader who reads more easily on a light page asked for this, and
 * the system setting is the one place they have already said so.
 *
 * Two states, not three. An "Auto" state is a third icon a visitor has to decode. Instead, a
 * click that lands on the system's own theme forgets the stored choice, so a visitor who
 * switches away and back is following the system again, with nothing to learn.
 *
 * The resolved theme is written to <html> as data-theme="light" or "dark", and the stylesheet
 * keys on it. index.html sets the same attribute in an inline script before the bundle loads,
 * so a light-theme visitor never sees a black frame first. The two must agree on the storage
 * key and the meaning of each value.
 */

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const KEY = "ziyang-agent.theme";

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function savePref(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}


export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolve(pref: ThemePref): Theme {
  return pref === "system" ? systemTheme() : pref;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Native controls and scrollbars follow this, so it has to change with the page.
  root.style.colorScheme = theme;
}
