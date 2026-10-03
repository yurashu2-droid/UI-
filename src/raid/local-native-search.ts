import type { DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
const tag = (n: Node) => ("tagName" in n ? n.tagName : "");
const attr = (n: Node, key: string) =>
  "attrs" in n ? n.attrs.find((a) => a.name === key)?.value : undefined;
const parent = (n: Node) => ("parentNode" in n ? n.parentNode : null);
const controlContainers = new Set([
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "output",
  "meter",
  "progress",
]);

/**
 * Additive local semantics only: explicit native search inputs, or one native
 * search region that owns them. Captions are generic; no input values or name
 * attributes are read. The existing form candidate always keeps precedence.
 */
export function localNativeSearchNodes(
  nodes: Node[],
  hidden: (node: Node) => boolean | undefined,
  omitted: ReadonlySet<string>,
  isLegacySearchForm: (node: Node) => boolean,
): Set<Node> {
  const active = new WeakSet<Node>(),
    legacyReachable = new WeakSet<Node>(),
    forms = new Set<Node>(),
    regions = new Map<Node, { invalid: boolean; hasInput: boolean }>();
  // The bounded parse5 document tree is already in preorder. A separate legacy
  // reachability index matches visit's existing gates, without tightening old
  // form behavior (which does not exclude inert or foreign ancestry).
  for (const n of nodes) {
    const p = parent(n),
      name = tag(n),
      invisible = hidden(n);
    if ((!p || legacyReachable.has(p)) && !omitted.has(name) && !invisible) {
      legacyReachable.add(n);
      if (name === "form" && isLegacySearchForm(n)) forms.add(n);
    }
    if (
      (!p || (active.has(p) && !controlContainers.has(tag(p)))) &&
      (!name ||
        ("namespaceURI" in n &&
          n.namespaceURI === "http://www.w3.org/1999/xhtml")) &&
      !invisible &&
      attr(n, "inert") === undefined &&
      name !== "datalist" &&
      (!omitted.has(name) || name === "input")
    )
      active.add(n);
    if (name === "search" && active.has(n))
      regions.set(n, { invalid: false, hasInput: false });
  }
  // Visible nested search regions are deliberately unsupported. A reachable
  // legacy form inside or outside a region owns the search approximation.
  // Every walk has the existing depth-64 bound; no selectors/ID lookup/IO.
  for (const [n, info] of regions) {
    for (let p = parent(n); p; p = parent(p)) {
      const outer = regions.get(p);
      if (outer) {
        info.invalid = true;
        outer.invalid = true;
      }
      if (forms.has(p)) info.invalid = true;
    }
  }
  for (const n of forms) {
    for (let p = parent(n); p; p = parent(p)) {
      const region = regions.get(p);
      if (region) region.invalid = true;
    }
  }
  const selected = new Set<Node>();
  for (const n of nodes) {
    if (
      tag(n) !== "input" ||
      !active.has(n) ||
      !/^search$/i.test(attr(n, "type") ?? "") ||
      attr(n, "form") !== undefined
    )
      continue;
    let owner: Node | undefined,
      covered = false;
    for (let p = parent(n); p; p = parent(p)) {
      if (forms.has(p)) covered = true;
      if (regions.has(p)) owner = p;
    }
    if (covered) continue;
    if (owner) regions.get(owner)!.hasInput = true;
    else selected.add(n);
  }
  for (const [n, info] of regions)
    if (!info.invalid && info.hasInput) selected.add(n);
  return selected;
}
