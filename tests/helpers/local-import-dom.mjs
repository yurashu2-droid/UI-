export class ElementAdapter extends EventTarget {
  constructor(tag, doc) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.disabled = false;
    this.hidden = false;
    this.value = "";
    this.files = [];
    this._text = "";
    this.className = "";
    this.dataset = {};
    this.style = {};
    this.clientWidth = 960;
    this.classes = new Set();
    this.classList = {
      add: (...n) => n.forEach((x) => this.classes.add(x)),
      remove: (...n) => n.forEach((x) => this.classes.delete(x)),
      toggle: (n, v) => {
        const on = v ?? !this.classes.has(n);
        on ? this.classes.add(n) : this.classes.delete(n);
        return on;
      },
      contains: (n) => this.classes.has(n),
    };
  }
  append(...nodes) {
    for (const n of nodes) {
      n.remove();
      n.parentElement = this;
      this.children.push(n);
    }
  }
  prepend(...nodes) {
    for (const n of [...nodes].reverse()) {
      n.remove();
      n.parentElement = this;
      this.children.unshift(n);
    }
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (n) => n !== this,
      );
    this.parentElement = null;
  }
  replaceChildren(...nodes) {
    for (const n of this.children) n.parentElement = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }
  get textContent() {
    return this._text + this.children.map((n) => n.textContent).join("");
  }
  set textContent(value) {
    this.replaceChildren();
    this._text = String(value);
  }
  set innerHTML(_) {
    throw Error("Unsafe HTML sink");
  }
  get isConnected() {
    return (
      this === this.ownerDocument.body || !!this.parentElement?.isConnected
    );
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
  }
  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }
  matches(selector) {
    if (selector.startsWith("."))
      return (
        this.className.split(" ").includes(selector.slice(1)) ||
        this.classes.has(selector.slice(1))
      );
    if (selector.startsWith("[")) {
      const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (!match) return false;
      const [, key, value] = match;
      const actual = key.startsWith("data-")
        ? this.dataset[
            key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          ]
        : this.getAttribute(key);
      return actual != null && (value === undefined || value === actual);
    }
    return selector.toLowerCase() === this.tagName.toLowerCase();
  }
  querySelectorAll(selector) {
    return this.children.flatMap((n) => [
      ...(n.matches(selector) ? [n] : []),
      ...n.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector) {
    return this.matches(selector)
      ? this
      : (this.parentElement?.closest(selector) ?? null);
  }
  click() {
    if (!this.disabled) this.dispatchEvent(new Event("click"));
  }
}
export function documentAdapter() {
  const doc = new EventTarget();
  doc.createElement = (tag) => new ElementAdapter(tag, doc);
  doc.body = doc.createElement("body");
  return doc;
}
export const settle = async () => {
  for (let n = 0; n < 12; n++)
    await new Promise((resolve) => setImmediate(resolve));
};
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
export const localFile = (text = "<h1>Local</h1>", options = {}) => {
  const bytes = new TextEncoder().encode(text);
  let reads = 0;
  return {
    name: "page.html",
    size: bytes.byteLength,
    webkitRelativePath: "",
    arrayBuffer: async () => {
      reads++;
      return bytes.buffer.slice(0);
    },
    get reads() {
      return reads;
    },
    ...options,
  };
};
export class WorkerAdapter extends EventTarget {
  static instances = [];
  terminated = 0;
  sent = [];
  handlers = new Map();
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    WorkerAdapter.instances.push(this);
  }
  addEventListener(type, fn) {
    super.addEventListener(type, fn);
    this.handlers.set(type, fn);
  }
  removeEventListener(type, fn) {
    super.removeEventListener(type, fn);
    this.handlers.delete(type);
  }
  postMessage(value, transfer) {
    this.sent.push({ value, transfer });
  }
  terminate() {
    this.terminated++;
  }
  reply(result) {
    const event = new Event("message");
    Object.defineProperty(event, "data", {
      value: {
        type: "local-import-result",
        requestId: this.sent[0].value.requestId,
        result,
      },
    });
    this.dispatchEvent(event);
  }
}

export async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw Error("Timed out waiting for production UI state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
