import E from "../src/engine.js";
import { cpuConditionsGuidance } from "../src/cpu-conditions-guidance.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
const { Editor } = await import(process.env.UI_RAID_QA_EDITOR_SOURCE || "../src/editor.js");
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import V from "../src/components.js";
import { createRunPersistence } from "../src/persistence.js";

// DOM/source acceptance only: real installed Editor listener, app save/render/
// renderFrames/frameMarkup, persistence, and Components. The host models removal
// of an active subtree as focus falling to BODY; detached nodes cannot focus.
// Unlike earlier adapters, it never leaves activeElement on a detached wrapper.
// Dropping keyboard focus preservation must fail after a genuine saved movement.
const app = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
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
  get isConnected() { return this.ownerDocument.body.contains(this); }
  remove() {
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = null;
  }
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
    if (this.children.some(node => node.contains(this.ownerDocument.activeElement)))
      this.ownerDocument.activeElement = this.ownerDocument.body;
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
  focus(options) {
    if (!this.isConnected) return;
    this.ownerDocument.activeElement = this;
    this.ownerDocument.focusCalls.push({node: this, options});
  }
  getBoundingClientRect() { return {left: 0, top: 0, width: 960, height: 680}; }
}

function fixture(t, entries = [["yt_like", 32, 32], ["yt_sub", 144, 32]]) {
  const globals = ["document", "Element", "HTMLElement", "requestAnimationFrame", "cancelAnimationFrame"];
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
  for (const name of ["Element", "HTMLElement"]) globalThis[name] = ElementAdapter;
  const animationFrames = new Map(); let animationId = 0;
  globalThis.requestAnimationFrame = callback => { const id = ++animationId; animationFrames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => animationFrames.delete(id);
  t.after(() => { for (const [name, descriptor] of old) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; });
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
  const values = new Map(), counts = {build: 0, writes: 0};
  const persistence = createRunPersistence({getItem: key => values.get(key) ?? null, setItem: (key, value) => {values.set(key, value); counts.writes++;}}, "qa-keyboard-focus-");
  let afterBuild = () => {};
  const context = vm.createContext({
    UIRaidEditor: {Editor}, cpuConditionsGuidance, run, R, V, C, D, memory: {}, runPersistence: persistence,
    clone: structuredClone, preview: false, battle: null, paused: false, view: "self", storyActive: false, storySession: null,
    profileStore: null, saveOK: true, saveProblem: "", document: doc, Element: ElementAdapter,
    $: selector => { const node = doc.querySelector(selector); assert.ok(node, `app element ${selector}`); return node; },
    renderStorageNotice() {}, syncEra() {}, renderTopbar() {}, markFusions() {},
    renderSide() {}, renderShop() {}, renderCoach() {}, afterBuildChange() {counts.build++; afterBuild();},
    crawler: {setEnabled() {}}, basket: {setEnabled() {}}, fx: {update() {}}, toast() {},
    appOpponent: () => ({faction: "google", pageName: "Other page", address: "local://other", decor: []}),
    appEnemyBoard: () => [C.makeItem("yt_like", "enemy-like", 32, 32)], ENEMY_ERA: {}, labPressureCapacity: () => null,
    pressureMeterMarkup: () => "", adminDock: () => "", scheduleFit() {}, esc: V.esc, icon: V.icon,
  });
  vm.runInContext(compiled, context);
  context.render();
  return {doc, ids, context, editor: context.editor, counts, values,
    item: id => context.run.owned.find(item => item.id === id),
    node: id => doc.querySelector(`#player-body .web-node[data-id="${id}"]`),
    host: () => doc.querySelector("#player-body"),
    stored: () => persistence.load("lab"),
    afterBuild: callback => {afterBuild = callback;},
    flushAnimation() { const pending = [...animationFrames.values()]; animationFrames.clear(); for (const callback of pending) callback(); },
    pointer(type, target, props = {}) {
      const event = {target, button: 0, pointerId: 1, clientX: 40, clientY: 40, altKey: true, shiftKey: false, defaultPrevented: false,
        preventDefault() {this.defaultPrevented = true;}, ...props};
      for (const listener of listeners.get(type) || []) listener(event);
      return event;
    },
    key(key, target = doc.activeElement, props = {}) {
      if (props.focus !== false && target !== doc.activeElement) target.focus();
      const event = {key, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...props};
      for (const listener of listeners.get("keydown") || []) listener(event);
      return event;
    },
  };
}
const activeId = h => h.doc.activeElement.dataset.id ?? h.doc.activeElement.tagName;
const savedItem = (h, id) => { const stored = h.stored(); assert.equal(stored.status, "loaded"); return stored.run.owned.find(item => item.id === id); };
function expectReplacement(h, old, id) {
  assert.equal(old.isConnected, false, "real frame replacement must detach old wrapper");
  assert.notEqual(h.node(id), old);
  assert.equal(activeId(h), id, "keyboard edit must focus same owned part's replacement, rather than BODY");
  assert.equal(h.doc.activeElement, h.node(id));
  assert.deepEqual(h.doc.focusCalls.at(-1).options, {preventScroll: true});
}

test("QA focus: saved ArrowDown replaces the actual frame and preserves wrapper focus for the next key", t => {
  const h = fixture(t), [id] = h.ids, before = structuredClone(h.context.run);
  const original = h.node(id), host = h.host();
  h.key("Enter", original);
  h.doc.focusCalls.length = 0;
  assert.equal(h.key("ArrowDown").defaultPrevented, true);
  assert.equal(h.item(id).y, 33); assert.equal(savedItem(h, id).y, 33);
  assert.equal(host.isConnected, false); assert.notEqual(h.host(), host);
  assert.equal(h.editor.history.length, 1); assert.equal(h.counts.build, 1);
  expectReplacement(h, original, id);
  assert.equal(h.doc.focusCalls.length, 1);
  const afterOne = h.node(id);
  h.key("ArrowDown", undefined, {repeat: true, shiftKey: true});
  assert.deepEqual([h.item(id).x, h.item(id).y], [32, 43]);
  assert.deepEqual([savedItem(h, id).x, savedItem(h, id).y], [32, 43]);
  expectReplacement(h, afterOne, id);
  assert.equal(h.context.run.cash, before.cash); assert.equal(h.context.run.owned.length, before.owned.length);
});

test("QA focus: installed undo, redo and shifted Meta-Z preserve focused nested child by ID", t => {
  const h = fixture(t, [["gov_form", 32, 200, 400, 250], ["gov_submit", 48, 300]]), [parent, child] = h.ids;
  h.key("Enter", h.node(parent)); h.key("g");
  h.node(child).focus();
  h.key("ArrowRight");
  assert.deepEqual([h.item(parent).x, h.item(child).x], [33, 49]);
  for (const [key, props, want] of [["z", {ctrlKey: true}, 48], ["y", {ctrlKey: true}, 49], ["z", {metaKey: true}, 48], ["Z", {metaKey: true, shiftKey: true}, 49]]) {
    const old = h.node(child); old.focus(); h.doc.focusCalls.length = 0;
    h.key(key, undefined, props);
    assert.equal(h.item(child).x, want); assert.equal(savedItem(h, child).x, want);
    expectReplacement(h, old, child); assert.equal(h.doc.focusCalls.length, 1);
    assert.deepEqual([...h.editor.selection], []);
  }
  assert.equal(h.node(child).parentElement.closest(".web-node"), h.node(parent));
});

// Capturing event.target or the selected ID instead of the genuinely active
// owned wrapper must fail here; foreign wrappers may carry an identical ID.
for (const origin of ["body", "host", "nested-button", "outside-button", "foreign-wrapper", "enemy-wrapper", "unfocused-event-wrapper"]) {
  test(`QA focus: keyboard editing never promotes ${origin} focus to the selected wrapper`, t => {
    const h = fixture(t), [id] = h.ids;
    h.key("Enter", h.node(id));
    let target;
    if (origin === "body" || origin === "unfocused-event-wrapper") target = h.doc.body;
    else if (origin === "host") target = h.host();
    else if (origin === "nested-button") target = h.node(id).querySelector("button");
    else if (origin === "enemy-wrapper") target = h.doc.querySelector('#enemy-body .web-node');
    else {
      target = h.doc.createElement(origin === "outside-button" ? "button" : "div");
      if (origin === "foreign-wrapper") {
        target.className = "web-node"; target.dataset.side = "player"; target.dataset.id = id; target.tabIndex = 0;
      }
      h.doc.body.append(target);
    }
    target.focus(); h.doc.focusCalls.length = 0;
    h.key("ArrowDown", origin === "unfocused-event-wrapper" ? h.node(id) : target, {focus: false});
    assert.equal(h.item(id).y, 33); assert.equal(savedItem(h, id).y, 33);
    assert.equal(h.doc.focusCalls.length, 0);
    assert.equal(h.doc.activeElement === (target.isConnected ? target : h.doc.body), true, `unexpected focus ${activeId(h)}`);
  });
}

for (const origin of ["input", "textarea", "select", "contenteditable", "preview", "enemy", "battle", "phase", "modal", "other-dialog"]) {
  test(`QA focus: ${origin} boundary keeps edit state and focus untouched`, t => {
    const h = fixture(t), [id] = h.ids;
    h.key("Enter", h.node(id));
    let target = h.node(id);
    if (["input", "textarea", "select", "contenteditable"].includes(origin)) {
      target = h.doc.createElement(origin === "contenteditable" ? "div" : origin);
      if (origin === "contenteditable") target.setAttribute("contenteditable", "plaintext-only");
      h.doc.body.append(target);
    } else if (origin === "preview") h.context.preview = true;
    else if (origin === "enemy") h.context.view = "enemy";
    else if (origin === "battle") h.context.battle = new E.Battle(h.context.run.owned, [], { playerCapacity: Infinity });
    else if (origin === "phase") h.context.run.phase = "battle";
    else if (origin === "modal") h.doc.querySelector("#modal").open = true;
    else { const dialog = h.doc.createElement("dialog"); dialog.open = true; h.doc.body.append(dialog); }
    target.focus(); h.doc.focusCalls.length = 0;
    const before = structuredClone(h.context.run);
    for (const [key, props] of [["ArrowDown", {}], ["z", {ctrlKey: true}], ["y", {ctrlKey: true}]])
      assert.equal(h.key(key, undefined, props).defaultPrevented, false);
    assert.deepEqual(h.context.run, before); assert.equal(h.counts.build, 0); assert.equal(h.values.size, 0);
    assert.equal(h.doc.activeElement, target); assert.equal(h.doc.focusCalls.length, 0);
  });
}

// The app callback may synchronously move to another screen or open a dialog.
// Dropping the post-action gate would steal focus back to an inactive board.
for (const transition of ["preview", "enemy", "battle", "phase", "modal", "other-dialog", "stash", "remove", "stash-with-stale-dom", "remove-with-stale-dom", "missing-wrapper", "old-node-reconnected"]) {
  test(`QA focus: after-build ${transition} transition prevents stale-wrapper restoration`, t => {
    const h = fixture(t), [id] = h.ids, old = h.node(id);
    h.key("Enter", old); h.doc.focusCalls.length = 0;
    h.afterBuild(() => {
      if (transition === "preview") h.context.preview = true;
      else if (transition === "enemy") h.context.view = "enemy";
      else if (transition === "battle") h.context.battle = new E.Battle(h.context.run.owned, [], { playerCapacity: Infinity });
      else if (transition === "phase") h.context.run.phase = "battle";
      else if (transition === "modal") h.doc.querySelector("#modal").open = true;
      else if (transition === "other-dialog") { const dialog = h.doc.createElement("dialog"); dialog.open = true; h.doc.body.append(dialog); }
      else if (transition === "stash") { assert.equal(R.move(h.context.run, id, null, null), true); h.context.renderFrames(); }
      else if (transition === "remove") { assert.equal(R.sell(h.context.run, id).ok, true); h.context.renderFrames(); }
      else if (transition === "stash-with-stale-dom") assert.equal(R.move(h.context.run, id, null, null), true);
      else if (transition === "remove-with-stale-dom") assert.equal(R.sell(h.context.run, id).ok, true);
      else if (transition === "missing-wrapper") h.node(id).remove();
      else h.doc.body.append(old);
    });
    h.key("ArrowDown");
    assert.equal(savedItem(h, id).y, 33, "the original real keyboard transaction was saved before the transition");
    assert.equal(activeId(h), "BODY"); assert.equal(h.doc.focusCalls.length, 0);
  });
}

for (const destination of ["outside-input", "different-wrapper", "nested-button", "modal-button"]) {
  test(`QA focus: app callback focus on ${destination} wins over automatic restoration`, t => {
    const h = fixture(t), [id, other] = h.ids;
    h.key("Enter", h.node(id)); h.doc.focusCalls.length = 0;
    let intended;
    h.afterBuild(() => {
      if (destination === "different-wrapper") intended = h.node(other);
      else if (destination === "nested-button") intended = h.node(id).querySelector("button");
      else {
        intended = h.doc.createElement(destination === "outside-input" ? "input" : "button");
        const container = destination === "modal-button" ? h.doc.querySelector("#modal") : h.doc.body;
        if (destination === "modal-button") container.open = true;
        container.append(intended);
      }
      intended.focus();
    });
    h.key("ArrowDown");
    assert.equal(savedItem(h, id).y, 33); assert.equal(h.doc.activeElement === intended, true, `focus stolen from ${destination} to ${activeId(h)}`);
    assert.equal(h.doc.focusCalls.length, 1); assert.equal(h.doc.focusCalls[0].node, intended);
  });
}

test("QA focus: failed movement and empty history do not refocus the original connected node", t => {
  const h = fixture(t, [["yt_like", 0, 0]]), [id] = h.ids, old = h.node(id), before = structuredClone(h.context.run);
  h.key("Enter", old); h.doc.focusCalls.length = 0;
  h.key("ArrowLeft"); h.key("ArrowUp"); h.key("z", undefined, {ctrlKey: true}); h.key("y", undefined, {ctrlKey: true});
  assert.deepEqual(h.context.run, before); assert.equal(h.node(id), old); assert.equal(h.doc.activeElement, old);
  assert.equal(h.doc.focusCalls.length, 0); assert.equal(h.editor.history.length, 0); assert.equal(h.counts.build, 0);
});

test("QA focus: generic rendering and inspector updates retain ordinary removal-to-BODY behavior", t => {
  const h = fixture(t), [id] = h.ids;
  h.key("Enter", h.node(id)); h.doc.focusCalls.length = 0;
  h.context.render();
  assert.equal(activeId(h), "BODY"); assert.equal(h.doc.focusCalls.length, 0);
  h.node(id).focus(); h.doc.focusCalls.length = 0;
  h.editor.update({label: "Changed through inspector"});
  assert.equal(savedItem(h, id).label, "Changed through inspector");
  assert.equal(activeId(h), "BODY"); assert.equal(h.doc.focusCalls.length, 0);
  h.node(id).focus(); h.doc.focusCalls.length = 0;
  h.editor.undo();
  assert.equal(savedItem(h, id).label, ""); assert.equal(activeId(h), "BODY"); assert.equal(h.doc.focusCalls.length, 0);
});

test("QA focus: Delete stashes the focused item and undo from BODY never selects a restoration target", t => {
  const h = fixture(t), [id] = h.ids;
  h.key("Enter", h.node(id)); h.doc.focusCalls.length = 0;
  h.key("Delete");
  assert.equal(h.item(id).x, null); assert.equal(savedItem(h, id).x, null); assert.equal(h.node(id), null);
  assert.equal(activeId(h), "BODY"); assert.equal(h.doc.focusCalls.length, 0);
  h.key("z", undefined, {ctrlKey: true});
  assert.equal(h.item(id).x, 32); assert.equal(savedItem(h, id).x, 32); assert.ok(h.node(id));
  assert.equal(activeId(h), "BODY"); assert.equal(h.doc.focusCalls.length, 0);
});

test("QA focus: real pointer drag keeps its existing host-focus behavior instead of keyboard wrapper restoration", t => {
  const h = fixture(t, [["ab_link", 32, 32]]), [id] = h.ids, original = h.node(id), host = h.host();
  original.focus(); h.doc.focusCalls.length = 0;
  assert.equal(h.pointer("pointerdown", original).defaultPrevented, true);
  assert.equal(h.doc.activeElement === host, true); assert.deepEqual([...h.editor.selection], [id]);
  h.pointer("pointermove", host, {clientX: 56, clientY: 56}); h.flushAnimation();
  assert.equal(h.editor.drag.active, true); assert.equal(h.editor.drag.valid, true);
  assert.equal(h.doc.activeElement === host, true);
  h.pointer("pointerup", host, {clientX: 56, clientY: 56});
  assert.deepEqual([h.item(id).x, h.item(id).y], [48, 48]);
  assert.deepEqual([savedItem(h, id).x, savedItem(h, id).y], [48, 48]);
  assert.equal(host.isConnected, false); assert.equal(h.doc.activeElement === h.host(), true);
  assert.equal(h.doc.focusCalls.length, 2); assert.ok(h.doc.focusCalls.every(({node, options}) => node.id === "player-body" && options.preventScroll));
});

for (const invalid of ["enemy-side", "unplaced", "unowned"]) {
  test(`QA focus: initially ${invalid} wrapper is not captured even when matching player ID appears after callback`, t => {
    const h = fixture(t), [id, staleId] = h.ids;
    h.key("Enter", h.node(id));
    const stale = h.node(staleId), item = h.item(staleId);
    if (invalid === "enemy-side") stale.dataset.side = "enemy";
    else if (invalid === "unplaced") assert.equal(R.move(h.context.run, staleId, null, null), true);
    else h.context.run.owned = h.context.run.owned.filter(part => part.id !== staleId);
    stale.focus(); h.doc.focusCalls.length = 0;
    h.afterBuild(() => {
      if (invalid === "unplaced") assert.equal(R.move(h.context.run, staleId, 144, 32), true);
      else if (invalid === "unowned") h.context.run.owned.push(item);
      h.context.renderFrames();
    });
    h.key("ArrowDown");
    assert.equal(savedItem(h, id).y, 33); assert.ok(h.node(staleId));
    assert.equal(activeId(h), "BODY"); assert.equal(h.doc.focusCalls.length, 0);
  });
}

test("QA focus: replacement search ignores a foreign-side same-ID wrapper in the current host", t => {
  const h = fixture(t), [id] = h.ids;
  h.key("Enter", h.node(id)); h.doc.focusCalls.length = 0;
  let foreign, own;
  h.afterBuild(() => {
    own = h.node(id); foreign = h.doc.createElement("div"); foreign.className = "web-node";
    foreign.dataset.side = "enemy"; foreign.dataset.id = id; foreign.tabIndex = 0;
    const host = h.host(); host.replaceChildren(foreign, ...host.children);
  });
  h.key("ArrowDown");
  assert.equal(savedItem(h, id).y, 33);
  assert.equal(h.doc.activeElement === own, true, "only the current player wrapper may receive focus");
  assert.equal(h.doc.focusCalls.length, 1); assert.notEqual(h.doc.focusCalls[0].node.dataset.side, "enemy");
});

test("QA focus: a foreign-host same-ID wrapper removed by the callback is never restored into the player host", t => {
  const h = fixture(t), [id] = h.ids;
  h.key("Enter", h.node(id));
  const foreign = h.doc.createElement("div"); foreign.className = "web-node";
  foreign.dataset.side = "player"; foreign.dataset.id = id; foreign.tabIndex = 0;
  h.doc.body.append(foreign); foreign.focus(); h.doc.focusCalls.length = 0;
  h.afterBuild(() => foreign.remove());
  h.key("ArrowDown");
  assert.equal(savedItem(h, id).y, 33); assert.equal(foreign.isConnected, false); assert.ok(h.node(id));
  assert.equal(activeId(h), "BODY"); assert.equal(h.doc.focusCalls.length, 0);
});
