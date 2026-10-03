import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
const { Editor } = await import(process.env.UI_RAID_QA_EDITOR_SOURCE || "../src/editor.js");
import C from "../src/document.js";
import R from "../src/run.js";
import V from "../src/components.js";

// Independent integration seam: production listener, app gating/callbacks,
// renderer, selection, transactions and geometry. This is not browser pixel,
// actual tab-navigation or assistive-technology certification.
const app = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const options = app.match(/^const editor = new UIRaidEditor.Editor\(\{[^]*?^\}\);/m)?.[0];
assert.ok(options, "actual app editor options must be available");
const wireEditor = transformSync(`${options}\nglobalThis.editor = editor;`, {loader: "ts", target: "es2022"}).code;
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
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return {left: 0, top: 0, width: 960, height: 680}; }
}

function fixture(t, entries = [["yt_like", 32, 32], ["yt_sub", 144, 32]]) {
  const old = Object.fromEntries(["document", "Element", "HTMLElement"].map(key => [key, globalThis[key]]));
  const listeners = new Map();
  const doc = {
    activeElement: null,
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    createElement(tag) { return new ElementAdapter(tag, this); },
    querySelector(selector) { return this.body.querySelector(selector); },
  };
  doc.body = doc.createElement("body"); doc.activeElement = doc.body;
  globalThis.document = doc; globalThis.Element = ElementAdapter; globalThis.HTMLElement = ElementAdapter;
  t.after(() => { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const host = doc.createElement("div"), overlay = doc.createElement("div"), modal = doc.createElement("dialog");
  host.id = "player-body"; overlay.id = "editor-overlay"; modal.id = "modal";
  doc.body.append(host, overlay, modal);
  const run = R.newRun("lab");
  // Use supported storage and acquisition routes, rather than inventing owned
  // IDs or overwriting the starting preset's board/economy.
  for (const item of run.owned) assert.equal(R.move(run, item.id, null, null), true);
  const ids = entries.map(([type, x, y, w, h]) => {
    const result = R.purchase(run, type); assert.equal(result.ok, true); assert.ok(result.item);
    assert.equal(R.move(run, result.item.id, x, y, w, h), true, `legal placement of ${type}`);
    return result.item.id;
  });
  assert.equal(R.validateRun(run), true);
  const counts = {side: 0, shop: 0, coach: 0, saves: 0, renders: 0, builds: 0};
  const context = vm.createContext({
    UIRaidEditor: {Editor}, run, battle: null, preview: false, view: "player", V, R,
    $: selector => doc.querySelector(selector),
    save: () => counts.saves++,
    render: () => { counts.renders++; paint(); },
    afterBuildChange: () => counts.builds++,
    renderSide: () => counts.side++, renderShop: () => counts.shop++, renderCoach: () => counts.coach++,
    toast() {},
  });
  vm.runInContext(wireEditor, context);
  const editor = context.editor;
  function paint() { V.render(host, run.owned, {side: "player", selected: [...editor.selection]}); editor.drawSelection(); }
  paint();
  function key(key, target = doc.body, props = {}) {
    if (props.focus !== false) target.focus();
    const event = {key, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...props};
    for (const listener of listeners.get("keydown") || []) listener(event);
    return event;
  }
  return {doc, host, overlay, modal, run, ids, editor, context, counts, paint, key,
    node: id => host.querySelector(`.web-node[data-id="${id}"]`),
    item: id => run.owned.find(item => item.id === id),
  };
}
const selected = h => [...h.editor.selection].sort();

// Removing activation handling must fail this test at selection, before any
// transaction shortcut is exercised.
test("QA: a real rendered wrapper enters selection through the installed key listener and app onSelect", t => {
  const h = fixture(t), id = h.ids[0], wrapper = h.node(id), before = structuredClone(h.run);
  assert.equal(wrapper.tabIndex, 0); assert.equal(wrapper.getAttribute("role"), "group");
  const control = wrapper.querySelector("button"); assert.ok(control); assert.equal(control.tabIndex, -1);
  h.editor.pending = {type: "ab_link"};
  assert.equal(h.key("Enter", wrapper).defaultPrevented, true);
  assert.deepEqual(selected(h), [id]); assert.equal(h.editor.pending, null);
  assert.equal(wrapper.classList.contains("is-selected"), true);
  assert.ok(h.overlay.querySelector(".selection-box"));
  assert.deepEqual([h.counts.side, h.counts.shop, h.counts.coach], [1, 1, 1]);
  assert.deepEqual([h.counts.saves, h.counts.renders, h.counts.builds], [0, 0, 0]);
  assert.deepEqual(h.run, before); assert.deepEqual(h.editor.history, []); assert.deepEqual(h.editor.future, []);
  assert.equal(h.doc.activeElement, wrapper, "selection callback must not rebuild or displace the focused board wrapper");
});

test("QA: Shift activation extends and toggles actual selection while held Space cannot oscillate it", t => {
  const h = fixture(t), [a, b] = h.ids;
  h.key("Enter", h.node(a));
  h.key(" ", h.node(b), {shiftKey: true});
  assert.deepEqual(selected(h), [a, b].sort());
  assert.deepEqual([h.counts.side, h.counts.shop, h.counts.coach], [2, 2, 2]);
  assert.ok(h.node(a).classList.contains("is-selected")); assert.ok(h.node(b).classList.contains("is-selected"));
  assert.equal(h.overlay.querySelector(".selection-label").textContent, "2 個のUI");
  const calls = h.counts.side;
  for (let i = 0; i < 4; i++) assert.equal(h.key(" ", h.node(b), {shiftKey: true, repeat: true}).defaultPrevented, true);
  assert.equal(h.counts.side, calls); assert.deepEqual(selected(h), [a, b].sort());
  h.key("Enter", h.node(a)); assert.deepEqual(selected(h), [a, b].sort(), "ordinary activation preserves the existing multiselection");
  h.key("Enter", h.node(a), {shiftKey: true}); assert.deepEqual(selected(h), [b]);
  assert.equal(h.node(a).classList.contains("is-selected"), false); assert.equal(h.node(b).classList.contains("is-selected"), true);
  h.key(" ", h.node(b), {shiftKey: true}); assert.deepEqual(selected(h), []);
  assert.equal(h.overlay.querySelector(".selection-box"), null); assert.equal(h.node(b).classList.contains("is-selected"), false);
});

test("QA: keyboard-selected real composition reaches group, movement, stash and undo without changing ownership or economy", t => {
  const h = fixture(t), [a, b] = h.ids, before = structuredClone(h.run);
  assert.ok(C.analyze(h.run.owned).groups.some(group => group.kind === "button-group" && group.items.includes(a) && group.items.includes(b)));
  h.key("Enter", h.node(a)); h.key("g", h.node(a));
  assert.deepEqual(selected(h), [a, b].sort());
  h.key("ArrowRight", h.node(a));
  for (const id of [a, b]) assert.equal(h.item(id).x, before.owned.find(item => item.id === id).x + 1);
  h.key("ArrowDown", h.node(a), {shiftKey: true});
  for (const id of [a, b]) assert.equal(h.item(id).y, before.owned.find(item => item.id === id).y + 10);
  const moved = structuredClone(h.run);
  h.key("Delete", h.node(a));
  for (const id of [a, b]) assert.deepEqual([h.item(id).x, h.item(id).y], [null, null]);
  assert.deepEqual(selected(h), []); assert.equal(h.run.owned.length, before.owned.length); assert.equal(h.run.cash, before.cash);
  assert.equal(h.editor.history.length, 3); assert.equal(h.counts.saves, 3);
  h.key("z", h.doc.body, {ctrlKey: true}); assert.deepEqual(h.run, moved);
  h.key("z", h.doc.body, {ctrlKey: true}); h.key("z", h.doc.body, {ctrlKey: true}); assert.deepEqual(h.run, before);
  h.key("y", h.doc.body, {ctrlKey: true}); h.key("Z", h.doc.body, {metaKey: true, shiftKey: true}); assert.deepEqual(h.run, moved);
  assert.equal(R.validateRun(h.run), true);
});

test("QA: a rendered child wrapper selects itself and parent grouping carries nested legal controls through stash and undo", t => {
  const h = fixture(t, [["gov_form", 32, 200, 400, 250], ["gov_submit", 48, 300]]), [parent, child] = h.ids;
  assert.equal(C.analyze(h.run.owned).parents[child], parent);
  assert.equal(h.node(child).parentElement.closest(".web-node"), h.node(parent));
  h.key("Enter", h.node(child)); assert.deepEqual(selected(h), [child]);
  h.key(" ", h.node(parent)); assert.deepEqual(selected(h), [parent]);
  h.key("G", h.node(parent)); assert.deepEqual(selected(h), [parent, child].sort());
  const before = structuredClone(h.run);
  h.key("ArrowRight", h.node(parent)); assert.equal(h.item(parent).x, 33); assert.equal(h.item(child).x, 49);
  h.key("Backspace", h.node(parent)); assert.equal(h.item(parent).x, null); assert.equal(h.item(child).x, null);
  h.key("z", h.doc.body, {ctrlKey: true}); h.key("z", h.doc.body, {ctrlKey: true}); assert.deepEqual(h.run, before);
});

test("QA: selection alone preserves a real undone move and its redo branch", t => {
  const h = fixture(t), [a, b] = h.ids;
  h.key("Enter", h.node(a)); h.key("ArrowDown", h.node(a)); const moved = structuredClone(h.run);
  h.key("z", h.doc.body, {ctrlKey: true});
  const before = structuredClone(h.run), future = structuredClone(h.editor.future), history = structuredClone(h.editor.history), saves = h.counts.saves;
  h.key(" ", h.node(b));
  assert.deepEqual(selected(h), [b]); assert.deepEqual(h.run, before); assert.deepEqual(h.editor.future, future); assert.deepEqual(h.editor.history, history); assert.equal(h.counts.saves, saves);
  h.key("y", h.doc.body, {ctrlKey: true}); assert.deepEqual(h.run, moved);
});

test("QA: actual app disabled, battle, preview, enemy and dialog boundaries ignore activation and resume in editing", t => {
  const h = fixture(t), id = h.ids[0], before = structuredClone(h.run);
  const blockers = [
    [() => {h.context.battle = {};}, () => {h.context.battle = null;}],
    [() => {h.context.preview = true;}, () => {h.context.preview = false;}],
    [() => {h.context.view = "enemy";}, () => {h.context.view = "player";}],
    [() => {h.run.phase = "battle";}, () => {h.run.phase = "build";}],
    [() => {h.modal.open = true;}, () => {h.modal.open = false;}],
  ];
  for (const [block, unblock] of blockers) {
    block(); assert.equal(h.key("Enter", h.node(id)).defaultPrevented, false); assert.equal(h.key(" ", h.node(id)).defaultPrevented, false);
    assert.deepEqual(selected(h), []); unblock();
  }
  const otherDialog = h.doc.createElement("dialog"); otherDialog.open = true; h.doc.body.append(otherDialog);
  assert.equal(h.key("Enter", h.node(id)).defaultPrevented, false); assert.deepEqual(selected(h), []); otherDialog.open = false;
  assert.deepEqual(h.run, before); assert.equal(h.counts.side, 0);
  h.key("Enter", h.node(id)); assert.deepEqual(selected(h), [id]);
});

test("QA: foreign, enemy, thumbnail, unfocused and no-longer-placed rendered wrappers cannot become selection", t => {
  const h = fixture(t), id = h.ids[0];
  for (const side of ["enemy", "thumb", "player"]) {
    const foreign = h.doc.createElement("div"); h.doc.body.append(foreign); V.render(foreign, h.run.owned, {side});
    const wrapper = foreign.querySelector(`.web-node[data-id="${id}"]`);
    assert.equal(h.key("Enter", wrapper).defaultPrevented, false); assert.deepEqual(selected(h), []);
  }
  for (const side of ["enemy", "thumb"]) {
    const wrapper = V.create(h.item(id), {side}); h.host.append(wrapper);
    assert.equal(h.key("Enter", wrapper).defaultPrevented, false); assert.deepEqual(selected(h), []);
  }
  const wrapper = h.node(id);
  h.doc.body.focus();
  assert.equal(h.key("Enter", wrapper, {focus: false}).defaultPrevented, false); assert.deepEqual(selected(h), []);
  const extra = R.purchase(h.run, "ab_link"); assert.equal(extra.ok, true); assert.ok(extra.item);
  const unowned = V.create({...extra.item, id: "not-owned"}); h.host.append(unowned);
  assert.equal(h.key("Enter", unowned).defaultPrevented, false); assert.deepEqual(selected(h), []);
  assert.equal(R.move(h.run, id, null, null), true);
  assert.equal(h.key("Enter", wrapper).defaultPrevented, false); assert.deepEqual(selected(h), []);
});

test("QA: actual rendered native controls and editable descendants retain their Enter and Space defaults", t => {
  const h = fixture(t, [["yt_like", 32, 32], ["go_search", 32, 100], ["go_translate", 32, 200], ["ab_link", 32, 300]]);
  const controls = h.host.querySelectorAll("button,input,select,a"); assert.ok(controls.length >= 4);
  for (const control of controls) {
    assert.equal(control.tabIndex, -1);
    for (const key of ["Enter", " "]) { assert.equal(h.key(key, control).defaultPrevented, false); assert.deepEqual(selected(h), []); }
  }
  for (const value of ["", "true", "plaintext-only"]) {
    const editable = h.doc.createElement("div"), span = h.doc.createElement("span"); editable.setAttribute("contenteditable", value); editable.append(span); h.node(h.ids[0]).append(editable);
    for (const target of [editable, span]) for (const key of ["Enter", " "]) {
      assert.equal(target.isContentEditable, true); assert.equal(h.key(key, target).defaultPrevented, false); assert.deepEqual(selected(h), []);
    }
  }
  for (const flag of ["ctrlKey", "metaKey", "altKey", "isComposing"]) for (const key of ["Enter", " "]) {
    assert.equal(h.key(key, h.node(h.ids[0]), {[flag]: true}).defaultPrevented, false); assert.deepEqual(selected(h), []);
  }
  for (const value of ["", "plaintext-only"]) {
    h.host.setAttribute("contenteditable", value);
    assert.equal(h.node(h.ids[0]).isContentEditable, true);
    for (const key of ["Enter", " "]) {
      assert.equal(h.key(key, h.node(h.ids[0])).defaultPrevented, false); assert.deepEqual(selected(h), []);
    }
  }
  h.host.setAttribute("contenteditable", "false");
  h.key("Enter", h.node(h.ids[0])); assert.deepEqual(selected(h), [h.ids[0]]);
});
