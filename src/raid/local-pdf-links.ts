import type { DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
const tag = (n: Node) => ("tagName" in n ? n.tagName : "");
const attr = (n: Node, key: string) =>
  "attrs" in n ? n.attrs.find((a) => a.name === key)?.value : undefined;
const parent = (n: Node) => ("parentNode" in n ? n.parentNode : null);
const html = (n: Node) =>
  "namespaceURI" in n && n.namespaceURI === "http://www.w3.org/1999/xhtml";
const containers = new Set([
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "output",
  "meter",
  "progress",
  "form",
  "datalist",
  "canvas",
]);

/** Filename advertisement only. URL parsing here performs no resource IO. */
function advertisesPdf(href: string | undefined, hasBase: boolean): boolean {
  if (href === undefined || href.length > 2048) return false;
  const value = href.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
  // Reject parser repairs and unsupported URL syntax rather than guessing.
  if (
    !value ||
    /[\s\u0000-\u001f\u007f-\u009f\\\ufffd\ud800-\udfff]/u.test(value)
  )
    return false;
  const absolute = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(value);
  let path: string;
  if (absolute) {
    if (absolute[1].includes("@")) return false;
    path = absolute[2];
  } else {
    if (hasBase || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//"))
      return false;
    path = value.split(/[?#]/, 1)[0];
  }
  // Only literal source suffixes qualify. Do not decode encoded separators,
  // suffixes or dot segments; raw Unicode filenames remain eligible because
  // the URL serializer's UTF-8 percent-encoding is not source escape syntax.
  if (/[\%<>"`{}|^\[\]]/.test(path) || !/[^/]\.pdf$/i.test(path)) return false;
  try {
    const url = new URL(value, "https://local-pdf.invalid/");
    const basename = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      basename.length > 4 &&
      /\.pdf$/i.test(basename)
    );
  } catch {
    return false;
  }
}

/**
 * Local-only conservative anchor subset. Existing caption extraction, product
 * ownership, quotas and traversal stay in code.ts. No destination or attribute
 * text is returned or persisted. Closed details are excluded even in summary;
 * this is a supported subset, not a complete browser visibility calculation.
 */
export function localPdfLinkNodes(
  nodes: Node[],
  hidden: (node: Node) => boolean | undefined,
  omitted: ReadonlySet<string>,
): Set<Node> {
  const hasBase = nodes.some(
    (n) => html(n) && tag(n) === "base" && attr(n, "href") !== undefined,
  );
  const active = new WeakSet<Node>(),
    selected = new Set<Node>();
  // The bounded parse5 tree is preorder, so parent eligibility is already known.
  for (const n of nodes) {
    const p = parent(n),
      name = tag(n);
    if (
      (!p || (active.has(p) && !containers.has(tag(p)))) &&
      (!name || html(n)) &&
      !hidden(n) &&
      attr(n, "inert") === undefined &&
      !omitted.has(name) &&
      !(
        (name === "details" || name === "dialog") &&
        attr(n, "open") === undefined
      )
    )
      active.add(n);
    if (
      name === "a" &&
      active.has(n) &&
      advertisesPdf(attr(n, "href"), hasBase)
    )
      selected.add(n);
  }
  return selected;
}
