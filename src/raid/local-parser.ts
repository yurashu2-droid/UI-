import {
  parse,
  defaultTreeAdapter,
  type DefaultTreeAdapterMap,
  type TreeAdapter,
} from "parse5";

type Node = DefaultTreeAdapterMap["node"];
/**
 * Local source is bounded while parse5 constructs its inert tree, including
 * template contents. No DOM, resource loader, script callback or filesystem.
 * Public parsing stays on its legacy path so old output is not reinterpreted.
 */
export function parseBoundedLocalHtml(
  html: string,
): DefaultTreeAdapterMap["document"] {
  let created = 0;
  const templateOwner = new WeakMap<Node, Node>();
  const count = () => {
    if (++created > 20000) throw Error("source-too-large");
  };
  const depth = (parent: Node) => {
    let n: Node | null | undefined = parent,
      value = 1;
    while (n && n.nodeName !== "#document") {
      if (++value > 64) throw Error("source-too-large");
      n = ("parentNode" in n ? n.parentNode : null) ?? templateOwner.get(n);
    }
  };
  const adapter: TreeAdapter<DefaultTreeAdapterMap> = {
    ...defaultTreeAdapter,
    createDocument() {
      count();
      return defaultTreeAdapter.createDocument();
    },
    createDocumentFragment() {
      count();
      return defaultTreeAdapter.createDocumentFragment();
    },
    createElement(...args) {
      count();
      return defaultTreeAdapter.createElement(...args);
    },
    createCommentNode(...args) {
      count();
      return defaultTreeAdapter.createCommentNode(...args);
    },
    createTextNode(...args) {
      count();
      return defaultTreeAdapter.createTextNode(...args);
    },
    appendChild(parent, node) {
      depth(parent);
      defaultTreeAdapter.appendChild(parent, node);
    },
    insertBefore(parent, node, reference) {
      depth(parent);
      defaultTreeAdapter.insertBefore(parent, node, reference);
    },
    setTemplateContent(element, content) {
      depth(element);
      templateOwner.set(content, element);
      defaultTreeAdapter.setTemplateContent(element, content);
    },
    setDocumentType(document, ...args) {
      if (!document.childNodes.some((n) => n.nodeName === "#documentType"))
        count();
      defaultTreeAdapter.setDocumentType(document, ...args);
    },
    // The default adapter's text helpers call its own node factory, so account
    // for those nodes here rather than relying on createTextNode interception.
    insertText(parent, text) {
      depth(parent);
      const previous = parent.childNodes.at(-1);
      if (!previous || !defaultTreeAdapter.isTextNode(previous)) count();
      defaultTreeAdapter.insertText(parent, text);
    },
    insertTextBefore(parent, text, reference) {
      depth(parent);
      const previous =
        parent.childNodes[parent.childNodes.indexOf(reference) - 1];
      if (!previous || !defaultTreeAdapter.isTextNode(previous)) count();
      defaultTreeAdapter.insertTextBefore(parent, text, reference);
    },
  };
  return parse(html, { scriptingEnabled: false, treeAdapter: adapter });
}
