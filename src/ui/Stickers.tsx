/* Topic tags scattered around the landing page, tilted. Each one is a piece of his own work,
 * and clicking it asks the agent about that piece.
 *
 * The tags used to be read from the SKILLS section of the résumé: Python, Go, epoll, NUMA.
 * Those are words anyone can put on a résumé, and they told a visitor nothing about him. The
 * topics now name what he built and found: V2V OS and VMTools at SmartX, FastMM, the kernel
 * defect, the papers, and the numbers that came out of them. Each carries its own question,
 * because "Tell me about his VMTools work" is a worse question than "What is VMTools, and why
 * did he rebuild it?"
 *
 * The two anonymised submissions under review are never named here. Naming the author of an
 * anonymous submission is a real harm to it. See the README.
 *
 * Four decisions worth stating.
 *
 * The positions are hand-placed, not random. Random scatter looks the same on average and
 * occasionally drops a tag straight onto the composer, and a layout that is broken one visit
 * in ten is broken. Each slot is a percentage of the container with a fixed tilt, arranged in
 * two bands down the left and right of the centre column.
 *
 * Hand-placed is still not enough, so a tag also hides itself when it measures an overlap with
 * the centre column. The coordinates were checked at four viewport widths and a tag still
 * landed on the suggestion chips, because the chips wrap differently with different text and
 * the seed questions are not fixed forever. Measuring beats predicting.
 *
 * They move on separate planes. The pointer shifts the whole field, each tag by an amount set
 * by its own depth, so the set has parallax instead of sliding as one sheet. That needs two
 * transform channels: the plane owns `translate` for parallax, the button inside owns
 * `translate` for its idle drift. One element cannot take the same property from a keyframe
 * and a pointer handler at once.
 *
 * They are buttons. A decoration that answers when you click it stops being decoration —
 * clicking "VMware CBT" asks how V2V OS uses it, which is also the fastest way to discover
 * that arbitrary questions work at all. They stay quiet until hovered so they read
 * as texture first and as an invitation second.
 */

import { calmMotion } from "./motion";
import { useEffect, useRef } from "react";
import type React from "react";

interface Slot {
  /** Percentage from the left edge of the landing area. */
  x: number;
  /** Percentage from the top. */
  y: number;
  /** Degrees. */
  rot: number;
  /** Relative size, 0.9–1.1. */
  scale?: number;
  /** Parallax plane: 0.4 is far away and barely moves, 1 is near and moves most. */
  depth?: number;
}

type TagStyle = React.CSSProperties & Record<`--${string}`, string>;

/* Each tag drifts on its own loop. The numbers are the point of this: 16–26 seconds for one
 * circuit of 5–9 pixels is slow enough that you never catch a tag moving, only notice the
 * page is not quite still. Shared timings would make the whole set breathe in unison, which
 * reads as a loading state. Derived from the index so the arrangement stays deterministic. */
function drift(i: number): TagStyle {
  const dx = 5 + ((i * 3) % 5);
  const dy = 4 + ((i * 5) % 4);
  return {
    "--dx": `${i % 2 ? dx : -dx}px`,
    "--dy": `${i % 3 ? dy : -dy}px`,
    "--dur": `${16 + ((i * 7) % 11)}s`,
    "--lag": `-${(i * 1.9).toFixed(1)}s`,
  };
}

/* Left band, right band, and a few along the top and bottom. Nothing between x 26 and 74,
 * which is where the heading, the composer and the suggestion chips live. Depth alternates so
 * that neighbouring tags travel by visibly different amounts. */
const SLOTS: Slot[] = [
  // Left band. Slots level with the centre column stay inside x 16, so even a long keyword
  // cannot reach the composer.
  { x: 6, y: 12, rot: -7, depth: 0.5 },
  { x: 5, y: 25, rot: 5, scale: 1.08, depth: 1 },
  { x: 3, y: 37, rot: 8, depth: 0.7 },
  { x: 4, y: 48, rot: -4, depth: 0.4 },
  { x: 6, y: 59, rot: 6, scale: 0.94, depth: 0.85 },
  { x: 12, y: 70, rot: -8, depth: 0.55 },
  { x: 8, y: 79, rot: 3, depth: 0.95 },

  // Right band, anchored on the right edge. Pulled to x 96–97 across the centre column's
  // height for the same reason, and only shorter labels are placed there.
  { x: 82, y: 11, rot: 6, depth: 0.6 },
  { x: 96, y: 25, rot: -5, scale: 1.06, depth: 1 },
  { x: 97, y: 36, rot: -8, depth: 0.45 },
  { x: 96, y: 47, rot: 4, depth: 0.8 },
  { x: 97, y: 58, rot: -3, scale: 0.95, depth: 0.5 },
  { x: 92, y: 69, rot: 7, depth: 0.9 },
  { x: 82, y: 78, rot: -6, depth: 0.65 },

  /* Above the heading and below the chips, where the column is clear. The lowest row used to
     sit at 91 and 92, hard against the bottom edge, which left the set trailing away from the
     content instead of framing it. The chips end near 66%, so 85 is as high as these can go. */
  { x: 33, y: 7, rot: -4, scale: 0.94, depth: 0.75 },
  { x: 57, y: 5, rot: 5, depth: 0.45 },
  { x: 30, y: 85, rot: 6, depth: 0.85 },
  { x: 62, y: 86, rot: -5, scale: 0.96, depth: 0.6 },
];

/* Which topic goes in which slot. Fixed rather than shuffled: the page should look the same
 * every visit. The short labels take the slots level with the centre column, where there is
 * least room, and the long ones sit above or below it. */
const TOPICS: { label: string; ask: string }[] = [
  // Left band.
  { label: "70 → 290 MB/s", ask: "How did he take migration throughput from 70 to 290 MB/s?" },
  { label: "10,000+ production VMs", ask: "What is V2V OS, and how did it reach 10,000+ production VMs?" },
  { label: "V2V OS", ask: "What is V2V OS, and what did he build in it?" },
  { label: "QGA", ask: "What is QGA, and how does VMTools use it?" },
  { label: "VMware CBT", ask: "How does V2V OS use VMware CBT for incremental sync?" },
  { label: "Cross-cluster migration", ask: "How does cross-cluster live migration check its data?" },
  { label: "Driver injection", ask: "How does V2V OS inject drivers into Windows and Linux guests?" },
  // Right band.
  { label: "111 ns tick-to-order", ask: "How does FastMM get market data to an order in 111 ns?" },
  { label: "fsfreeze snapshots", ask: "How did he make VM snapshots filesystem-consistent?" },
  { label: "FastMM", ask: "What is FastMM?" },
  { label: "VMTools", ask: "What is VMTools, and why did he rebuild it?" },
  { label: "Nasdaq ITCH", ask: "How does FastMM handle Nasdaq TotalView-ITCH?" },
  { label: "UOS pidfd leak", ask: "How did he find the UOS kernel defect that hung customer VMs?" },
  { label: "Deterministic replay", ask: "How does FastMM replay a session byte for byte?" },
  // Above the heading.
  { label: "Copy-as-Decode", ask: "What does the Copy-as-Decode paper show?" },
  { label: "Memory paging for LLMs", ask: "What is cooperative memory paging for LLM conversations?" },
  // Below the chips.
  { label: "SAE-feature traces", ask: "What are committed SAE-feature traces?" },
  { label: "HKUST (Guangzhou)", ask: "What did he research at HKUST (Guangzhou)?" },
];

/** Parallax travel of the nearest plane, in pixels, from the centre to the edge of the page. */
const REACH = 18;

/**
 * Pointer parallax for the whole field, and the runtime overlap check.
 *
 * One rAF loop writes two custom properties on the container, and each plane multiplies them
 * by its own depth in CSS. Eighteen tags therefore cost one style write per frame instead of
 * eighteen, and nothing re-renders: React never sees the pointer.
 */
function useParallax(container: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const host = container.current;
    if (!host) return;

    /* Hide any tag that overlaps what the centre column actually occupies on this screen.
     * Runs after layout and on every resize, because whether a tag fits depends on how the
     * suggestion chips wrapped, which depends on their text. */
    const cull = () => {
      const zones = [".h1", ".composer", ".suggestions"]
        .map((sel) => document.querySelector(sel)?.getBoundingClientRect())
        .filter((r): r is DOMRect => Boolean(r));

      for (const plane of host.querySelectorAll<HTMLElement>(".sticker-plane")) {
        // Measure unhidden, or a tag hidden once could never come back after a resize.
        plane.style.visibility = "";
        const r = plane.getBoundingClientRect();
        const pad = 10; // air, so a tag never looks like it is touching the column
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
    /* The centre column arrives with a short rise, so the first measurement sees it a few
       pixels low. Measuring again when an arrival animation ends corrects that. The event
       bubbles, so one listener on the landing area hears all of them. */
    const landing = host.closest(".landing");
    landing?.addEventListener("animationend", cull);
    const stopCull = () => {
      ro.disconnect();
      landing?.removeEventListener("animationend", cull);
    };

    // No pointer to follow, or the visitor asked for less motion. The tags still cull.
    if (
      window.matchMedia("(hover: none)").matches ||
      calmMotion()
    ) {
      return stopCull;
    }

    let atX = 0;
    let atY = 0;
    let toX = 0;
    let toY = 0;
    let raf = 0;

    const loop = () => {
      /* Eased at 0.12, the same figure the wordmark sheen uses, so the field settles behind
       * the cursor rather than snapping to it and the two movements feel like one hand. */
      atX += (toX - atX) * 0.12;
      atY += (toY - atY) * 0.12;
      host.style.setProperty("--px", `${atX.toFixed(2)}px`);
      host.style.setProperty("--py", `${atY.toFixed(2)}px`);
      raf =
        Math.abs(toX - atX) > 0.05 || Math.abs(toY - atY) > 0.05
          ? requestAnimationFrame(loop)
          : 0;
    };

    const onPointer = (e: PointerEvent) => {
      /* Negated, so the field slides against the pointer. Moving with it reads as dragging
       * the page around; moving against it reads as looking past something nearer. */
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

export function Stickers({ onPick }: { onPick: (question: string) => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  useParallax(host);


  return (
    <div className="stickers" ref={host} aria-label="Topics from his work">
      {TOPICS.slice(0, SLOTS.length).map(({ label, ask }, i) => {
        const slot = SLOTS[i]!;
        const plane: TagStyle = {
          /* Right-band tags anchor on their right edge so a long keyword grows inward
             instead of off the page — "P2P sync and reorg handling" was clipped. */
          ...(slot.x >= 70 ? { right: `${100 - slot.x}%` } : { left: `${slot.x}%` }),
          top: `${slot.y}%`,
          "--depth": String(slot.depth ?? 0.7),
        };
        const tag: TagStyle = {
          /* `rotate`, `translate` and `scale` are separate CSS properties, not one
             `transform` string. That is what lets the tilt sit here, the drift live in a
             keyframe, and the hover lift be a third rule — with one `transform` the last
             writer would win and hovering would snap the tag upright. */
          rotate: `${slot.rot}deg`,
          "--fs": `${((slot.scale ?? 1) * 14.5).toFixed(2)}px`,
          ...drift(i),
          "--rot": `${slot.rot}deg`,
          // Arrival order. The tags come in one after another instead of in three groups.
          "--n": String(i),
        };
        return (
          <span className="sticker-plane" key={label} style={plane}>
            <button
              className="sticker"
              style={tag}
              onClick={() => onPick(ask)}
            >
              {label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
