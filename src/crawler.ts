/* RAID Crawler: the shop as a 2.5D hacking den behind a dimensional rift.
   Whatever era the OS is in, the AI shopkeeper is from somewhere else: a jagged tear opens in the
   panel (a wobbling SVG-displaced rim), and through it you look into a void. Seen through the hole,
   the layers inside shift against the fixed rim with different depths:
     far  – a canvas of falling code over a perspective grid floor (server room),
     mid  – the AI shopkeeper "ジャンク", a CRT face whose eyes follow the cursor and whose mouth moves while it talks,
     near – the stolen site windows, each tilting on its own depth.
   New stock arrives as windows that fall in with gravity and a bounce while each card decrypts.
   The shop's own markup, drag-to-transplant and tutorial targets are untouched; this only layers on top. */

import { scanHackSite } from "./hacksite.js";

export type Mood = "normal" | "happy" | "sly" | "sad";
export interface Crawler {
  /** Call after the shop list has been re-rendered. */
  sync(signature: string, reason: "first" | "reroll" | "round" | "same"): void;
  /** Where the basket lives (inside the rift). */
  basketHost: HTMLElement;
  say(text: string, mood?: Mood): void;
  setEnabled(on: boolean): void;
  onTalk(fn: () => void): void;
  onHack(fn: () => void): void;
  setHackLabel(html: string, disabled: boolean): void;
}

const GLYPHS = "01<>/{}[]#$%&*+=アイウエオカキクケコｱｲｳｴｵ▓▒░";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountCrawler(panel: HTMLElement, list: HTMLElement, isReduced: () => boolean): Crawler {
  const still = () => isReduced() || reduced();
  /* far layer */
  const far = document.createElement("div");
  far.className = "hx-far";
  far.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  far.append(canvas);
  /* the rift: a fixed jagged rim + the void seen through it */
  ensureWarpFilter();
  const rift = document.createElement("section");
  rift.className = "hx-rift";
  const rim = document.createElement("div");
  rim.className = "hx-rim";
  rim.setAttribute("aria-hidden", "true");
  const voidEl = document.createElement("div");
  voidEl.className = "hx-void";
  const basketHost = document.createElement("div");
  rift.append(rim, voidEl);
  const tear = jagged();
  rim.style.clipPath = voidEl.style.clipPath = tear;
  /* mid layer: the keeper */
  const keeper = document.createElement("section");
  keeper.className = "hx-keeper";
  keeper.innerHTML = `
    <div class="hx-face" aria-hidden="true"><div class="hx-screen"><i class="hx-eye hx-l"><b></b></i><i class="hx-eye hx-r"><b></b></i><i class="hx-mouth"></i></div><span class="hx-antenna"></span></div>
    <div class="hx-bubble" role="status" aria-live="polite"><b class="hx-name">店主AI「ジャンク」</b><p class="hx-say"></p></div>
    <div class="hx-actions"><button type="button" class="hx-talk">話しかける</button><button type="button" class="hx-hack"></button></div>`;
  voidEl.append(far, keeper, basketHost);
  const head = panel.querySelector(".panel-head");
  (head ?? panel.firstChild)?.after(rift);
  const sayEl = keeper.querySelector<HTMLElement>(".hx-say")!,
    face = keeper.querySelector<HTMLElement>(".hx-face")!,
    hackBtn = keeper.querySelector<HTMLButtonElement>(".hx-hack")!,
    talkBtn = keeper.querySelector<HTMLButtonElement>(".hx-talk")!;

  let enabled = false,
    raf = 0,
    typing = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  /* parallax: one pointer, three depths */
  panel.addEventListener("pointermove", (e) => {
    if (!enabled) return;
    const r = panel.getBoundingClientRect();
    mouse.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  });
  panel.addEventListener("pointerleave", () => {
    mouse.tx = 0;
    mouse.ty = 0;
  });

  /* far canvas: code rain + grid floor */
  const ctx = canvas.getContext("2d");
  let cols: number[] = [],
    w = 0,
    h = 0,
    lastDraw = 0;
  const resize = () => {
    w = far.clientWidth;
    h = far.clientHeight;
    canvas.width = w;
    canvas.height = h;
    cols = Array.from({ length: Math.ceil(w / 14) }, () => Math.random() * -h);
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!enabled) return;
    mouse.x += (mouse.tx - mouse.x) * 0.08;
    mouse.y += (mouse.ty - mouse.y) * 0.08;
    panel.style.setProperty("--mx", mouse.x.toFixed(3));
    panel.style.setProperty("--my", mouse.y.toFixed(3));
    if (!ctx || now - lastDraw < 42) return;
    lastDraw = now;
    if (far.clientWidth !== w || far.clientHeight !== h) resize();
    const accent = getComputedStyle(panel).getPropertyValue("--hx-code").trim() || "#39ff88";
    // fade the previous frame toward transparent so the void's own gradient shows through
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "12px Consolas, monospace";
    const shift = mouse.x * -8;
    cols.forEach((y, i) => {
      const x = i * 14 + shift;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.55;
      ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, y);
      ctx.globalAlpha = 0.18;
      ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, y - 14);
      cols[i] = y > h + Math.random() * 400 ? Math.random() * -60 : y + 14;
    });
    // perspective grid floor under everything (vanishing point follows the pointer a little)
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = accent;
    const vx = w / 2 + mouse.x * 20,
      vy = h * 0.58,
      floor = h;
    ctx.beginPath();
    for (let i = -8; i <= 8; i++) {
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx + i * (w / 5), floor);
    }
    for (let k = 1; k < 8; k++) {
      const t = Math.pow(k / 8, 2),
        yy = vy + (floor - vy) * t;
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  /* keeper: blink + talk */
  let blinkTimer = 0;
  const blink = () => {
    face.classList.add("hx-blink");
    window.setTimeout(() => face.classList.remove("hx-blink"), 130);
    blinkTimer = window.setTimeout(blink, 2400 + Math.random() * 3200);
  };

  function say(text: string, mood: Mood = "normal") {
    face.dataset.mood = mood;
    window.clearInterval(typing);
    if (still()) {
      sayEl.textContent = text;
      return;
    }
    let i = 0;
    face.classList.add("hx-talking");
    sayEl.textContent = "";
    typing = window.setInterval(() => {
      i += 2;
      sayEl.textContent = text.slice(0, i);
      if (i >= text.length) {
        window.clearInterval(typing);
        face.classList.remove("hx-talking");
      }
    }, 28);
  }

  /* stock arrival: windows fall in with gravity, cards decrypt */
  let lastSig = "";
  function arrive(reason: string) {
    if (still()) return;
    if (reason === "reroll") {
      panel.classList.remove("hx-glitch");
      void panel.offsetWidth;
      panel.classList.add("hx-glitch");
      window.setTimeout(() => panel.classList.remove("hx-glitch"), 420);
    }
    list.querySelectorAll<HTMLElement>(".crawl-site").forEach((site, i) => {
      if (site.classList.contains("hs-site")) {
        scanHackSite(site, i * 260);
        return;
      }
      site.style.setProperty("--i", String(i));
      site.style.setProperty("--r", `${(Math.random() - 0.5) * 10}deg`);
      site.classList.remove("hx-drop");
      void site.offsetWidth;
      site.classList.add("hx-drop");
      site.addEventListener("animationend", () => site.classList.remove("hx-drop"), { once: true });
    });
    list.querySelectorAll<HTMLElement>(".shop-card:not(.sold)").forEach((card, i) => {
      const veil = document.createElement("div");
      veil.className = "hx-decrypt";
      veil.setAttribute("aria-hidden", "true");
      card.append(veil);
      const name = card.querySelector<HTMLElement>(".sc-name"),
        real = name?.textContent ?? "",
        start = performance.now() + 180 + i * 140,
        dur = 520;
      const tick = (now: number) => {
        const p = Math.max(0, Math.min(1, (now - start) / dur));
        veil.textContent = p < 1 ? `DECRYPT ${String(Math.round(p * 100)).padStart(3, "0")}%` : "";
        veil.style.setProperty("--p", String(p));
        if (name) {
          let out = "";
          for (let k = 0; k < real.length; k++) out += k / real.length < p ? real[k] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          name.textContent = out;
        }
        if (p < 1 && card.isConnected) requestAnimationFrame(tick);
        else {
          veil.remove();
          if (name) name.textContent = real;
        }
      };
      requestAnimationFrame(tick);
    });
  }

  const talkers: (() => void)[] = [],
    hackers: (() => void)[] = [];
  talkBtn.addEventListener("click", () => talkers.forEach((f) => f()));
  hackBtn.addEventListener("click", () => hackers.forEach((f) => f()));
  face.addEventListener("click", () => talkers.forEach((f) => f()));

  return {
    basketHost,
    sync(signature, reason) {
      if (!enabled) return;
      if (signature !== lastSig) arrive(reason);
      lastSig = signature;
      // depth per stolen window, so each tilts by its own amount
      list.querySelectorAll<HTMLElement>(".crawl-site").forEach((site, i) => site.style.setProperty("--d", String(0.55 + ((i * 37) % 60) / 100)));
    },
    say,
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      panel.classList.toggle("hx-on", on);
      if (on) {
        resize();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
        window.clearTimeout(blinkTimer);
        blinkTimer = window.setTimeout(blink, 1500);
      } else {
        cancelAnimationFrame(raf);
        window.clearTimeout(blinkTimer);
        panel.style.removeProperty("--mx");
        panel.style.removeProperty("--my");
      }
    },
    onTalk(fn) {
      talkers.push(fn);
    },
    onHack(fn) {
      hackers.push(fn);
    },
    setHackLabel(html, disabled) {
      hackBtn.innerHTML = html;
      hackBtn.disabled = disabled;
    },
  };
}

/* A torn outline: random jags along all four edges, as a clip-path polygon (percentages). */
function jagged(): string {
  const pts: string[] = [],
    j = (a: number) => (Math.random() * a).toFixed(1);
  for (let x = 2; x <= 98; x += 6 + Math.random() * 7) pts.push(`${x.toFixed(1)}% ${j(3.2)}%`);
  for (let y = 4; y <= 96; y += 5 + Math.random() * 6) pts.push(`${(100 - +j(4)).toFixed(1)}% ${y.toFixed(1)}%`);
  for (let x = 98; x >= 2; x -= 6 + Math.random() * 7) pts.push(`${x.toFixed(1)}% ${(100 - +j(3.2)).toFixed(1)}%`);
  for (let y = 96; y >= 4; y -= 5 + Math.random() * 6) pts.push(`${j(4)}% ${y.toFixed(1)}%`);
  return `polygon(${pts.join(",")})`;
}
/* SVG turbulence that makes the rim shimmer like a tear in space. */
function ensureWarpFilter() {
  if (document.getElementById("hx-warp")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.innerHTML = `<filter id="hx-warp" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"><animate attributeName="baseFrequency" dur="6s" values="0.03;0.05;0.03" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="9"/></filter>`;
  document.body.append(svg);
}
