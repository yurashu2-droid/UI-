/* Modern-web touches for the in-game OS, unlocked as the OS era advances:
   - Aero and later: pointer spotlight on windows and cards (CSS vars --mx/--my, drawn in os.css).
   - Flat and later: the publish button gets a magnetic pull and an animated conic border (os.css).
   - 2025 Art: notification banners decode in with a text scramble.
   - 2025 Art: the desktop wallpaper is the title's live WebGL2 shader.
   The 98/XP eras stay deliberately period-correct. */
import { shaderBackdrop } from "./shader-bg.js";

const SPOT = ".shop-card, .crawl-site, .side-sec, .tb-primary, .left-panel .panel-head";
const GLYPHS = "▓▒░<>/{}#01アイウカキクｱｲｳ";

const eraAtLeast = (era: "aero" | "flat" | "art") => {
  const order = ["98", "xp", "aero", "flat", "art"];
  const cur = order.findIndex((e) => document.body.classList.contains("era-" + e));
  return cur >= order.indexOf(era);
};

function scramble(node: HTMLElement, text: string, ms: number): void {
  const start = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / ms);
    let out = "";
    for (let i = 0; i < text.length; i++) out += i / text.length < p * 1.2 - 0.2 || /\s/.test(text[i]) ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    node.textContent = out;
    if (p < 1 && node.isConnected) requestAnimationFrame(tick);
    else node.textContent = text;
  };
  requestAnimationFrame(tick);
}

let wall: { canvas: HTMLCanvasElement; ctl: AbortController; api: ReturnType<typeof shaderBackdrop> } | null = null;
function syncWallpaper(isReduced: () => boolean): void {
  const on = document.body.classList.contains("era-art");
  if (on && !wall) {
    const canvas = document.createElement("canvas");
    canvas.className = "os-wallpaper";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    const ctl = new AbortController();
    wall = { canvas, ctl, api: shaderBackdrop(canvas, ctl.signal, isReduced(), { scale: 0.35, fps: 30, gain: 0.9 }) };
  } else if (!on && wall) {
    wall.ctl.abort();
    wall.canvas.remove();
    wall = null;
  }
}

export function initModernUI(isReduced: () => boolean): void {
  let magnet: HTMLElement | null = null;
  syncWallpaper(isReduced);
  new MutationObserver(() => syncWallpaper(isReduced)).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener(
    "pointermove",
    (e) => {
      wall?.api.setMouse(e.clientX / innerWidth, e.clientY / innerHeight);
      if (!eraAtLeast("aero")) return;
      const target = (e.target as Element | null)?.closest?.(SPOT) as HTMLElement | null;
      if (target) {
        const r = target.getBoundingClientRect();
        target.style.setProperty("--mx", `${e.clientX - r.left}px`);
        target.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      // Magnetic publish button (Flat+).
      const btn = (e.target as Element | null)?.closest?.(".tb-primary") as HTMLElement | null;
      if (magnet && magnet !== btn) {
        magnet.style.translate = "";
        magnet = null;
      }
      if (btn && eraAtLeast("flat") && !isReduced()) {
        const r = btn.getBoundingClientRect();
        btn.style.translate = `${((e.clientX - (r.left + r.width / 2)) * 0.2).toFixed(1)}px ${((e.clientY - (r.top + r.height / 2)) * 0.3).toFixed(1)}px`;
        magnet = btn;
      }
    },
    { passive: true },
  );
  document.addEventListener("pointerleave", () => {
    if (magnet) magnet.style.translate = "";
    magnet = null;
  });
  // Banner decode (2025 Art).
  new MutationObserver((muts) => {
    if (!eraAtLeast("art") || isReduced()) return;
    for (const m of muts)
      for (const n of Array.from(m.addedNodes)) {
        if (!(n instanceof HTMLElement) || !n.classList.contains("cer-banner")) continue;
        const title = n.querySelector<HTMLElement>(".cer-banner-title");
        if (title?.textContent) scramble(title, title.textContent, 520);
      }
  }).observe(document.body, { childList: true });
}
