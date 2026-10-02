/* The megastructure behind the page: one flat disc of orbits, seen at a low angle, with a
 * black hole at its centre and a camera that never stops falling toward it.
 *
 * The disc is tracks, scales and links, drawn as flat white hairlines on black. Tracks are
 * circles round the centre. A scale is a row of ticks on a track. A link is one straight line
 * from a track to the next. Together they read as something built and measured, at a size
 * where a planet's rings are a detail.
 *
 * The whole pattern is drawn in log-polar coordinates: v = log(radius), and the angle. In that
 * space a zoom toward the centre is a plain slide along v. So the zoom needs no trick to run
 * forever. There is no loop point and nothing repeats: every track has a number, the number
 * seeds a hash, and the hash decides whether the track exists, how bright it is, which way it
 * turns and what hangs off it. Falling for an hour shows an hour of tracks never seen before.
 *
 * Detail is layered in octaves, each three times finer than the last. An octave is drawn only
 * while its cells are larger than a few pixels. So as a region of the disc comes toward the
 * camera, finer structure keeps resolving inside it. That is the fall from the largest scale
 * to the smallest: the camera never arrives, because there is always another layer under the
 * one it has just reached.
 *
 * Three scenes were built before this one and thrown away: a ray-marched city of stacked boxes
 * shaded with a sun and fog, the same city as outlines, and a city of real geometry. Each was
 * a picture of buildings, and buildings invite the question of whether they look like
 * buildings. A disc of orbits has no such test to fail. It only has to be vast and exact.
 *
 * Nothing here touches React. The loop owns its own clock and writes uniforms.
 */

import { calmMotion } from "./motion";

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uZoom;     // how far the fall has gone, in factors of three
uniform vec3 uRo;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uFocal;
uniform float uShift;    // where the optical centre sits on screen
uniform float uGain;
uniform float uPulse;    // radius of the shock ring
uniform float uPulseAmp;
out vec4 frag;

const float TAU = 6.2831853;
const float L3 = 1.0986123;
/** Radius of the hole, in view units. It does not scale: the disc flows out from under it. */
const float HOLE = 0.085;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/* A line at x = 0 in a space where one pixel is 'w' wide. 'px' is the line width in pixels.
   When a pixel covers many lines the result tends to the average, not to noise. */
float stroke(float x, float w, float px) {
  return 1.0 - smoothstep(0.5 * px * w, (0.5 * px + 1.0) * w, abs(x));
}

/* One octave of the disc. 'v' is log-radius in the disc's own frame, 'th' the angle, 'n' the
   number of tracks per factor of three, 'm' the number of cells round the circle, 'foot' the
   size of a pixel along v and along the turn.

   The drawing is Swiss: one line weight, flat white, a lot of black. An octave has only three
   kinds of mark. A track is a full circle or a run of dashes. A scale is a row of short ticks
   standing on a track, like the edge of a dial. A link is one straight line from a track to
   the next. Most cells are empty, and that emptiness is the design. An earlier version filled
   every cell with glow, dust, diagonals and junctions, and it read as noise. */
float octave(float v, float th, float n, float m, vec2 foot, float seed) {
  float a = v * n;
  float da = n * foot.x;
  // Tracks closer than about five pixels are not drawn. The octave above carries the region.
  float show = 1.0 - smoothstep(0.1, 0.2, da);
  if (show <= 0.0) return 0.0;

  float i = floor(a);
  float fa = a - i;
  float h = hash(vec2(i, seed));

  // Each track turns at its own rate and in its own direction, so the disc is never still.
  float b = (th / TAU + uTime * (h - 0.5) * 0.04 / (1.0 + seed)) * m;
  float j = mod(floor(b), m);
  float fb = fract(b);
  float db = m * foot.y;
  // A tick or a link is dropped where the cells round the circle are too thin to hold it.
  float cross_ = 1.0 - smoothstep(0.12, 0.25, db);
  float c = hash(vec2(i * 7.0 + seed * 31.0, j));

  float ink = 0.0;

  if (h > 0.45) {
    // A track. One in three is dashed: every other cell is left out.
    float dash = h > 0.82 ? step(0.5, fract(j * 0.5 + 0.25)) : 1.0;
    ink = max(ink, stroke(fa, da, 1.0) * dash);
    // A scale on some tracks: one tick per cell, a tenth of the way to the next track.
    if (h > 0.9 || (h > 0.6 && h < 0.66)) {
      ink = max(ink, stroke(fb - 0.5, db, 1.0) * step(fa, 0.12) * cross_);
    }
    // A link to the next track, in one cell out of fourteen.
    if (c < 0.07) ink = max(ink, stroke(fb - 0.5, db, 1.0) * cross_);
  }

  return ink * show;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv.y -= uShift;
  vec3 rd = normalize(uRight * uv.x + uUp * uv.y + uFwd * uFocal);
  float ink = 0.0;

  // Where the centre of the disc lands on screen, and how far away it is.
  float cz = dot(-uRo, uFwd);
  vec2 centre = vec2(dot(-uRo, uRight), dot(-uRo, uUp)) * uFocal / cz;
  float fromCentre = length(uv - centre);
  float holeR = HOLE * uFocal / cz;

  float t = -uRo.y / rd.y;
  bool onDisc = rd.y < 0.0 && t > 0.0;

  if (onDisc) {
    vec3 p = uRo + rd * t;
    float r = length(p.xz);

    // The size of this pixel on the disc. Every line is antialiased against it, so the far
    // side thins out and never turns to moire.
    // Measured along the radius and round the circle separately. Near the horizon a pixel is
    // long one way and thin the other, and one number for both drew ticks as thick smears.
    vec2 dx = dFdx(p.xz);
    vec2 dy = dFdy(p.xz);
    float r2 = r * r;
    vec2 foot = vec2(
      length(vec2(dot(p.xz, dx), dot(p.xz, dy))) / (r2 * L3),
      length(vec2(p.x * dx.y - p.z * dx.x, p.x * dy.y - p.z * dy.x)) / (r2 * TAU));

    float v = log(r) / L3 - uZoom;
    float th = atan(p.z, p.x);

    // Three weights of grey, flat. No tint, no glow, no fade with distance.
    ink = max(ink, octave(v, th, 2.0, 24.0, foot, 0.0));
    ink = max(ink, octave(v, th, 8.0, 96.0, foot, 1.0) * 0.5);
    ink = max(ink, octave(v, th, 32.0, 384.0, foot, 2.0) * 0.26);

    // The shock ring: one more circle, travelling outward.
    ink = max(ink, stroke((log(r) - log(uPulse)) / L3, foot.x, 1.5) * uPulseAmp);

    ink *= step(HOLE, r);
    // The hole is a sphere in the plane: it hides the part of the disc behind it.
    if (t > length(uRo) && fromCentre < holeR) ink = 0.0;
  }

  // The hole itself is black, with one hairline round it.
  float hair = 1.3 / uRes.y;
  ink = max(ink, 1.0 - smoothstep(hair, 2.0 * hair, abs(fromCentre - holeR)));

  vec3 col = vec3(pow(ink * uGain, 0.4545));
  frag = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------------------ tuning */

/** Factors of three per second when nothing is happening. Never zero: the fall does not stop. */
const DRIFT = 0.045;
/** Factors of three per second while an answer is being produced. */
const DRIFT_BUSY = 0.3;
const SPEED_MAX = 1.6;
/** Seconds for a burst of speed to fall back to the drift. */
const SETTLE = 2.2;

/** Length of the opening shot, in seconds. */
const INTRO = 4.2;
/** When the page content is allowed in, in seconds. The shot is still landing behind it. */
const REVEAL_AT = 2.4;

export interface Megastructure {
  /** A burst of speed and a shock ring. Strength 1 is a sent question. */
  kick(strength?: number): void;
  setBusy(busy: boolean): void;
  /** The chat pose: higher, dimmer, and deaf to the wheel, which the thread needs. */
  setChat(chat: boolean): void;
  destroy(): void;
}

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("megastructure: shader did not compile", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

/**
 * Starts the scene on `canvas`. Returns null when WebGL 2 is not available, and the caller
 * then keeps the line field it had before.
 *
 * `onReveal` fires once, when the opening shot is far enough along for the page content to
 * come in over it.
 */
export function startMegastructure(
  canvas: HTMLCanvasElement,
  onReveal: () => void,
): Megastructure | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const calm = calmMotion();

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("megastructure: program did not link", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // One triangle that covers the screen. No seam down a diagonal, and one less vertex.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = (name: string) => gl.getUniformLocation(prog, name);
  const u = {
    res: U("uRes"),
    time: U("uTime"),
    zoom: U("uZoom"),
    ro: U("uRo"),
    right: U("uRight"),
    up: U("uUp"),
    fwd: U("uFwd"),
    focal: U("uFocal"),
    shift: U("uShift"),
    gain: U("uGain"),
    pulse: U("uPulse"),
    pulseAmp: U("uPulseAmp"),
  };

  /* The lines are one pixel wide, so the canvas runs at the real resolution of the screen, up
     to 2x. The shader is a few hashes per pixel with no loop over space, and that is cheap
     enough to afford it. */
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(window.innerWidth * dpr));
    canvas.height = Math.max(2, Math.round(window.innerHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  /* --------------------------------------------------------------------- state */
  let zoom = 0;
  let speed = DRIFT;
  let busy = false;
  let chat = false;
  let chatMix = 0;

  // Pointer, as -1..1 across the window. `look` trails it, so the view turns late and gently.
  let mx = 0;
  let my = 0;
  let lookX = 0;
  let lookY = 0;
  let lastX = -1;
  let lastY = -1;

  let pulseAt = -10;
  let pulseAmp = 0;
  let focal = 1.05;

  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    onReveal();
  };

  /* Scene time is summed from frame steps, not read off the wall clock. A tab that was hidden
     during the opening shot comes back to the shot where it left it, not to its end. */
  let time = 0;
  let last = performance.now();
  let raf = 0;

  const frame = (now: number) => {
    raf = calm ? 0 : requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tick(dt);
  };

  const tick = (dt: number) => {
    time += dt;

    /* The opening shot. It starts directly above the disc, far out and turning, so the first
       thing on screen is the whole structure as a diagram: circles inside circles. Then the
       camera comes down to a low angle while the zoom rushes inward, and the diagram becomes
       a horizon. `a` runs 0..1 over the shot. */
    const a = calm ? 1 : clamp01(time / INTRO);
    const land = smooth((a - 0.22) / 0.78);
    if (a >= REVEAL_AT / INTRO) reveal();

    // Speed falls back toward the drift, and the opening adds a burst that dies away.
    const drift = busy ? DRIFT_BUSY : DRIFT;
    speed += (drift - speed) * (1 - Math.exp(-dt / SETTLE));
    const dive = calm ? 0 : 2.6 * Math.exp(-time / 1.1);
    zoom += (speed + dive) * dt;

    chatMix += ((chat ? 1 : 0) - chatMix) * (1 - Math.exp(-dt / 0.7));
    lookX += (mx - lookX) * (1 - Math.exp(-dt / 0.5));
    lookY += (my - lookY) * (1 - Math.exp(-dt / 0.5));

    /* The camera circles the centre at a fixed distance and comes down from overhead. The
       elevation is the whole composition: 90 degrees is a diagram, 14 is a planet's rings seen
       from just above their plane. The pointer raises and lowers it a little, and swings the
       camera round the hole. */
    const elev = mix(1.5, mix(0.24, 0.5, chatMix), land) - lookY * 0.07 * land + 0.012 * Math.sin(time * 0.27);
    const around = -1.9 * Math.pow(1 - a, 2.4) + lookX * 0.28 * land + time * 0.012;
    const dist = mix(2.2, 1.25, land);
    const ro: V3 = [
      dist * Math.cos(elev) * Math.sin(around),
      dist * Math.sin(elev),
      dist * Math.cos(elev) * Math.cos(around),
    ];

    const fwd = norm(sub([0, 0, 0], ro));
    // Straight overhead, "up" is not defined by the horizon. Use the direction of travel.
    const hint: V3 = Math.abs(fwd[1]) > 0.999 ? [Math.sin(around), 0, Math.cos(around)] : [0, 1, 0];
    const right = norm(cross(fwd, hint));
    const up = cross(right, fwd);

    // Speed opens the lens, which is what makes a fast zoom read as fast.
    const rush = clamp01(Math.abs(speed + dive) / SPEED_MAX);
    focal += (mix(1.05, 0.74, rush) - focal) * (1 - Math.exp(-dt / 0.25));

    const pulseAge = time - pulseAt;

    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, time);
    // Wrapped far out, so the track numbers stay small enough to hash exactly.
    gl.uniform1f(u.zoom, zoom % 2187);
    gl.uniform3f(u.ro, ro[0], ro[1], ro[2]);
    gl.uniform3f(u.right, right[0], right[1], right[2]);
    gl.uniform3f(u.up, up[0], up[1], up[2]);
    gl.uniform3f(u.fwd, fwd[0], fwd[1], fwd[2]);
    gl.uniform1f(u.focal, focal);
    // The hole sits above the heading on the landing page, and dead centre in chat.
    gl.uniform1f(u.shift, mix(0.27, 0, chatMix) * land);
    /* The lines are mid grey, never white. White is kept for the text. The first flat version
       drew both at full white, and the heading had lines of its own weight running through
       it. Value is the only thing that separates the two layers, so they must not share one. */
    gl.uniform1f(u.gain, (calm ? 1 : smooth(time / 0.8)) * mix(0.13, 0.035, chatMix));
    gl.uniform1f(u.pulse, 0.04 * Math.exp(Math.max(0, pulseAge) * 3.6));
    gl.uniform1f(u.pulseAmp, pulseAge < 1.8 ? pulseAmp * (1 - pulseAge / 1.8) : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /* --------------------------------------------------------------------- input
   * Any movement of the pointer feeds the fall. The amount is the distance travelled as a
   * fraction of the window, so a small window and a large one feel the same. */
  const onPointer = (e: PointerEvent) => {
    mx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    my = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    if (lastX >= 0) {
      const d =
        Math.hypot(e.clientX - lastX, e.clientY - lastY) /
        Math.max(window.innerWidth, window.innerHeight);
      speed = Math.min(SPEED_MAX, speed + d * (chat ? 0.5 : 1.8));
    }
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onLeave = () => {
    lastX = -1;
  };

  /* The wheel flies the zoom directly, in both directions, on the landing page only. In chat
     the wheel belongs to the thread. Passive: nothing here needs to cancel a scroll. */
  const onWheel = (e: WheelEvent) => {
    if (chat) return;
    speed = Math.max(-SPEED_MAX, Math.min(SPEED_MAX, speed + e.deltaY * 0.0022));
  };

  const kick = (strength = 1) => {
    speed = Math.min(SPEED_MAX, speed + 1.1 * strength);
    pulseAt = time;
    pulseAmp = strength;
  };

  // A click during the opening shot means the visitor is done watching it.
  const onDown = () => reveal();

  const onVisible = () => {
    if (calm) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  const onResize = () => {
    resize();
    if (calm) tick(0);
  };

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisible);
  if (calm) {
    // One still frame, at rest above the disc. No loop and no input.
    tick(0);
  } else {
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("keydown", reveal);
    window.addEventListener("wheel", onWheel, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(frame);
  }

  /* Development only. A hidden tab gets no animation frames, so a test cannot watch the scene
     run; this steps it by hand. `__megaStep(2)` advances two seconds and returns the mean cost
     of a frame in milliseconds, measured with the GPU forced to finish. A negative argument
     rewinds to the first frame of the opening shot. */
  if (import.meta.env.DEV) {
    (window as unknown as { __megaStep?: (seconds: number) => number }).__megaStep = (seconds) => {
      if (seconds < 0) {
        time = 0;
        zoom = 0;
        speed = DRIFT;
        return 0;
      }
      const n = Math.max(1, Math.round(seconds * 60));
      const px = new Uint8Array(4);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        tick(1 / 60);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      return (performance.now() - t0) / n;
    };
  }

  return {
    kick,
    setBusy: (b) => {
      busy = b;
    },
    setChat: (c) => {
      chat = c;
    },
    /* The context is left alone. React runs an effect twice in development, and a second
       getContext on the same canvas returns the same context: losing it here would hand the
       second run a dead one. */
    destroy: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", reveal);
      window.removeEventListener("wheel", onWheel);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    },
  };
}
