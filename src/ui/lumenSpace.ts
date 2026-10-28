/* lumen's front page, live, behind its card: a halftone sphere in a galaxy of stars, with a
 * belt of small bodies round it, a black hole far behind it and a spiral galaxy beyond.
 *
 * Ported from lumen-next (apps/web/src/ui/space.ts), which is his. The scene there is the
 * background of every lumen page, with five camera shots, a theme wipe and quiet zones behind
 * text. Here it only has to be the landing shot, so those are gone, and two things are new:
 *
 * - The camera flies in. The drawing opens with the camera far out and falling toward the
 *   sphere, so the stars print as streaks on the lattice and settle back to points. That is
 *   lumen's own move between pages, used once, as an entrance.
 * - Everything takes the layer's opacity, so the scene fades in and out with the card.
 *
 * Everything sits on one fixed lattice of cells, 8 px apart. The sphere is sampled at the
 * cells, and each star lights its nearest cell. That lattice is what makes it halftone. */

const TAU = Math.PI * 2;

interface Vec {
  x: number;
  y: number;
  z: number;
}

interface Star extends Vec {
  seed: number;
  lastX: number;
  lastY: number;
}

interface Orbit {
  a: number;
  r: number;
  h: number;
}

interface GalaxyParticle {
  a: number;
  t: number;
  tone: number;
}

interface Theme {
  /** "r,g,b" */
  ink: string;
  bg: string;
  dark: boolean;
}

export interface Lumen {
  draw(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    alpha: number,
    theme: Theme,
    pointer: { x: number; y: number; on: boolean },
    still: boolean,
    /** Where the sphere stands, if not at the landing shot: the small player on a phone. */
    shot?: { ax: number; ay: number; size: number },
  ): void;
}

function norm(v: Vec): Vec {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function seeded(start: number): () => number {
  let seed = start;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function axes(normal: Vec) {
  const n = norm(normal);
  const a = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = norm({ x: a.y * n.z - a.z * n.y, y: a.z * n.x - a.x * n.z, z: a.x * n.y - a.y * n.x });
  const w = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
  return { n, u, w };
}

const SUN = norm({ x: 0.85, y: 0.35, z: 0.4 });

const BELT: readonly Orbit[] = (() => {
  const rnd = seeded(5);
  return Array.from({ length: 520 }, () => ({
    a: rnd() * TAU,
    r: 1.9 + rnd() * 0.9,
    h: (rnd() - 0.5) * 0.12,
  }));
})();

const HOLE = { c: { x: -40, y: -5, z: -48 }, shadow: 5, f: axes({ x: 0.2, y: 1, z: 0.35 }) };
const DISK: readonly Orbit[] = (() => {
  const rnd = seeded(23);
  return Array.from({ length: 5200 }, () => {
    const r = 7 + Math.pow(rnd(), 1.8) * 22;
    return { a: rnd() * TAU, r, h: (rnd() - 0.5) * 0.5 * (r / 12) };
  });
})();

const GAL = { c: { x: 170, y: -20, z: 300 }, r: 160, f: axes({ x: -0.45, y: -0.8, z: -0.6 }) };
const GALAXY: readonly GalaxyParticle[] = (() => {
  const rnd = seeded(41);
  return Array.from({ length: 6000 }, () => {
    const core = rnd() < 0.28;
    const t = core ? Math.pow(rnd(), 2) * 0.18 : 0.08 + rnd() * 0.92;
    const arm = rnd() < 0.5 ? 0 : Math.PI;
    const a = core ? rnd() * TAU : arm + Math.log(t) * 2.4 + (rnd() - 0.5) * (0.35 + t * 0.6);
    return { a, t, tone: rnd() };
  });
})();

function seedStars(): Star[] {
  const rnd = seeded(11);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(TAU * rnd());
  const ct = Math.cos(0.5);
  const st = Math.sin(0.5);
  return Array.from({ length: 1400 }, () => {
    const a = rnd() * TAU;
    const y = rnd() < 0.65 ? gauss() * 0.12 : rnd() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const dist = 6 + rnd() * 14;
    return {
      x: (x * ct + y * st) * dist,
      y: (y * ct - x * st) * dist,
      z: z * dist,
      seed: rnd(),
      lastX: -1,
      lastY: -1,
    };
  });
}

/* The shot: the sphere stands at the right, at 30% of the page height, as on lumen's own
   landing, where it stands at 71% beside the text column. Here the session window
   (lumenSession.ts) takes the place of the text column. */
export const SHOT = { ax: 0.76, ay: 0.5, size: 0.3, dist: 3.2 };
/** The entrance: the camera starts this many times further out and falls in over FALL s. */
const FAR = 4.5;
const FALL = 2.2;
/** Lattice pitch, in CSS pixels. */
const S = 8;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createLumen(): Lumen {
  const stars = seedStars();
  const cam = { yaw: -0.7, pitch: 0.18, dist: SHOT.dist };
  const steer = { yaw: 0, pitch: 0 };
  let prevYaw = 0;
  let prevDist = 0;
  let lastT = -1;
  /* Where the pointer was when the scene opened. The pointer is on a card at the edge of the
     page then, and steering from the centre of the page, as lumen does, turned the camera to
     the dark side of the sphere at once. Steering counts from here instead. */
  const origin = { x: 0, y: 0 };

  // The lattice is drawn once per size and theme, then copied in each frame.
  const paper = document.createElement("canvas");
  let paperKey = "";

  const snap = (v: number) => Math.round(v / S) * S + S / 2;

  return {
    draw(ctx, W, H, t, alpha, theme, pointer, still, shot) {
      const at = shot ?? SHOT;
      const fresh = lastT < 0 || t < lastT;
      const dt = fresh ? 0.016 : Math.min(t - lastT, 0.064);
      if (fresh) {
        origin.x = pointer.on ? pointer.x : W / 2;
        origin.y = pointer.on ? pointer.y : H / 2;
        steer.yaw = 0;
        steer.pitch = 0;
      }
      lastT = t;
      const dpr = ctx.getTransform().a;

      const key = `${W}x${H}@${dpr}:${theme.ink}`;
      if (key !== paperKey) {
        paperKey = key;
        paper.width = Math.round(W * dpr);
        paper.height = Math.round(H * dpr);
        const p = paper.getContext("2d")!;
        p.setTransform(dpr, 0, 0, dpr, 0, 0);
        p.fillStyle = `rgba(${theme.ink},${theme.dark ? 0.12 : 0.09})`;
        p.beginPath();
        for (let y = S / 2; y < H; y += S) {
          for (let x = S / 2; x < W; x += S) {
            p.moveTo(x + 0.55, y);
            p.arc(x, y, 0.55, 0, TAU);
          }
        }
        p.fill();
      }

      // The page of lumen is its own paper: opaque, over the scene behind this site.
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${theme.bg})`;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(paper, 0, 0, W, H);

      // The camera: the slow orbit of the original, steered by the pointer, plus the fall.
      const s = still ? 8 : t;
      let wantYaw = 0;
      let wantPitch = 0;
      if (pointer.on && !still) {
        wantYaw = ((pointer.x - origin.x) / W) * 2.4;
        wantPitch = ((pointer.y - origin.y) / H) * 0.9;
      }
      const e = 1 - Math.pow(0.06, dt);
      steer.yaw += (wantYaw - steer.yaw) * e;
      steer.pitch += (wantPitch - steer.pitch) * e;
      const fall = still ? 1 : easeInOut(Math.min(1, t / FALL));
      cam.yaw = -0.7 + (s * TAU) / 60 + steer.yaw - (1 - fall) * 1.2;
      cam.pitch = Math.max(-1.1, Math.min(1.1, 0.18 + Math.sin(s * 0.21) * 0.22 + steer.pitch));
      cam.dist =
        SHOT.dist *
        (1 + 0.16 * Math.sin(s * 0.17) + 0.06 * Math.sin(s * 0.41 + 1)) *
        (1 + (FAR - 1) * (1 - fall));
      const speed = still
        ? 0
        : (Math.abs(cam.yaw - prevYaw) * 60 + Math.abs(cam.dist - prevDist) * 6) /
          Math.max(1, dt / 0.016);
      prevYaw = cam.yaw;
      prevDist = cam.dist;
      const streak = Math.min(1, Math.max(0, speed - 0.25));

      const cy_ = Math.cos(cam.yaw);
      const sy_ = Math.sin(cam.yaw);
      const cp = Math.cos(cam.pitch);
      const sp = Math.sin(cam.pitch);
      const fwd = { x: -sy_ * cp, y: -sp, z: -cy_ * cp };
      const right = { x: cy_, y: 0, z: -sy_ };
      const up = {
        x: right.y * fwd.z - right.z * fwd.y,
        y: right.z * fwd.x - right.x * fwd.z,
        z: right.x * fwd.y - right.y * fwd.x,
      };
      const pos = { x: -fwd.x * cam.dist, y: -fwd.y * cam.dist, z: -fwd.z * cam.dist };

      const cx = at.ax * W;
      const cy = at.ay * H;
      const restR = at.size * H;
      const focal = restR * Math.sqrt(SHOT.dist * SHOT.dist - 1);
      const R = focal / Math.sqrt(cam.dist * cam.dist - 1);
      const dark = theme.dark;
      ctx.fillStyle = `rgb(${theme.ink})`;

      const ga = (v: number) => {
        ctx.globalAlpha = v * alpha;
      };
      const dotAt = (x: number, y: number, r: number) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      };

      // Stars, with a streak of cells behind each while the camera moves fast.
      for (const star of stars) {
        const px = star.x - pos.x;
        const py = star.y - pos.y;
        const pz = star.z - pos.z;
        const vz = px * fwd.x + py * fwd.y + pz * fwd.z;
        if (vz < 0.5) {
          star.lastX = -1;
          continue;
        }
        const sx = cx + (focal * (px * right.x + py * right.y + pz * right.z)) / vz;
        const sy = cy - (focal * (px * up.x + py * up.y + pz * up.z)) / vz;
        const lastX = star.lastX;
        const lastY = star.lastY;
        star.lastX = sx;
        star.lastY = sy;
        if (sx < -S || sx > W + S || sy < -S || sy > H + S) continue;
        const ox = sx - cx;
        const oy = sy - cy;
        if (ox * ox + oy * oy < R * R * 1.1 && vz > cam.dist) continue;
        const near = Math.min(1, 9 / vz);
        const beat = still
          ? 0.7
          : 0.55 + 0.45 * Math.sin((s / (2.5 + star.seed * 5)) * TAU + star.seed * 40);
        const a = (dark ? 0.2 : 0.1) + near * beat * (dark ? 0.75 : 0.4);
        if (streak > 0.05 && lastX >= 0) {
          const dx = sx - lastX;
          const dy = sy - lastY;
          const reach = 2 + streak * 6;
          const steps = Math.min(40, Math.floor((Math.hypot(dx, dy) * reach) / S));
          for (let k = 1; k <= steps; k++) {
            const f = k / (steps + 1);
            ga(a * (1 - f) * streak);
            dotAt(snap(sx - dx * f * reach), snap(sy - dy * f * reach), 0.6 + near * 0.6);
          }
        }
        ga(a);
        dotAt(snap(sx), snap(sy), 0.6 + near * (0.5 + star.seed * 1.1) * beat);
      }

      // The sphere, sampled at the lattice cells and lit by a fixed sun.
      const lx = SUN.x * right.x + SUN.y * right.y + SUN.z * right.z;
      const ly = -(SUN.x * up.x + SUN.y * up.y + SUN.z * up.z);
      const lz = -(SUN.x * fwd.x + SUN.y * fwd.y + SUN.z * fwd.z);
      if (R > S * 0.6) {
        ga(1);
        const ya = Math.floor((cy - R) / S) * S + S / 2;
        const xa = Math.floor((cx - R) / S) * S + S / 2;
        for (let y = ya; y < cy + R; y += S) {
          for (let x = xa; x < cx + R; x += S) {
            const nx = (x - cx) / R;
            const ny = (y - cy) / R;
            const q = nx * nx + ny * ny;
            if (q > 1) continue;
            const nz = Math.sqrt(1 - q);
            const ndl = nx * lx + ny * ly + nz * lz;
            const lambert = Math.max(0, (ndl + 0.15) / 1.15);
            const rz = Math.min(1, Math.max(0, 2 * ndl * nz - lz));
            const lit = Math.min(1, 0.04 + 0.86 * lambert + 0.3 * Math.pow(rz, 24));
            const cover = Math.max(0, Math.min(1, ((1 - Math.sqrt(q)) * R) / S + 0.5));
            const inkv = dark
              ? cover * Math.min(0.7, 0.74 * Math.pow(lit, 1.3))
              : cover * Math.max(0.03, (0.4 + 0.6 * nz) * 0.66 * Math.pow(1 - lit, 1.2));
            const rad = S * 0.56 * Math.sqrt(inkv);
            if (rad >= 0.55) dotAt(x, y, rad);
          }
        }
      }

      const particle = (
        wx: number,
        wy: number,
        wz: number,
        a: number,
        size: number,
        hole: { x: number; y: number; r: number; z: number } | null,
      ) => {
        const px = wx - pos.x;
        const py = wy - pos.y;
        const pz = wz - pos.z;
        const vz = px * fwd.x + py * fwd.y + pz * fwd.z;
        if (vz < 0.5) return;
        const sx = cx + (focal * (px * right.x + py * right.y + pz * right.z)) / vz;
        const sy = cy - (focal * (px * up.x + py * up.y + pz * up.z)) / vz;
        if (sx < 0 || sx > W || sy < 0 || sy > H) return;
        const ox = sx - cx;
        const oy = sy - cy;
        if (ox * ox + oy * oy < R * R && vz > cam.dist) return;
        if (hole && vz > hole.z) {
          const hx = sx - hole.x;
          const hy = sy - hole.y;
          if (hx * hx + hy * hy < hole.r * hole.r) return;
        }
        ga(a);
        dotAt(snap(sx), snap(sy), size);
      };

      // The galaxy turns once every ten minutes; the disk round the hole much faster.
      const level = dark ? 0.9 : 0.55;
      const gf = GAL.f;
      const gs = (s * TAU) / 600;
      for (const g of GALAXY) {
        const a = g.a + gs;
        const r = g.t * GAL.r;
        const u = Math.cos(a) * r;
        const w = Math.sin(a) * r;
        const h = (g.tone - 0.5) * GAL.r * 0.04 * (1 - g.t);
        const bright = g.t < 0.18 ? 0.8 : 0.25 + 0.4 * g.tone;
        particle(
          GAL.c.x + gf.u.x * u + gf.w.x * w + gf.n.x * h,
          GAL.c.y + gf.u.y * u + gf.w.y * w + gf.n.y * h,
          GAL.c.z + gf.u.z * u + gf.w.z * w + gf.n.z * h,
          level * bright * 0.6,
          0.6 + bright * 0.5,
          null,
        );
      }

      const hp = { x: HOLE.c.x - pos.x, y: HOLE.c.y - pos.y, z: HOLE.c.z - pos.z };
      const hz = hp.x * fwd.x + hp.y * fwd.y + hp.z * fwd.z;
      if (hz >= 1) {
        const hole = {
          x: cx + (focal * (hp.x * right.x + hp.y * right.y + hp.z * right.z)) / hz,
          y: cy - (focal * (hp.x * up.x + hp.y * up.y + hp.z * up.z)) / hz,
          r: (focal * HOLE.shadow) / hz,
          z: hz,
        };
        const f = HOLE.f;
        for (const d of DISK) {
          const da = d.a + s * 0.9 * Math.pow(7 / d.r, 1.5);
          const du = Math.cos(da) * d.r;
          const dw = Math.sin(da) * d.r;
          const heat = Math.pow(7 / d.r, 1.3);
          particle(
            HOLE.c.x + f.u.x * du + f.w.x * dw + f.n.x * d.h,
            HOLE.c.y + f.u.y * du + f.w.y * dw + f.n.y * d.h,
            HOLE.c.z + f.u.z * du + f.w.z * dw + f.n.z * d.h,
            level * (0.3 + 0.7 * heat),
            0.6 + heat * 1.2,
            hole,
          );
        }
        // The ring of bent light, just outside the shadow.
        const n = Math.max(24, Math.floor((TAU * hole.r * 1.12) / S));
        ga(level);
        for (let k = 0; k < n; k++) {
          const ra = (k / n) * TAU;
          dotAt(
            snap(hole.x + Math.cos(ra) * hole.r * 1.12),
            snap(hole.y + Math.sin(ra) * hole.r * 1.12),
            1.3,
          );
        }
      }

      // The belt, after the sphere: bodies in front print over it, bodies behind are hidden.
      const spin = (s * TAU) / 90;
      const base = dark ? 0.85 : 0.6;
      for (const body of BELT) {
        const a = body.a + spin * Math.pow(2.2 / body.r, 1.5);
        const px = Math.cos(a) * body.r - pos.x;
        const py = body.h + Math.cos(a) * 0.22 - pos.y;
        const pz = Math.sin(a) * body.r - pos.z;
        const vz = px * fwd.x + py * fwd.y + pz * fwd.z;
        if (vz < 0.3) continue;
        const sx = cx + (focal * (px * right.x + py * right.y + pz * right.z)) / vz;
        const sy = cy - (focal * (px * up.x + py * up.y + pz * up.z)) / vz;
        const ox = sx - cx;
        const oy = sy - cy;
        if (ox * ox + oy * oy < R * R && vz > cam.dist) continue;
        ga(base);
        dotAt(snap(sx), snap(sy), 0.7 + Math.min(1, 2.4 / vz) * 1.6);
      }
      ctx.globalAlpha = 1;
    },
  };
}
