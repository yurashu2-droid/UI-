/* Title screen: "1999 boots, then upgrades itself into 2025".
   1. Retro boot: a BIOS "press any key", POST text, a Win98 desktop with the old homepage-style
      title and a dial-up progress dialog.
   2. The whole thing upgrades through the rumbling tile wave (src/upgrade.ts).
   3. The modern title: WebGL2 domain-warped shader backdrop (mouse lens + audio pulse), a particle
      logo that assembles from scattered dots and scatters from the cursor, text scramble, a CSS 3D ring
      of stolen UI parts, glass menu buttons with @property conic borders, pointer spotlights and
      magnetic pull, a blend-mode cursor, a rolling odometer, and a radial mask transition out. */
import "./styles/title.css";
import { audio } from "./audio.js";
import { tileWave } from "./upgrade.js";
import { shaderBackdrop } from "./shader-bg.js";

export interface TitleOptions {
  hasSave: boolean;
  /** Play the retro boot + upgrade intro (first launch of a session). */
  intro: boolean;
  onContinue(): void;
  onNewRun(): void;
  onTutorial(): void;
  onLab(): void;
  onSettings(): void;
  onFirstInteraction?(): void;
}

const ACCENT = "#ff4f1f";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (window.clearTimeout(id), resolve()), { once: true });
  });

/* ---------------- text scramble ---------------- */
const GLYPHS = "▓▒░█<>/\\{}[]#$%&01アイウエオカキクケコｱｲｳ";
function scramble(node: HTMLElement, text: string, ms: number, signal: AbortSignal): void {
  const start = performance.now();
  const tick = (now: number) => {
    if (signal.aborted) return;
    const p = Math.min(1, (now - start) / ms);
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const reveal = i / text.length < p * 1.15 - 0.15;
      out += reveal || text[i] === " " || text[i] === "　" ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    node.textContent = out;
    if (p < 1) requestAnimationFrame(tick);
    else node.textContent = text;
  };
  requestAnimationFrame(tick);
}

/* ---------------- particle logo ---------------- */
type Dot = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; c: string; s: number };
function particleLogo(canvas: HTMLCanvasElement, anchor: HTMLElement, signal: AbortSignal, still: boolean) {
  const ctx = canvas.getContext("2d")!;
  let dots: Dot[] = [];
  let w = 0,
    h = 0,
    dpr = 1;
  const mouse = { x: -9999, y: -9999, down: false };
  const build = (scatter: boolean) => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const a = anchor.getBoundingClientRect(),
      c = canvas.getBoundingClientRect();
    const boxW = a.width,
      boxH = a.height,
      ox = a.left - c.left,
      oy = a.top - c.top;
    // Rasterise the wordmark, then turn every Nth lit pixel into a dot.
    const off = document.createElement("canvas");
    off.width = Math.ceil(boxW);
    off.height = Math.ceil(boxH);
    const g = off.getContext("2d")!;
    let size = boxH * 0.92;
    const font = (s: number) => `900 ${s}px "Segoe UI Black", "Arial Black", "Helvetica Neue", sans-serif`;
    g.font = font(size);
    const mw = g.measureText("UI RAID").width;
    if (mw > boxW * 0.98) size *= (boxW * 0.98) / mw;
    g.font = font(size);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.fillText("UI RAID", boxW / 2, boxH / 2 + size * 0.04);
    const step = Math.max(3, Math.round(size / 30));
    const data = g.getImageData(0, 0, off.width, off.height).data;
    const old = dots;
    dots = [];
    for (let y = 0; y < off.height; y += step)
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] < 128) continue;
        const u = x / off.width;
        // "UI" in the accent, "RAID" in cream with a blue edge toward the end.
        const c2 = u < 0.3 ? (Math.random() < 0.15 ? "#ffd2c2" : ACCENT) : u > 0.88 && Math.random() < 0.35 ? "#6d69ff" : "#f2ece0";
        const prev = old[dots.length];
        dots.push({
          tx: ox + x,
          ty: oy + y,
          x: prev ? prev.x : scatter ? Math.random() * w : ox + x,
          y: prev ? prev.y : scatter ? Math.random() * h : oy + y,
          vx: 0,
          vy: 0,
          c: c2,
          s: step - 1,
        });
      }
  };
  build(true);
  let logoLeft = 0,
    logoRight = 0,
    logoTop = 0,
    logoBottom = 0;
  const bounds = () => {
    logoLeft = Math.min(...dots.map((d) => d.tx)) - 20;
    logoRight = Math.max(...dots.map((d) => d.tx)) + 20;
    logoTop = Math.min(...dots.map((d) => d.ty));
    logoBottom = Math.max(...dots.map((d) => d.ty));
  };
  bounds();
  const onResize = () => (build(false), bounds());
  window.addEventListener("resize", onResize, { signal });
  const blast = (x: number, y: number, power: number) => {
    for (const d of dots) {
      const dx = d.x - x,
        dy = d.y - y,
        dist = Math.hypot(dx, dy) || 1;
      const f = (power * 900) / (dist + 60);
      d.vx += (dx / dist) * f;
      d.vy += (dy / dist) * f;
    }
  };
  let glitchUntil = 0,
    glitchY = 0,
    glitchH = 0,
    nextGlitch = performance.now() + 2600,
    last = performance.now(),
    pulse = 0;
  const frame = (now: number) => {
    if (signal.aborted) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    pulse += (audio.level().low - pulse) * 0.25;
    if (now > nextGlitch && !still) {
      glitchUntil = now + 110;
      glitchY = logoTop + Math.random() * (logoBottom - logoTop);
      glitchH = 10 + Math.random() * 40;
      nextGlitch = now + 2200 + Math.random() * 2800;
    }
    ctx.clearRect(0, 0, w, h);
    const R = 110;
    for (const d of dots) {
      let ax = (d.tx - d.x) * 38 - d.vx * 7.5,
        ay = (d.ty - d.y) * 38 - d.vy * 7.5;
      const mx = d.x - mouse.x,
        my = d.y - mouse.y,
        md = mx * mx + my * my;
      if (md < R * R) {
        const k = (1 - Math.sqrt(md) / R) * 5200;
        const inv = 1 / (Math.sqrt(md) || 1);
        ax += mx * inv * k;
        ay += my * inv * k;
      }
      d.vx += ax * dt;
      d.vy += ay * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      let gx = 0;
      if (now < glitchUntil && d.ty > glitchY && d.ty < glitchY + glitchH) gx = 18;
      // Snap to whole pixels so the settled logo reads as a crisp dot matrix.
      const s = Math.max(2, Math.round(d.s * (0.8 + pulse * 0.45)));
      ctx.fillStyle = d.c;
      ctx.fillRect(Math.round(d.x + gx - s / 2), Math.round(d.y - s / 2), s, s);
    }
    if (now < glitchUntil) {
      // Chromatic split on the glitched band.
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,60,40,.14)";
      ctx.fillRect(logoLeft, glitchY, logoRight - logoLeft, glitchH);
      ctx.globalCompositeOperation = "source-over";
    }
    if (!still) requestAnimationFrame(frame);
  };
  if (still) for (const d of dots) (d.x = d.tx), (d.y = d.ty);
  requestAnimationFrame(frame);
  return {
    pointer(x: number, y: number) {
      const r = canvas.getBoundingClientRect();
      mouse.x = x - r.left;
      mouse.y = y - r.top;
    },
    leave() {
      mouse.x = mouse.y = -9999;
    },
    blast(x: number, y: number, power = 1) {
      const r = canvas.getBoundingClientRect();
      blast(x - r.left, y - r.top, power);
    },
  };
}

/* ---------------- the stolen-UI ring ---------------- */
const PARTS = [
  '<span class="tt-p-yt"><b>▶</b></span>',
  '<span class="tt-p-cart">カートに入れる</span>',
  '<span class="tt-p-search"><i>⌕</i>UIを奪う方法<u>🎤</u></span>',
  '<span class="tt-p-pdf">申請書.pdf ↓</span>',
  '<span class="tt-p-count">あなたは<b>000128</b>人目</span>',
  '<span class="tt-p-new">NEW!</span>',
  '<span class="tt-p-like">♥ 1.2万</span>',
  '<span class="tt-p-cookie">すべて同意する</span>',
  '<span class="tt-p-ok">OK</span>',
  '<span class="tt-p-captcha"><i>☑</i>私はロボットではありません</span>',
  '<span class="tt-p-marquee"><i>ようこそ！！私のホームページへ</i></span>',
  '<span class="tt-p-sub">チャンネル登録</span>',
];

/* ---------------- screen ---------------- */
export function showTitle(opts: TitleOptions): { close(): void } {
  const ctl = new AbortController(),
    signal = ctl.signal;
  const still = reducedMotion();
  const root = el("dialog", "tt");
  root.setAttribute("aria-label", "UI RAID タイトル");
  root.lang = "ja";

  /* modern layer */
  const modern = el("div", "tt-modern");
  const gl = el("canvas", "tt-gl");
  const ringStage = el("div", "tt-ring-stage");
  ringStage.setAttribute("aria-hidden", "true");
  const ring = el("div", "tt-ring");
  PARTS.forEach((p, i) => {
    const chip = el("div", "tt-chip", p);
    chip.style.setProperty("--i", String(i));
    chip.style.setProperty("--n", String(PARTS.length));
    ring.append(chip);
  });
  ringStage.append(ring);
  const logoCanvas = el("canvas", "tt-logo");
  logoCanvas.setAttribute("aria-hidden", "true");
  const hero = el("main", "tt-hero");
  const eyebrow = el("p", "tt-eyebrow");
  const h1 = el("h1", "tt-h1", "UI RAID");
  const anchor = el("div", "tt-logo-anchor");
  const tag = el("p", "tt-tag");
  const menu = el("nav", "tt-menu");
  menu.setAttribute("aria-label", "メインメニュー");
  const foot = el("footer", "tt-foot");
  const counter = el("span", "tt-odo");
  foot.append(el("span", "tt-foot-label", "あなたは"), counter, el("span", "tt-foot-label", "人目のプレイヤーです"));
  const stack = el(
    "p",
    "tt-stack",
    "<b>RAID OS 2025</b> · WebGL2 shader · Canvas particles · Web Audio analyser · CSS 3D · @property · backdrop-filter",
  );
  hero.append(eyebrow, h1, anchor, tag, menu, foot, stack);
  const cursor = el("div", "tt-cursor");
  cursor.setAttribute("aria-hidden", "true");
  modern.append(gl, ringStage, logoCanvas, hero, cursor);
  root.append(modern);
  document.body.append(root);
  root.showModal();
  root.addEventListener("cancel", (e) => e.preventDefault(), { signal });

  let interacted = false;
  const first = () => {
    if (interacted) return;
    interacted = true;
    audio.unlock();
    opts.onFirstInteraction?.();
  };
  root.addEventListener("pointerdown", first, { capture: true, signal });
  root.addEventListener("keydown", first, { capture: true, signal });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    ctl.abort();
    root.close();
    root.remove();
  };

  /* menu */
  let logo: ReturnType<typeof particleLogo> | null = null;
  const leave = (b: HTMLElement, fn: () => void) => {
    // Radial mask wipe: the title opens a hole at the button and the game shows through.
    const r = b.getBoundingClientRect();
    audio.sfx("whoosh", { volume: 1.2 });
    logo?.blast(r.left + r.width / 2, r.top + r.height / 2, 2.5);
    if (still) {
      close();
      fn();
      return;
    }
    root.style.setProperty("--hx", r.left + r.width / 2 + "px");
    root.style.setProperty("--hy", r.top + r.height / 2 + "px");
    root.classList.add("tt-leaving");
    window.setTimeout(() => {
      close();
      fn();
    }, 620);
  };
  const button = (label: string, sub: string, cls: string, fn: () => void, closes = true) => {
    const b = el("button", "tt-btn " + cls, `<span class="tt-btn-label">${label}</span><small>${sub}</small>`);
    b.type = "button";
    b.addEventListener(
      "click",
      () => {
        first();
        if (closes) leave(b, fn);
        else fn();
      },
      { signal },
    );
    b.addEventListener("pointerenter", () => audio.sfx("hover"), { signal });
    menu.append(b);
    return b;
  };
  const primary = button(opts.hasSave ? "つづきから" : "はじめから", opts.hasSave ? "前回のページを開く" : "空っぽのページから", "tt-primary", opts.hasSave ? opts.onContinue : opts.onNewRun);
  if (opts.hasSave) button("新しいページで", "最初からやり直す", "", opts.onNewRun);
  button("あそびかた", "チュートリアル", "", opts.onTutorial);
  button("実験室", "すべてのUIで自由に", "", opts.onLab);
  button("設定", "音量など", "tt-small", opts.onSettings, false);

  /* pointer: spotlight + magnetic buttons + cursor + shader lens + logo repel + ring tilt */
  const fine = window.matchMedia("(pointer: fine)").matches;
  let bg: ReturnType<typeof shaderBackdrop> | null = null;
  const cur = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2, big: false };
  root.addEventListener(
    "pointermove",
    (e) => {
      cur.tx = e.clientX;
      cur.ty = e.clientY;
      bg?.setMouse(e.clientX / innerWidth, e.clientY / innerHeight);
      logo?.pointer(e.clientX, e.clientY);
      root.style.setProperty("--tilt-x", ((e.clientY / innerHeight - 0.5) * -8).toFixed(2) + "deg");
      root.style.setProperty("--tilt-y", ((e.clientX / innerWidth - 0.5) * 10).toFixed(2) + "deg");
      const b = (e.target as Element).closest?.(".tt-btn") as HTMLElement | null;
      cur.big = !!b;
      for (const btn of menu.querySelectorAll<HTMLElement>(".tt-btn")) {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty("--mx", e.clientX - r.left + "px");
        btn.style.setProperty("--my", e.clientY - r.top + "px");
        if (btn === b && !still) {
          const dx = (e.clientX - (r.left + r.width / 2)) * 0.18,
            dy = (e.clientY - (r.top + r.height / 2)) * 0.28;
          btn.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        } else btn.style.transform = "";
      }
    },
    { signal },
  );
  root.addEventListener("pointerleave", () => logo?.leave(), { signal });
  modern.addEventListener(
    "pointerdown",
    (e) => {
      if (!(e.target as Element).closest?.("button")) logo?.blast(e.clientX, e.clientY, 1.2);
    },
    { signal },
  );
  if (fine && !still) {
    root.classList.add("tt-custom-cursor");
    const moveCursor = () => {
      if (signal.aborted) return;
      cur.x += (cur.tx - cur.x) * 0.22;
      cur.y += (cur.ty - cur.y) * 0.22;
      cursor.style.transform = `translate(${cur.x}px, ${cur.y}px) scale(${cur.big ? 2.3 : 1})`;
      requestAnimationFrame(moveCursor);
    };
    requestAnimationFrame(moveCursor);
  }

  /* odometer */
  const count = String(128 + (Math.floor(Date.now() / 86400000) % 900)).padStart(6, "0");
  for (const ch of count) {
    const col = el("span", "tt-odo-col");
    const strip = el("span", "tt-odo-strip", "0123456789".split("").map((d) => `<i>${d}</i>`).join(""));
    strip.style.setProperty("--d", ch);
    col.append(strip);
    counter.append(col);
  }
  counter.setAttribute("aria-label", count);

  /* start the modern layer */
  let modernStarted = false;
  const startModern = () => {
    if (modernStarted) return;
    modernStarted = true;
    root.classList.add("tt-live");
    bg = shaderBackdrop(gl, signal, still);
    logo = particleLogo(logoCanvas, anchor, signal, still);
    scramble(eyebrow, "1999 → 2025　すべてのUIが、武器になる。", still ? 1 : 900, signal);
    window.setTimeout(() => !signal.aborted && scramble(tag, "他のサイトから、UIを奪え。", still ? 1 : 700, signal), still ? 0 : 350);
    window.setTimeout(() => !signal.aborted && root.classList.add("tt-odo-roll"), 400);
    primary.focus({ preventScroll: true });
  };

  if (!opts.intro || still) {
    startModern();
    return { close };
  }

  /* ---------------- retro boot intro ---------------- */
  const retro = el("div", "tt-retro");
  const boot = el("div", "tt-boot");
  const desk = el("div", "tt-desk");
  desk.innerHTML = `
    <div class="tt-w98 tt-w98-main">
      <div class="tt-w98-bar"><span>UI RAID.exe - Netscape Navigator</span><span class="tt-w98-tools"><i>_</i><i>□</i><i>×</i></span></div>
      <div class="tt-w98-body tt-home">
        <marquee class="tt-home-marq" scrollamount="8">★☆★ ようこそ！！ UI RAID のホームページへ ★☆★ 相互リンク募集中 ★☆★</marquee>
        <h2 class="tt-home-logo">UI RAID</h2>
        <p class="tt-home-sub">〜 他のサイトから、UIを奪え 〜</p>
        <p class="tt-home-construct">🚧 工事中 🚧</p>
        <p class="tt-home-count">あなたは <b>000128</b> 人目のお客様です</p>
        <p class="tt-home-best">このページは 800×600 / Netscape 4.0 で最適化されています</p>
      </div>
    </div>
    <div class="tt-w98 tt-w98-dial">
      <div class="tt-w98-bar"><span>ダイヤルアップ接続</span><span class="tt-w98-tools"><i>×</i></span></div>
      <div class="tt-w98-body">
        <p class="tt-dial-msg">インターネットに接続しています…</p>
        <div class="tt-w98-progress"><i></i></div>
        <p class="tt-dial-speed">56,000 bps</p>
      </div>
    </div>
    <div class="tt-w98-taskbar"><span class="tt-w98-start">スタート</span><span class="tt-w98-clock">23:59</span></div>`;
  const press = el("div", "tt-press", `<pre>RAID-BIOS (C) 1999 UI RAID Systems\n\n</pre><p>PRESS ANY KEY TO BOOT<span>_</span></p>`);
  retro.append(boot, desk, press);
  root.append(retro);
  root.classList.add("tt-booting");
  const dialMsg = desk.querySelector<HTMLElement>(".tt-dial-msg")!,
    bar = desk.querySelector<HTMLElement>(".tt-w98-progress")!;

  let hurry = false;
  let bootStarted = false;
  const runBoot = async () => {
    if (bootStarted) return;
    bootStarted = true;
    first();
    audio.setMusic("none");
    press.remove();
    audio.sfx("post");
    const lines = [
      "RAID-BIOS (C) 1999 UI RAID Systems",
      "CPU : Pentium(R) II 400MHz",
      "Memory Test : 65536K OK",
      "",
      "Detecting IDE Primary Master ... WEB_PAGE.HTM",
      "Detecting IDE Primary Slave  ... UI_PARTS.DAT",
      "",
      "Starting RAID OS 98 ...",
    ];
    for (const line of lines) {
      boot.textContent += line + "\n";
      await wait(hurry ? 10 : 90, signal);
    }
    await wait(hurry ? 40 : 320, signal);
    boot.remove();
    desk.classList.add("tt-desk-on");
    audio.sfx("dialup", { volume: 0.9 });
    // Chunky 98-style progress: discrete blocks, stalling at 99%.
    const blocks = 22;
    for (let i = 1; i <= blocks; i++) {
      bar.style.setProperty("--p", String(i / blocks));
      await wait(hurry ? 8 : i === blocks - 1 ? 420 : 55 + Math.random() * 60, signal);
    }
    dialMsg.textContent = "新しいバージョンが見つかりました。RAID OS 2025 にアップグレードします…";
    await wait(hurry ? 60 : 700, signal);
    if (signal.aborted) return;
    root.classList.remove("tt-booting");
    await tileWave({ ghost: retro, host: root, shake: root, accent: ACCENT, swap: startModern, volume: 1.8 });
    if (signal.aborted) return;
    audio.setMusic("title");
  };
  const onKey = () => {
    if (!bootStarted) void runBoot();
    else hurry = true;
  };
  root.addEventListener("pointerdown", onKey, { signal });
  root.addEventListener("keydown", onKey, { signal });
  return { close };
}
