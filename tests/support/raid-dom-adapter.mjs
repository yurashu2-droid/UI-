import { parseFragment } from "parse5";

// DOM boundary only; no browser layout, file picker or accessibility acceptance.
export class ElementAdapter {
  constructor(document, tag) {
    Object.assign(this, {
      ownerDocument: document,
      tagName: tag.toUpperCase(),
      parentElement: null,
      children: [],
      attrs: new Map(),
      dataset: {},
      className: "",
      tabIndex: -1,
      ownText: "",
      events: new Map(),
      clientWidth: 960,
      style: {
        setProperty(name, value) {
          this[name] = value;
        },
      },
    });
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) =>
        names.forEach((name) => this.classList.toggle(name, true)),
      remove: (...names) =>
        names.forEach((name) => this.classList.toggle(name, false)),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const on = force ?? !names.has(name);
        if (on) names.add(name);
        else names.delete(name);
        this.className = [...names].join(" ");
        return on;
      },
    };
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name === "class") this.className = String(value);
    if (name.startsWith("data-"))
      this.dataset[
        name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      ] = String(value);
  }
  getAttribute(name) {
    if (name === "class") return this.className;
    if (name.startsWith("data-"))
      return (
        this.dataset[
          name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        ] ?? null
      );
    return this.attrs.get(name) ?? null;
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (child) => child !== this,
      );
    this.parentElement = null;
  }
  append(...children) {
    children.forEach((child) => {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
    });
  }
  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children = [];
    this.ownText = "";
    this.append(...children);
  }
  get textContent() {
    return (
      this.ownText + this.children.map((child) => child.textContent).join("")
    );
  }
  set textContent(value) {
    this.replaceChildren();
    this.ownText = String(value);
  }
  set innerHTML(html) {
    this.htmlSource = html;
    const convert = (node) => {
      const el = this.ownerDocument.createElement(node.tagName ?? "#text");
      for (const attr of node.attrs ?? [])
        el.setAttribute(attr.name, attr.value);
      if (node.nodeName === "#text") el.ownText = node.value;
      el.append(...(node.childNodes ?? []).map(convert));
      return el;
    };
    this.replaceChildren(...parseFragment(html).childNodes.map(convert));
  }
  matches(selector) {
    return selector.split(",").some((value) => {
      const simple = value.trim();
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (
        [...simple.matchAll(/\.([\w-]+)/g)].some(
          ([, name]) => !this.classList.contains(name),
        )
      )
        return false;
      return [
        ...simple.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g),
      ].every(([, name, expected]) =>
        expected === undefined
          ? this.getAttribute(name) !== null
          : this.getAttribute(name) === expected,
      );
    });
  }
  querySelectorAll(selector) {
    if (selector.startsWith(":scope > "))
      return this.children.filter((child) => child.matches(selector.slice(9)));
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
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
  addEventListener(name, callback) {
    const list = this.events.get(name) ?? [];
    list.push(callback);
    this.events.set(name, list);
  }
  removeEventListener(name, callback) {
    this.events.set(
      name,
      (this.events.get(name) ?? []).filter((fn) => fn !== callback),
    );
  }
  async dispatch(name, event = {}) {
    for (const callback of this.events.get(name) ?? [])
      await callback({ target: this, preventDefault() {}, ...event });
  }
}
