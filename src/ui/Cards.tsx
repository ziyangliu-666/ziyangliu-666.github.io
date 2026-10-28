/* Highlight cards around the landing page. Each card is one piece of his work, with the one
 * number that makes it worth a look, and it opens the place where that work lives.
 *
 * They replace eighteen keyword tags. The tags named fragments, such as "QGA" and "Driver
 * injection", that meant nothing to a visitor without the story around them, and a click on a
 * tag only asked the agent. A visitor who wanted to see FastMM had to wait for an answer and
 * then find the link inside it. A card goes there directly. The agent is still one field away
 * for anything a card does not cover.
 *
 * Three rules, so that every card behaves the same way.
 *
 * Hover previews, click goes. Pointing at a card straightens it and unfolds a preview: the
 * number, one line about it, and where a click will go. Nothing on the page navigates until
 * the visitor clicks. A preview that navigated on hover would punish a visitor for moving the
 * mouse across the page.
 *
 * One card, one destination. The whole card is the link to its main destination, and the
 * preview footer names that host, so the visitor knows where a click goes before it happens.
 * A card that groups three papers also lists each paper, and each line is its own link. Those
 * lines sit above the card's link in the stacking order, so a click on a title opens that
 * paper and a click anywhere else opens the lead paper.
 *
 * Everything opens in a new tab. The landing page is an agent, and a visitor who comes back
 * should find the conversation where they left it.
 *
 * On a touch screen there is no hover. The first tap opens the preview, and a second tap on
 * the same card follows the link.
 *
 * The two anonymised submissions under review are never named here. Naming the author of an
 * anonymous submission is a real harm to it. See the README.
 *
 * The placement, the parallax and the overlap check came from the tags and are unchanged in
 * idea: hand-placed slots, one rAF loop for the pointer, and a runtime measurement that hides
 * a card when it would touch the centre column.
 */

import { hideBlueprint, showBlueprint } from "./blueprint";
import { type Art, CardArt } from "./cardArt";
import { playInline } from "./inlinePlayer";
import { calmMotion } from "./motion";
import { useEffect, useRef, useState } from "react";
import type React from "react";

interface Slot {
  /** Percentage from the left edge of the landing area. */
  x: number;
  /** Percentage from the top. */
  y: number;
  /** Degrees. */
  rot: number;
  /** Parallax plane: 0.4 is far away and barely moves, 1 is near and moves most. */
  depth: number;
}

interface Card {
  /** Small label above the title: what kind of thing this is. */
  kind: string;
  title: string;
  /** The headline of the preview. A number where there is one. */
  figure: string;
  /** One line that says what the figure means. */
  caption: string;
  /** The main destination. The whole card links here. */
  href: string;
  /** Further links. Each one is clickable on its own. */
  links?: { label: string; href: string }[];
  /** The faint drawing behind the card. */
  art: Art;
}

type CardStyle = React.CSSProperties & Record<`--${string}`, string>;

/* Five cards down each side of the centre column. The left band is what he builds now, the
 * right band is what he built and found before, down to the blog he kept as a student. Cards in the lower half open
 * upwards, so the preview never runs off the bottom of the page. */
const SLOTS: Slot[] = [
  { x: 3, y: 10, rot: -5, depth: 0.6 },
  { x: 4.5, y: 28, rot: 4, depth: 1 },
  { x: 2.5, y: 47, rot: -3, depth: 0.75 },
  { x: 4, y: 71, rot: 4, depth: 0.85 },
  { x: 3, y: 90, rot: -4, depth: 0.5 },

  { x: 97, y: 10, rot: 5, depth: 0.85 },
  { x: 95.5, y: 28, rot: -4, depth: 0.5 },
  { x: 97.5, y: 47, rot: 3, depth: 1 },
  { x: 96, y: 71, rot: -4, depth: 0.65 },
  { x: 97, y: 90, rot: 4, depth: 0.55 },
];

/* The figures come from the corpus notes and the résumé, not from memory. The Binance figures
 * come from his own public LinkedIn post about 12 October 2026, and the card links that post. */
const CARDS: Card[] = [
  // Left band.
  {
    kind: "Market making · C++20",
    art: "book",
    title: "FastMM",
    figure: "111 ns",
    caption: "From market data to an order, p50, in the engine alone. Open source.",
    href: "https://ziy.bio/FastMM/",
    links: [{ label: "github.com", href: "https://github.com/ziyangliu-666/FastMM" }],
  },
  {
    kind: "Live · Binance",
    art: "candles",
    title: "Binance liquidity provider",
    figure: "Top 5",
    caption: "Maker on 5 tokenized US-equity pairs, all on FastMM.",
    href: "https://www.linkedin.com/feed/update/urn:li:activity:7515643540148797440/",
  },
  {
    kind: "Rust · live demo",
    art: "desk",
    title: "bndesk",
    figure: "Read-only",
    caption: "A real-time desk for market making on Binance. It holds no keys that can trade.",
    href: "https://ziy.bio/bndesk/",
    links: [{ label: "github.com", href: "https://github.com/ziyangliu-666/bndesk" }],
  },
  {
    kind: "TypeScript · agents",
    art: "lumen",
    title: "lumen",
    figure: "On its own",
    caption: "An AI that does research in mathematics while you watch and steer it.",
    href: "https://github.com/ziyangliu-666/lumen-next",
  },
  {
    kind: "macOS · Windows",
    art: "wave",
    title: "vox",
    figure: "Hold ⌥",
    caption: "Speak, and the text appears in any app. Runs on a ChatGPT account, no API key.",
    href: "https://github.com/ziyangliu-666/vox",
  },
  // Right band.
  {
    kind: "SmartX · 2022–2025",
    art: "migrate",
    title: "V2V OS",
    figure: "10,000+",
    caption: "Production VMs moved off VMware with the migration product he led.",
    href: "https://www.smartx.com/hk-mo/migration-tool/",
  },
  {
    kind: "SmartX",
    art: "guest",
    title: "VMTools",
    figure: "3 s → 50 ms",
    caption: "Guest response time after he rebuilt the in-guest agent on native QGA.",
    href: "https://www.smartx.com/blog/2025/11/elf-vmtools-en/",
  },
  {
    kind: "arXiv · 2026",
    art: "copy",
    title: "LLM systems papers",
    figure: "13×",
    caption: "The speedup bound for edits that copy text instead of regenerating it.",
    href: "https://arxiv.org/pdf/2604.18170v1",
    links: [
      { label: "Faster editing by copying", href: "https://arxiv.org/pdf/2604.18170v1" },
      { label: "Memory with bookmarks", href: "https://arxiv.org/pdf/2604.12376v1" },
      { label: "Which model answered?", href: "https://arxiv.org/pdf/2604.18179v1" },
    ],
  },
  {
    kind: "Zenodo · 2026",
    art: "matrix",
    title: "Mathematics preprints",
    figure: "3×3",
    caption: "The matrix that disproves Ziętak's 2017 conjecture.",
    href: "https://zenodo.org/records/22986376",
    links: [
      { label: "Matrix conjecture, disproved", href: "https://zenodo.org/records/22986376" },
      { label: "Prime-race problems, solved", href: "https://zenodo.org/records/22537927" },
      { label: "Where random matrices miss", href: "https://zenodo.org/records/22537929" },
    ],
  },
  /* The oldest thing on the page, last in the band. Its blueprint is a memory, not a diagram:
     see the student blog in blueprintScenes.ts. The count is the posts in its feed. */
  {
    kind: "2021–2022 · in Chinese",
    art: "notes",
    title: "His old blog",
    figure: "48 posts",
    caption: "His notes from 2021 and 2022: Spring, Redis, the JVM, blockchain and his first neural nets.",
    href: "https://ziy.bio/comethx.github.io/",
    // The host line would read "ziy.bio", the domain of this page, and say nothing.
    links: [{ label: "Open the blog", href: "https://ziy.bio/comethx.github.io/" }],
  },
];

/** Parallax travel of the nearest plane, in pixels, from the centre to the edge of the page. */
const REACH = 18;

/** "https://www.smartx.com/blog/…" → "smartx.com". The footer names the site, not the path. */
function host(href: string): string {
  return new URL(href).host.replace(/^www\./, "");
}

/* Each card drifts on its own slow loop, 16–26 seconds for 4–8 pixels. Shared timings would
 * make the set breathe in unison, which reads as a loading state. */
function drift(i: number): CardStyle {
  const dx = 4 + ((i * 3) % 4);
  const dy = 3 + ((i * 5) % 4);
  return {
    "--dx": `${i % 2 ? dx : -dx}px`,
    "--dy": `${i % 3 ? dy : -dy}px`,
    "--dur": `${16 + ((i * 7) % 11)}s`,
    "--lag": `-${(i * 1.9).toFixed(1)}s`,
  };
}

/**
 * Pointer parallax for the whole field, and the runtime overlap check.
 *
 * One rAF loop writes two custom properties on the container, and each plane multiplies them
 * by its own depth in CSS. Nothing re-renders: React never sees the pointer.
 */
function useParallax(container: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const host = container.current;
    if (!host) return;

    /* Hide any card that overlaps what the centre column actually occupies on this screen.
     * Runs after layout and on every resize, because the suggestion chips wrap differently with
     * different text. Measuring beats predicting. */
    const cull = () => {
      const zones = [".h1", ".composer", ".suggestions"]
        .map((sel) => document.querySelector(sel)?.getBoundingClientRect())
        .filter((r): r is DOMRect => Boolean(r));

      for (const plane of host.querySelectorAll<HTMLElement>(".card-plane")) {
        // Measure unhidden, or a card hidden once could never come back after a resize.
        plane.style.visibility = "";
        const r = plane.getBoundingClientRect();
        const pad = 10;
        const clash = zones.some(
          (z) =>
            r.right + pad > z.left &&
            r.left - pad < z.right &&
            r.bottom + pad > z.top &&
            r.top - pad < z.bottom,
        );
        if (clash || r.left < 0 || r.right > window.innerWidth) {
          plane.style.visibility = "hidden";
        }
      }
    };

    cull();
    const ro = new ResizeObserver(cull);
    ro.observe(document.body);
    // The heading changes width on its own as the words after the name take turns.
    const h1 = document.querySelector(".h1");
    if (h1) ro.observe(h1);
    /* The centre column arrives with a short rise, so the first measurement sees it a few
       pixels low. Measuring again when an arrival animation ends corrects that. */
    const landing = host.closest(".landing");
    landing?.addEventListener("animationend", cull);
    const stopCull = () => {
      ro.disconnect();
      landing?.removeEventListener("animationend", cull);
    };

    if (window.matchMedia("(hover: none)").matches || calmMotion()) {
      return stopCull;
    }

    let atX = 0;
    let atY = 0;
    let toX = 0;
    let toY = 0;
    let raf = 0;

    const loop = () => {
      atX += (toX - atX) * 0.12;
      atY += (toY - atY) * 0.12;
      host.style.setProperty("--px", `${atX.toFixed(2)}px`);
      host.style.setProperty("--py", `${atY.toFixed(2)}px`);
      raf =
        Math.abs(toX - atX) > 0.05 || Math.abs(toY - atY) > 0.05
          ? requestAnimationFrame(loop)
          : 0;
    };

    /* Negated, so the field slides against the pointer, as something nearer than the page. */
    const onPointer = (e: PointerEvent) => {
      toX = -((e.clientX / window.innerWidth) * 2 - 1) * REACH;
      toY = -((e.clientY / window.innerHeight) * 2 - 1) * REACH;
      if (!raf) raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      if (raf) cancelAnimationFrame(raf);
      stopCull();
    };
  }, [container]);
}

/** A link that leaves the page. Every link on a card opens in a new tab. */
function Out({
  href,
  className,
  children,
  onClick,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  /* The link lets go of focus once it has opened the new tab. Chrome marks the focus as
   * visible again when the visitor comes back to this tab, and a focused card stays open. */
  const go = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (!e.defaultPrevented) e.currentTarget.blur();
  };
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer" onClick={go}>
      {children}
    </a>
  );
}

/** The cards scattered around the centre column, for screens wide enough to hold them. */
export function Cards() {
  const field = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useParallax(field);

  // A tap anywhere outside the open card closes it.
  useEffect(() => {
    if (open === null) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".card-tilt[data-open]")) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  /* A tapped card shows its blueprint too, since a touch screen has no hover to start it. */
  useEffect(() => {
    const el = open === null ? null : document.querySelector(".card-tilt[data-open]");
    if (el && open !== null) showBlueprint(CARDS[open]!.art, el);
    else hideBlueprint();
  }, [open]);

  // The landing goes when a conversation starts, and its blueprint goes with it.
  useEffect(() => hideBlueprint, []);

  return (
    <div className="cards" ref={field} aria-label="Highlights from his work">
      {CARDS.map((card, i) => {
        const slot = SLOTS[i]!;
        const up = slot.y > 50;
        const plane: CardStyle = {
          /* Right-band cards anchor on their right edge, and lower cards on their bottom
             edge, so a preview always unfolds into open space. */
          ...(slot.x >= 50 ? { right: `${100 - slot.x}%` } : { left: `${slot.x}%` }),
          ...(up ? { bottom: `${100 - slot.y}%` } : { top: `${slot.y}%` }),
          "--depth": String(slot.depth),
        };
        const tilt: CardStyle = { "--rot": `${slot.rot}deg`, "--n": String(i) };

        /* No hover on a touch screen: the first tap previews, the second follows the link. */
        const first = (e: React.MouseEvent<HTMLAnchorElement>) => {
          if (window.matchMedia("(hover: none)").matches && open !== i) {
            e.preventDefault();
            setOpen(i);
          } else {
            // Followed: the card closes, so the page is at rest when the visitor comes back.
            setOpen(null);
          }
        };

        return (
          <div className="card-plane" key={card.title} style={plane}>
            <div
              className={up ? "card-tilt card-tilt--up" : "card-tilt"}
              style={tilt}
              data-open={open === i ? "" : undefined}
              /* The blueprint behind the page follows the same three ways a card opens: the
                 pointer, keyboard focus, and a tap (the effect above). */
              onPointerEnter={(e) => {
                if (e.pointerType !== "touch") showBlueprint(card.art, e.currentTarget);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== "touch") hideBlueprint();
              }}
              onFocus={(e) => {
                if (e.target.matches(":focus-visible")) showBlueprint(card.art, e.currentTarget);
              }}
              onBlur={(e) => {
                // Focus moving to another link on the same card keeps the drawing.
                if (!e.currentTarget.contains(e.relatedTarget)) hideBlueprint();
              }}
            >
              <div className="card" style={drift(i)}>
                <CardArt art={card.art} />
                <Out className="card-head" href={card.href} onClick={first}>
                  <span className="card-kind">{card.kind}</span>
                  <span className="card-title">{card.title}</span>
                </Out>
                <div className="card-more">
                  <div className="card-body">
                    <div className="card-inner">
                      <div className="card-figure">{card.figure}</div>
                      <p className="card-caption">{card.caption}</p>
                      <div className="card-links">
                        {/* A paper group lists its lead paper among the titles, so the host
                            line would name the same destination twice. */}
                        {!card.links?.some((l) => l.href === card.href) && (
                          <span className="card-host">{host(card.href)}{"\u00a0↗"}</span>
                        )}
                        {card.links?.map((l) => (
                          <Out className="card-link" href={l.href} key={l.label}>
                            {l.label}{"\u00a0↗"}
                          </Out>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Below the width that holds the side bands, the cards become a column under the suggestions,
 * one card under another, and the page scrolls down through them. The card nearest the middle
 * of the screen plays its drawing in its own screen, the same drawing a wide screen shows
 * behind the page (inlinePlayer.ts), with the current step as a subtitle. The others show
 * their still emblem. A tap opens the work, as a click does on a wide screen.
 *
 * It replaces a sideways row of small chips that cut their titles off and showed no drawing.
 * A sideways deck came between the two, and it was the wrong axis: on a phone the thumb
 * already scrolls down, and a second direction is one more thing to find.
 *
 * The player lives inside the card, so it moves with the scroll and has nothing to lag behind.
 * The choice of card waits until the scroll has paused a moment, so a fast fling through the
 * column does not start and stop ten players on the way. */
export function CardDeck() {
  const list = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    let timer = 0;
    const pick = () => {
      // Hidden, because the side bands are showing: nothing plays.
      if (el.offsetParent === null) return setActive(null);
      const mid = window.innerHeight / 2;
      let best: number | null = null;
      let bestScore = Infinity;
      Array.from(el.children).forEach((child, i) => {
        const r = child.getBoundingClientRect();
        /* A card mostly on screen wins, nearest the middle first. Short of that, a card that
           shows its screen at least: on a phone the first card is only half in view under
           the suggestions, and a column that plays nothing until scrolled looks dead. */
        const shown = (Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) / r.height;
        if (shown < 0.4) return;
        const score = (shown >= 0.6 ? 0 : 1e6) + Math.abs(r.top + r.height / 2 - mid);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      });
      setActive(best);
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(pick, 120);
    };
    pick();
    // The page may scroll on the window or on a container; capture hears both.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (active === null) return;
    const card = list.current?.children[active] as HTMLElement | undefined;
    const canvas = card?.querySelector<HTMLCanvasElement>(".deck-live");
    const sub = card?.querySelector<HTMLElement>(".deck-sub");
    if (!card || !canvas) return;
    card.dataset.live = "";
    const stop = playInline(canvas, CARDS[active]!.art, (caption) => {
      if (sub) sub.textContent = caption;
    });
    return () => {
      stop();
      delete card.dataset.live;
    };
  }, [active]);

  return (
    <section className="deck" aria-label="Highlights from his work">
      <div className="deck-head">Highlights</div>
      <div className="deck-list" ref={list}>
        {CARDS.map((card) => (
          <Out className="deck-card" href={card.href} key={card.title}>
            <span className="deck-screen">
              <CardArt art={card.art} align="center" />
              <canvas className="deck-live" aria-hidden="true" />
              <span className="deck-sub" aria-hidden="true" />
            </span>
            <span className="deck-meta">
              <span className="deck-row">
                <span className="card-kind">{card.kind}</span>
                <span className="deck-figure">{card.figure}</span>
              </span>
              <span className="deck-title">
                {card.title}
                {"\u00a0↗"}
              </span>
              <span className="deck-caption">{card.caption}</span>
            </span>
          </Out>
        ))}
      </div>
    </section>
  );
}
