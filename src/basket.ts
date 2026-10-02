/* The rift basket: stolen UIs lie limp in a basket on the other side of the rift.
   Each UI is a soft sheet – four Verlet corner particles joined by weak springs – and the real UI
   markup is projected onto that quad with a matrix3d homography, so the actual component sags,
   slides and piles up. Picking one "tenses" it: the springs go rigid, the corners snap to the true
   rectangle (overshoot, wobble) and it grows to page scale while following the cursor exactly –
   no separate drop preview. Released over the page it is placed right there ("pop"); released
   anywhere else, or where it cannot fit, it goes limp and falls back into the basket. */

export interface BasketStock {
  key: string;
  type: string;
}
export interface BasketOptions {
  /** Real-size preview markup of a UI (unscaled, d.w × d.h). */
  preview(type: string): HTMLElement;
  size(type: string): { w: number; h: number };
  /** Screen rect of the page body and its scale (page px → screen px). */
  page(): { rect: DOMRect; scale: number } | null;
  hover(type: string | null): void;
  grab(type: string): void;
  /** Released over the page at these page coordinates; place it (the basket re-syncs if bought). */
  drop(type: string, x: number, y: number): void;
  reduced(): boolean;
}
export interface Basket {
  sync(stock: BasketStock[]): void;
  setEnabled(on: boolean): void;
}

type V2 = { x: number; y: number; px: number; py: number };
interface Body {
  key: string;
  type: string;
  el: HTMLElement;
  w0: number; // element size (true UI size)
  h0: number;
  bw: number; // rest size in the basket
  bh: number;
  pts: V2[]; // tl, tr, br, bl
  carry: boolean;
  tense: number; // 0 limp → 1 rigid
  shown: number;
}

const G = 2200; // basket gravity, px/s²

function homography(w: number, h: number, q: { x: number; y: number }[]): string {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x,
    dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1 || 1e-6;
  const g = (dx3 * dy2 - dx2 * dy3) / det,
    hh = (dx1 * dy3 - dx3 * dy1) / det;
  const a = p1.x - p0.x + g * p1.x,
    b = p3.x - p0.x + hh * p3.x,
    c = p0.x,
    d = p1.y - p0.y + g * p1.y,
    e = p3.y - p0.y + hh * p3.y,
    f = p0.y;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(6))).join(",")})`;
}

export function mountBasket(host: HTMLElement, o: BasketOptions): Basket {
  host.classList.add("hx-basket");
  host.hidden = true;
  host.innerHTML = `<div class="hxb-back" aria-hidden="true"></div><div class="hxb-items"></div><div class="hxb-front" aria-hidden="true"></div><p class="hxb-hint">つまんで、ページへ運ぶ</p>`;
  const itemsEl = host.querySelector<HTMLElement>(".hxb-items")!;
  const carryLayer = document.createElement("div");
  carryLayer.className = "hxb-carry";
  document.body.append(carryLayer);

  let bodies: Body[] = [],
    enabled = false,
    raf = 0,
    last = 0,
    pointer = { x: 0, y: 0 },
    carried: Body | null = null;

  const W = () => host.clientWidth,
    H = () => host.clientHeight;

  function spawn(s: BasketStock, i: number): Body {
    const { w, h } = o.size(s.type);
    const scale = Math.min(150 / w, 84 / h, Math.max(0.42, 72 / w));
    const bw = w * scale,
      bh = h * scale;
    const el = document.createElement("div");
    el.className = "hxb-item";
    el.dataset.basketType = s.type;
    el.style.width = w + "px";
    el.style.height = h + "px";
    const inner = o.preview(s.type);
    for (const c of inner.querySelectorAll<HTMLElement>("button,a,input,select")) c.tabIndex = -1;
    el.append(inner);
    itemsEl.append(el);
    // drop in from above the rim, spread across the basket, slightly tumbled
    const cx = 30 + ((i * 97) % Math.max(40, W() - 60)),
      cy = -40 - i * 55,
      a = (Math.random() - 0.5) * 0.5;
    const corner = (dx: number, dy: number): V2 => {
      const x = cx + dx * Math.cos(a) - dy * Math.sin(a),
        y = cy + dx * Math.sin(a) + dy * Math.cos(a);
      return { x, y, px: x, py: y - 2 };
    };
    const body: Body = {
      key: s.key,
      type: s.type,
      el,
      w0: w,
      h0: h,
      bw,
      bh,
      pts: [corner(-bw / 2, -bh / 2), corner(bw / 2, -bh / 2), corner(bw / 2, bh / 2), corner(-bw / 2, bh / 2)],
      carry: false,
      tense: 0,
      shown: 1,
    };
    el.addEventListener("pointerenter", () => !carried && o.hover(s.type));
    el.addEventListener("pointerleave", () => !carried && o.hover(null));
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || o.reduced()) return;
      e.preventDefault();
      grab(body, e.clientX, e.clientY);
    });
    return body;
  }

  function grab(b: Body, x: number, y: number) {
    const r = host.getBoundingClientRect();
    // move the sheet into screen space so it can leave the rift
    for (const p of b.pts) {
      p.x += r.left;
      p.y += r.top;
      p.px += r.left;
      p.py += r.top;
    }
    carryLayer.append(b.el);
    b.carry = true;
    b.tense = 1;
    b.el.classList.add("hxb-snap");
    window.setTimeout(() => b.el.classList.remove("hxb-snap"), 380);
    carried = b;
    pointer = { x, y };
    o.grab(b.type);
  }
  function release() {
    const b = carried;
    carried = null;
    if (!b || !bodies.includes(b)) return; // bought: sync() already removed it
    const r = host.getBoundingClientRect();
    b.carry = false;
    b.tense = 0;
    b.el.style.opacity = "1";
    // shrink back to basket size around the pointer, then let it fall back in
    const cx = Math.min(Math.max(pointer.x - r.left, 20), W() - 20),
      cy = Math.min(pointer.y - r.top, -20);
    b.pts = [
      { x: cx - b.bw / 2, y: cy - b.bh / 2, px: cx - b.bw / 2, py: cy - b.bh / 2 },
      { x: cx + b.bw / 2, y: cy - b.bh / 2, px: cx + b.bw / 2, py: cy - b.bh / 2 },
      { x: cx + b.bw / 2, y: cy + b.bh / 2, px: cx + b.bw / 2, py: cy + b.bh / 2 },
      { x: cx - b.bw / 2, y: cy + b.bh / 2, px: cx - b.bw / 2, py: cy + b.bh / 2 },
    ];
    itemsEl.append(b.el);
  }
  window.addEventListener("pointermove", (e) => {
    if (carried) pointer = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", (e) => {
    const b = carried;
    if (!b) return;
    pointer = { x: e.clientX, y: e.clientY };
    const page = o.page();
    if (page && pointer.x > page.rect.left && pointer.x < page.rect.right && pointer.y > page.rect.top && pointer.y < page.rect.bottom)
      o.drop(b.type, (pointer.x - page.rect.left) / page.scale, (pointer.y - page.rect.top) / page.scale);
    window.setTimeout(release, 60);
  });

  function step(dt: number) {
    const w = W(),
      h = H(),
      floor = h - 10;
    const page = o.page();
    for (const b of bodies) {
      const k = b.carry && page ? page.scale : 0;
      // rest lengths: basket size when limp, page size when carried
      const rw = b.carry ? b.w0 * k : b.bw,
        rh = b.carry ? b.h0 * k : b.bh;
      for (const p of b.pts) {
        const vx = (p.x - p.px) * (b.carry ? 0.82 : 0.985),
          vy = (p.y - p.py) * (b.carry ? 0.82 : 0.985);
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy + (b.carry ? 0 : G * dt * dt);
      }
      if (b.carry) {
        // tensed: every corner springs to its place on the true rectangle under the cursor (overshoot = the "ping")
        const ox = rw / 2,
          oy = Math.min(rh / 2, 24 * k);
        const tx = [pointer.x - ox, pointer.x - ox + rw, pointer.x - ox + rw, pointer.x - ox],
          ty = [pointer.y - oy, pointer.y - oy, pointer.y - oy + rh, pointer.y - oy + rh];
        b.pts.forEach((p, i) => {
          p.x += (tx[i] - p.x) * 0.3;
          p.y += (ty[i] - p.y) * 0.3;
        });
      }
      const edge = b.carry ? 1 : 0.6,
        diag = b.carry ? 1 : 0.12;
      const dl = Math.hypot(rw, rh);
      const links: [number, number, number, number][] = [
        [0, 1, rw, edge],
        [1, 2, rh, edge],
        [2, 3, rw, edge],
        [3, 0, rh, edge],
        [0, 2, dl, diag],
        [1, 3, dl, diag],
      ];
      for (let it = 0; it < 5; it++) {
        for (const [i, j, len, s] of links) {
          const a = b.pts[i],
            c = b.pts[j];
          const dx = c.x - a.x,
            dy = c.y - a.y,
            d = Math.hypot(dx, dy) || 1e-6;
          let diff = (d - len) / d,
            k = s;
          // a limp sheet may shear and sag, but never flatten edge-on or fold over itself
          if (j - i === 2) {
            const lo = len * 0.86,
              hi = len * 1.14;
            if (d < lo) (diff = (d - lo) / d), (k = 1);
            else if (d > hi) (diff = (d - hi) / d), (k = 1);
          }
          const f = diff * 0.5 * k;
          a.x += dx * f;
          a.y += dy * f;
          c.x -= dx * f;
          c.y -= dy * f;
        }
        if (b.carry) continue;
        for (const p of b.pts) {
          if (p.y > floor) {
            p.y = floor;
            p.px = p.x - (p.x - p.px) * 0.6; // friction on the basket floor
          }
          if (p.x < 10) p.x = 10;
          if (p.x > w - 10) p.x = w - 10;
        }
      }
    }
    // sheets rest on each other: push corners out of other sheets' bounds
    const free = bodies.filter((b) => !b.carry);
    for (const A of free)
      for (const B of free) {
        if (A === B) continue;
        const xs = B.pts.map((p) => p.x),
          ys = B.pts.map((p) => p.y);
        const l = Math.min(...xs),
          r = Math.max(...xs),
          t = Math.min(...ys),
          btm = Math.max(...ys);
        for (const p of A.pts) {
          if (p.x <= l || p.x >= r || p.y <= t || p.y >= btm) continue;
          const pen = [p.x - l, r - p.x, p.y - t, btm - p.y],
            m = Math.min(...pen);
          if (m === pen[2]) p.y = t;
          else if (m === pen[3]) p.y = btm;
          else if (m === pen[0]) p.x = l;
          else p.x = r;
        }
      }
  }
  function draw() {
    for (const b of bodies) b.el.style.transform = homography(b.w0, b.h0, b.pts);
  }
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!enabled) return;
    const dt = Math.min(1 / 30, (now - (last || now)) / 1000) || 1 / 60;
    last = now;
    step(dt / 2);
    step(dt / 2);
    draw();
  };

  return {
    sync(stock) {
      const keys = new Set(stock.map((s) => s.key));
      bodies = bodies.filter((b) => {
        if (keys.has(b.key)) return true;
        b.el.classList.add("hxb-gone");
        window.setTimeout(() => b.el.remove(), 240);
        if (carried === b) carried = null;
        return false;
      });
      let n = 0;
      for (const s of stock) if (!bodies.some((b) => b.key === s.key)) bodies.push(spawn(s, n++));
      if (o.reduced()) {
        // no physics: lay them out flat in rows
        let x = 12,
          y = 12,
          rowH = 0;
        for (const b of bodies) {
          if (x + b.bw > W() - 12) {
            x = 12;
            y += rowH + 8;
            rowH = 0;
          }
          b.pts = [
            { x, y, px: x, py: y },
            { x: x + b.bw, y, px: x + b.bw, py: y },
            { x: x + b.bw, y: y + b.bh, px: x + b.bw, py: y + b.bh },
            { x, y: y + b.bh, px: x, py: y + b.bh },
          ];
          x += b.bw + 8;
          rowH = Math.max(rowH, b.bh);
        }
        draw();
      }
    },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      host.hidden = !on;
      cancelAnimationFrame(raf);
      last = 0;
      if (on) raf = requestAnimationFrame(frame);
    },
  };
}
