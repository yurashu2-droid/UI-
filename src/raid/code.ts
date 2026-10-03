import { parse, type DefaultTreeAdapterMap } from "parse5";
import { utf8Bytes, rawSourceHash } from "./code-source.js";
import { parseBoundedLocalHtml } from "./local-parser.js";
import { canonicalTypeFor, sealRaidBlueprint } from "./blueprint.js";
import type { RaidBlueprint, RaidComponent, RaidPrimitive } from "./types.js";
import type { Rect } from "../types.js";
/** Structural subset: no server service/config/network dependency in the browser graph. */
export interface StaticCodeSource {
  html: string;
  sourceHash: string;
  capturedAt: string;
  requestedUrl: string;
  stylesheets?: { css: string; sourceHash: string; url?: string }[];
  stylesheetWarning?: boolean;
}
import {
  activeStylesheetLinkUrl,
  isActiveStylesheetLink,
  CSS_LIMITS,
  createSafeStyleReader,
  isScreenStylesheet,
  type SafeStyle,
} from "./code-css.js";

type Node = DefaultTreeAdapterMap["node"];
type Style = SafeStyle;
type ProductDetail = {
  kind: "price" | "availability";
  label: string;
  style: Style;
};
type Candidate = {
  kind: RaidComponent["evidence"];
  label: string;
  style: Style;
  region: "navigation" | "content";
  sourceNode: NonNullable<RaidComponent["sourceNode"]>;
  details?: ProductDetail[];
};
const children = (n: Node): Node[] => ("childNodes" in n ? n.childNodes : []);
const tag = (n: Node) => ("tagName" in n ? n.tagName : "");
const attr = (n: Node, key: string) =>
  "attrs" in n ? n.attrs.find((a) => a.name === key)?.value : undefined;
const classes = (n: Node) =>
  (attr(n, "class") ?? "")
    .split(/\s+/)
    .filter((c) => /^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(c))
    .slice(0, 4);
const clean = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
const omit = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
  "svg",
  "math",
  "input",
  "textarea",
  "select",
]);
function rawText(n: Node, depth = 0): string {
  if (depth > 64) return "";
  if (n.nodeName === "#text" && "value" in n) return n.value;
  return children(n)
    .map((c) => rawText(c, depth + 1))
    .join(" ");
}
/** Local-only structural labels; never an ARIA/accessibility-name resolver. */
function localCheckboxLabels(
  nodes: Node[],
  hidden: (node: Node) => boolean | undefined,
): Map<Node, string> {
  const html = (n: Node) =>
    "namespaceURI" in n && n.namespaceURI === "http://www.w3.org/1999/xhtml";
  const parent = (n: Node) => ("parentNode" in n ? n.parentNode : null);
  const ids = new Map<string, Node | null>();
  const active = new WeakSet<Node>();
  const labels = new Map<Node, { control?: Node; invalid: boolean }>();
  // nodes is already bounded and in tree order. Index every document-tree ID,
  // including hidden/foreign nodes, so an excluded duplicate cannot become a
  // false unique match. Template contents belong to a separate, omitted tree.
  for (const n of nodes) {
    const id = attr(n, "id"),
      p = parent(n),
      name = tag(n);
    if (id) ids.set(id, ids.has(id) ? null : n);
    if (
      (!p || active.has(p)) &&
      (!name || html(n)) &&
      !hidden(n) &&
      attr(n, "inert") === undefined &&
      name !== "datalist" &&
      (!omit.has(name) || name === "input")
    )
      active.add(n);
    if (html(n) && name === "label") labels.set(n, { invalid: false });
  }
  // A label cannot contain other labels or unrelated labelable controls.
  // Each ancestry walk is bounded by the existing depth-64 source guard;
  // there are no per-label whole-document searches or selector evaluation.
  for (const n of nodes) {
    if (!html(n)) continue;
    const name = tag(n),
      own = labels.get(n),
      labelable =
        name === "input"
          ? attr(n, "type")?.toLowerCase() !== "hidden"
          : [
              "button",
              "meter",
              "output",
              "progress",
              "select",
              "textarea",
            ].includes(name);
    if (!own && !labelable) continue;
    for (let p = parent(n); p; p = parent(p)) {
      const ancestor = labels.get(p);
      if (!ancestor) continue;
      if (own) {
        own.invalid = true;
        ancestor.invalid = true;
      } else if (ancestor.control) ancestor.invalid = true;
      else ancestor.control = n;
    }
  }
  const text = (n: Node): string => {
    if (!active.has(n) || omit.has(tag(n))) return "";
    if (n.nodeName === "#text" && "value" in n) return n.value;
    return children(n).map(text).join(" ");
  };
  const selected = new Map<
    Node,
    { node: Node; text: string; nested: boolean }
  >();
  for (const [n, info] of labels) {
    if (!active.has(n) || info.invalid) continue;
    const id = attr(n, "for"),
      target =
        id === undefined
          ? info.control
          : id && !/[\u0000-\u0020\u007f]/.test(id)
            ? ids.get(id)
            : undefined;
    if (
      !target ||
      !html(target) ||
      !active.has(target) ||
      tag(target) !== "input" ||
      attr(target, "type")?.toLowerCase() !== "checkbox" ||
      (info.control && info.control !== target)
    )
      continue;
    const caption = clean(text(n));
    if (!caption) continue;
    const nested = info.control === target,
      previous = selected.get(target);
    // Preserve existing wrapped-label output even if an extra external label
    // appears first; otherwise take the first eligible label in source order.
    if (!previous || (nested && !previous.nested))
      selected.set(target, { node: n, text: caption, nested });
  }
  return new Map(
    [...selected.values()].map((label) => [label.node, label.text]),
  );
}
export function analyzeStaticCode(
  html: string,
  externalStyles: (string | { css: string; url: string })[] = [],
  pageUrl?: string,
) {
  return analyzeCode(html, externalStyles, pageUrl);
}
export function analyzeLocalCode(
  html: string,
  stylesheet?: { name: string; css: string },
) {
  return analyzeCode(html, [], undefined, { stylesheet });
}
function analyzeCode(
  html: string,
  externalStyles: (string | { css: string; url: string })[],
  pageUrl?: string,
  local?: { stylesheet?: { name: string; css: string } },
) {
  if (utf8Bytes(html).length > 524288) throw Error("source-too-large");
  const doc = local
      ? parseBoundedLocalHtml(html)
      : parse(html, { scriptingEnabled: false }),
    nodes: Node[] = [];
  const bound = (n: Node, depth = 0) => {
    if (nodes.length >= 20000 || depth > 64) throw Error("source-too-large");
    nodes.push(n);
    for (const c of children(n)) bound(c, depth + 1);
  };
  bound(doc);
  const orderedStyles: { css: string; order: number }[] = [];
  const acquired = new Map<string, string>();
  for (const sheet of externalStyles) {
    // Legacy direct callers supply unpositioned text; preserve their old order.
    if (typeof sheet === "string")
      orderedStyles.push({ css: sheet, order: -1 });
    else acquired.set(sheet.url, sheet.css);
  }
  const linkedStyles = new Map<string, { css: string; order: number }>();
  let localLinks = 0;
  nodes.forEach((n, order) => {
    if (
      tag(n) === "style" &&
      isScreenStylesheet(attr(n, "media"), attr(n, "type"))
    )
      orderedStyles.push({ css: rawText(n), order });
    if (
      local?.stylesheet &&
      isActiveStylesheetLink(n) &&
      [local.stylesheet.name, "./" + local.stylesheet.name].includes(
        attr(n, "href") ?? "",
      )
    ) {
      localLinks++;
      orderedStyles.push({ css: local.stylesheet.css, order });
    }
    const url = pageUrl && activeStylesheetLinkUrl(n, pageUrl);
    const css = url ? acquired.get(url) : undefined;
    // The same acquired sheet at its last eligible link has the same cascade
    // effect, without charging repeated source text against the CSS budget.
    if (url && css !== undefined) linkedStyles.set(url, { css, order });
  });
  orderedStyles.push(...linkedStyles.values());
  orderedStyles.sort((a, b) => a.order - b.order);
  if (local?.stylesheet && localLinks !== 1)
    throw Error(localLinks ? "stylesheet-ambiguous" : "stylesheet-unmatched");
  if (
    local &&
    orderedStyles.reduce(
      (total, sheet) => total + utf8Bytes(sheet.css).length,
      0,
    ) > CSS_LIMITS.bytes
  )
    throw Error("source-too-large");
  const reader = createSafeStyleReader(orderedStyles.map((sheet) => sheet.css));
  const styleFor = (n: Node, _parent: Style = {}): Style => reader.styleFor(n);
  const hidden = (n: Node) =>
    attr(n, "hidden") !== undefined ||
    attr(n, "aria-hidden") === "true" ||
    styleFor(n, {}).hidden;
  const visibleText = (n: Node, depth = 0): string => {
    if (depth > 64 || omit.has(tag(n)) || hidden(n)) return "";
    if (n.nodeName === "#text" && "value" in n) return n.value;
    return children(n)
      .map((c) => visibleText(c, depth + 1))
      .join(" ");
  };
  const descendants = (n: Node): Node[] =>
    children(n).flatMap((c) =>
      hidden(c) || (omit.has(tag(c)) && tag(c) !== "input")
        ? []
        : [c, ...descendants(c)],
    );
  const localLabels = local ? localCheckboxLabels(nodes, hidden) : undefined;
  const candidates: Candidate[] = [];
  let count = 0,
    order = 0,
    title = local ? "ローカルHTML" : "公開ページ",
    pageStyle: Style = {};
  const quotas = new Map<string, number>();
  function visit(
    n: Node,
    path: string,
    group = 0,
    region: "navigation" | "content" = "content",
    inherited: Style = {},
  ) {
    const name = tag(n),
      current = ++order;
    if (omit.has(name) || hidden(n)) return;
    const style = { ...styleFor(n, inherited) };
    if (name === "title") {
      title = clean(rawText(n)) || title;
      return;
    }
    if (name === "body") pageStyle = style;
    if (
      name === "nav" ||
      name === "aside" ||
      /side_categories|sidebar|navigation/i.test(attr(n, "class") ?? "")
    )
      region = "navigation";
    const sourceClasses = classes(n);
    let kind: Candidate["kind"] | undefined,
      label = clean(visibleText(n));
    const details: ProductDetail[] = [];
    const product =
      name === "article" &&
      descendants(n).some(
        (c) =>
          tag(c) === "button" &&
          /add to (?:basket|cart)|buy|購入|カート|かご/i.test(visibleText(c)),
      );
    if (product) {
      group = current;
      kind = "product";
      const heading = descendants(n).find((c) => /^h[1-4]$/.test(tag(c)));
      const link = heading && descendants(heading).find((c) => tag(c) === "a");
      if (heading) {
        const labelStyle = styleFor(link || heading);
        for (const key of ["color", "font", "size", "weight", "align"] as const)
          if (labelStyle[key] !== undefined)
            Object.assign(style, { [key]: labelStyle[key] });
      }
      label = clean(
        (link && attr(link, "title")) ||
          (heading && visibleText(heading)) ||
          label,
      );
      // The reviewed Books source marks these visible product facts explicitly.
      // Keep them within the same appearance: they are not extra combat parts.
      const productNodes = descendants(n);
      for (const [detailKind, className] of [
        ["price", "price_color"],
        ["availability", "availability"],
      ] as const) {
        const detail = productNodes.find(
          (node) =>
            (attr(node, "class") ?? "").split(/\s+/).includes(className) &&
            clean(visibleText(node)),
        );
        if (detail)
          details.push({
            kind: detailKind,
            label: clean(visibleText(detail)),
            style: styleFor(detail),
          });
      }
    } else if (/^h[1-3]$/.test(name) && !group) kind = "heading";
    else if (name === "a" && !group) kind = "navigation";
    else if (
      name === "button" &&
      /add to (?:basket|cart)|buy|購入|カート|かご/i.test(label)
    )
      kind = "purchase";
    else if (
      name === "form" &&
      (attr(n, "role") === "search" ||
        descendants(n).some(
          (c) => tag(c) === "input" && attr(c, "type") === "search",
        ))
    ) {
      kind = "search";
      label = label || "検索";
    } else if (
      name === "label" &&
      (localLabels
        ? localLabels.has(n)
        : descendants(n).some(
            (c) => tag(c) === "input" && attr(c, "type") === "checkbox",
          ))
    ) {
      kind = "checkbox";
      if (localLabels) label = localLabels.get(n)!;
    }
    if (kind && label) {
      count++;
      const bucket = kind + ":" + region,
        used = quotas.get(bucket) ?? 0;
      // Navigation never consumes the product/purchase quota.
      if (used < 12 && candidates.length < 64) {
        candidates.push({
          kind,
          label,
          style,
          region,
          ...(details.length ? { details } : {}),
          sourceNode: {
            tag: name,
            path,
            order: current,
            group,
            classes: sourceClasses,
          },
        });
        quotas.set(bucket, used + 1);
      }
    }
    children(n).forEach((c, i) =>
      visit(
        c,
        `${path}/${tag(c) || "text"}[${i}]`.slice(0, 512),
        group,
        region,
        style,
      ),
    );
  }
  visit(doc, "document");
  return {
    title,
    pageStyle,
    candidates,
    candidateCount: count,
    css: { rules: reader.rules, limited: reader.limited },
  };
}
const R = (x: number, y: number, w: number, h: number): Rect => ({
  x,
  y,
  w,
  h,
});
const text = (
  value: string,
  rect: Rect,
  size: number,
  color: string,
  font: "sans" | "serif" | "mono" = "sans",
): RaidPrimitive => ({
  kind: "text",
  rect,
  text: value.slice(0, 80),
  size,
  color,
  font,
  weight: "normal",
  align: "left",
});
function component(c: Candidate, index: number, rect: Rect): RaidComponent {
  const details = c.kind === "product" ? (c.details ?? []) : [];
  const footerTop = rect.h - 24;
  const detailTop = footerTop - 4 - details.length * 24;
  const top = Math.min(
    c.style.padding?.[0] ?? (c.kind === "product" ? 20 : 8),
    (rect.h - 16) / 2,
  );
  const bottom = Math.min(c.style.padding?.[2] ?? 8, rect.h - top - 16);
  const textHeight = Math.min(
    64,
    rect.h - top - bottom,
    details.length ? detailTop - top - 8 : 64,
  );
  const background =
      c.style.background ?? (c.kind === "purchase" ? "#276c91" : "#ffffff"),
    foreground =
      c.style.color ?? (c.kind === "purchase" ? "#ffffff" : "#263b4a");
  const primitives: RaidPrimitive[] = [
    {
      kind: "rect",
      rect: R(0, 0, rect.w, rect.h),
      fill: background,
      borderColor: c.style.borderColor ?? "#b6c5cd",
      borderWidth: c.style.borderWidth ?? 1,
      radius: c.style.radius ?? (c.kind === "purchase" ? 4 : 0),
    },
    text(
      c.label,
      R(
        c.style.padding?.[3] ?? 12,
        top,
        Math.max(
          1,
          rect.w - (c.style.padding?.[1] ?? 12) - (c.style.padding?.[3] ?? 12),
        ),
        textHeight,
      ),
      Math.min(
        c.style.size ?? (c.kind === "heading" ? 22 : 16),
        Math.max(8, textHeight / 1.4),
      ),
      foreground,
      c.style.font ?? "sans",
    ),
  ];
  const label = primitives[1];
  if (label.kind === "text") {
    label.weight = c.style.weight ?? "normal";
    label.align = c.style.align ?? "left";
  }
  if (c.kind === "product") {
    for (const [i, detail] of details.entries()) {
      const row = text(
        detail.label,
        R(12, detailTop + i * 24, rect.w - 24, 22),
        Math.min(detail.style.size ?? 14, 22 / 1.4),
        detail.style.color ?? foreground,
        detail.style.font ?? c.style.font ?? "sans",
      );
      if (row.kind === "text") {
        row.weight = detail.style.weight ?? "normal";
        row.align = detail.style.align ?? c.style.align ?? "left";
      }
      primitives.push(row);
    }
    primitives.push(
      text(
        "画像は省略 / HTMLの商品要素",
        R(
          12,
          details.length ? footerTop : rect.h - 38,
          rect.w - 24,
          details.length ? 16 : 24,
        ),
        details.length ? 10 : 11,
        "#6c7e89",
      ),
    );
  }
  return {
    componentId: `component-${String(index).padStart(2, "0")}`,
    canonicalType: canonicalTypeFor(c.kind),
    sourceRect: null,
    combatRect: rect,
    sourceNode: c.sourceNode,
    evidence: c.kind,
    appearanceId: "appearance_" + "0".repeat(64),
    appearance: { width: rect.w, height: rect.h, background, primitives },
  };
}
/** Reflows genuine source semantics into legal game geometry. These are never source measurements. */
export async function reconstructStaticCode(
  input: StaticCodeSource,
): Promise<RaidBlueprint> {
  // WebCrypto yields where the old server digest was synchronous. Freeze the
  // relevant input values before that first await so source and digest cannot
  // describe different caller-owned revisions.
  const source: StaticCodeSource = {
    html: input.html,
    sourceHash: input.sourceHash,
    capturedAt: input.capturedAt,
    requestedUrl: input.requestedUrl,
    stylesheetWarning: input.stylesheetWarning,
    stylesheets: input.stylesheets?.map((sheet) => ({
      css: sheet.css,
      sourceHash: sheet.sourceHash,
      url: sheet.url,
    })),
  };
  if (source.sourceHash !== (await rawSourceHash(utf8Bytes(source.html))))
    throw Error("source-hash-mismatch");
  for (const sheet of source.stylesheets ?? [])
    if (sheet.sourceHash !== (await rawSourceHash(utf8Bytes(sheet.css))))
      throw Error("stylesheet-hash-mismatch");
  const a = analyzeStaticCode(
    source.html,
    (source.stylesheets ?? []).map((s) =>
      s.url ? { css: s.css, url: s.url } : s.css,
    ),
    source.requestedUrl,
  );
  return reconstructCodeAnalysis(a, {
    kind: "static-public",
    displayUrl: new URL(source.requestedUrl).origin + "/",
    caption:
      new URL(source.requestedUrl).hostname + " / コード解析による近似配置",
    capturedAt: source.capturedAt,
    sourceHash: source.sourceHash,
    stylesheetHashes: (source.stylesheets ?? []).map((s) => s.sourceHash),
    stylesheetWarning: source.stylesheetWarning,
  });
}
/** Shared legal layout; source acquisition and provenance remain distinct. */
export async function reconstructCodeAnalysis(
  a: ReturnType<typeof analyzeStaticCode>,
  source: {
    kind: "static-public" | "local-file";
    displayUrl: string;
    caption: string;
    capturedAt: string;
    sourceHash: string;
    stylesheetHashes: string[];
    stylesheetWarning?: boolean;
  },
): Promise<RaidBlueprint> {
  const placed: { c: Candidate; r: Rect }[] = [];
  const products = a.candidates.filter((c) => c.kind === "product").slice(0, 2),
    heading = a.candidates.find((c) => c.kind === "heading");
  if (products.length) {
    if (heading) placed.push({ c: heading, r: R(252, 104, 672, 44) });
    let nav = a.candidates
      .filter((c) => c.kind === "navigation" && c.region === "navigation")
      .slice(0, 3);
    if (!nav.length)
      nav = a.candidates.filter((c) => c.kind === "navigation").slice(0, 3);
    nav.forEach((c, i) => placed.push({ c, r: R(28, 156 + i * 58, 192, 40) }));
    products.forEach((c, i) => {
      const x = 252 + i * 348;
      placed.push({ c, r: R(x, 174, 324, 170) });
      const buy = a.candidates.find(
        (q) =>
          q.kind === "purchase" && q.sourceNode.group === c.sourceNode.group,
      );
      if (buy) placed.push({ c: buy, r: R(x, 362, 324, 44) });
    });
  } else {
    const selected = a.candidates
      .filter((c) => c.kind !== "navigation")
      .slice(0, 4);
    selected.push(
      ...a.candidates.filter((c) => c.kind === "navigation").slice(0, 4),
    );
    selected.sort((x, y) => x.sourceNode.order - y.sourceNode.order);
    selected.slice(0, 8).forEach((c, i) =>
      placed.push({
        c,
        r: R(
          28 + (i % 2) * 472,
          124 + Math.floor(i / 2) * 86,
          432,
          c.kind === "heading" ? 52 : 44,
        ),
      }),
    );
  }
  if (!placed.length) throw Error("no-playable-elements");
  const components = placed.map(({ c, r }, i) => component(c, i, r));
  return sealRaidBlueprint({
    schemaVersion: 1,
    extractorVersion: "code-v1",
    mapperVersion: "canonical-v1",
    viewport: { width: 960, height: 680 },
    source: {
      kind: source.kind,
      name: a.title,
      displayUrl: source.displayUrl,
      capturedAt: source.capturedAt,
    },
    fidelity: "code-approximation",
    analysis: {
      sourceHash: source.sourceHash,
      layout: "inferred-flow",
      confidence: "low",
      styles: "safe-css-subset-v1",
      css: {
        ...a.css,
        stylesheetHashes: source.stylesheetHashes,
      },
      candidateCount: a.candidateCount,
      selectedCount: components.length,
      omitted: ["unsupported-css", "images", "scripts"],
    },
    warnings: [
      "コード解析による近似配置です。取得したHTMLのタグ・名前・商品構造から戦闘用に配置しました。",
      "色・文字・余白・枠線・角丸は限定したCSSから反映。CSSの完全な計算、画像・動画・JavaScriptには対応していません。",
      ...(source.stylesheetWarning
        ? [
            "許可したCSSを取得できなかったため、HTML内の情報だけで再構成しました。",
          ]
        : []),
      "元ページの寸法を測定していません。回収できるのは、この近似再構成で表示したUIです。",
    ],
    background: a.pageStyle.background ?? "#eef2f4",
    decor: [
      {
        kind: "rect",
        rect: R(0, 0, 960, 84),
        fill: "#233d4c",
        borderColor: "#233d4c",
        borderWidth: 0,
        radius: 0,
      },
      text(a.title, R(28, 18, 904, 34), 24, "#ffffff"),
      text(source.caption, R(28, 56, 904, 22), 12, "#c2d8e2"),
    ],
    components,
  });
}
