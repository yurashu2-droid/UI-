import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import postcss from "postcss";
import { Editor } from "../src/editor.js";
import C from "../src/document.js";
import R from "../src/run.js";
const {default: V, setAppearanceRenderer} = await import(process.env.UI_RAID_QA_COMPONENTS_SOURCE || "../src/components.js");
import { createRunPersistence } from "../src/persistence.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { createFixtureRaid, registerRaidBlueprint, applyRaidAppearance } from "../src/raid/index.js";

// Actual application change listener, editor callbacks, save, rendering and
// preview handler run against a parse5-backed DOM boundary. These checks do not
// measure browser pixels, layout, tab-navigation or screen-reader output.
// Mutations caught: missing render/save after edits, preview writing persistent
// data or toggling while disabled, replacing controls while applying a skin,
// and a custom title forcing the acquired source artwork's caption visible.
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const extract = name => {
  const found = app.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(found, `production ${name} function`); return found;
};
const options = app.match(/^const editor = new UIRaidEditor.Editor\([^]*?^\}\);/m)?.[0];
const change = app.match(/^document.addEventListener\("change",[^]*?^\}\);/m)?.[0];
assert.ok(options); assert.ok(change);
const compiled = transformSync(`${extract("save")}\n${extract("previewAction")}\n${options}\n${change}\nglobalThis.editor = editor;`, {loader: "ts", target: "es2022"}).code;
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


function fixture(t, type) {
  const old = Object.fromEntries(["document", "Element", "HTMLElement", "HTMLInputElement", "HTMLSelectElement"].map(key => [key, globalThis[key]]));
  const listeners = new Map();
  const doc = {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    createElement(tag) { return new ElementAdapter(tag, this); },
    querySelector(selector) { return this.body.querySelector(selector); },
  };
  doc.body = doc.createElement("body");
  globalThis.document = doc;
  for (const key of ["Element", "HTMLElement", "HTMLInputElement", "HTMLSelectElement"]) globalThis[key] = ElementAdapter;
  t.after(() => {
    setAppearanceRenderer(null);
    for (const [key, value] of Object.entries(old)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
  });
  const paper = doc.createElement("section"), host = doc.createElement("div"), modal = doc.createElement("dialog");
  paper.className = "browser-paper"; host.id = "player-body"; modal.id = "modal";
  paper.append(host); doc.body.append(paper, modal);
  const run = R.newRun("lab");
  for (const item of run.owned) assert.equal(R.move(run, item.id, null, null), true);
  const bought = R.purchase(run, type); assert.equal(bought.ok, true);
  assert.equal(R.move(run, bought.item.id, 24, 24), true);
  const id = bought.item.id, values = new Map(), toasts = [], calls = {render: 0, build: 0, pulse: 0};
  const persistence = createRunPersistence({getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}, "qa-video-");
  let context;
  const paint = () => { calls.render++; V.render(host, context.run.owned, {side: "player", interactive: context.preview}); };
  context = vm.createContext({
    UIRaidEditor: {Editor}, run, R, V, C, memory: {}, runPersistence: persistence,
    clone: structuredClone, preview: false, battle: null, view: "self", storyActive: false, storySession: null,
    profileStore: null, saveOK: true, saveProblem: "", document: doc,
    Element: ElementAdapter, HTMLInputElement: ElementAdapter, HTMLSelectElement: ElementAdapter,
    $: selector => doc.querySelector(selector), render: paint, renderStorageNotice() {},
    renderSide() {}, renderShop() {}, renderCoach() {}, afterBuildChange() { calls.build++; },
    toast: message => toasts.push(message), previewCatalogueAction, fx: {pulse() { calls.pulse++; }},
  });
  vm.runInContext(compiled, context); paint(); context.editor.select([id]);
  return {context, editor: context.editor, host, doc, id, values, toasts, calls, paint,
    item: () => context.run.owned.find(item => item.id === id),
    node: () => host.querySelector(`[data-id="${id}"]`),
    stored: () => persistence.load("lab"),
    change(label) { const input = doc.createElement("input"); input.id = "part-label"; input.value = label; for (const callback of listeners.get("change")) callback({target: input}); },
    clickPlay() { context.previewAction({target: this.node().querySelector(".video-play"), preventDefault() { throw new Error("button is not a link"); }}); },
  };
}

for (const type of ["yt_play", "yt_embed"]) {
  test(`QA: real app ${type} label change persists and renders hostile 80-unit title through undo/redo`, t => {
    const h = fixture(t, type), baseline = h.node().querySelector(".video-copy strong").textContent;
    const prefix = `<img src=x onerror="bad()">&'資料`;
    const label = prefix + "長".repeat(80 - prefix.length);
    assert.equal(label.length, 80);
    h.change(label);
    assert.equal(h.item().label, label);
    assert.equal(h.context.saveOK, true, h.context.saveProblem);
    assert.equal(h.stored().status, "loaded");
    assert.equal(h.stored().run.owned.find(item => item.id === h.id).label, label);
    const title = () => h.node().querySelector(".video-copy strong");
    assert.equal(title().textContent, label);
    assert.equal(title().title, label);
    assert.equal(h.node().querySelector("img"), null);
    assert.equal(h.node().querySelector("script"), null);
    const before = JSON.stringify(h.context.run);
    h.change("超".repeat(81));
    assert.equal(JSON.stringify(h.context.run), before, "existing 80-unit editor limit must reject oversized input atomically");
    h.editor.undo();
    assert.equal(h.item().label, ""); assert.equal(title().textContent, baseline);
    assert.equal(h.stored().run.owned.find(item => item.id === h.id).label, "");
    h.editor.redo();
    assert.equal(title().textContent, label); assert.equal(title().title, label);
    assert.equal(h.stored().run.owned.find(item => item.id === h.id).label, label);
    assert.equal(h.calls.build, 3, "only successful edit, undo, redo notify build");
    h.editor.select([h.id]); h.change("  \t\n");
    assert.equal(h.item().label, "  \t\n", "renderer must not trim persisted data");
    assert.equal(title().textContent, baseline);
    assert.equal(h.stored().run.owned.find(item => item.id === h.id).label, "  \t\n");
  });

  test(`QA: real app ${type} preview repeatedly toggles only local presentation and respects editor/battle gates`, t => {
    const h = fixture(t, type);
    h.change("An editable local video");
    const runBefore = JSON.stringify(h.context.run), savedBefore = [...h.values], historyBefore = h.editor.history.length;
    h.clickPlay(); assert.equal(h.node().classList.contains("video-paused"), false, "edit mode ignores preview action");
    h.context.preview = true; h.paint();
    const title = h.node().querySelector(".video-copy strong"), play = h.node().querySelector(".video-play");
    assert.equal(play.tabIndex, 0);
    for (let n = 0; n < 6; n++) {
      h.clickPlay(); assert.equal(h.node().classList.contains("video-paused"), n % 2 === 0);
      assert.equal(h.node().querySelector(".video-copy strong"), title);
      assert.equal(title.textContent, "An editable local video");
      assert.equal(title.title, "An editable local video");
      assert.equal(h.node().querySelector(".video-play"), play);
    }
    h.change("cannot edit in preview"); assert.equal(h.item().label, "An editable local video");
    h.context.battle = {}; h.clickPlay(); assert.equal(h.node().classList.contains("video-paused"), false);
    h.context.battle = null; h.context.preview = false; h.paint();
    assert.equal(h.node().querySelector(".video-play").tabIndex, -1);
    assert.equal(JSON.stringify(h.context.run), runBefore);
    assert.deepEqual([...h.values], savedBefore);
    assert.equal(h.editor.history.length, historyBefore);
    assert.equal(h.calls.pulse, 6);
  });

  test(`QA: acquired ${type} appearance retains its original native title and live control identities`, async t => {
    const h = fixture(t, type), blueprint = await createFixtureRaid("archive");
    await registerRaidBlueprint(blueprint);
    h.change("Title belongs under the source artwork");
    const host = h.node(), root = host.querySelector(".native-video"), title = host.querySelector(".video-copy strong"), play = host.querySelector(".video-play"), caption = host.querySelector(".video-caption");
    const item = {...h.item(), appearanceId: blueprint.components[0].appearanceId};
    for (let n = 0; n < 2; n++) {
      assert.equal(applyRaidAppearance(host, item), true);
      assert.equal(host.querySelector(".native-video"), root);
      assert.equal(host.querySelector(".video-copy strong"), title);
      assert.equal(host.querySelector(".video-play"), play);
      assert.equal(host.querySelector(".video-caption"), caption);
      assert.equal(root.dataset.raidLive, "video");
      assert.equal(root.classList.contains("raid-live-layer"), true);
      assert.equal(host.querySelectorAll(":scope > .raid-skin").length, 1);
      assert.equal(host.querySelector(".raid-skin").getAttribute("aria-hidden"), "true");
    }
    h.context.preview = true; h.clickPlay(); h.clickPlay();
    assert.equal(host.classList.contains("video-paused"), false);
    assert.equal(title.textContent, item.label);
    assert.equal(title.title, item.label);
  });
}


test("QA: the entry point loads custom-title CSS, and acquired source artwork keeps title descendants hidden (source cascade only)", t => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const imports = [...main.matchAll(/^import "(\.\/styles\/[^"\n]+\.css)";/gm)].map(match => match[1]);
  const sheets = [];
  function loadSheet(url, ancestors = []) {
    assert.ok(!ancestors.includes(url.href), "no stylesheet import cycle");
    const css = postcss.parse(readFileSync(url, "utf8"));
    css.walkAtRules("import", rule => {
      const local = rule.params.match(/^["']([^"']+)["']$/)?.[1];
      assert.ok(local?.startsWith("."), "review any newly introduced remote or conditional stylesheet import");
      loadSheet(new URL(local, url), [...ancestors, url.href]);
    });
    sheets.push({url, css});
  }
  for (const path of imports) loadSheet(new URL(`../src/${path.slice(2)}`, import.meta.url));
  const loaded = sheets.map(sheet => sheet.url.pathname);
  assert.equal(loaded.filter(path => path.endsWith("/video-titles.css")).length, 1, "the containment stylesheet must actually be imported exactly once");
  assert.ok(loaded.findIndex(path => path.endsWith("/game.css")) < loaded.findIndex(path => path.endsWith("/video-titles.css")));
  assert.ok(loaded.findIndex(path => path.endsWith("/video-titles.css")) < loaded.findIndex(path => path.endsWith("/raid.css")));
  const h = fixture(t, "yt_play"); h.change("Hidden behind preserved source artwork");
  const root = h.node().querySelector(".native-video"), copy = root.querySelector(".video-copy"), title = copy.querySelector("strong"), small = copy.querySelector("small");
  root.classList.add("raid-live-layer"); root.dataset.raidLive = "video";
  const rules = [];
  for (const {css} of sheets) {
    css.walkRules(rule => {
      if (!/video-copy|has-custom-title|raid-live-layer/.test(rule.selector)) return;
      rule.walkDecls("visibility", decl => {
        for (const selector of rule.selectors) {
          if (/\[data-raid-live=["'](?:search|checkbox|select|progress|button)["']\]/.test(selector)) continue;
          // Relevant title visibility selectors currently use only classes,
          // attributes, descendant and child combinators. Refuse silent expansion.
          assert.doesNotMatch(selector, /:(?!scope)/);
          const specificity = [(selector.match(/#[\w-]+/g) ?? []).length, (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length, (selector.replace(/\.[\w-]+|\[[^\]]+\]/g, "").match(/\b[a-z][\w-]*\b/g) ?? []).length];
          rules.push({selector, value: decl.value, important: !!decl.important, specificity});
        }
      });
    });
  }
  function visibility(node) {
    const candidates = rules.map((rule, order) => ({...rule, order})).filter(rule => node.matches(rule.selector));
    candidates.sort((a, b) => Number(a.important) - Number(b.important) || a.specificity[0] - b.specificity[0] || a.specificity[1] - b.specificity[1] || a.specificity[2] - b.specificity[2] || a.order - b.order);
    const own = candidates.at(-1)?.value;
    return own && own !== "inherit" ? own : node.parentElement ? visibility(node.parentElement) : "visible";
  }
  for (const node of [copy, small, title]) assert.equal(visibility(node), "hidden", "source art intentionally hides native copy and descendants");
  assert.equal(visibility(root.querySelector(".video-play")), "visible", "actual native play control stays available above source art");
  root.classList.remove("raid-live-layer"); delete root.dataset.raidLive;
  assert.equal(visibility(title), "visible", "custom title visibility is inherited normally without a source appearance");
});
