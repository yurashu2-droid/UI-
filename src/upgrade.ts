/* OS upgrade transition — rumbling tile wave.
   The screen is a grid of square tiles. A wave rolls from the top-right corner toward the bottom-left;
   as it passes, each tile launches toward the viewer as a 3D block (perspective toward the screen
   centre, lit sides, accent tint), rolls, flips from the old OS to the new one at its peak, drops like
   a rock, slams down and bounces. Slams knock debris loose, shake the whole screen and thud. The new
   OS is applied immediately underneath a frozen copy of the old screen (the "ghost"), which is cut
   away behind the peak. */

import { audio } from "./audio.js";

export interface UpgradeOptions {
  /** Era class of the outgoing OS (e.g. "era-98"); the ghost keeps it. */
  fromClass: string;
  /** Accent colour of the incoming era (tints the blocks). */
  accent: string;
  swap(): void;
  reduced?: boolean;
}

const TILE = 40;
const DURATION = 1.75; // seconds for the wave to travel from the origin past the farthest tile
const WIDTH = 340; // px of distance covered by one tile's launch-slam-bounce
const HMAX = 190; // how far a tile rises toward the viewer (perspective depth)
const FOCAL = 1000;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOutSoft = (t: number) => 1 - Math.pow(1 - t, 1.4);

type RGB = [number, number, number];
function parse(color: string): [number, number, number, number] | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
function hex(c: string): RGB {
  const m = c.match(/^#([0-9a-f]{6})/i);
  if (!m) return [120, 230, 220];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
// Colour painted at a screen point: nearest ancestor with an opaque-ish background.
function sample(x: number, y: number): RGB {
  let el = document.elementFromPoint(x, y) as HTMLElement | null;
  for (let depth = 0; el && depth < 10; depth++, el = el.parentElement) {
    const c = parse(getComputedStyle(el).backgroundColor);
    if (c && c[3] > 0.45) return [c[0], c[1], c[2]];
  }
  return [40, 60, 80];
}
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c: RGB, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// Frozen copy of the current screen, including canvas pixels, scroll offsets and form values.
function makeGhost(fromClass: string): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "os-ghost " + fromClass;
  ghost.setAttribute("aria-hidden", "true");
  const src = Array.from(document.body.children).filter(
    (c) => c.tagName !== "SCRIPT" && !c.classList.contains("os-ghost") && !c.classList.contains("cer-overlay"),
  );
  for (const child of src) ghost.append(child.cloneNode(true));
  document.body.append(ghost);
  const srcAll: Element[] = [],
    dstAll: Element[] = [];
  for (const c of src) srcAll.push(c, ...Array.from(c.querySelectorAll("*")));
  for (const c of Array.from(ghost.children)) dstAll.push(c, ...Array.from(c.querySelectorAll("*")));
  const n = Math.min(srcAll.length, dstAll.length);
  for (let i = 0; i < n; i++) {
    const a = srcAll[i] as HTMLElement,
      b = dstAll[i] as HTMLElement;
    if (a.tagName !== b.tagName) break;
    if (a.scrollTop || a.scrollLeft) {
      b.scrollTop = a.scrollTop;
      b.scrollLeft = a.scrollLeft;
    }
    if (a instanceof HTMLCanvasElement && b instanceof HTMLCanvasElement && a.width && a.height) {
      try {
        b.getContext("2d")?.drawImage(a, 0, 0);
      } catch {
        /* tainted or webgl: leave blank */
      }
    }
    if (a instanceof HTMLInputElement && b instanceof HTMLInputElement) {
      b.value = a.value;
      b.checked = a.checked;
    }
  }
  return ghost;
}

// Height over a tile's local phase u ∈ (0,1): shoot up, drop like a rock, slam at .55, bounce twice.
function height(u: number): number {
  if (u < 0.3) return Math.sin((u / 0.3) * Math.PI * 0.5);
  if (u < 0.55) {
    const v = (u - 0.3) / 0.25;
    return 1 - v * v;
  }
  if (u < 0.8) return 0.32 * Math.sin(((u - 0.55) / 0.25) * Math.PI);
  return 0.1 * Math.sin(((u - 0.8) / 0.2) * Math.PI);
}

export function playOsUpgrade(o: UpgradeOptions): Promise<void> {
  if (o.reduced || typeof document === "undefined") {
    o.swap();
    return Promise.resolve();
  }
  return tileWave({ ghost: makeGhost(o.fromClass), accent: o.accent, swap: o.swap });
}

export interface WaveOptions {
  /** Element showing the OLD state on top of everything; it is cut away by the wave and removed at the end. */
  ghost: HTMLElement;
  /** Where the wave canvas is attached (a modal <dialog> must host its own). Default: body. */
  host?: HTMLElement;
  /** Element rattled by the screen shake. Default: <html>. */
  shake?: HTMLElement;
  accent: string;
  /** Switch the real UI to the NEW state (called once, before the wave starts). */
  swap(): void;
  volume?: number;
}

/** The rumbling tile wave, usable on any ghost/new-state pair. */
export function tileWave(o: WaveOptions): Promise<void> {
  const ghost = o.ghost;
  const w = window.innerWidth,
    h = window.innerHeight,
    cols = Math.ceil(w / TILE),
    rows = Math.ceil(h / TILE),
    n = cols * rows;
  const at = (i: number, j: number): [number, number] => [Math.min(w - 1, i * TILE + TILE / 2), Math.min(h - 1, j * TILE + TILE / 2)];
  const oldC: RGB[] = new Array(n),
    newC: RGB[] = new Array(n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) oldC[j * cols + i] = sample(...at(i, j));

  o.swap(); // the real UI underneath is already the new state
  ghost.style.visibility = "hidden"; // sample the new OS (no paint happens in between)
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) newC[j * cols + i] = sample(...at(i, j));
  ghost.style.visibility = "";

  const tint = mix(hex(o.accent), [255, 255, 255], 0.55);
  // Wave origin: top-right corner, so the wave rolls toward the bottom-left. Blocks lean away from the centre.
  const ox = w,
    oy = 0,
    vx = w / 2,
    vy = h / 2;
  const dist = new Float32Array(n),
    lift = new Float32Array(n), // per-tile height variance: a lumpy, rolling wave rather than a clean sheet
    tilt = new Float32Array(n), // per-tile roll while airborne
    state = new Uint8Array(n); // bit 1: peaked (debris spawned), bit 2: slammed (thud)
  let far = 0;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i,
        [x, y] = at(i, j);
      const d = Math.hypot(x - ox, y - oy) + Math.random() * 46;
      dist[k] = d;
      lift[k] = 0.55 + Math.random() * 0.9;
      tilt[k] = (Math.random() - 0.5) * 1.1;
      far = Math.max(far, d);
    }

  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", zIndex: "1400", pointerEvents: "none" });
    (o.host ?? document.body).append(canvas);
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const root = o.shake ?? document.documentElement,
      prevTransform = root.style.transform;
    const finish = () => {
      root.style.transform = prevTransform;
      canvas.remove();
      ghost.remove();
      resolve();
    };
    if (!ctx) {
      finish();
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    audio.sfx("rumble", { volume: o.volume ?? 1.6 });
    const quad = (pts: number[], fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let q = 2; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]);
      ctx.closePath();
      ctx.fill();
    };
    type Up = { k: number; i: number; j: number; z: number; u: number };
    type Chip = { x: number; y: number; vx: number; vy: number; s: number; c: RGB; age: number; life: number };
    const ups: Up[] = [],
      chips: Chip[] = [];
    let trauma = 0.35,
      last = performance.now();
    const start = last;
    const frame = (now: number) => {
      const t = Math.max(0, (now - start) / 1000),
        dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const R = -WIDTH / 2 + (far + WIDTH) * easeOutSoft(clamp01(t / DURATION));
      // The ghost survives outside the flip circle (tiles flip at their peak, u = .3).
      const r = Math.max(0, R - WIDTH * 0.2);
      ghost.style.clipPath =
        r <= 0 ? "" : `path(evenodd, "M0 0 H${w} V${h} H0 Z M${ox - r} ${oy} A${r} ${r} 0 1 0 ${ox + r} ${oy} A${r} ${r} 0 1 0 ${ox - r} ${oy} Z")`;
      ctx.clearRect(0, 0, w, h);
      ups.length = 0;
      let landed = 0,
        landX = 0;
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i,
            u = (R - dist[k]) / WIDTH + 0.5;
          if (u <= 0 || u >= 1) continue;
          if (u >= 0.3 && !(state[k] & 1)) {
            state[k] |= 1;
            if (Math.random() < 0.45) {
              // Debris knocked loose at the peak, thrown away from the wave origin.
              const a = Math.atan2(j * TILE - oy, i * TILE - ox) + (Math.random() - 0.5) * 1.6,
                sp = 120 + Math.random() * 320;
              chips.push({
                x: i * TILE + TILE / 2,
                y: j * TILE + TILE / 2,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 260 - Math.random() * 200,
                s: 5 + Math.random() * 9,
                c: Math.random() < 0.5 ? oldC[k] : tint,
                age: 0,
                life: 0.5 + Math.random() * 0.6,
              });
            }
          }
          if (u >= 0.55 && !(state[k] & 2)) {
            state[k] |= 2;
            landed++;
            landX += i * TILE;
          }
          ups.push({ k, i, j, z: height(u) * lift[k], u });
        }
      if (landed) {
        trauma = Math.min(1, trauma + landed * 0.012);
        audio.sfx("thud", { volume: Math.min(1.8, 0.6 + landed * 0.05), pan: (landX / landed / w) * 2 - 1, pitch: 0.8 + Math.random() * 0.4 });
      }
      // Screen shake: the whole OS rattles while blocks slam down.
      trauma = Math.max(0, trauma - dt * 1.4);
      const sh = trauma * trauma * 14;
      root.style.transform =
        sh > 0.3 ? `translate(${((Math.random() - 0.5) * 2 * sh).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * sh).toFixed(1)}px)` : prevTransform;

      // Pits under raised tiles first (the gap reads as depth), then blocks from low to high.
      for (const p of ups) {
        ctx.fillStyle = `rgba(4,8,14,${Math.min(0.75, 0.6 * p.z)})`;
        ctx.fillRect(p.i * TILE, p.j * TILE, TILE, TILE);
      }
      ups.sort((a, b) => a.z - b.z);
      for (const p of ups) {
        const s = FOCAL / (FOCAL - p.z * HMAX),
          x0 = p.i * TILE,
          y0 = p.j * TILE,
          x1 = x0 + TILE,
          y1 = y0 + TILE,
          mx = x0 + TILE / 2,
          my = y0 + TILE / 2;
        // Top face: the base square rolled about its centre, then pushed toward the viewer.
        const ang = tilt[p.k] * Math.min(1, p.z) * (p.u < 0.55 ? 1 : 0.3),
          ca = Math.cos(ang),
          sa = Math.sin(ang);
        const T = (x: number, y: number): [number, number] => {
          const rx = mx + (x - mx) * ca - (y - my) * sa,
            ry = my + (x - mx) * sa + (y - my) * ca;
          return [vx + (rx - vx) * s, vy + (ry - vy) * s];
        };
        const [ax, ay] = T(x0, y0),
          [bx, by] = T(x1, y0),
          [cx, cy] = T(x1, y1),
          [dx, dy] = T(x0, y1);
        const top = mix(p.u < 0.3 ? oldC[p.k] : newC[p.k], tint, Math.min(0.75, 0.6 * p.z));
        // Side walls (those facing the centre end up under the top face).
        quad([x0, y0, x1, y0, bx, by, ax, ay], css(top, 0.92));
        quad([x1, y0, x1, y1, cx, cy, bx, by], css(top, 0.6));
        quad([x0, y1, x1, y1, cx, cy, dx, dy], css(top, 0.48));
        quad([x0, y0, x0, y1, dx, dy, ax, ay], css(top, 0.76));
        quad([ax, ay, bx, by, cx, cy, dx, dy], css(top));
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.7, 0.2 + 0.4 * p.z)})`;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.strokeStyle = `rgba(0,0,0,${Math.min(0.45, 0.15 + 0.2 * p.z)})`;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(cx, cy);
        ctx.lineTo(dx, dy);
        ctx.stroke();
      }
      // Debris chips: tumble (flip by squashing), fall, fade.
      for (let q = chips.length - 1; q >= 0; q--) {
        const c = chips[q];
        c.age += dt;
        if (c.age >= c.life) {
          chips.splice(q, 1);
          continue;
        }
        c.vy += 1400 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        const sw = Math.max(1, c.s * Math.abs(Math.cos(c.age * 14 + c.x * 0.05)));
        ctx.globalAlpha = 1 - clamp01((c.age / c.life - 0.6) / 0.4);
        ctx.fillStyle = css(c.c, 0.55);
        ctx.fillRect(c.x - sw / 2 + 2, c.y - c.s / 2 + 2, sw, c.s);
        ctx.fillStyle = css(c.c);
        ctx.fillRect(c.x - sw / 2, c.y - c.s / 2, sw, c.s);
        ctx.globalAlpha = 1;
      }
      if (t < DURATION || chips.length) requestAnimationFrame(frame);
      else finish();
    };
    requestAnimationFrame(frame);
  });
}
