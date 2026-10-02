import "./styles/ceremony.css";
import "./styles/versus.css";
import { audio } from "./audio.js";
import { runFragment } from "./shader-bg.js";

export interface SiteCard {
  name: string; url: string; color: string; faction?: string; thumbHTML?: string;
  stats: { label: string; value: string }[]; tags?: string[];
}
export interface VersusData {
  round: number | null; totalRounds: number; you: SiteCard; foe: SiteCard; foeTip: string; isBoss?: boolean;
}
export interface OutcomeData {
  win: boolean; draw?: boolean; round: number | null; you: number; foe: number; headline?: string; mvp?: string;
}
export interface PublishLine {
  kind: "cmd" | "step" | "meter" | "info" | "warn" | "upload" | "done";
  text: string;
  /** step: result word; meter: final percent; upload: destination. */
  result?: string;
  value?: number;
}
export interface RoundIntroData {
  round: number; totalRounds: number;
  ladder: { name: string; color: string; state: "win" | "lose" | "next" | "future"; boss?: boolean }[];
  unlocked?: string[]; lives: number; cash: number; capacity: number; tip?: string;
}

// Motion grammar: publish (0–650), collision (650–1050), read (1050–1950), connect (1950–2400).
// Outcomes: stamp → visitor transfer → hold → collapse. All scheduled work belongs to its surface.
let reduceRequested = false;
const motionObservers = new Set<() => void>();
let closeForeground: (() => void) | undefined;
const reduced = () => reduceRequested || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function setReducedMotion(v: boolean): void {
  reduceRequested = v;
  motionObservers.forEach(update => update());
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function accent(node: HTMLElement, color: string): void {
  node.style.setProperty("--cer-accent", CSS.supports("color", color) ? color : "#2fb47c");
}
function chrome(label: string): HTMLElement {
  const bar = el("div", "cer-chrome");
  bar.append(el("span", "cer-chrome-label", label), el("span", "cer-window-tools", "−  □  ×"));
  return bar;
}

function surface(kind: string, label: string, duration?: number) {
  closeForeground?.();
  const root = el("dialog", `cer-overlay cer-${kind}`);
  root.setAttribute("aria-label", label);
  root.lang = "ja";
  const previousFocus = document.activeElement;
  const controller = new AbortController();
  const timers = new Set<number>();
  const cleanups: (() => void)[] = [];
  let closed = false;
  let resolve!: () => void;
  const done = new Promise<void>(r => { resolve = r; });
  function later(ms: number, fn: () => void): void {
    const timer = window.setTimeout(() => { timers.delete(timer); if (!closed) fn(); }, ms);
    timers.add(timer);
  }
  function close(): void {
    if (closed) return;
    closed = true;
    controller.abort();
    timers.forEach(window.clearTimeout);
    cleanups.forEach(fn => fn());
    motionObservers.delete(updateMotion);
    // A non-blocking notification keeps its full lifetime across ceremony handoffs.
    root.querySelectorAll<HTMLElement>(".cer-banner").forEach(banner => document.body.append(banner));
    root.close();
    root.remove();
    if (closeForeground === close) closeForeground = undefined;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    resolve();
  }
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  function updateMotion(): void {
    root.classList.toggle("cer-reduced", reduced());
    if (duration !== undefined && reduced()) later(900, close);
  }
  motionObservers.add(updateMotion);
  media.addEventListener("change", updateMotion, { signal: controller.signal });
  updateMotion();
  closeForeground = close;
  document.body.append(root);
  root.showModal();
  root.addEventListener("cancel", event => { event.preventDefault(); if (duration !== undefined) close(); }, { signal: controller.signal });
  if (duration !== undefined) {
    const skip = el("button", "cer-skip", "クリック / キーでスキップ ↵");
    skip.type = "button";
    root.append(skip);
    root.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); close(); }, { signal: controller.signal });
    root.addEventListener("keydown", event => {
      event.preventDefault(); event.stopPropagation(); close();
    }, { signal: controller.signal });
    later(reduced() ? 900 : duration - 160, () => root.classList.add("cer-leaving"));
    later(reduced() ? 1050 : duration, close);
  }
  return { root, close, done, later, cleanups, signal: controller.signal };
}

/* ---------- VS: a broadcast-style match intro ----------
   Live WebGL split field in both sites' colours (speed lines rushing to a glowing seam), cards that
   whip in with motion blur and 3D tilt, a VS slam with chromatic split, shockwave, sparks and shake,
   a decoding tip ticker, then CONNECT resolving letter by letter under a light sweep. */
const VS_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uYou; uniform vec3 uFoe; uniform float uOpen; uniform float uFlash; uniform float uBoss;
out vec4 o;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+1.), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*n(p); p = p*2.1 + 3.7; a *= .5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - .5*uRes) / uRes.y;
  float t = uTime;
  // Entry: the YOU half slides in from the bottom-left, the RIVAL half from the top-right;
  // each carries its own glowing edge, and the two edges meet on the diagonal seam.
  float away = 1. - uOpen;
  vec2 pY = p - vec2(-1.3, -1.) * away * 1.5;
  vec2 pF = p - vec2( 1.3,  1.) * away * 1.5;
  float seamY = pY.x + pY.y*.32, seamF = pF.x + pF.y*.32;
  vec3 col = vec3(.012, .012, .02);
  bool inYou = seamY < 0., inFoe = seamF >= 0.;
  if (inYou || inFoe) {
    float side = inYou ? 0. : 1.;
    vec2 lp = inYou ? pY : pF;
    float seam = inYou ? seamY : seamF;
    float dir = side > .5 ? 1. : -1.;                 // speed lines rush toward the seam from both sides
    vec2 q = vec2(lp.x*1.6 + dir*t*1.8, lp.y*22.);
    float lines = smoothstep(.72, 1., n(vec2(q.x*.8, floor(q.y)))) * smoothstep(0., .9, abs(seam)*2.2);
    float field = fbm(lp*2.2 + vec2(dir*t*.35, t*.1));
    vec3 base = mix(uYou, uFoe, side);
    col = base * (.16 + .5*field*field);
    col += base * lines * .55;
    col = mix(col, vec3(.02,.02,.035), smoothstep(.3, 1.2, abs(seam)) * .55);
    float d = abs(seam);                              // each half's leading edge: hot white core, coloured bloom
    col += vec3(1.) * exp(-d*140.) * 1.2;
    col += base * exp(-d*18.) * .9;
  }
  // light spilling across the gap while the halves are still apart
  col += mix(uYou, uFoe, .5) * .25 * away * exp(-abs(seamY)*6.) * step(0., seamY) * step(seamF, 0.);
  col = mix(col, col*vec3(1.35,.55,.5) + vec3(.08,0.,0.), uBoss*.6);
  col *= 1. - uBoss*.12*step(.5, fract(uv.y*60. - t*3.));
  col += vec3(1.) * uFlash;
  col *= smoothstep(1.5, .35, length(p*vec2(.8, 1.)));
  col += (h(gl_FragCoord.xy + fract(t*9.)*77.) - .5) * .06;
  o = vec4(col, 1.);
}`;
function rgb01(color: string, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return fallback;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
const VS_GLYPHS = "▓▒░<>/{}#01アイウカキク";
function decode(node: HTMLElement, text: string, ms: number, s: ReturnType<typeof surface>): void {
  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const p = reduced() ? 1 : Math.min(1, (now - start) / ms);
    let out = "";
    for (let i = 0; i < text.length; i++) out += i / text.length < p * 1.2 - 0.2 || /\s/.test(text[i]) ? text[i] : VS_GLYPHS[(Math.random() * VS_GLYPHS.length) | 0];
    node.textContent = out;
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  s.cleanups.push(() => cancelAnimationFrame(raf));
}
function vsCard(card: SiteCard, side: "you" | "foe"): HTMLElement {
  const box = el("section", `vs2-card vs2-${side}`);
  accent(box, card.color);
  const inner = el("div", "vs2-card-inner");
  inner.append(el("div", "vs2-side", side === "you" ? "YOU　／　あなたのサイト" : "RIVAL　／　対戦サイト"));
  const thumb = el("div", "vs2-thumb");
  if (card.thumbHTML) {
    const frame = el("iframe", "cer-thumbnail");
    frame.title = `${card.name} のプレビュー`;
    frame.setAttribute("sandbox", "");
    frame.setAttribute("tabindex", "-1");
    frame.setAttribute("aria-hidden", "true");
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>body{margin:12px;font:14px 'Segoe UI',sans-serif;color:#23242a;background:white;overflow:hidden}*{box-sizing:border-box}</style>${card.thumbHTML}`;
    thumb.append(frame);
  } else thumb.append(el("div", "vs2-thumb-empty", card.name));
  inner.append(thumb, el("div", "vs2-faction", card.faction || "独自のデザインシステム"), el("h2", "vs2-name", card.name));
  const stats = el("div", "vs2-stats");
  card.stats.forEach((stat, i) => {
    const chip = el("span", "vs2-stat");
    chip.style.setProperty("--k", String(i));
    chip.append(el("small", "", stat.label), el("b", "", stat.value));
    stats.append(chip);
  });
  inner.append(stats);
  if (card.tags?.length) inner.append(el("p", "vs2-tags", card.tags.join("　／　")));
  box.append(inner);
  return box;
}
function sparks(canvas: HTMLCanvasElement, you: [number, number, number], foe: [number, number, number], s: ReturnType<typeof surface>): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1),
    w = canvas.clientWidth,
    h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = w / 2,
    cy = h * 0.46;
  const css = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
  const ps = Array.from({ length: 150 }, () => {
    const a = Math.random() * Math.PI * 2,
      sp = 300 + Math.random() * 1100;
    const vx = Math.cos(a) * sp;
    return { x: cx, y: cy, vx, vy: Math.sin(a) * sp * 0.6, life: 0.4 + Math.random() * 0.7, age: 0, c: Math.random() < 0.25 ? "#fff" : css(vx < 0 ? you : foe) };
  });
  let last = performance.now(),
    raf = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    let alive = 0;
    for (const p of ps) {
      p.age += dt;
      if (p.age >= p.life) continue;
      alive++;
      p.vx *= 0.93;
      p.vy = p.vy * 0.93 + 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.strokeStyle = p.c;
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (alive) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  s.cleanups.push(() => cancelAnimationFrame(raf));
}

/* ---------- Publish: a build log that really reads your page, then "公開完了" ---------- */
const SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
export function showPublish(lines: PublishLine[], title = "RAID Publisher"): Promise<void> {
  const k = reduced() ? 0.25 : 1;
  const plan = lines.map((l) => (l.kind === "meter" ? 520 : l.kind === "upload" ? 620 : l.kind === "step" ? 230 : l.kind === "done" ? 700 : 150) * k);
  const total = plan.reduce((a, b) => a + b, 0) + 250 * k;
  const s = surface("publish", "ページを公開中", Math.round(total + 450 * k));
  const win = el("section", "cer-term");
  win.append(chrome(`${title} — ターミナル`));
  const body = el("div", "cer-term-body");
  win.append(body);
  s.root.append(win);
  let at = 120 * k;
  const bar = (p: number, n = 22) => "█".repeat(Math.round(p * n)) + "░".repeat(n - Math.round(p * n));
  const animate = (ms: number, fn: (p: number, spin: string) => void) => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / Math.max(1, ms));
      fn(p, SPIN[Math.floor(now / 70) % SPIN.length]);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    s.cleanups.push(() => cancelAnimationFrame(raf));
  };
  lines.forEach((l, i) => {
    const dur = plan[i];
    s.later(at, () => {
      const row = el("div", `cer-term-row cer-term-${l.kind}`);
      body.append(row);
      body.scrollTop = body.scrollHeight;
      audio.sfx("click", { volume: 0.35, pitch: 0.8 + Math.random() * 0.5 });
      if (l.kind === "cmd") {
        row.innerHTML = `<b>$</b> `;
        const t = el("span", "", "");
        row.append(t, el("i", "cer-term-caret"));
        animate(dur * 0.9, (p) => (t.textContent = l.text.slice(0, Math.ceil(l.text.length * p))));
        s.later(dur, () => row.querySelector(".cer-term-caret")?.remove());
      } else if (l.kind === "step") {
        const spin = el("b", "cer-term-spin", SPIN[0]),
          label = el("span", "", l.text),
          dots = el("span", "cer-term-dots", ""),
          res = el("em", "", "");
        row.append(spin, label, dots, res);
        animate(dur * 0.85, (p, c) => {
          spin.textContent = p < 1 ? c : "✓";
          dots.textContent = " " + ".".repeat(Math.round(p * 10));
          if (p >= 1) res.textContent = " " + (l.result ?? "ok");
        });
      } else if (l.kind === "meter") {
        const label = el("span", "", l.text + " "),
          meter = el("span", "cer-term-bar", ""),
          pct = el("em", "", "");
        row.append(el("b", "cer-term-spin", "◆"), label, meter, pct);
        animate(dur * 0.9, (p) => {
          const v = (l.value ?? 100) * (1 - Math.pow(1 - p, 3));
          meter.textContent = "[" + bar(v / 100) + "]";
          pct.textContent = ` ${Math.round(v)}%`;
        });
      } else if (l.kind === "upload") {
        const label = el("span", "", l.text + " "),
          meter = el("span", "cer-term-bar", ""),
          pct = el("em", "", ""),
          spin = el("b", "cer-term-spin", SPIN[0]);
        row.append(spin, label, meter, pct);
        animate(dur * 0.92, (p, c) => {
          spin.textContent = p < 1 ? c : "✓";
          meter.textContent = "[" + bar(p) + "]";
          pct.textContent = ` ${Math.round(p * 100)}%${l.result ? "  → " + l.result : ""}`;
        });
      } else if (l.kind === "done") {
        row.innerHTML = `<span class="cer-term-stamp">✓ ${esc(l.text)}</span>${l.result ? `<small>${esc(l.result)}</small>` : ""}`;
        s.root.classList.add("cer-published-done");
        audio.sfx("deploy", { volume: 0.9 });
      } else {
        row.append(el("b", "cer-term-spin", l.kind === "warn" ? "!" : "»"), el("span", "", l.text));
        if (l.kind === "warn") audio.sfx("error", { volume: 0.4 });
      }
    });
    at += dur;
  });
  return s.done;
}
function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function showVersus(d: VersusData): Promise<void> {
  const s = surface("vs2", "対戦サイトに接続", 2750);
  if (d.isBoss) s.root.classList.add("cer-boss");
  const you = rgb01(d.you.color, [0.18, 0.85, 0.5]),
    foe = rgb01(d.foe.color, [1, 0.3, 0.2]);
  s.root.style.setProperty("--vs-you", `rgb(${you.map((v) => Math.round(v * 255)).join(",")})`);
  s.root.style.setProperty("--vs-foe", `rgb(${foe.map((v) => Math.round(v * 255)).join(",")})`);

  const bg = el("canvas", "vs2-bg");
  bg.setAttribute("aria-hidden", "true");
  s.root.append(bg);
  const clashAt = 0.72;
  const ok = runFragment(
    bg,
    VS_FRAG,
    (gl, u, t) => {
      gl.uniform1f(u("uTime"), t);
      gl.uniform3f(u("uYou"), you[0], you[1], you[2]);
      gl.uniform3f(u("uFoe"), foe[0], foe[1], foe[2]);
      gl.uniform1f(u("uOpen"), reduced() ? 1 : 1 - Math.pow(1 - Math.min(1, t / 0.6), 3));
      gl.uniform1f(u("uFlash"), reduced() || t < clashAt ? 0 : Math.exp(-(t - clashAt) * 7) * 0.9);
      gl.uniform1f(u("uBoss"), d.isBoss ? 1 : 0);
    },
    s.signal,
    0.5,
  );
  if (!ok) bg.classList.add("vs2-bg-fallback");

  const round = el("div", "vs2-round");
  const roundText = `${d.isBoss ? "☠ BOSS　" : ""}${d.round === null ? "TEST MATCH　／　実験室" : `ROUND ${d.round} / ${d.totalRounds}`}`;
  round.append(el("span", "vs2-round-rule"), el("b", "vs2-round-text", ""), el("span", "vs2-round-rule"));
  const arena = el("div", "vs2-arena");
  const youCard = vsCard(d.you, "you");
  const deploy = el("div", "vs2-deploy");
  const deployText = el("b", "", "デプロイ中…");
  deploy.append(deployText, el("i", "vs2-deploy-bar"));
  youCard.querySelector(".vs2-card-inner")!.append(deploy);
  const vs = el("div", "vs2-vs");
  vs.setAttribute("aria-label", "対戦");
  vs.innerHTML = '<span class="vs2-v" data-t="V">V</span><span class="vs2-s" data-t="S">S</span>';
  arena.append(youCard, vs, vsCard(d.foe, "foe"));
  const shock = el("i", "vs2-shock");
  const spark = el("canvas", "vs2-sparks");
  const tip = el("p", "vs2-tip");
  const tipText = el("span", "", "");
  tip.append(el("b", "", "攻略メモ"), tipText);
  const go = el("div", "vs2-go");
  go.setAttribute("aria-live", "polite");
  const word = el("div", "vs2-go-word");
  "CONNECT".split("").forEach((ch, i) => {
    const sp = el("span", "", ch);
    sp.style.setProperty("--k", String(i));
    word.append(sp);
  });
  go.append(word, el("div", "vs2-go-sub", "接続開始　—　閲覧者を奪え"));
  s.root.append(round, arena, shock, spark, tip, go);

  const k = reduced() ? 0.3 : 1;
  s.later(40, () => {
    s.root.classList.add("vs2-open");
    decode(round.querySelector<HTMLElement>(".vs2-round-text")!, roundText, 420, s);
    audio.sfx("whoosh", { volume: 1.1 });
  });
  s.later(120 * k, () => s.root.classList.add("vs2-you-in"));
  s.later(240 * k, () => s.root.classList.add("vs2-foe-in"));
  s.later(600 * k, () => {
    deployText.textContent = "✓ 公開しました";
    s.root.classList.add("vs2-published");
  });
  s.later(clashAt * 1000 * k, () => {
    s.root.classList.add("vs2-clash");
    audio.sfx("thud", { volume: 2, pitch: 0.55 });
    audio.sfx("hit", { volume: 1.6, pitch: 0.7 });
    if (!reduced()) sparks(spark, you, foe, s);
  });
  s.later(1000 * k, () => {
    s.root.classList.add("vs2-tip-in");
    decode(tipText, d.foeTip, 600, s);
  });
  s.later(1900 * k, () => s.root.classList.add("vs2-go-on"));
  return s.done;
}

function countUp(node: HTMLElement, value: number, s: ReturnType<typeof surface>): void {
  const target = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const p = reduced() ? 1 : Math.min(1, (now - start) / 1000);
    node.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("ja-JP");
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  s.cleanups.push(() => cancelAnimationFrame(raf));
}

export function showOutcome(d: OutcomeData): Promise<void> {
  const mode = d.draw ? "draw" : d.win ? "win" : "loss";
  const headline = d.headline || (d.draw ? "アクセス、拮抗。" : d.win ? "トレンド入り！" : "このサイトにアクセスできません");
  const s = surface(`outcome cer-${mode}`, headline, 2200);
  const panel = el("section", "cer-result-window");
  panel.append(chrome(`${d.round === null ? "実験室" : `ROUND ${d.round}`} / アクセス解析`));
  const content = el("div", "cer-result-content");
  content.append(el("div", "cer-outcome-mark", d.draw ? "＝" : d.win ? "勝利" : ":("), el("h1", "cer-outcome-headline", headline));
  if (mode === "loss") content.append(el("p", "cer-error", "接続が切断されました　ERR_VISITORS_LOST"));
  const tally = el("div", "cer-tally");
  const number = el("b", "cer-big-count", "0");
  number.setAttribute("aria-hidden", "true");
  tally.setAttribute("aria-label", `あなたの閲覧者 ${d.you} 人、相手 ${d.foe} 人`);
  tally.append(number, el("span", "cer-count-label", "人が、あなたのページへ。"));
  content.append(tally);
  const share = el("div", "cer-share");
  const total = Math.max(0, d.you) + Math.max(0, d.foe);
  share.style.setProperty("--cer-share", `${total > 0 ? Math.max(0, d.you) / total * 100 : 50}%`);
  share.append(el("i", "cer-share-fill"));
  content.append(share, el("div", "cer-share-label", `あなた ${d.you.toLocaleString("ja-JP")}　／　相手 ${d.foe.toLocaleString("ja-JP")}`));
  content.append(el("p", "cer-result-copy", d.draw ? "勝負は、次のクリックへ。" : d.win ? "あなたの寄せ集めが、インターネットを動かした。" : "次は負けない。UIをつなぎ直して、もう一度。"));
  if (d.mvp) content.append(el("p", "cer-mvp", `最も活躍したUI：${d.mvp}`));
  panel.append(content);
  s.root.append(panel);
  if (mode === "win") {
    const burst = el("div", "cer-burst");
    burst.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 24; i++) {
      const confetti = el("span", "cer-confetti", ["↗", "✓", "+1", "★"][i % 4]);
      const angle = i * Math.PI * 2 / 24;
      confetti.style.cssText = `--cer-x:${Math.cos(angle) * (310 + i % 3 * 50)}px;--cer-y:${Math.sin(angle) * 270}px;--cer-spin:${i % 2 ? 32 : -28}deg;--cer-delay:${i % 4 * 35}ms`;
      burst.append(confetti);
    }
    s.root.prepend(burst);
  }
  countUp(number, d.you, s);
  return s.done;
}

export function showRoundIntro(d: RoundIntroData): Promise<void> {
  const s = surface("intro", `ラウンド ${d.round} の準備`, 2900);
  const panel = el("section", "cer-map-window");
  panel.append(chrome("ブックマーク / 遠征ルート"));
  const strip = el("ol", "cer-tabs");
  const nextIndex = d.ladder.findIndex(item => item.state === "next");
  strip.style.setProperty("--cer-count", String(Math.max(1, d.ladder.length)));
  strip.style.setProperty("--cer-next", String(Math.max(0, nextIndex)));
  strip.style.setProperty("--cer-prev", String(Math.max(0, nextIndex - 1)));
  d.ladder.forEach((item, i) => {
    const tab = el("li", `cer-tab cer-tab-${item.state}`);
    accent(tab, item.color);
    const dot = el("i", "cer-favicon");
    tab.append(el("small", "cer-tab-number", `${String(i + 1).padStart(2, "0")}${item.boss ? " / ☠" : ""}`), dot, el("span", "cer-tab-name", item.name));
    const stateText = { win: "✓", lose: "✗", next: "NEXT", future: "·" }[item.state];
    const stamp = el("b", "cer-stamp", stateText);
    stamp.setAttribute("aria-label", { win: "勝利", lose: "敗北", next: "次の対戦", future: "未対戦" }[item.state]);
    tab.append(stamp);
    strip.append(tab);
  });
  if (nextIndex >= 0) strip.append(el("li", "cer-tab-traveller"));
  panel.append(strip);
  const detail = el("div", "cer-next-detail");
  const next = d.ladder[nextIndex];
  detail.append(el("p", "cer-eyebrow", `ROUND ${d.round} / ${d.totalRounds}　${next?.boss ? "☠ BOSS / 最終接続" : "次の接続先"}`), el("h1", "cer-next-name", next?.name || "遠征ルートを確認中"));
  if (next) accent(detail, next.color);
  const status = el("div", "cer-run-status");
  status.append(el("span", "cer-lives", `♥ ${d.lives} ライフ`), el("span", "cer-cash", `$${d.cash}`), el("span", "cer-capacity", `処理能力 ${d.capacity}`));
  detail.append(status);
  const unlocks = el("div", "cer-unlocks");
  for (const name of d.unlocked || []) unlocks.append(el("div", "cer-unlock", `＋ 新しい巡回先：${name}`));
  detail.append(unlocks);
  if (d.tip) detail.append(el("p", "cer-intro-tip", `ヒント：${d.tip}`));
  panel.append(detail);
  s.root.append(panel);
  return s.done;
}

const banners: { title: string; subtitle?: string; color?: string }[] = [];
let bannerActive = false;
export function showBanner(title: string, subtitle?: string, color?: string): void {
  banners.push({ title, subtitle, color });
  pumpBanner();
}
function pumpBanner(): void {
  if (bannerActive) return;
  const data = banners.shift();
  if (!data) return;
  bannerActive = true;
  const banner = el("div", "cer-banner");
  banner.lang = "ja";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  accent(banner, data.color || "#f5c542");
  banner.append(el("span", "cer-banner-icon", "↗"), el("b", "cer-banner-title", data.title));
  if (data.subtitle) banner.append(el("span", "cer-banner-subtitle", data.subtitle));
  const update = () => banner.classList.toggle("cer-reduced", reduced());
  update();
  motionObservers.add(update);
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", update);
  // A modal's top layer would cover a body-level banner; mount inside the active ceremony instead.
  (document.querySelector(".cer-overlay[open]") || document.body).append(banner);
  window.setTimeout(() => banner.classList.add("cer-banner-out"), reduced() ? 900 : 1600);
  window.setTimeout(() => {
    banner.remove();
    motionObservers.delete(update);
    media.removeEventListener("change", update);
    bannerActive = false;
    pumpBanner();
  }, reduced() ? 1050 : 1800);
}
