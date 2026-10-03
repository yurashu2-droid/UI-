import type { DefaultTreeAdapterMap } from "parse5";
type Node = DefaultTreeAdapterMap["node"];
export const CSS_LIMITS = Object.freeze({
  bytes: 262144,
  rules: 1024,
  blocks: 4096,
  declarations: 64,
  selectorParts: 4,
});
export type SafeStyle = {
  color?: string;
  background?: string;
  font?: "sans" | "serif" | "mono";
  size?: number;
  weight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  padding?: [number, number, number, number];
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  hidden?: boolean;
};
const tag = (n: Node) => ("tagName" in n ? n.tagName : "");
const attr = (n: Node, k: string) =>
  "attrs" in n ? n.attrs.find((a) => a.name === k)?.value : undefined;
const classList = (n: Node) =>
  (attr(n, "class") ?? "").split(/\s+/).slice(0, 64);
const names: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  blue: "#0000ff",
  navy: "#000080",
  red: "#ff0000",
  green: "#008000",
  gray: "#808080",
  grey: "#808080",
};
function color(s: string) {
  s = s.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s))
    return "#" + [...s.slice(1)].map((c) => c + c).join("");
  return Object.hasOwn(names, s) ? names[s] : undefined;
}
const px = (s: string, max: number) =>
  /^(?:0|\d+(?:\.\d+)?px)$/.test(s) && parseFloat(s) <= max
    ? parseFloat(s)
    : undefined;
/** Values are interpreted, never inserted as CSS. Unsupported functions/resources are discarded. */
export function safeDeclarations(css: string): SafeStyle {
  const out: SafeStyle = {};
  if (css.length > 4096) return out;
  for (const d of css.split(";").slice(0, CSS_LIMITS.declarations)) {
    const j = d.indexOf(":");
    if (j < 0) continue;
    const key = d.slice(0, j).trim().toLowerCase(),
      value = d
        .slice(j + 1)
        .trim()
        .replace(/\s*!important\s*$/i, "");
    if (/[()@\\]/.test(value) || /url|expression|javascript/i.test(value))
      continue;
    if (key === "color") {
      const v = color(value);
      if (v) out.color = v;
    }
    if (key === "background" || key === "background-color") {
      const v = color(value);
      if (v) out.background = v;
    }
    if (key === "font-family") {
      if (/monospace/i.test(value)) out.font = "mono";
      else if (/sans-serif/i.test(value)) out.font = "sans";
      else if (/serif|georgia|times/i.test(value)) out.font = "serif";
    }
    if (key === "font-size") {
      const v = px(value, 64);
      if (v !== undefined && v >= 8) out.size = v;
    }
    if (key === "font-weight" && /^(normal|bold|[1-9]00)$/.test(value))
      out.weight = value === "bold" || Number(value) >= 600 ? "bold" : "normal";
    if (key === "text-align" && ["left", "center", "right"].includes(value))
      out.align = value as SafeStyle["align"];
    if (key === "padding") {
      const values = value.split(/\s+/).map((v) => px(v, 32));
      if (
        values.length >= 1 &&
        values.length <= 4 &&
        values.every((v) => v !== undefined)
      ) {
        const [a, b = a, c = a, e = b] = values as number[];
        out.padding = [a, b, c, e];
      }
    }
    if (key === "border-radius") {
      const v = px(value, 80);
      if (v !== undefined) out.radius = v;
    }
    if (key === "border-width") {
      const v = px(value, 8);
      if (v !== undefined) out.borderWidth = v;
    }
    if (key === "border-color") {
      const v = color(value);
      if (v) out.borderColor = v;
    }
    if (key === "border") {
      if (value === "none" || value === "0") out.borderWidth = 0;
      else {
        const parts = value.split(/\s+/);
        if (parts.length === 3 && parts.includes("solid")) {
          const w = parts.map((p) => px(p, 8)).find((v) => v !== undefined),
            c = parts.map(color).find(Boolean);
          if (w !== undefined && c) {
            out.borderWidth = w;
            out.borderColor = c;
          }
        }
      }
    }
    if (
      (key === "display" && value === "none") ||
      (key === "visibility" && value === "hidden")
    )
      out.hidden = true;
  }
  return out;
}
type Part = { tag?: string; id?: string; classes: string[] };
type Rule = { parts: Part[]; style: SafeStyle; score: number; order: number };
function selector(s: string): Part[] | null {
  const tokens = s.trim().split(/\s+/);
  if (tokens.length > CSS_LIMITS.selectorParts) return null;
  const out: Part[] = [];
  for (const t of tokens) {
    if (
      !/^(?:[a-z][a-z0-9-]*)?(?:[.#][a-zA-Z][a-zA-Z0-9_-]{0,47})*$/.test(t) ||
      !t
    )
      return null;
    const head = t.match(/^[a-z][a-z0-9-]*/)?.[0];
    const p: Part = { tag: head, classes: [] };
    for (const m of t.matchAll(/([.#])([a-zA-Z][a-zA-Z0-9_-]{0,47})/g)) {
      if (m[1] === "#") {
        if (p.id) return null;
        p.id = m[2];
      } else p.classes.push(m[2]);
    }
    out.push(p);
  }
  return out;
}
/** Scan only top-level blocks, respecting strings/comments; all at-rules are skipped as a unit. */
function blocks(
  css: string,
  emit: (prelude: string, body: string) => void,
): boolean {
  let i = 0,
    count = 0;
  function until(stops: string) {
    const start = i;
    let quote = "";
    while (i < css.length) {
      const c = css[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "/" && css[i + 1] === "*") {
        const end = css.indexOf("*/", i + 2);
        i = end < 0 ? css.length : end + 1;
      } else if (stops.includes(c)) break;
      i++;
    }
    return css.slice(start, i);
  }
  while (i < css.length) {
    if (++count > CSS_LIMITS.blocks) return true;
    const prelude = until("{;")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    if (css[i] === ";") {
      i++;
      continue;
    }
    if (css[i] !== "{") break;
    i++;
    const start = i;
    let depth = 1;
    while (i < css.length && depth) {
      until("{}");
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      if (i < css.length) i++;
    }
    if (depth) break;
    const body = css.slice(start, i - 1);
    if (!prelude.startsWith("@") && !body.includes("{")) emit(prelude, body);
  }
  return false;
}
export function createSafeStyleReader(sheets: string[]) {
  const rules: Rule[] = [],
    index = new Map<string, Rule[]>();
  let total = 0,
    limited = false;
  for (const css of sheets) {
    total += Buffer.byteLength(css, "utf8");
    if (total > CSS_LIMITS.bytes) {
      limited = true;
      break;
    }
    limited =
      blocks(css, (prelude, body) => {
        const style = safeDeclarations(body);
        if (!Object.keys(style).length) return;
        for (const s of prelude.split(",").slice(0, 128)) {
          if (rules.length >= CSS_LIMITS.rules) {
            limited = true;
            break;
          }
          const parts = selector(s);
          if (!parts) continue;
          const rule = {
            parts,
            style,
            score: parts.reduce(
              (n, p) =>
                n + (p.id ? 100 : 0) + p.classes.length * 10 + (p.tag ? 1 : 0),
              0,
            ),
            order: rules.length,
          };
          rules.push(rule);
          const p = parts.at(-1)!,
            key = p.id
              ? "#" + p.id
              : p.classes.length
                ? "." + p.classes[0]
                : p.tag!;
          const bucket = index.get(key) ?? [];
          bucket.push(rule);
          index.set(key, bucket);
        }
      }) || limited;
  }
  const matches = (n: Node, p: Part) =>
    (!p.tag || tag(n) === p.tag) &&
    (!p.id || attr(n, "id") === p.id) &&
    p.classes.every((c) => classList(n).includes(c));
  const match = (n: Node, r: Rule) => {
    let current: Node | null = n;
    for (let i = r.parts.length - 1; i >= 0; i--) {
      if (!current) return false;
      if (i === r.parts.length - 1) {
        if (!matches(current, r.parts[i])) return false;
      } else {
        while (current && !matches(current, r.parts[i]))
          current = "parentNode" in current ? current.parentNode : null;
        if (!current) return false;
      }
      current = "parentNode" in current ? current.parentNode : null;
    }
    return true;
  };
  const cache = new WeakMap<object, SafeStyle>();
  const styleFor = (n: Node): SafeStyle => {
    const existing = cache.get(n);
    if (existing) return existing;
    const parent =
      "parentNode" in n && n.parentNode ? styleFor(n.parentNode) : {};
    const out: SafeStyle = {
      color: parent.color,
      font: parent.font,
      size: parent.size,
      weight: parent.weight,
      align: parent.align,
    };
    const keys = [
      tag(n),
      ...classList(n).map((c) => "." + c),
      "#" + (attr(n, "id") ?? ""),
    ];
    const candidates = [...new Set(keys.flatMap((k) => index.get(k) ?? []))]
      .filter((r) => match(n, r))
      .sort((a, b) => a.score - b.score || a.order - b.order);
    for (const r of candidates) Object.assign(out, r.style);
    Object.assign(out, safeDeclarations(attr(n, "style") ?? ""));
    cache.set(n, out);
    return out;
  };
  return { styleFor, rules: rules.length, limited };
}
