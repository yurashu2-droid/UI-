/* The shop as the hacked site itself. Each crawled site is shown as a little live page (its own
   header, its own styling) with the stolen stock laid out inside it at true proportions. Every
   takeable UI wears a DevTools "inspect element" overlay: a highlight box and a label with the
   element's tag, its size and its price – so price and kind read at a glance, like price tags on a
   shelf, but in the web's own language. Taken UIs leave a dashed hole in the site. */

export interface SiteStock {
  index: number;
  type: string;
  sold: boolean;
}
export interface SiteView {
  faction: string;
  name: string;
  url: string;
  color: string;
  header: string;
  stock: SiteStock[];
}
export interface ItemInfo {
  name: string;
  price: number;
  kind: string;
  kindLabel: string;
  load: number;
  desc: string;
  match: string | null;
  poor: boolean;
  w: number;
  h: number;
}
export interface HackSiteOptions {
  preview(type: string): HTMLElement;
  info(type: string): ItemInfo;
  favicon(faction: string): string;
}

const PAGE_W = 480; // the mini page's own width in CSS px before it is scaled into the window
const GAP = 14;

/* ---------- The scan: a green read-head sweeps each hacked site from top to bottom ----------
   Until the head reaches it, every UI is corrupted signal (desaturated, torn, under static).
   The head is a hot phosphor line with a spark racing along it and a CRT afterglow behind it.
   Whatever it crosses it actually reads: the element's outline and its real tag / size / price /
   name are burnt into the glow in green and fade like an afterimage, while the UI itself snaps
   back out of the glitch and its inspector label decodes into place – top to bottom, one by one. */
const SCAN_GLYPHS = "01<>/{}#$%&*=+ｱｲｳｴｵｶｷｸｹｺ▓▒░";
let noiseURL = "";
function noiseTexture(): string {
  if (noiseURL) return noiseURL;
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return "";
  for (let y = 0; y < 64; y++) {
    const streak = Math.random() < 0.18,
      base = streak ? 90 + Math.random() * 120 : 0;
    for (let x = 0; x < 96; x++) {
      const v = streak ? base + Math.random() * 60 : Math.random() < 0.55 ? Math.random() * 140 : 0;
      const tint = Math.random();
      g.fillStyle =
        tint < 0.04 ? "#ff2bd6" : tint < 0.08 ? "#27f3ff" : tint < 0.14 ? `rgb(${v * 0.3},${v},${v * 0.5})` : `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return (noiseURL = c.toDataURL());
}
function decode(el: Element | null, ms: number): void {
  if (!(el instanceof HTMLElement)) return;
  const real = el.dataset.real ?? el.textContent ?? "";
  el.dataset.real = real;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    let out = "";
    for (let i = 0; i < real.length; i++) out += i / real.length < p ? real[i] : SCAN_GLYPHS[(Math.random() * SCAN_GLYPHS.length) | 0];
    el.textContent = out;
    if (p < 1 && el.isConnected) requestAnimationFrame(tick);
    else el.textContent = real;
  };
  requestAnimationFrame(tick);
}

export function scanHackSite(site: HTMLElement, delay = 0): void {
  const vp = site.querySelector<HTMLElement>(".hs-viewport");
  if (!vp) return;
  const items = [...site.querySelectorAll<HTMLElement>(".hs-el")];
  for (const it of items) {
    it.classList.remove("hs-resolve");
    it.classList.add("hs-pre");
    if (!it.querySelector(".hs-noise")) {
      const n = document.createElement("i");
      n.className = "hs-noise";
      n.setAttribute("aria-hidden", "true");
      n.style.backgroundImage = `url(${noiseTexture()})`;
      n.style.backgroundPosition = `${(Math.random() * 96) | 0}px ${(Math.random() * 64) | 0}px`;
      it.append(n);
    }
    it.style.setProperty("--jx", `${(Math.random() - 0.5) * 8}px`);
  }
  site.querySelector(".hs-scan")?.remove();
  const cv = document.createElement("canvas");
  cv.className = "hs-scan";
  cv.setAttribute("aria-hidden", "true");
  vp.append(cv);
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = vp.clientWidth,
    H = vp.clientHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vr = vp.getBoundingClientRect();
  const targets = items
    .map((it) => {
      const r = it.getBoundingClientRect(),
        tag = it.querySelector(".hs-tag"),
        tr = tag?.getBoundingClientRect();
      const label = [...(tag?.querySelectorAll("b, small, em") ?? [])].map((n) => n.textContent).join("  ");
      const name = (it.getAttribute("aria-label") ?? "").split(" $")[0];
      return {
        it,
        x: r.left - vr.left,
        y: r.top - vr.top,
        w: r.width,
        h: r.height,
        tx: tr ? tr.left - vr.left : r.left - vr.left,
        ty: tr ? tr.top - vr.top : r.top - vr.top - 16,
        label,
        name,
        fired: -1,
      };
    })
    .sort((a, b) => a.ty - b.ty || a.x - b.x);
  const D = Math.min(1700, 620 + H * 1.5),
    t0 = performance.now() + delay,
    FADE = 1150;
  const reveal = (t: (typeof targets)[number], now: number) => {
    t.fired = now;
    t.it.classList.remove("hs-pre");
    t.it.classList.add("hs-resolve");
    const tag = t.it.querySelector(".hs-tag");
    tag?.classList.add("hs-tag-live");
    tag?.querySelectorAll("b, small, em").forEach((n, i) => decode(n, 240 + i * 60));
    window.setTimeout(() => tag?.classList.remove("hs-tag-live"), 900);
    window.setTimeout(() => t.it.classList.remove("hs-resolve"), 1000);
  };
  const frame = (now: number) => {
    if (!cv.isConnected) return;
    if (now < t0) return void requestAnimationFrame(frame);
    const p = Math.min(1, (now - t0) / D),
      e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2,
      y = -6 + (H + 12) * (0.25 * p + 0.75 * e);
    for (const t of targets) if (t.fired < 0 && y >= t.ty + 4) reveal(t, now);
    if (ctx) {
      ctx.clearRect(0, 0, W, H);
      if (p < 1) {
        // CRT afterglow behind the head, with scanlines
        const g = ctx.createLinearGradient(0, y - 130, 0, y);
        g.addColorStop(0, "rgba(57,255,136,0)");
        g.addColorStop(0.75, "rgba(57,255,136,.07)");
        g.addColorStop(1, "rgba(57,255,136,.22)");
        ctx.fillStyle = g;
        ctx.fillRect(0, y - 130, W, 130);
        ctx.fillStyle = "rgba(0,20,8,.18)";
        for (let sy = Math.floor(y - 130); sy < y; sy += 3) ctx.fillRect(0, sy, W, 1);
      }
      // what the head has read: outlines and real labels, burnt in and fading
      ctx.font = "600 10.5px Consolas, 'Cascadia Code', monospace";
      ctx.textBaseline = "top";
      for (const t of targets) {
        if (t.fired < 0) continue;
        const a = 1 - (now - t.fired) / FADE;
        if (a <= 0) continue;
        const up = (1 - a) * 6;
        ctx.strokeStyle = `rgba(90,255,150,${a * 0.9})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(t.x + 0.5, t.y + 0.5 - up * 0.3, t.w - 1, t.h - 1);
        // corner brackets
        ctx.fillStyle = `rgba(200,255,220,${a})`;
        for (const [cx, cy, dx, dy] of [
          [t.x, t.y, 1, 1],
          [t.x + t.w, t.y, -1, 1],
          [t.x, t.y + t.h, 1, -1],
          [t.x + t.w, t.y + t.h, -1, -1],
        ] as const) {
          ctx.fillRect(cx - (dx < 0 ? 7 : 0), cy - (dy < 0 ? 2 : 0), 7, 2);
          ctx.fillRect(cx - (dx < 0 ? 2 : 0), cy - (dy < 0 ? 7 : 0), 2, 7);
        }
        const lines = [t.label, t.name];
        lines.forEach((txt, i) => {
          const lx = t.tx + 2,
            ly = (i === 0 ? t.ty + 3 : t.y + 6) - up;
          ctx.fillStyle = `rgba(255,43,214,${a * 0.35})`;
          ctx.fillText(txt, lx - 1.5, ly);
          ctx.fillStyle = `rgba(39,243,255,${a * 0.35})`;
          ctx.fillText(txt, lx + 1.5, ly);
          ctx.shadowColor = "#39ff88";
          ctx.shadowBlur = 8;
          ctx.fillStyle = `rgba(170,255,200,${a})`;
          ctx.fillText(txt, lx, ly);
          ctx.shadowBlur = 0;
        });
      }
      if (p < 1) {
        // the head: a hot core, a soft bloom, and a spark racing along it ("ビュー")
        const bloom = ctx.createLinearGradient(0, y - 10, 0, y + 6);
        bloom.addColorStop(0, "rgba(57,255,136,0)");
        bloom.addColorStop(0.6, "rgba(57,255,136,.45)");
        bloom.addColorStop(1, "rgba(57,255,136,0)");
        ctx.fillStyle = bloom;
        ctx.fillRect(0, y - 10, W, 16);
        ctx.fillStyle = "rgba(225,255,235,.95)";
        ctx.fillRect(0, y - 1, W, 2);
        const sx = (((now - t0) / 360) % 1) * (W + 160) - 80;
        const sg = ctx.createRadialGradient(sx, y, 0, sx, y, 70);
        sg.addColorStop(0, "rgba(255,255,255,.95)");
        sg.addColorStop(0.25, "rgba(120,255,170,.55)");
        sg.addColorStop(1, "rgba(57,255,136,0)");
        ctx.save();
        ctx.translate(0, y);
        ctx.scale(1, 0.12);
        ctx.translate(0, -y);
        ctx.fillStyle = sg;
        ctx.fillRect(sx - 70, y - 70, 140, 140);
        ctx.restore();
        // sparse read-glyphs flickering right at the head
        ctx.fillStyle = "rgba(160,255,190,.8)";
        for (let k = 0; k < 6; k++) ctx.fillText(SCAN_GLYPHS[(Math.random() * SCAN_GLYPHS.length) | 0], Math.random() * W, y - 14 + Math.random() * 6);
      }
    }
    const glowing = targets.some((t) => t.fired < 0 || now - t.fired < FADE);
    if (p < 1 || glowing) requestAnimationFrame(frame);
    else cv.remove();
  };
  requestAnimationFrame(frame);
  // never leave a UI stuck in the corrupted state (e.g. frames throttled in a background tab)
  window.setTimeout(() => items.forEach((it) => it.classList.remove("hs-pre")), delay + D + 400);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderHackSites(host: HTMLElement, sites: SiteView[], o: HackSiteOptions): void {
  const html = sites
    .map(
      (s) => `<section class="crawl-site hs-site" data-faction="${s.faction}" style="--c:${s.color}">
  <div class="cs-bar">${o.favicon(s.faction)}<span class="cs-name">${esc(s.name)}</span><span class="cs-url">${esc(s.url)}</span></div>
  <div class="hs-devbar"><b>⬚ 要素を検証</b><span>${s.stock.filter((x) => !x.sold).length} 個の要素を抜き取れます</span></div>
  <div class="hs-viewport"><div class="hs-page site-theme-${s.faction}"><header class="site-header">${s.header}</header><div class="hs-body"></div></div></div>
</section>`,
    )
    .join("");
  host.insertAdjacentHTML("afterbegin", html);
  host.querySelectorAll<HTMLElement>(".hs-site").forEach((siteEl, n) => {
    const site = sites[n],
      body = siteEl.querySelector<HTMLElement>(".hs-body")!;
    // flow the stock into the page like a real layout: rows, true proportions
    let x = GAP,
      y = GAP,
      rowH = 0;
    for (const st of site.stock) {
      const inf = o.info(st.type);
      const k = Math.min(1, (PAGE_W - GAP * 2) / inf.w, 190 / inf.h);
      const w = Math.round(inf.w * k),
        h = Math.round(inf.h * k);
      if (x + w > PAGE_W - GAP && x > GAP) {
        x = GAP;
        y += rowH + GAP + 18;
        rowH = 0;
      }
      const el = document.createElement("div");
      el.style.cssText = `left:${x}px;top:${y + 18}px;width:${w}px;height:${h}px`;
      if (st.sold) {
        el.className = "hs-hole";
        el.append(pixelHole(w, h, st.index));
      } else {
        el.className = `hs-el kind-${inf.kind}${inf.poor ? " is-poor" : ""}${inf.match ? " is-match" : ""}`;
        el.dataset.paletteType = st.type;
        el.dataset.shopIndex = String(st.index);
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `${inf.name} $${inf.price}：ドラッグして自分のページへ移植`);
        const pv = o.preview(st.type);
        for (const c of pv.querySelectorAll<HTMLElement>("button,a,input,select")) c.tabIndex = -1;
        pv.style.transform = `scale(${k})`;
        pv.style.transformOrigin = "0 0";
        const tag = pv.dataset.tag || "<div>";
        const box = document.createElement("div");
        box.className = "hs-box";
        box.append(pv);
        el.append(box);
        el.insertAdjacentHTML(
          "beforeend",
          `<span class="hs-tag"><i class="hs-kind"></i><b>${esc(tag)}</b><small>${inf.w}×${inf.h}</small><em>$${inf.price}</em>${inf.match ? '<u title="シナジー">◎</u>' : ""}<button type="button" class="hs-add" data-add-type="${st.type}" title="クリックで配置">⧉</button></span>`,
        );
      }
      body.append(el);
      x += w + GAP;
      rowH = Math.max(rowH, h);
    }
    body.style.height = y + rowH + 18 + GAP + "px";
  });
  layoutHackSites(host);
}

/** Scale each mini page to its window's current width. */
export function layoutHackSites(host: HTMLElement): void {
  host.querySelectorAll<HTMLElement>(".hs-site").forEach((site) => {
    const vp = site.querySelector<HTMLElement>(".hs-viewport"),
      page = site.querySelector<HTMLElement>(".hs-page");
    if (!vp || !page) return;
    const s = Math.max(0.3, vp.clientWidth / PAGE_W);
    page.style.transform = `scale(${s})`;
    vp.style.height = page.offsetHeight * s + "px";
  });
}

/* DevTools-style hover card */
let card: HTMLElement | null = null;
export function inspectCard(target: HTMLElement | null, inf?: ItemInfo): void {
  if (!target || !inf) {
    card?.classList.remove("is-on");
    return;
  }
  card ??= Object.assign(document.createElement("div"), { className: "hs-card" });
  if (!card.isConnected) document.body.append(card);
  card.innerHTML = `<header><b>${esc(inf.name)}</b><em class="${inf.poor ? "poor" : ""}">$${inf.price}</em></header>
    <div class="hs-card-meta"><span class="hs-k kind-${inf.kind}">${esc(inf.kindLabel)}</span><span>重さ ${inf.load}</span><span>${inf.w}×${inf.h}</span></div>
    <p>${esc(inf.desc)}</p>${inf.match ? `<p class="hs-card-match">◎ ${esc(inf.match)}</p>` : ""}${inf.poor ? '<p class="hs-card-poor">資金が足りません</p>' : ""}
    <small>ドラッグして自分のページへ ／ ⧉ でクリック配置</small>`;
  const r = target.getBoundingClientRect(),
    cw = 260;
  const left = r.right + 12 + cw < innerWidth ? r.right + 12 : Math.max(8, r.left - cw - 12);
  card.style.left = left + "px";
  card.style.top = Math.min(innerHeight - 200, Math.max(8, r.top)) + "px";
  card.classList.add("is-on");
}

/* The hole a stolen UI leaves: a ragged cluster of black pixels (a few squares short of a
   rectangle), with stray grey and glitch-coloured cells. The glitch noise itself is CSS. */
export function pixelHole(w: number, h: number, seed = 1): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "px-hole";
  wrap.setAttribute("aria-label", "抜き取られた跡");
  const cell = 6,
    cols = Math.max(3, Math.round(w / cell)),
    rows = Math.max(2, Math.round(h / cell));
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext("2d");
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  if (ctx) {
    // a few overlapping black rectangles make the blocky silhouette
    const blocks = 3 + Math.floor(rnd() * 3);
    for (let b = 0; b < blocks; b++) {
      const bw = Math.max(2, Math.round(cols * (0.45 + rnd() * 0.5))),
        bh = Math.max(1, Math.round(rows * (0.45 + rnd() * 0.5))),
        bx = Math.floor(rnd() * (cols - bw + 1)),
        by = Math.floor(rnd() * (rows - bh + 1));
      ctx.fillStyle = "#050608";
      ctx.fillRect(bx, by, bw, bh);
    }
    // ragged edges + stray cells
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const r = rnd();
        if (r < 0.06) {
          ctx.fillStyle = "#050608";
          ctx.fillRect(x, y, 1, 1);
        } else if (r < 0.1) {
          ctx.fillStyle = "#1b1f27";
          ctx.fillRect(x, y, 1, 1);
        } else if (r < 0.115) {
          ctx.fillStyle = rnd() < 0.5 ? "#ff2bd6" : "#27f3ff";
          ctx.fillRect(x, y, 1, 1);
        }
      }
  }
  wrap.append(c);
  return wrap;
}
