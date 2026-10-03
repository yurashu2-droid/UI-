import E from "../src/engine.js";
import { cpuConditionsGuidance } from "../src/cpu-conditions-guidance.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import { Editor } from "../src/editor.js";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import V from "../src/components.js";
import { createRunPersistence } from "../src/persistence.js";

// Real app Editor callbacks, save, render, renderFrames and frameMarkup run with
// the real Editor and Components. Only unrelated shell/effect hooks are inert.
// The DOM adapter explicitly drops focus to body when a focused subtree is
// removed; later key events use activeElement without automatically refocusing.
// This checks application/DOM boundaries, not browser Tab order or pixels.
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const extract = name => {
  const found = app.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(found, `production ${name} function`); return found;
};
const options = app.match(/^const editor = new UIRaidEditor.Editor\([^]*?^\}\);/m)?.[0];
assert.ok(options);
const compiled = transformSync(`${["save", "frameMarkup", "currentCpuConditions", "refreshCpuFrameConditions", "renderFrames", "render"].map(extract).join("\n")}\n${options}\nglobalThis.editor = editor;`, {loader: "ts", target: "es2022"}).code;
const camel = value => value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class ElementAdapter {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument;
    this.parentElement = null; this.children = []; this.attributes = new Map();
    this.dataset = {}; this.style = {setProperty(name, value) { this[name] = value; }};
    this.className = ""; this.id = ""; this.open = false; this._text = "";
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(" "); },
      toggle: (name, force) => { const add = force ?? !this.classList.contains(name); this.classList[add ? "add" : "remove"](name); return add; },
    };
  }
  get title() { return this.getAttribute("title") ?? ""; }
  set title(value) { this.setAttribute("title", value); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  get tabIndex() { const value = this.getAttribute("tabindex"); return value === null ? -1 : Number(value); }
  set tabIndex(value) { this.setAttribute("tabindex", String(value)); }
  get isContentEditable() {
    const value = this.getAttribute("contenteditable")?.toLowerCase();
    if (value === "false") return false;
    if (value === "" || value === "true" || value === "plaintext-only") return true;
    return this.parentElement?.isContentEditable ?? false;
  }
  setAttribute(name, value) {
    const text = String(value); this.attributes.set(name, text);
    if (name === "id") this.id = text;
    if (name === "class") this.className = text;
    if (name === "open") this.open = true;
    if (name.startsWith("data-")) this.dataset[camel(name.slice(5))] = text;
  }
  getAttribute(name) {
    if (name === "class") return this.className || null;
    if (name === "id") return this.id || null;
    if (name === "open") return this.open ? "" : null;
    if (name.startsWith("data-")) return this.dataset[camel(name.slice(5))] ?? null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
      node.parentElement = this; this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    if (this.children.some(node => node.contains(this.ownerDocument.activeElement))) this.ownerDocument.activeElement = this.ownerDocument.body;
    for (const node of this.children) node.parentElement = null;
    this.children = []; this._text = ""; this.append(...nodes);
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  set innerHTML(html) {
    const convert = node => {
      if (!node.tagName) return null;
      const element = new ElementAdapter(node.tagName, this.ownerDocument);
      for (const {name, value} of node.attrs || []) element.setAttribute(name, value);
      element._text = (node.childNodes || []).filter(child => child.nodeName === "#text").map(child => child.value).join("");
      element.append(...(node.childNodes || []).map(convert).filter(Boolean));
      return element;
    };
    this.replaceChildren(...parseFragment(html).childNodes.map(convert).filter(Boolean));
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  matches(selector) {
    return selector.split(",").some(part => {
      const chain = part.trim().split(/\s+/), simple = chain.pop();
      if (!simple) return false;
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      for (const [, id] of simple.matchAll(/#([\w-]+)/g)) if (this.id !== id) return false;
      for (const [, name] of simple.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
      for (const [, name, , value] of simple.matchAll(/\[([\w-]+)(?:=(['"]?)([^'"\]]*)\2)?\]/g)) {
        if (this.getAttribute(name) === null || value !== undefined && this.getAttribute(name) !== value) return false;
      }
      if (!chain.length) return true;
      if (chain.at(-1) === ">") { chain.pop(); return this.parentElement?.matches(chain.join(" ")) ?? false; }
      let ancestor = this.parentElement;
      while (ancestor) {
        if (ancestor.matches(chain.join(" "))) return true;
        ancestor = ancestor.parentElement;
      }
      return false;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector) {
    if (selector.startsWith(":scope > ")) return this.children.filter(child => child.matches(selector.slice(9)));
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  get isConnected() { return this.ownerDocument.body.contains(this); }
  focus(options) {
    this.ownerDocument.focusCalls.push({node: this, options});
    if (this.isConnected) this.ownerDocument.activeElement = this;
  }
  getBoundingClientRect() { return {left: 0, top: 0, width: 960, height: 680}; }
}


function fixture(t, entries = [["ab_link", 32, 32]]) {
  const globals = ["document", "Element", "HTMLElement", "HTMLInputElement", "HTMLSelectElement"];
  const old = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const listeners = new Map();
  const doc = {
    focusCalls: [],
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    createElement(tag) { return new ElementAdapter(tag, this); },
    querySelector(selector) { return this.body.querySelector(selector); },
  };
  doc.body = doc.createElement("body"); doc.activeElement = doc.body;
  globalThis.document = doc;
  for (const name of globals.slice(1)) globalThis[name] = ElementAdapter;
  t.after(() => {
    for (const [name, descriptor] of old) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
  });
  for (const id of ["player-frame", "enemy-frame", "page-window", "scene", "traffic-hub", "modal", "battle-controls", "battle-log", "canvas-float", "back-to-page"]) {
    const node = doc.createElement(id === "modal" ? "dialog" : "section"); node.id = id; doc.body.append(node);
  }
  const run = R.newRun("lab");
  for (const item of run.owned) assert.equal(R.move(run, item.id, null, null), true);
  const ids = entries.map(([type, x, y, w, h]) => {
    const bought = R.purchase(run, type); assert.equal(bought.ok, true);
    assert.equal(R.move(run, bought.item.id, x, y, w, h), true, `legal ${type} fixture`);
    return bought.item.id;
  });
  assert.equal(R.validateRun(run), true);
  const values = new Map(), counts = {build: 0};
  const persistence = createRunPersistence({getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}, "keyboard-focus-");
  let context;
  context = vm.createContext({
    UIRaidEditor: {Editor}, cpuConditionsGuidance, run, R, V, C, D, memory: {}, runPersistence: persistence,
    clone: structuredClone, preview: false, battle: null, view: "self", storyActive: false, storySession: null,
    profileStore: null, saveOK: true, saveProblem: "", document: doc,
    Element: ElementAdapter, HTMLElement: ElementAdapter, HTMLInputElement: ElementAdapter, HTMLSelectElement: ElementAdapter,
    $: selector => doc.querySelector(selector), renderStorageNotice() {}, syncEra() {}, renderTopbar() {}, markFusions() {},
    renderSide() {}, renderShop() {}, renderCoach() {}, afterBuildChange() { counts.build++; context.afterChange?.(); },
    toast() {}, paused: false, fx: {update() {}}, crawler: {setEnabled() {}}, basket: {setEnabled() {}},
    appOpponent: () => ({faction: "google", pageName: "Other page", address: "local://other", decor: []}),
    appEnemyBoard: () => [], ENEMY_ERA: {}, labPressureCapacity: () => null,
    pressureMeterMarkup: () => "", adminDock: () => "", scheduleFit() {}, esc: V.esc, icon: V.icon,
  });
  vm.runInContext(compiled, context);
  context.renderFrames();
  return {doc, ids, context, editor: context.editor, counts, values,
    item: id => context.run.owned.find(item => item.id === id),
    node: id => doc.querySelector(`#player-body .web-node[data-id="${id}"]`),
    stored: () => persistence.load("lab"),
    key(key, props = {}, target = doc.activeElement) {
      const event = {key, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...props};
      for (const listener of listeners.get("keydown") || []) listener(event);
      return event;
    },
  };
}

const press = (h, id, key = "Enter", props = {}) => {
  h.node(id).focus();
  return h.key(key, props);
};
const assertFocus = (h, id) => {
  assert.equal(h.doc.activeElement === h.node(id), true, "focus follows the current owned wrapper");
  assert.deepEqual(h.doc.focusCalls.at(-1).options, {preventScroll: true});
};

test("actual app repeated arrows replace the host and preserve keyboard focus without another focus call", t => {
  const h = fixture(t), id = h.ids[0], original = h.node(id), host = h.doc.querySelector("#player-body");
  const before = structuredClone(h.context.run);
  press(h, id);
  assert.equal(h.key("ArrowDown").defaultPrevented, true);
  assert.equal(h.item(id).y, 33);
  assert.notEqual(h.doc.querySelector("#player-body"), host);
  assert.notEqual(h.node(id), original); assert.equal(original.isConnected, false);
  assertFocus(h, id);
  assert.equal(h.key("ArrowDown", {repeat: true, shiftKey: true}).defaultPrevented, true);
  assertFocus(h, id); assert.equal(h.item(id).y, 43);
  assert.deepEqual([...h.editor.selection], [id]);
  assert.deepEqual(h.context.run, {...before, owned: before.owned.map(item => item.id === id ? {...item, y: 43} : item)});
  assert.equal(h.stored().run.owned.find(item => item.id === id).y, 43);
  assert.equal(h.editor.history.length, 2); assert.equal(h.counts.build, 2);
});

for (const [undo, redo] of [[{ctrlKey: true}, ["y", {ctrlKey: true}]], [{metaKey: true}, ["z", {metaKey: true, shiftKey: true}]]]) {
  test(`actual app ${undo.ctrlKey ? "Ctrl" : "Meta"} undo/redo retain wrapper focus while keeping selection reset`, t => {
    const h = fixture(t), id = h.ids[0], before = structuredClone(h.context.run);
    press(h, id); h.key("ArrowDown"); const moved = structuredClone(h.context.run);
    assert.equal(h.key("z", undo).defaultPrevented, true);
    assert.deepEqual(h.context.run, before); assert.equal(h.editor.selection.size, 0); assertFocus(h, id);
    assert.equal(h.key(...redo).defaultPrevented, true);
    assert.deepEqual(h.context.run, moved); assert.equal(h.editor.selection.size, 0); assertFocus(h, id);
    assert.equal(h.key(" ").defaultPrevented, true);
    assert.deepEqual([...h.editor.selection], [id]);
    h.key("ArrowRight"); assertFocus(h, id); assert.equal(h.item(id).x, 33);
    assert.equal(h.stored().run.owned.find(item => item.id === id).x, 33);
  });
}

test("nested child focus follows the child identity through move/undo/redo without selecting its container", t => {
  const h = fixture(t, [["gov_form", 32, 200, 400, 250], ["gov_submit", 48, 300]]), [parent, child] = h.ids;
  assert.equal(C.analyze(h.context.run.owned).parents[child], parent);
  press(h, child); h.key("ArrowDown"); assertFocus(h, child);
  assert.deepEqual([...h.editor.selection], [child]); assert.equal(h.item(child).y, 301); assert.equal(h.item(parent).y, 200);
  h.key("z", {ctrlKey: true}); assertFocus(h, child); assert.equal(h.item(child).y, 300);
  h.key("y", {ctrlKey: true}); assertFocus(h, child); assert.equal(h.item(child).y, 301);
  assert.equal(h.node(child).parentElement.closest(".web-node"), h.node(parent));
});

test("rejected moves and empty undo/redo keep the original node and do not force focus", t => {
  const h = fixture(t, [["ab_link", 0, 0]]), id = h.ids[0], original = h.node(id), before = structuredClone(h.context.run);
  press(h, id); const calls = h.doc.focusCalls.length;
  h.key("ArrowLeft"); h.key("ArrowUp"); h.key("z", {ctrlKey: true}); h.key("y", {ctrlKey: true});
  assert.deepEqual(h.context.run, before); assert.equal(h.node(id), original); assert.equal(h.doc.activeElement, original);
  assert.equal(h.doc.focusCalls.length, calls); assert.equal(h.counts.build, 0); assert.equal(h.editor.history.length, 0);
});

for (const operation of ["purchase", "place"]) {
  test(`undo ${operation} removes focus with the part, and body redo does not invent focus`, t => {
    const h = fixture(t), id = h.ids[0];
    if (operation === "purchase") h.editor.add("yt_like");
    else {
      assert.equal(R.move(h.context.run, id, null, null), true);
      h.context.renderFrames();
      h.editor.commit(() => R.move(h.context.run, id, 32, 32));
    }
    const focusedId = operation === "purchase" ? [...h.editor.selection][0] : id;
    press(h, focusedId); h.key("z", {ctrlKey: true});
    assert.equal(h.node(focusedId), null); assert.equal(h.doc.activeElement, h.doc.body);
    const calls = h.doc.focusCalls.length;
    h.key("y", {ctrlKey: true});
    assert.ok(h.node(focusedId)); assert.equal(h.doc.activeElement, h.doc.body); assert.equal(h.doc.focusCalls.length, calls);
  });
}

test("inputs, native controls, foreign wrappers and unrelated render/actions never acquire replacement wrapper focus", t => {
  const h = fixture(t, [["yt_like", 32, 32]]), id = h.ids[0];
  press(h, id); h.key("ArrowDown");
  const input = h.doc.createElement("input"); h.doc.body.append(input); input.focus();
  const before = structuredClone(h.context.run), calls = h.doc.focusCalls.length;
  h.key("ArrowDown"); h.key("z", {ctrlKey: true});
  assert.deepEqual(h.context.run, before); assert.equal(h.doc.activeElement, input); assert.equal(h.doc.focusCalls.length, calls);
  const native = h.node(id).querySelector("button"); native.focus();
  h.key("z", {ctrlKey: true});
  assert.equal(native.isConnected, false); assert.equal(h.doc.activeElement, h.doc.body);
  const foreign = V.create(h.item(id), {side: "enemy"}); h.doc.querySelector("#player-body").append(foreign); foreign.focus();
  h.key("y", {ctrlKey: true}); assert.equal(h.doc.activeElement, h.doc.body);
  press(h, id); h.context.render(); assert.equal(h.doc.activeElement, h.doc.body);
  press(h, id); h.editor.update({label: "unrelated direct update"}); assert.equal(h.doc.activeElement, h.doc.body);
});

for (const gate of ["preview", "battle", "enemy", "phase", "modal"]) {
  test(`callback ${gate} change prevents focus restoration after repaint`, t => {
    const h = fixture(t), id = h.ids[0];
    h.context.afterChange = () => {
      if (gate === "enemy") h.context.view = "enemy";
      else if (gate === "phase") h.context.run.phase = "reward";
      else if (gate === "modal") h.doc.querySelector("#modal").open = true;
      else if (gate === "battle") h.context.battle = new E.Battle(h.context.run.owned, [], { playerCapacity: Infinity });
      else h.context[gate] = true;
    };
    press(h, id); const calls = h.doc.focusCalls.length;
    h.key("ArrowDown"); assert.equal(h.item(id).y, 33);
    assert.equal(h.doc.activeElement, h.doc.body); assert.equal(h.doc.focusCalls.length, calls);
  });
}

test("deliberate focus chosen by the callback wins over the former wrapper", t => {
  const h = fixture(t), id = h.ids[0], input = h.doc.createElement("input"); h.doc.body.append(input);
  h.context.afterChange = () => input.focus();
  press(h, id); h.key("ArrowDown");
  assert.equal(h.doc.activeElement, input); assert.equal(h.item(id).y, 33);
  assert.equal(h.doc.focusCalls.at(-1).node, input);
});
