import { site } from "./site";

export const navLinks = [
  { label: "Blog", href: "/blog" },
  { label: "Resume", href: "/resume" },
  { label: "GitHub", href: site.github, external: true },
];

export const contactLinks = [
  {
    label: "Email",
    value: site.email,
    href: `mailto:${site.email}`,
    external: false,
  },
  {
    label: "GitHub",
    value: "ziyangliu-666",
    href: site.github,
    external: true,
  },
  {
    label: "LinkedIn",
    value: "ziyang-liu",
    href: site.linkedin,
    external: true,
  },
  {
    label: "Resume",
    value: "view online",
    href: "/resume",
    external: false,
  },
];
