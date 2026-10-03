import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import R from "../src/run.js";
import V from "../src/components.js";
import Effects from "../src/effects.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";

// Independent production-renderer, app-handler and Effects integration checks.
// The adapter establishes state/ownership only, not browser keyboard, pixels,
// native popup behavior or assistive-technology acceptance.
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const previewSource = app.match(/^function previewAction\([^]*?^}/m)?.[0];
assert.ok(previewSource, "the actual application preview handler must be tested");
const compiled = transformSync(previewSource, { loader: "ts", target: "es2022" }).code;
const camel = value => value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class ElementAdapter {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc;
    this.parentElement = null; this.children = []; this.attributes = new Map();
    this.dataset = {}; this.className = ""; this._text = "";
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(" "); },
      toggle: (name, force) => { const add = force ?? !this.classList.contains(name); this.classList[add ? "add" : "remove"](name); return add; },
    };
  }
  setAttribute(name, value) {
    const text = String(value); this.attributes.set(name, text);
    if (name === "class") this.className = text;
    if (name.startsWith("data-")) this.dataset[camel(name.slice(5))] = text;
  }
  getAttribute(name) {
    if (name === "class") return this.className || null;
    if (name.startsWith("data-")) return this.dataset[camel(name.slice(5))] ?? null;
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith("data-")) delete this.dataset[camel(name.slice(5))];
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(value) { value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled"); }
  get title() { return this.getAttribute("title") ?? ""; }
  set title(value) { this.setAttribute("title", value); }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
      node.parentElement = this; this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentElement = null;
    this.children = []; this._text = ""; this.append(...nodes);
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  set innerHTML(html) {
    const convert = node => {
      if (!node.tagName) return null;
      const element = new ElementAdapter(node.tagName, this.ownerDocument);
      for (const { name, value } of node.attrs || []) element.setAttribute(name, value);
      element._text = (node.childNodes || []).filter(child => child.nodeName === "#text").map(child => child.value).join("");
      element.append(...(node.childNodes || []).map(convert).filter(Boolean)); return element;
    };
    this.replaceChildren(...parseFragment(html).childNodes.map(convert).filter(Boolean));
  }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  matches(selector) {
    return selector.split(",").some(part => {
      const chain = part.trim().split(/\s+/), simple = chain.pop();
      if (!simple) return false;
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      for (const [, name] of simple.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
      for (const [, name, , value] of simple.matchAll(/\[([\w-]+)(?:=(['"]?)([^'"\]]*)\2)?\]/g)) {
        if (this.getAttribute(name) === null || value !== undefined && this.getAttribute(name) !== value) return false;
      }
      if (!chain.length) return true;
      if (chain.at(-1) === ">") { chain.pop(); return this.parentElement?.matches(chain.join(" ")) ?? false; }
      let parent = this.parentElement;
      while (parent) { if (parent.matches(chain.join(" "))) return true; parent = parent.parentElement; }
      return false;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector) {
    if (selector.startsWith(":scope > ")) return this.children.filter(child => child.matches(selector.slice(9)));
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function fixture(t, type) {
  const previous = globalThis.document;
  const doc = { createElement(tag) { return new ElementAdapter(tag, this); } };
  globalThis.document = doc;
  t.after(() => previous === undefined ? delete globalThis.document : globalThis.document = previous);
  const paper = doc.createElement("section"); paper.className = "browser-paper";
  const run = R.newRun("lab");
  for (const item of run.owned) assert.equal(R.move(run, item.id, null, null), true);
  const items = [0, 1].map(index => {
    const result = R.purchase(run, type); assert.equal(result.ok, true);
    assert.equal(R.move(run, result.item.id, 24, 24 + index * 180), true);
    return result.item;
  });
  assert.equal(R.validateRun(run), true);
  const toasts = [], calls = { pulse: 0 };
  const context = vm.createContext({
    Element: ElementAdapter, HTMLElement: ElementAdapter, HTMLButtonElement: ElementAdapter,
    preview: false, battle: null, run, storyActive: false, storySession: null,
    previewCatalogueAction, fx: { pulse() { calls.pulse++; } }, toast: text => toasts.push(text),
    save() { assert.fail("native page selection must not save a run"); },
    fetch() { assert.fail("native page selection must not fetch content"); },
  });
  vm.runInContext(compiled, context);
  const paint = () => { paper.replaceChildren(...items.map(item => V.create(item))); };
  paint();
  return { paper, run, context, toasts, calls, paint,
    node: (index = 0) => paper.children[index],
    click(control) { context.previewAction({ target: control, preventDefault() { assert.fail("native pagination has no link destination"); } }); },
  };
}

function assertPage(node, page, total) {
  const numeric = node.querySelectorAll("button[data-page]");
  const current = numeric.filter(button => button.classList.contains("current"));
  const announced = node.querySelectorAll('[aria-current="page"]');
  assert.equal(numeric.length, total);
  assert.equal(current.length, 1); assert.equal(announced.length, 1);
  assert.equal(current[0], announced[0]); assert.equal(current[0].dataset.page, String(page));
  const previous = node.querySelector('[data-page-direction="previous"]');
  const next = node.querySelector('[data-page-direction="next"]');
  if (previous) assert.equal(previous.disabled, page === 1);
  assert.equal(next.disabled, page === total);
  for (const arrow of node.querySelectorAll("button[data-page-direction]")) {
    assert.equal(arrow.classList.contains("current"), false);
    assert.equal(arrow.getAttribute("aria-current"), null);
  }
}

for (const [type, total] of [["go_page", 6], ["gov_page", 4]]) {
  test(`QA: ${type} production clicks select only local numeric pages and respect app gates`, t => {
    const h = fixture(t, type), before = JSON.stringify(h.run);
    let node = h.node(), other = h.node(1);
    assertPage(node, 1, total); assertPage(other, 1, total);
    assert.equal(node.querySelectorAll("a,form,input").length, 0);
    const next = node.querySelector('[data-page-direction="next"]');
    h.click(next); assertPage(node, 1, total); assert.equal(h.calls.pulse, 0);
    h.context.preview = true;
    h.click(next); assertPage(node, 2, total); assertPage(other, 1, total);
    h.context.battle = {};
    h.click(next); assertPage(node, 2, total);
    h.context.battle = null;
    for (let page = 3; page <= total; page++) { h.click(next); assertPage(node, page, total); }
    const pulses = h.calls.pulse;
    h.click(next); h.click(next); assertPage(node, total, total);
    assert.equal(h.calls.pulse, pulses, "a disabled boundary button cannot pretend to activate");
    h.click(node.querySelector('[data-page="1"]')); assertPage(node, 1, total);
    const previous = node.querySelector('[data-page-direction="previous"]');
    if (previous) {
      h.click(previous); assertPage(node, 1, total);
      h.click(node.querySelector(`[data-page="${total}"]`));
      h.click(previous); assertPage(node, total - 1, total);
    }
    assert.equal(JSON.stringify(h.run), before, "preview selection is not save state or combat progress");
    assert.equal(h.node(), node, "clicks keep the original native control tree");
    assert.equal(h.node(1), other);
    h.paint(); node = h.node(); other = h.node(1);
    assertPage(node, 1, total); assertPage(other, 1, total);
    assert.equal(JSON.stringify(h.run), before);
  });

  test(`QA: ${type} real Effects advances numeric feedback with original wrap semantics`, t => {
    const h = fixture(t, type), node = h.node(), before = JSON.stringify(h.run);
    const effects = Object.create(Effects.prototype);
    for (let turn = 1; turn <= total * 2; turn++) {
      effects.act(node, type);
      assertPage(node, turn % total + 1, total);
      assertPage(h.node(1), 1, total);
    }
    assert.equal(JSON.stringify(h.run), before);
  });
}

for (const type of ["go_tabs", "gov_font"]) {
  test(`QA: pagination integration leaves existing ${type} cycles unchanged`, t => {
    const h = fixture(t, type), node = h.node(), buttons = node.querySelectorAll("button");
    const initial = buttons.findIndex(button => button.classList.contains("current"));
    const effects = Object.create(Effects.prototype);
    for (let turn = 1; turn <= buttons.length * 2; turn++) {
      effects.act(node, type);
      assert.equal(buttons.filter(button => button.classList.contains("current")).length, 1);
      assert.equal(buttons.findIndex(button => button.classList.contains("current")), (initial + turn) % buttons.length);
      assert.equal(node.querySelectorAll("[data-page],[aria-current]").length, 0);
    }
    h.context.preview = true;
    h.click(buttons.at(-1));
    assert.equal(buttons.at(-1).classList.contains("current"), true);
    assert.equal(buttons.filter(button => button.classList.contains("current")).length, 1);
  });
}
