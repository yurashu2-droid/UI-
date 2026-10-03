import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import { Editor } from "../src/editor.js";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import V from "../src/components.js";
import { renderHackSites } from "../src/hacksite.js";
import { createRunPersistence } from "../src/persistence.js";

// Run the production app listener, editor options, shop rendering, save and
// render orchestration with the real Editor, transactions and persistence.
// Only browser DOM/drawing and unrelated descriptive UI are adapted. This does
// not establish native browser default actions, Tab order, paint or AT support.
// Removing Space handling or ownership/repeat gates must fail these assertions.
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const declaration = name => {
  const found = source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(found, `production app ${name}`); return found;
};
const options = source.match(/^const editor = new UIRaidEditor.Editor\([^]*?^\}\);/m)?.[0];
const listener = source.match(/^document.addEventListener\("keydown", \(e\) => \{[^]*?^\}\);/m)?.[0];
const kinds = source.match(/^const KIND: [^]*?^};/m)?.[0];
const sites = source.match(/^const SITE_URL: [^]*?^};/m)?.[0];
assert.ok(options && listener && kinds && sites, "real app declarations and installed listener");
const compiled = transformSync([
  kinds, sites, ...["save", "shopCard", "planCard", "itemInfo", "renderShop", "render"].map(declaration),
  options, listener, "globalThis.editor = editor;",
].join("\n"), {loader: "ts", target: "es2022"}).code;

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
  clientWidth = 240;
  offsetHeight = 200;
  scrollTop = 0;
  getContext() { return null; }
  click() { this.ownerDocument.emit("click", this); }
  insertAdjacentHTML(position, html) {
    const holder = this.ownerDocument.createElement("div"); holder.innerHTML = html;
    const nodes = [...holder.children];
    if (position === "beforeend") this.append(...nodes);
    else if (position === "afterbegin") {
      for (const node of nodes) node.remove();
      for (const node of nodes) node.parentElement = this;
      this.children.unshift(...nodes);
    } else throw Error(`Unmodeled insertion ${position}`);
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

function fixture(t, mode = "lab") {
  const listeners = new Map(), doc = {
    focusCalls: [],
    createElement(tag) { return new ElementAdapter(tag, this); },
    addEventListener(type, fn) { listeners.set(type, [...listeners.get(type) ?? [], fn]); },
    querySelector(selector) { return this.body.querySelector(selector); },
    emit(type, target, props = {}) {
      const event = {target, key: "", code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
        repeat: false, isComposing: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...props};
      for (const listener of listeners.get(type) ?? []) listener(event);
      return event;
    },
  };
  doc.body = doc.createElement("body"); doc.activeElement = doc.body;
  const names = ["document", "Element", "HTMLElement"];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {document: doc, Element: ElementAdapter, HTMLElement: ElementAdapter});
  t.after(() => { for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; });
  for (const id of ["library-list", "library-toolbar", "shop-foot", "library-query", "family-filter", "shop-title", "shop-sub", "reroll-button", "player-body", "editor-overlay", "modal", "pause-button", "enemy-thumbnail", "battle-controls", "battle-log", "canvas-float", "back-to-page"]) {
    const tag = id === "modal" ? "dialog" : id === "library-query" ? "input" : id === "family-filter" ? "select" : id === "pause-button" ? "button" : "div";
    const node = doc.createElement(tag); node.id = id; doc.body.append(node);
  }
  const left = doc.createElement("section"); left.className = "left-panel"; doc.body.append(left);
  doc.querySelector("#library-query").value = ""; doc.querySelector("#family-filter").value = "all";
  const run = R.newRun(mode, "mixed", {tutorial: mode === "campaign"});
  const values = new Map(), counts = {writes: 0, changes: 0, pause: 0}, toasts = [];
  const persistence = createRunPersistence({getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); if (key === "palette-keys-" + mode) counts.writes++; }}, "palette-keys-");
  const context = vm.createContext({
    document: doc, Element: ElementAdapter, HTMLElement: ElementAdapter, UIRaidEditor: {Editor},
    run, R, V, C, D, E, P: D.PARTS, memory: {}, runPersistence: persistence,
    clone: structuredClone, preview: false, battle: null, paused: false, view: "self", storyActive: false, storySession: null,
    profileStore: null, saveOK: true, saveProblem: "", renderHackSites,
    $: selector => { const node = doc.querySelector(selector); assert.ok(node, `app element ${selector}`); return node; },
    renderStorageNotice() {}, syncEra() {}, renderTopbar() {}, markFusions() {}, renderSide() {}, renderCoach() {},
    renderFrames() { V.render(doc.querySelector("#player-body"), run.owned, {side: "player"}); },
    renderStash() {}, syncCrawler() {}, matchHint: () => "", shortDesc: part => part.desc,
    isFaction: name => Object.hasOwn(D.FACTIONS, name), favicon: () => "", esc: V.esc,
    afterBuildChange() { counts.changes++; }, toast: text => toasts.push(text),
    crawler: {setEnabled() {}}, basket: {setEnabled() {}}, fx: {reduced: false, update() {}}, wm: {setTitle() {}},
  });
  doc.querySelector("#pause-button").click = () => { counts.pause++; };
  vm.runInContext(compiled, context); context.render();
  return {doc, run, context, editor: context.editor, counts, toasts, persistence,
    card: (type = "ab_link") => doc.querySelector(`#library-list [data-palette-type="${type}"]`),
    saved: () => { const saved = persistence.load(mode); assert.equal(saved.status, "loaded"); return saved.run; },
    key(key, target = doc.activeElement, props = {}) {
      if (props.focus !== false) target?.focus();
      return doc.emit("keydown", target, {key, code: key === " " ? "Space" : key, ...props});
    },
    release(key, target = doc.activeElement) { return doc.emit("keyup", target, {key, code: key === " " ? "Space" : key}); },
  };
}
const state = h => structuredClone({run: h.run, history: h.editor.history, future: h.editor.future,
  selected: [...h.editor.selection], pending: h.editor.pending, counts: h.counts});

for (const mode of ["lab", "campaign"]) for (const key of [" ", "Enter"]) {
  test(`${mode} current palette ${JSON.stringify(key)} adds once via the saved transaction and retains Undo/Redo`, t => {
    const h = fixture(t, mode), before = structuredClone(h.run), card = h.card();
    assert.ok(card); assert.equal(card.getAttribute("role"), "button"); assert.equal(card.tabIndex, 0);
    assert.equal(h.key(key, card).defaultPrevented, true, "handled activation must prevent scroll/default handling");
    assert.equal(h.run.owned.length, before.owned.length + 1);
    const item = h.run.owned.at(-1); assert.equal(item.type, "ab_link");
    assert.equal(C.placed(item), true); assert.equal(h.run.owned.filter(C.placed).every(part => C.canPlace(h.run.owned, part, part.x, part.y)), true);
    assert.equal(h.run.cash, before.cash - (mode === "campaign" ? D.PARTS.ab_link.price : 0));
    assert.deepEqual(h.run.owned.slice(0, -1), before.owned);
    assert.deepEqual([...h.editor.selection], [item.id]); assert.equal(h.editor.history.length, 1);
    assert.equal(h.counts.changes, 1); assert.equal(h.counts.writes, 1);
    assert.equal(R.validateRun(h.run), true); assert.deepEqual(h.saved(), h.run);
    const added = structuredClone(h.run);
    h.release(key, card); h.key(key, card, {repeat: true, focus: false});
    assert.deepEqual(h.run, added); assert.equal(h.counts.changes, 1, "release/repeat/stale target must not buy twice");
    h.key("z", h.doc.body, {ctrlKey: true});
    assert.deepEqual(h.run, before); assert.deepEqual(h.saved(), before);
    h.key("y", h.doc.body, {ctrlKey: true});
    assert.deepEqual(h.run, added); assert.deepEqual(h.saved(), added);
  });
}

for (const key of [" ", "Enter"]) {
  test(`${JSON.stringify(key)} repeats prevent scrolling but never buy`, t => {
    const h = fixture(t), before = state(h);
    assert.equal(h.key(key, h.card(), {repeat: true}).defaultPrevented, true);
    assert.deepEqual(state(h), before);
  });
  for (const option of ["ctrlKey", "metaKey", "altKey", "shiftKey", "isComposing", "defaultPrevented"]) {
    test(`${JSON.stringify(key)} ignores ${option}`, t => {
      const h = fixture(t), before = state(h);
      const event = h.key(key, h.card(), {[option]: true});
      assert.equal(event.defaultPrevented, option === "defaultPrevented");
      assert.deepEqual(state(h), before);
    });
  }
  for (const gate of ["preview", "enemy", "reward", "complete", "gameover", "battle-phase", "modal", "other-dialog", "drag", "inactive-drag"]) {
    test(`${JSON.stringify(key)} never purchases during ${gate}`, t => {
      const h = fixture(t);
      if (gate === "preview") h.context.preview = true;
      else if (gate === "enemy") h.context.view = "enemy";
      else if (["reward", "complete", "gameover", "battle-phase"].includes(gate)) h.run.phase = gate === "battle-phase" ? "battle" : gate;
      else if (gate === "modal") h.doc.querySelector("#modal").open = true;
      else if (gate === "other-dialog") { const dialog = h.doc.createElement("dialog"); dialog.open = true; h.doc.body.append(dialog); }
      else h.editor.drag = {active: gate === "drag"};
      const before = state(h);
      assert.equal(h.key(key, h.card()).defaultPrevented, false);
      assert.deepEqual(state(h), before);
    });
  }
  for (const origin of ["detached", "foreign", "unfocused", "child", "data-only", "contenteditable", "inherited-editable", "other-key"]) {
    test(`${JSON.stringify(key)} rejects ${origin} palette targets`, t => {
      const h = fixture(t), card = h.card(); let target = card;
      if (origin === "detached") h.context.renderShop();
      else if (origin === "foreign") h.doc.body.append(card);
      else if (origin === "child") target = card.querySelector(".sc-name");
      else if (origin === "data-only") { target = h.doc.createElement("div"); target.dataset.paletteType = "ab_link"; h.doc.querySelector("#library-list").append(target); }
      else if (origin === "contenteditable") card.setAttribute("contenteditable", "plaintext-only");
      else if (origin === "inherited-editable") h.doc.querySelector("#library-list").setAttribute("contenteditable", "true");
      const before = state(h);
      assert.equal(h.key(origin === "other-key" ? "a" : key, target, {focus: origin !== "unfocused"}).defaultPrevented, false);
      assert.deepEqual(state(h), before);
    });
  }
  for (const tag of ["button", "input", "select", "textarea", "a"]) {
    test(`${JSON.stringify(key)} leaves native inner ${tag} default handling alone`, t => {
      const h = fixture(t), card = h.card();
      const control = tag === "button" ? card.querySelector("[data-add-type]") : h.doc.createElement(tag);
      if (tag !== "button") card.append(control);
      const before = state(h);
      assert.equal(h.key(key, control).defaultPrevented, false);
      assert.deepEqual(state(h), before);
      // Node does not synthesize native key defaults. Explicitly dispatch that
      // browser-owned click separately and prove the installed click path buys once.
      if (tag === "button") {
        control.click(); assert.equal(h.run.owned.length, before.run.owned.length + 1);
        assert.equal(h.counts.changes, 1); assert.equal(h.counts.writes, 1);
      }
    });
  }
}

test("fresh laboratory cards remain operable after query filtering and re-rendering", t => {
  const h = fixture(t), old = h.card();
  h.doc.querySelector("#library-query").value = D.PARTS.ab_link.name;
  h.context.renderShop(); const current = h.card();
  assert.notEqual(current, old); assert.equal(old.isConnected, false);
  assert.equal(h.key(" ", current).defaultPrevented, true);
  assert.equal(h.run.owned.at(-1).type, "ab_link"); assert.equal(h.counts.changes, 1);
});

for (const reason of ["funds", "stock", "limit"]) {
  test(`keyboard addition preserves domain rejection for ${reason}`, t => {
    const h = fixture(t, reason === "limit" ? "lab" : "campaign"), card = h.card();
    if (reason === "funds") h.run.cash = 0;
    else if (reason === "stock") h.run.shop.find(stock => stock.type === "ab_link").sold = true;
    else while (h.run.owned.length < D.MAX_ITEMS) assert.equal(R.purchase(h.run, "ab_link").ok, true);
    const before = state(h);
    assert.equal(h.key(" ", card).defaultPrevented, true);
    assert.deepEqual(state(h), before); assert.equal(h.toasts.length, 1);
  });
}

test("battle Space pause remains owned by the existing handler and never purchases", t => {
  const h = fixture(t), before = structuredClone(h.run); h.context.battle = {};
  assert.equal(h.key(" ", h.doc.body).defaultPrevented, true); assert.equal(h.counts.pause, 1);
  assert.equal(h.key(" ", h.card()).defaultPrevented, true); assert.equal(h.counts.pause, 2);
  assert.equal(h.key("Enter", h.card()).defaultPrevented, false);
  for (const tag of ["button", "input", "select", "textarea"]) {
    const native = h.doc.createElement(tag); h.doc.body.append(native);
    assert.equal(h.key(" ", native).defaultPrevented, false);
  }
  h.doc.querySelector("#modal").open = true;
  assert.equal(h.key(" ", h.doc.body).defaultPrevented, false); assert.equal(h.counts.pause, 2);
  assert.deepEqual(h.run, before); assert.equal(h.counts.writes, 0); assert.equal(h.editor.history.length, 0);
});

// The focus checks below model synchronous subtree removal, not native browser
// focus/scroll acceptance. They use the same installed listener and real saved
// Editor.add transaction as the guard cases above.
function afterBuild(h, callback) {
  const original = h.context.afterBuildChange;
  h.context.afterBuildChange = () => { original(); callback(); };
}
function expectFocusReplacement(h, old, current) {
  assert.equal(old.isConnected, false, "the production redraw removed the operated wrapper");
  assert.notEqual(current, old); assert.ok(current?.isConnected);
  assert.equal(h.doc.activeElement === current, true, "focus must follow only the corresponding current wrapper");
  assert.equal(h.doc.focusCalls.length, 1, "one restoration, after the complete synchronous transaction");
  assert.equal(h.doc.focusCalls[0].node, current);
  assert.equal(h.doc.focusCalls[0].options?.preventScroll, true);
}

for (const key of [" ", "Enter"]) {
  test(`laboratory ${JSON.stringify(key)} restores its replaced card and the next fresh key adds once`, t => {
    const h = fixture(t), old = h.card(), host = h.doc.querySelector("#library-list");
    host.scrollTop = 217; old.focus(); h.doc.focusCalls.length = 0;
    const before = h.run.owned.length;
    assert.equal(h.key(key, old, {focus: false}).defaultPrevented, true);
    expectFocusReplacement(h, old, h.card());
    assert.equal(host.scrollTop, 217); assert.equal(h.run.owned.length, before + 1);
    assert.deepEqual(h.saved(), h.run); assert.equal(h.counts.writes, 1);
    const current = h.card();
    h.release(key); h.doc.focusCalls.length = 0;
    assert.equal(h.key(key, undefined, {repeat: true, focus: false}).defaultPrevented, true);
    assert.equal(h.doc.activeElement, current); assert.equal(h.doc.focusCalls.length, 0);
    assert.equal(h.run.owned.length, before + 1);
    assert.equal(h.key(key, undefined, {focus: false}).defaultPrevented, true);
    expectFocusReplacement(h, current, h.card());
    assert.equal(h.run.owned.length, before + 2); assert.equal(h.counts.writes, 2);
    assert.deepEqual(h.saved(), h.run);
  });

  test(`campaign ${JSON.stringify(key)} preserves only the original still-unsold duplicate slot`, t => {
    const h = fixture(t, "campaign");
    h.run.shop.push({type: "ab_link", sold: false}); h.context.renderShop();
    const cards = h.doc.body.querySelectorAll('#library-list .hs-el[data-palette-type="ab_link"]');
    assert.equal(cards.length, 2);
    const old = cards[1], index = old.dataset.shopIndex;
    old.focus(); h.doc.focusCalls.length = 0;
    h.key(key, old, {focus: false});
    const current = h.doc.querySelector(`#library-list .hs-el[data-shop-index="${index}"]`);
    expectFocusReplacement(h, old, current);
    assert.equal(h.run.shop[Number(cards[0].dataset.shopIndex)].sold, true);
    assert.equal(h.run.shop[Number(index)].sold, false);
    assert.deepEqual(h.saved(), h.run); assert.equal(h.counts.changes, 1);
  });

  test(`campaign ${JSON.stringify(key)} never moves to a different duplicate after the source is sold`, t => {
    const h = fixture(t, "campaign");
    h.run.shop.push({type: "ab_link", sold: false}); h.context.renderShop();
    const old = h.card(); old.focus(); h.doc.focusCalls.length = 0;
    h.key(key, old, {focus: false});
    assert.equal(old.isConnected, false); assert.ok(h.card(), "another same-type card remains");
    assert.notEqual(h.card().dataset.shopIndex, old.dataset.shopIndex);
    assert.equal(h.doc.activeElement === h.doc.body, true, "focus remains on the document body"); assert.equal(h.doc.focusCalls.length, 0);
    assert.deepEqual(h.saved(), h.run); assert.equal(h.counts.changes, 1);
  });
}

test("palette focus continuity works when the real undo history is already capped", t => {
  const h = fixture(t), old = h.card();
  h.editor.history = Array.from({length: 60}, () => structuredClone(h.run));
  old.focus(); h.doc.focusCalls.length = 0;
  h.key(" ", old, {focus: false});
  assert.equal(h.editor.history.length, 60);
  expectFocusReplacement(h, old, h.card()); assert.deepEqual(h.saved(), h.run);
});

for (const phase of ["before-change", "after-change", "after-build", "toast"]) {
  test(`palette restoration respects deliberate ${phase} focus`, t => {
    const h = fixture(t), old = h.card(), chosen = h.doc.querySelector("#library-query");
    if (phase === "after-build") afterBuild(h, () => chosen.focus());
    else if (phase === "toast") {
      const original = h.editor.o.onToast;
      h.editor.o.onToast = message => { original(message); chosen.focus(); };
    } else {
      const original = h.editor.o.onChange;
      h.editor.o.onChange = () => {
        if (phase === "before-change") chosen.focus();
        original();
        if (phase === "after-change") chosen.focus();
      };
    }
    old.focus(); h.doc.focusCalls.length = 0;
    h.key("Enter", old, {focus: false});
    assert.equal(old.isConnected, false); assert.equal(h.doc.activeElement, chosen);
    assert.deepEqual(h.doc.focusCalls.map(call => call.node), [chosen]);
    assert.equal(h.counts.changes, 1); assert.deepEqual(h.saved(), h.run);
  });
}

for (const reason of ["funds", "stock", "limit"]) {
  test(`rejected ${reason} addition never reclaims focus even if its toast redraws the palette`, t => {
    const h = fixture(t, reason === "limit" ? "lab" : "campaign"), old = h.card();
    if (reason === "funds") h.run.cash = 0;
    else if (reason === "stock") h.run.shop.find(stock => stock.type === "ab_link").sold = true;
    else while (h.run.owned.length < D.MAX_ITEMS) assert.equal(R.purchase(h.run, "ab_link").ok, true);
    const before = state(h), original = h.editor.o.onToast;
    h.editor.o.onToast = message => { original(message); h.context.renderShop(); };
    old.focus(); h.doc.focusCalls.length = 0;
    h.key(" ", old, {focus: false});
    assert.deepEqual(state(h), before); assert.equal(old.isConnected, false);
    assert.equal(h.doc.activeElement === h.doc.body, true, "focus remains on the document body"); assert.equal(h.doc.focusCalls.length, 0);
    assert.equal(h.toasts.length, 1);
  });
}

for (const change of ["new-run", "same-object-mode", "stage", "story-mode", "editor-owner", "selection", "old-selected-item", "removed-added-item", "changed-added-type", "extra-added-item",
  "preview", "enemy", "battle", "phase", "modal", "other-dialog", "drag", "new-library", "missing-library",
  "query-removes-card", "family-removes-card", "removed-card", "foreign-card", "changed-type", "changed-role", "changed-kind",
  "untabbable", "editable", "native-ancestor", "hidden", "inert", "aria-hidden", "aria-disabled"]) {
  test(`palette restoration declines ${change} after its successful synchronous add`, t => {
    const h = fixture(t), old = h.card(), before = h.run.owned.length;
    afterBuild(h, () => {
      const current = h.card(), library = h.doc.querySelector("#library-list");
      if (change === "new-run") { h.context.run = structuredClone(h.run); h.context.render(); }
      else if (change === "same-object-mode") h.run.mode = "campaign";
      else if (change === "stage") h.run.stage++;
      else if (change === "story-mode") h.context.storyActive = true;
      else if (change === "editor-owner") h.editor.o.getRun = () => R.newRun("lab");
      else if (change === "selection") h.editor.selection.clear();
      else if (change === "old-selected-item") h.editor.selection = new Set([h.run.owned.find(item => item.type === "ab_link").id]);
      else if (change === "removed-added-item") h.run.owned.pop();
      else if (change === "changed-added-type") h.run.owned.at(-1).type = "ab_heading";
      else if (change === "extra-added-item") assert.equal(R.purchase(h.run, "ab_link").ok, true);
      else if (change === "preview") h.context.preview = true;
      else if (change === "enemy") h.context.view = "enemy";
      else if (change === "battle") h.context.battle = {};
      else if (change === "phase") h.run.phase = "reward";
      else if (change === "modal") h.doc.querySelector("#modal").open = true;
      else if (change === "other-dialog") { const dialog = h.doc.createElement("dialog"); dialog.open = true; h.doc.body.append(dialog); }
      else if (change === "drag") h.editor.drag = {active: false};
      else if (change === "new-library") {
        library.remove(); const fresh = h.doc.createElement("div"); fresh.id = "library-list"; h.doc.body.append(fresh); h.context.renderShop();
      } else if (change === "missing-library") library.remove();
      else if (change === "query-removes-card") { h.doc.querySelector("#library-query").value = "nonexistent palette match"; h.context.renderShop(); }
      else if (change === "family-removes-card") { h.doc.querySelector("#family-filter").value = "amazon"; h.context.renderShop(); }
      else if (change === "removed-card") current.remove();
      else if (change === "foreign-card") h.doc.body.append(current);
      else if (change === "changed-type") current.dataset.paletteType = "ab_heading";
      else if (change === "changed-role") current.setAttribute("role", "group");
      else if (change === "changed-kind") current.className = "hs-el";
      else if (change === "untabbable") current.tabIndex = -1;
      else if (change === "editable") library.setAttribute("contenteditable", "true");
      else if (change === "native-ancestor") { const button = h.doc.createElement("button"); library.append(button); button.append(current); }
      else if (change === "hidden") library.setAttribute("hidden", "");
      else if (change === "inert") library.setAttribute("inert", "");
      else if (change === "aria-hidden") library.setAttribute("aria-hidden", "true");
      else current.setAttribute("aria-disabled", "true");
    });
    old.focus(); h.doc.focusCalls.length = 0;
    h.key("Enter", old, {focus: false});
    assert.equal(h.counts.changes, 1); assert.equal(h.counts.writes, 1);
    assert.equal(h.saved().owned.length, before + 1, "the real addition saved before the callback changed ownership");
    assert.equal(old.isConnected, false); assert.equal(h.doc.activeElement === h.doc.body, true, "focus remains on the document body");
    assert.equal(h.doc.focusCalls.length, 0);
  });
}

test("palette restoration never changes wrapper kind after adding from a mutated source", t => {
  const h = fixture(t), old = h.card(); old.className = "hs-el";
  old.focus(); h.doc.focusCalls.length = 0;
  h.key("Enter", old, {focus: false});
  assert.equal(h.counts.changes, 1); assert.equal(h.counts.writes, 1);
  assert.ok(h.card().classList.contains("shop-card"));
  assert.equal(h.doc.activeElement === h.doc.body, true, "focus remains on the document body"); assert.equal(h.doc.focusCalls.length, 0);
});

test("palette restoration follows the current filtered card even when focus falls to null", t => {
  const h = fixture(t);
  h.doc.querySelector("#library-query").value = D.PARTS.ab_link.name;
  h.doc.querySelector("#family-filter").value = D.PARTS.ab_link.faction;
  h.context.renderShop(); const old = h.card();
  afterBuild(h, () => { h.doc.activeElement = null; });
  old.focus(); h.doc.focusCalls.length = 0;
  h.key(" ", old, {focus: false});
  expectFocusReplacement(h, old, h.card()); assert.deepEqual(h.saved(), h.run);
});

for (const change of ["sold-slot", "changed-index", "replaced-stock", "reordered-stock"]) {
  test(`campaign restoration rejects ${change} instead of trusting a same-type wrapper`, t => {
    const h = fixture(t, "campaign");
    h.run.shop.push({type: "ab_link", sold: false}); h.context.renderShop();
    const old = h.doc.body.querySelectorAll('#library-list .hs-el[data-palette-type="ab_link"]')[1], index = Number(old.dataset.shopIndex);
    afterBuild(h, () => {
      if (change === "sold-slot") h.run.shop[index].sold = true;
      else if (change === "changed-index") h.card().dataset.shopIndex = String(index + 1);
      else if (change === "replaced-stock") h.run.shop[index] = {...h.run.shop[index]};
      else [h.run.shop[index], h.run.shop[0]] = [h.run.shop[0], h.run.shop[index]];
    });
    old.focus(); h.doc.focusCalls.length = 0;
    h.key(" ", old, {focus: false});
    assert.equal(h.counts.changes, 1); assert.equal(h.counts.writes, 1);
    assert.equal(h.doc.activeElement === h.doc.body, true, "focus remains on the document body"); assert.equal(h.doc.focusCalls.length, 0);
  });
}

for (const mode of ["lab", "campaign"]) for (const key of [" ", "Enter"])
  for (const origin of ["card", "library"])
    for (const attribute of ["hidden", "inert", "aria-hidden", "aria-disabled"]) {
      test(`${mode} ${JSON.stringify(key)} rejects an initially ${attribute} ${origin}`, t => {
        const h = fixture(t, mode), card = h.card();
        card.focus(); h.doc.focusCalls.length = 0;
        const inactive = origin === "card" ? card : h.doc.querySelector("#library-list");
        inactive.setAttribute(attribute, attribute.startsWith("aria-") ? "true" : "");
        const before = state(h);
        // Model an existing focus target becoming inactive before dispatch. No
        // browser focusing of hidden/inert content or native default is claimed.
        const event = h.key(key, card, {focus: false});
        assert.deepEqual(state(h), before);
        assert.equal(event.defaultPrevented, false);
        assert.equal(h.toasts.length, 0); assert.equal(h.doc.focusCalls.length, 0);
      });
    }
