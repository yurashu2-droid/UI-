import D from "../data.js";
import { validateRaidAppearance, validateRaidBlueprint } from "./blueprint.js";
import type { RaidAppearance, RaidBlueprint, RaidPrimitive } from "./types.js";

const FONTS = {
  sans: "Arial, sans-serif",
  serif: 'Georgia, "Noto Serif JP", serif',
  mono: "Consolas, monospace",
};
function paint(
  host: HTMLElement,
  p: RaidPrimitive,
  width: number,
  height: number,
  relative: boolean,
): void {
  const node = host.ownerDocument.createElement("span");
  const unit = (n: number, size: number) =>
    relative ? `${(n / size) * 100}%` : `${n}px`;
  Object.assign(node.style, {
    position: "absolute",
    left: unit(p.rect.x, width),
    top: unit(p.rect.y, height),
    width: unit(p.rect.w, width),
    height: unit(p.rect.h, height),
    boxSizing: "border-box",
    overflow: "hidden",
    pointerEvents: "none",
  });
  if (p.kind === "text") {
    node.textContent = p.text;
    Object.assign(node.style, {
      color: p.color,
      fontSize: p.size + "px",
      fontWeight: p.weight,
      fontFamily: FONTS[p.font],
      textAlign: p.align,
      lineHeight: "1.4",
      whiteSpace: "nowrap",
    });
  } else
    Object.assign(node.style, {
      backgroundColor: p.fill,
      borderRadius: p.radius + "px",
      border: `${p.borderWidth}px solid ${p.borderColor}`,
    });
  host.append(node);
}
/** An allowlisted renderer, deliberately without HTML, CSS-string, URL or SVG sinks. */
export function renderRaidAppearance(
  host: HTMLElement,
  appearance: RaidAppearance,
): void {
  if (!validateRaidAppearance(appearance))
    throw new Error("外観データを安全に表示できません。");
  host.replaceChildren();
  Object.assign(host.style, {
    position: "relative",
    overflow: "hidden",
    backgroundColor: appearance.background,
  });
  const ordered = [...appearance.primitives].sort(
    (a, b) => Number(a.kind === "text") - Number(b.kind === "text"),
  );
  for (const p of ordered)
    paint(host, p, appearance.width, appearance.height, true);
}
export function renderRaidScene(
  host: HTMLElement,
  blueprint: RaidBlueprint,
): void {
  const checked = validateRaidBlueprint(blueprint);
  if (!checked.ok) throw new Error(checked.error);
  host.replaceChildren();
  host.className = "raid-scene";
  Object.assign(host.style, {
    position: "relative",
    width: "960px",
    height: "680px",
    backgroundColor: blueprint.background,
    overflow: "hidden",
    flexShrink: "0",
  });
  for (const p of blueprint.decor) paint(host, p, 960, 680, false);
  for (const c of blueprint.components) {
    const node = host.ownerDocument.createElement("div");
    renderRaidAppearance(node, c.appearance);
    node.className = "raid-component";
    node.dataset.componentId = c.componentId;
    node.dataset.canonicalType = c.canonicalType;
    node.dataset.appearanceId = c.appearanceId;
    node.setAttribute(
      "aria-label",
      `${D.PARTS[c.canonicalType].name} / ${D.PARTS[c.canonicalType].desc}`,
    );
    Object.assign(node.style, {
      position: "absolute",
      left: c.combatRect.x + "px",
      top: c.combatRect.y + "px",
      width: c.combatRect.w + "px",
      height: c.combatRect.h + "px",
    });
    host.append(node);
  }
}

import { getRaidAppearance } from "./registry.js";
import type { Item } from "../types.js";

/** Lift the original game-owned controls, rather than copying state or executing source code. */
function preserveLiveControls(
  host: HTMLElement,
  appearance: RaidAppearance,
): void {
  const layers = [
    [".native-search", "search"],
    [".native-gov-check", "checkbox"],
    [".native-coupon", "checkbox"],
    [".native-toggle", "checkbox"],
    [".native-quantity", "select"],
    [".native-translate", "select"],
    [".native-seek", "progress"],
    [".native-video", "video"],
    [".native-button", "button"],
  ] as const;
  for (const [selector, kind] of layers) {
    const root = host.querySelector<HTMLElement>(selector);
    if (!root) continue;
    root.classList.add("raid-live-layer");
    root.dataset.raidLive = kind;
    root.style.zIndex = "3";
    const label = appearance.primitives.find((p) => p.kind === "text");
    if (kind === "checkbox") {
      root
        .querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.setAttribute(
          "aria-label",
          label?.kind === "text" ? label.text : "チェック切り替え",
        );
    }
    const quantity = selector === ".native-quantity";
    if (kind !== "search" && !quantity) continue;
    const input = quantity
      ? root.querySelector<HTMLSelectElement>("select")
      : root.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input || !label || label.kind !== "text") continue;
    // Use the source text region for the real input. Its .value is still owned by
    // the game, including typing during battle and direct editing in preview.
    if (!quantity) (input as HTMLInputElement).placeholder = label.text;
    else {
      root.dataset.raidSourceField = "true";
      input.setAttribute("aria-label", "数量");
    }
    const r = label.rect;
    const backgrounds = appearance.primitives.filter(
      (p) =>
        p.kind === "rect" &&
        p.rect.x <= r.x &&
        p.rect.y <= r.y &&
        p.rect.x + p.rect.w >= r.x + r.w &&
        p.rect.y + p.rect.h >= r.y + r.h,
    );
    const backing = backgrounds.at(-1);
    // Quantity's frozen label can contain a stale digit (e.g. "数量 1").
    // Mask that one text region with the original labelled live selector.
    Object.assign(quantity ? root.style : input.style, {
      position: "absolute",
      left: `${(r.x / appearance.width) * 100}%`,
      top: `${(r.y / appearance.height) * 100}%`,
      width: `${(r.w / appearance.width) * 100}%`,
      height: `${(r.h / appearance.height) * 100}%`,
      backgroundColor:
        backing?.kind === "rect" ? backing.fill : appearance.background,
      color: label.color,
      fontSize: `${label.size}px`,
      fontWeight: label.weight,
      fontFamily: FONTS[label.font],
      textAlign: label.align,
    });
  }
}

/** Source artwork stays frozen; game-owned live controls and feedback remain visible above it. */
export function applyRaidAppearance(host: HTMLElement, item: Item): boolean {
  if (!item.appearanceId) return false;
  const appearance = getRaidAppearance(item.appearanceId);
  if (!appearance) return false;
  host.querySelector(":scope > .raid-skin")?.remove();
  const overlay = host.ownerDocument.createElement("div");
  renderRaidAppearance(overlay, appearance);
  overlay.className = "raid-skin";
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2",
  });
  host.classList.add("has-raid-skin");
  host.append(overlay);
  preserveLiveControls(host, appearance);
  return true;
}
