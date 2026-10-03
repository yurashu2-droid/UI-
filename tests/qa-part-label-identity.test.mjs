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
const {default: V, setAppearanceRenderer} = await import(process.env.UI_RAID_QA_COMPONENTS_SOURCE || "../src/components.js");
import { createRunPersistence } from "../src/persistence.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { createFixtureRaid, registerRaidBlueprint, applyRaidAppearance } from "../src/raid/index.js";

// DOM-boundary QA, not a browser, pixel, Tab-navigation or screen-reader claim.
// Real app label change/save/editor callbacks/renderFrames/frameMarkup/preview,
// Editor transactions and recursive Components rendering run unchanged.
// Removing wrapper identity, app save/render, or recursive child identity must
// fail these tests; acquired source text may not replace player-owned identity.
const app = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const extract = name => {
  const found = app.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(found, `production ${name} function`); return found;
};
const options = app.match(/^const editor = new UIRaidEditor.Editor\([^]*?^\}\);/m)?.[0];
const change = app.match(/^document.addEventListener\("change",[^]*?^\}\);/m)?.[0];
assert.ok(options); assert.ok(change);
const compiled = transformSync(`${["save", "frameMarkup", "renderFrames", "previewAction"].map(extract).join("\n")}\n${options}\n${change}\nglobalThis.editor = editor;`, {loader: "ts", target: "es2022"}).code;
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
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return {left: 0, top: 0, width: 960, height: 680}; }
}


function fixture(t, entries) {
  const globals = ["document", "Element", "HTMLElement", "HTMLInputElement", "HTMLSelectElement"];
  const old = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const listeners = new Map();
  const doc = {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    createElement(tag) { return new ElementAdapter(tag, this); },
    querySelector(selector) { return this.body.querySelector(selector); },
  };
  doc.body = doc.createElement("body"); doc.activeElement = doc.body;
  globalThis.document = doc;
  for (const name of globals.slice(1)) globalThis[name] = ElementAdapter;
  t.after(() => {
    setAppearanceRenderer(null);
    for (const [name, descriptor] of old) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
  });
  for (const id of ["player-frame", "enemy-frame", "page-window", "scene", "traffic-hub", "modal"]) {
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
  const values = new Map(), counts = {build: 0, pulse: 0};
  const persistence = createRunPersistence({getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}, "qa-identity-");
  let context;
  context = vm.createContext({
    UIRaidEditor: {Editor}, run, R, V, C, D, memory: {}, runPersistence: persistence,
    clone: structuredClone, preview: false, battle: null, view: "self", storyActive: false, storySession: null,
    profileStore: null, saveOK: true, saveProblem: "", document: doc,
    Element: ElementAdapter, HTMLInputElement: ElementAdapter, HTMLSelectElement: ElementAdapter,
    $: selector => doc.querySelector(selector), render() { context.renderFrames(); }, renderStorageNotice() {},
    renderSide() {}, renderShop() {}, renderCoach() {}, afterBuildChange() { counts.build++; },
    toast() {}, previewCatalogueAction, fx: {pulse() { counts.pulse++; }},
    appOpponent: () => ({faction: "google", pageName: "Other page", address: "local://other", decor: []}),
    appEnemyBoard: () => [], ENEMY_ERA: {}, labPressureCapacity: () => 99999,
    pressureMeterMarkup: () => "", adminDock: () => "", scheduleFit() {}, esc: V.esc, icon: V.icon,
  });
  vm.runInContext(compiled, context);
  context.renderFrames();
  return {doc, ids, context, editor: context.editor, counts, values,
    item: id => context.run.owned.find(item => item.id === id),
    node: id => doc.querySelector(`#player-body .web-node[data-id="${id}"]`),
    stored: () => persistence.load("lab"),
    change(label) { const input = doc.createElement("input"); input.id = "part-label"; input.value = label; for (const listener of listeners.get("change")) listener({target: input}); },
    key(key, target = doc.body, props = {}) {
      target.focus();
      const event = {key, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...props};
      for (const listener of listeners.get("keydown") || []) listener(event);
      return event;
    },
  };
}
const identity = (node, want) => {
  assert.equal(node.getAttribute("aria-label"), want);
  assert.equal(node.title, want);
  assert.equal(node.getAttribute("role"), "group");
  assert.equal(node.tabIndex, 0);
};

test("QA: real app nested label edits update only selected wrapper identity and save raw text through keyboard undo/redo", t => {
  const h = fixture(t, [["gov_form", 32, 200, 400, 250], ["gov_submit", 48, 300]]), [parent, child] = h.ids;
  assert.equal(C.analyze(h.context.run.owned).parents[child], parent);
  assert.equal(h.node(child).parentElement.closest(".web-node"), h.node(parent));
  const before = structuredClone(h.context.run), parentName = D.PARTS.gov_form.name, childName = D.PARTS.gov_submit.name;
  assert.equal(h.key("Enter", h.node(child)).defaultPrevented, true);
  assert.deepEqual([...h.editor.selection], [child]);
  const label = `  <img src=x onerror="bad()">\t&\u202e 子  `;
  h.change(label);
  identity(h.node(child), `<img src=x onerror="bad()"> & 子（${childName}）`);
  identity(h.node(parent), parentName);
  assert.equal(h.item(child).label, label);
  assert.equal(h.stored().status, "loaded");
  assert.equal(h.stored().run.owned.find(item => item.id === child).label, label);
  assert.equal(h.node(child).querySelector("img"), null);
  assert.deepEqual(h.context.run, {...before, owned: before.owned.map(item => item.id === child ? {...item, label} : item)});
  assert.equal(h.node(child).querySelector("button").tabIndex, -1);
  h.key("z", h.doc.body, {ctrlKey: true});
  identity(h.node(child), childName); assert.deepEqual(h.context.run, before);
  assert.equal(h.stored().run.owned.find(item => item.id === child).label, "");
  h.key("y", h.doc.body, {ctrlKey: true});
  identity(h.node(child), `<img src=x onerror="bad()"> & 子（${childName}）`);
  assert.equal(h.stored().run.owned.find(item => item.id === child).label, label);
  assert.equal(h.counts.build, 3);
  for (const raw of [" \t\n\u2066 ", childName]) {
    h.key(" ", h.node(child)); h.change(raw);
    identity(h.node(child), childName);
    assert.equal(h.stored().run.owned.find(item => item.id === child).label, raw);
  }
});

test("QA: unsupported visible label gains wrapper identity while repeated native preview keeps names and persistent state intact", t => {
  const h = fixture(t, [["yt_like", 32, 32]]), [id] = h.ids;
  h.key("Enter", h.node(id)); h.change("Favourite counter");
  identity(h.node(id), `Favourite counter（${D.PARTS.yt_like.name}）`);
  assert.equal(h.node(id).querySelector(".like-value").textContent, "128");
  const runBefore = JSON.stringify(h.context.run), savedBefore = [...h.values], historyBefore = h.editor.history.length;
  h.context.preview = true; h.context.renderFrames();
  const node = h.node(id), control = node.querySelector("button"), beforeName = node.getAttribute("aria-label");
  assert.equal(control.tabIndex, 0);
  for (let n = 0; n < 3; n++) {
    h.context.previewAction({target: control, preventDefault() { throw Error("not a link"); }});
    assert.equal(node.querySelector(".like-value").textContent, String(129 + n));
    assert.equal(h.node(id), node); assert.equal(node.querySelector("button"), control);
    identity(node, beforeName);
  }
  h.change("blocked in preview"); h.key("Enter", node, {shiftKey: true});
  assert.deepEqual([...h.editor.selection], [id]);
  h.context.battle = {}; h.context.previewAction({target: control});
  assert.equal(node.querySelector(".like-value").textContent, "131");
  assert.equal(JSON.stringify(h.context.run), runBefore); assert.deepEqual([...h.values], savedBefore);
  assert.equal(h.editor.history.length, historyBefore);
  h.context.battle = null; h.context.preview = false; h.context.renderFrames();
  identity(h.node(id), beforeName); assert.equal(h.node(id).querySelector("button").tabIndex, -1);
});

test("QA: real appearance hook and repeated repaint preserve edited video wrapper identity above frozen source art", async t => {
  const h = fixture(t, [["yt_play", 24, 24, 240, 144]]), [id] = h.ids;
  const blueprint = await createFixtureRaid("archive"), component = blueprint.components[0];
  assert.equal((await registerRaidBlueprint(blueprint)).ok, true);
  Object.assign(h.item(id), {appearanceId: component.appearanceId, provenanceId: blueprint.captureId});
  setAppearanceRenderer(applyRaidAppearance);
  h.context.renderFrames();
  h.key("Enter", h.node(id));
  const label = "長".repeat(80), expected = `${label}（${D.PARTS.yt_play.name}）`;
  h.change(label);
  identity(h.node(id), expected);
  assert.equal(h.stored().run.owned.find(item => item.id === id).label, label);
  const before = JSON.stringify(h.context.run), saved = [...h.values];
  for (let i = 0; i < 3; i++) {
    const node = h.node(id), play = node.querySelector(".video-play"), title = node.querySelector(".video-copy strong");
    assert.equal(play.getAttribute("aria-label"), "動画を再生");
    assert.equal(title.textContent, label);
    assert.equal(applyRaidAppearance(node, h.item(id)), true);
    assert.equal(node.querySelector(".video-play"), play); assert.equal(node.querySelector(".video-copy strong"), title);
    identity(node, expected);
    assert.equal(node.querySelectorAll(":scope > .raid-skin").length, 1);
    const skin = node.querySelector(".raid-skin"); assert.equal(skin.getAttribute("aria-hidden"), "true");
    assert.ok(!skin.textContent.includes(label), "source art is frozen, not rewritten from the edited label");
    h.context.renderFrames(); identity(h.node(id), expected);
  }
  h.change("長".repeat(81));
  assert.equal(JSON.stringify(h.context.run), before); assert.deepEqual([...h.values], saved);
  h.key("z", h.doc.body, {ctrlKey: true}); identity(h.node(id), D.PARTS.yt_play.name);
  assert.equal(h.node(id).querySelectorAll(":scope > .raid-skin").length, 1);
  h.key("y", h.doc.body, {ctrlKey: true}); identity(h.node(id), expected);
  assert.equal(h.node(id).querySelector(".video-play").getAttribute("aria-label"), "動画を再生");
});
