/* Resume: the English and the Chinese résumé, in a header menu (HeaderMenu.tsx).
 *
 * The header link opened the English PDF only. The Chinese one was served all along at
 * /resume-zh.pdf, and only the agent ever linked it. Now the word opens a panel with both.
 * The two are not translations of each other line for line; each is written for its readers,
 * so each row says what it is.
 *
 * The PDFs are copied in from ~/Projects/resume by hand when they change, and the corpus is
 * rebuilt from the same files (npm run corpus). */

import { HeaderMenu } from "./HeaderMenu";

const face = (word: string) => (
  <span className="menu-face menu-face--word" aria-hidden="true">
    {word}
  </span>
);

export function Resume() {
  return (
    <HeaderMenu
      title="Résumé"
      button="Resume"
      rows={[
        { href: "/resume.pdf", face: face("EN"), name: "English", line: "Two pages, PDF.", dest: "resume.pdf" },
        { href: "/resume-zh.pdf", face: face("中"), name: "中文", line: "In Chinese. Two pages, PDF.", dest: "resume-zh.pdf" },
      ]}
    />
  );
}
