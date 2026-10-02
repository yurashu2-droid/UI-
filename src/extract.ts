/* Extraction: pulling a UI out of a hacked site.
   The source breaks up in the same dot wave as the OS upgrade, only with much smaller voxels: a
   ripple spreads from the point you grabbed, each little tile rises toward you as a 3D block and
   flips from the UI's colour to black at its crest – so the wave literally eats a hole into the
   site (a ragged black pixel hole under glitch noise). The copy in your hand glitches into being
   and follows the pointer exactly, at page scale. Only over your page does the editor's drop
   preview take over; released there it is placed (and bought). Released anywhere else, or if it
   did not fit, the copy glitches out and a reverse wave rebuilds the original in the site. */
import { pixelHole } from "./hacksite.js";

export interface ExtractOptions {
  preview(type: string): HTMLElement;
  size(type: string): { w: number; h: number };
  page(): { rect: DOMRect; scale: number } | null;
  /** Hand the drag to the editor (it previews snapping on the page) / take it back. */
  enterPage(type: string, x: number, y: number, pointerId: number): void;
  leavePage(): void;
  /** True if the last drop turned into a purchase. */
  didPlace(): boolean;
  color(type: string): string;
  onGrab(type: string): void;
  onDone(type: string, placed: boolean): void;
  reduced(): boolean;
}

const TILE = 9; // far smaller voxels than the OS upgrade's 40px
const WIDTH = 46; // px of distance one tile takes to rise and settle
const HMAX = 16;
const FOCAL = 320;
const HOLE: [number, number, number] = [5, 6, 8];

let layer: HTMLCanvasElement | null = null;
function waveLayer(): CanvasRenderingContext2D | null {
  if (!layer) {
    layer = document.createElement("canvas");
    layer.className = "ex-wave";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
  }
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (layer.width !== Math.round(innerWidth * dpr) || layer.height !== Math.round(innerHeight * dpr)) {
    layer.width = Math.round(innerWidth * dpr);
    layer.height = Math.round(innerHeight * dpr);
  }
  const ctx = layer.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

type RGB = [number, number, number];
function parse(c: string): [number, number, number, number] | null {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
// Sample what is painted under each tile (the preview's own markup, not the site background).
function sampleTiles(src: HTMLElement, r: DOMRect, cols: number, rows: number, accent: RGB): RGB[] {
  src.classList.add("ex-sampling");
  const out: RGB[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = Math.min(r.right - 1, r.left + (i + 0.5) * TILE),
        y = Math.min(r.bottom - 1, r.top + (j + 0.5) * TILE);
      let el = document.elementFromPoint(x, y) as HTMLElement | null,
        col: RGB | null = null;
      for (let d = 0; el && d < 8 && !col; d++, el = el.parentElement) {
        const b = parse(getComputedStyle(el).backgroundColor);
        if (b && b[3] > 0.4) col = [b[0], b[1], b[2]];
        if (el === src) break;
      }
      out.push(col ?? (Math.random() < 0.15 ? accent : [238, 240, 244]));
    }
  src.classList.remove("ex-sampling");
  return out;
}
const hex = (c: string): RGB => {
  const m = /^#?([0-9a-f]{6})/i.exec(c);
  const v = m ? parseInt(m[1], 16) : 0x3b82f6;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const css = (c: RGB, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

/** One ripple of little rising voxels over rect r. `from` = colour before the crest, `to` = after. */
function voxelWave(
  rectNow: () => DOMRect,
  origin: { x: number; y: number },
  from: (k: number) => RGB,
  to: (k: number) => RGB,
  onRadius: (R: number, max: number) => void,
  done: () => void,
  still: boolean,
): void {
  const r0 = rectNow(),
    ctx = waveLayer(),
    cols = Math.max(1, Math.ceil(r0.width / TILE)),
    rows = Math.max(1, Math.ceil(r0.height / TILE)),
    ox = origin.x - r0.left,
    oy = origin.y - r0.top;
  let last = r0;
  const dist: number[] = [];
  let far = 0;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const d = Math.hypot((i + 0.5) * TILE - ox, (j + 0.5) * TILE - oy) + Math.random() * 10;
      dist.push(d);
      far = Math.max(far, d);
    }
  const dur = still ? 1 : Math.min(620, 260 + far * 1.4);
  const t0 = performance.now();
  const height = (u: number) => (u < 0.35 ? Math.sin((u / 0.35) * Math.PI * 0.5) : u < 0.7 ? 1 - ((u - 0.35) / 0.35) ** 2 : 0.25 * Math.sin(((u - 0.7) / 0.3) * Math.PI));
  const frame = (now: number) => {
    const p = Math.min(1, (now - t0) / dur),
      R = -WIDTH / 2 + (far + WIDTH) * (1 - (1 - p) ** 1.6);
    onRadius(Math.max(0, R - WIDTH * 0.15), far + WIDTH);
    // follow the element if its list scrolls while the wave runs
    const r = rectNow(),
      vx = r.left + r.width / 2,
      vy = r.top + r.height / 2;
    if (ctx) {
      ctx.clearRect(last.left - 40, last.top - 40, last.width + 80, last.height + 80);
      ctx.clearRect(r.left - 40, r.top - 40, r.width + 80, r.height + 80);
      last = r;
      const ups: { k: number; i: number; j: number; z: number; u: number }[] = [];
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i,
            u = (R - dist[k]) / WIDTH + 0.5;
          if (u > 0 && u < 1) ups.push({ k, i, j, z: height(u), u });
        }
      ups.sort((a, b) => a.z - b.z);
      for (const q of ups) {
        const x0 = r.left + q.i * TILE,
          y0 = r.top + q.j * TILE,
          s = FOCAL / (FOCAL - q.z * HMAX);
        const P = (x: number, y: number) => [vx + (x - vx) * s, vy + (y - vy) * s];
        const [ax, ay] = P(x0, y0),
          [cx, cy] = P(x0 + TILE, y0 + TILE);
        const top = q.u < 0.35 ? from(q.k) : to(q.k);
        ctx.fillStyle = css(top, 0.55);
        ctx.fillRect(Math.min(x0, ax), Math.min(y0, ay), Math.abs(cx - x0) + TILE * 0.2, Math.abs(cy - y0) + TILE * 0.2);
        ctx.fillStyle = css(top);
        ctx.fillRect(ax, ay, cx - ax - 0.6, cy - ay - 0.6);
        ctx.fillStyle = `rgba(255,255,255,${0.25 * q.z})`;
        ctx.fillRect(ax, ay, cx - ax - 0.6, 1);
      }
    }
    if (p < 1) requestAnimationFrame(frame);
    else {
      ctx?.clearRect(last.left - 40, last.top - 40, last.width + 80, last.height + 80);
      done();
    }
  };
  requestAnimationFrame(frame);
}

export function beginExtract(src: HTMLElement, type: string, e: PointerEvent, o: ExtractOptions): void {
  const id = e.pointerId,
    grab = { x: e.clientX, y: e.clientY };
  const { w, h } = o.size(type);
  const still = o.reduced();
  const r = src.getBoundingClientRect();
  const accent = hex(o.color(type));
  const cols = Math.max(1, Math.ceil(r.width / TILE)),
    rows = Math.max(1, Math.ceil(r.height / TILE));
  const colors = sampleTiles(src, r, cols, rows, accent);
  const holeCol = (k: number): RGB => (k % 11 === 0 ? [27, 31, 39] : HOLE);

  // the hole sits under the element; the wave eats the element away down to it
  const hole = pixelHole(src.offsetWidth || r.width, src.offsetHeight || r.height, Math.round(r.left + r.top));
  hole.classList.add("ex-hole");
  src.prepend(hole);
  src.classList.add("ex-taking");
  src.style.setProperty("--ex-x", `${((grab.x - r.left) / r.width) * 100}%`);
  src.style.setProperty("--ex-y", `${((grab.y - r.top) / r.height) * 100}%`);
  const toLocal = r.width / (src.offsetWidth || r.width); // screen px per element px
  voxelWave(() => src.getBoundingClientRect(), grab, (k) => colors[k], holeCol, (R) => src.style.setProperty("--ex-r", `${R / toLocal}px`), () => undefined, still);

  // the copy in your hand glitches into being
  const carry = document.createElement("div");
  carry.className = "ex-carry is-glitching";
  const pv = o.preview(type);
  for (const c of pv.querySelectorAll<HTMLElement>("button,a,input,select")) c.tabIndex = -1;
  carry.append(pv);
  Object.assign(carry.style, { width: w + "px", height: h + "px" });
  document.body.append(carry);
  window.setTimeout(() => carry.classList.remove("is-glitching"), 520);
  let pointer = { ...grab },
    overPage = false;
  const scaleNow = () => o.page()?.scale ?? 0.6;
  const place = () => {
    const k = scaleNow();
    carry.style.transform = `translate(${pointer.x - (w / 2) * k}px, ${pointer.y - Math.min(h / 2, 24) * k}px) scale(${k})`;
  };
  place();
  o.onGrab(type);

  // "over the page" means the page is what you actually see there – not hidden behind another window
  const inPage = () => {
    const pg = o.page();
    if (!pg || pointer.x <= pg.rect.left || pointer.x >= pg.rect.right || pointer.y <= pg.rect.top || pointer.y >= pg.rect.bottom) return false;
    const hit = document.elementFromPoint(pointer.x, pointer.y);
    return !!hit?.closest("#player-frame");
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    pointer = { x: ev.clientX, y: ev.clientY };
    place();
    const over = inPage();
    if (over !== overPage) {
      overPage = over;
      carry.classList.toggle("is-over-page", over);
      if (over) o.enterPage(type, pointer.x, pointer.y, id);
      else o.leavePage();
    }
  };
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", finish, true);
    // let the editor's own pointerup run first, then see whether it became a purchase
    window.setTimeout(() => {
      const placed = overPage && o.didPlace();
      if (!placed) {
        if (overPage) o.leavePage();
        carry.classList.add("is-glitching-out");
        // a reverse wave rebuilds the original out of the hole
        const rr = src.getBoundingClientRect();
        src.classList.remove("ex-taking");
        src.classList.add("ex-restoring");
        src.style.setProperty("--ex-r", "0px");
        voxelWave(
          () => src.getBoundingClientRect(),
          { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 },
          holeCol,
          (k) => colors[k] ?? [238, 240, 244],
          (R) => src.style.setProperty("--ex-r", `${R / toLocal}px`),
          () => {
            src.classList.remove("ex-restoring");
            hole.remove();
          },
          still,
        );
        // never leave the source half-eaten, even if frames are throttled (background tab)
        window.setTimeout(() => {
          src.classList.remove("ex-restoring", "ex-taking");
          hole.remove();
        }, 900);
      }
      window.setTimeout(() => carry.remove(), placed ? 0 : 280);
      o.onDone(type, placed);
    }, 40);
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", finish, true);
}
