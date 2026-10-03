import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import V from "../src/components.js";
import UIRaidEditor from "../src/editor.js";
import { createRunPersistence } from "../src/persistence.js";
import { createLabBattleController } from "../src/lab-audience-control.js";
import * as appGuidance from "../src/app-guidance.js";
import * as navigation from "../src/navigation-guidance.js";
import * as conversion from "../src/conversion-guidance.js";
import * as incomeRoutes from "../src/income-route-guidance.js";
import * as containment from "../src/containment-guidance.js";
import * as placement from "../src/sidechannel-placement-guide.js";
import * as redditPlacement from "../src/reddit-sidebar-placement-guide.js";
import { targetCaption } from "../src/catalog/target-caption.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// This runs the actual host renderer, delegated click listener, Editor transaction
// and save bridge. Only DOM mechanics and unrelated panel paint are adapted.
// Removing a real binding, freshness/edit gate, commit/save call or focus guard
// must break these assertions. This is source/DOM evidence, not browser or AT QA.
const app = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const extract = name => {
  const source = app.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(source, `production ${name}`);
  return source;
};
const rules = app.slice(app.indexOf("const KIND:"), app.indexOf("function shortDesc("));
const options = app.match(/^const editor = new UIRaidEditor.Editor\([^]*?^\}\);/m)?.[0];
const click = app.match(/^document.addEventListener\("click",[^]*?^\}\);/m)?.[0];
assert.ok(options); assert.ok(click);
assert.ok(app.includes("function setRedditSidebarPlacementFromControl("), "production sidebar handler exists");
const placementHelpers = [...app.matchAll(/^function ((?:\w*Sidechannel\w*|sidechannel\w*|\w*RedditSidebar\w*|redditSidebar\w*))\(/gm)].map(([, name]) => extract(name));
const compiled = transformSync([
  rules, ...placementHelpers,
  ...["incomeRouteEditingAllowed", "save", "renderStorageNotice", "labPressureCapacity", "selectionCard", "renderSide"].map(extract),
  options, click, "globalThis.editor = editor;",
].join("\n"), { loader: "ts", target: "es2022" }).code;

// Add only the ID, dialog and focus semantics needed at this host boundary.
// Parsing, selection, attributes and tree replacement reuse the shared adapter.
class HostElement extends ElementAdapter {
  get id() { return this.getAttribute("id") ?? ""; }
  set id(value) { this.setAttribute("id", value); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(value) { value ? this.setAttribute("disabled", "") : this.attrs.delete("disabled"); }
  get open() { return this.hasAttribute("open"); }
  set open(value) { value ? this.setAttribute("open", "") : this.attrs.delete("open"); }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  get isConnected() { return this.ownerDocument.body.contains(this); }
  matches(selector) {
    return selector.split(",").some(part => {
      if ([...part.matchAll(/#([\w-]+)/g)].some(([, id]) => this.id !== id)) return false;
      return super.matches(part.replace(/#[\w-]+/g, ""));
    });
  }
  replaceChildren(...children) {
    if (this.children.some(child => child.contains(this.ownerDocument.activeElement)))
      this.ownerDocument.activeElement = this.ownerDocument.body;
    super.replaceChildren(...children);
  }
  focus(options) {
    this.ownerDocument.focusCalls.push({ node: this, options });
    if (this.isConnected && !this.disabled) this.ownerDocument.activeElement = this;
  }
}
class ButtonElement extends HostElement {}
class InputElement extends HostElement {}
class SelectElement extends HostElement {}

function host(t) {
  const listeners = new Map();
  const doc = {
    focusCalls: [],
    addEventListener(type, fn) { const list = listeners.get(type) ?? []; list.push(fn); listeners.set(type, list); },
    createElement(tag) {
      const Type = { button: ButtonElement, input: InputElement, select: SelectElement }[tag] ?? HostElement;
      return new Type(this, tag);
    },
    querySelector(selector) { return this.body.querySelector(selector); },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
  };
  doc.body = doc.createElement("body"); doc.activeElement = doc.body;
  const globals = { document: doc, Element: HostElement, HTMLElement: HostElement,
    HTMLButtonElement: ButtonElement, HTMLInputElement: InputElement, HTMLSelectElement: SelectElement };
  const previous = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, globals);
  t.after(() => { for (const [name, old] of previous) old ? Object.defineProperty(globalThis, name, old) : delete globalThis[name]; });
  for (const id of ["inspector", "undo-button", "redo-button", "modal", "player-body"]) {
    const node = doc.createElement(id === "modal" ? "dialog" : id.endsWith("-button") ? "button" : "section"); node.id = id; doc.body.append(node);
  }
  const run = R.newRun("lab", "lesson_reddit_sidebar");
  const values = new Map(), writes = [], toasts = [];
  const storage = { getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); writes.push([key, value]); } };
  let c;
  c = vm.createContext({
    ...globals, ...appGuidance, ...navigation, ...conversion, ...incomeRoutes, ...containment, ...placement, ...redditPlacement,
    C, D, E, R, P: D.PARTS, UIRaidEditor, V: { ...V, render() {} }, targetCaption,
    run, storyActive: false, storySession: null, battle: null, preview: false, settling: false,
    pendingStorySettlement: null, view: "self", incomeRouteBinding: null, sidechannelPlacementBindings: new Map(), redditSidebarPlacementBindings: new WeakMap(),
    memory: {}, profileStore: null, profileProblem: "", profileWrites: Promise.resolve(),
    runPersistence: createRunPersistence(storage, "reddit-sidebar-"), saveOK: true, saveProblem: "",
    clone: structuredClone, labBattleController: createLabBattleController(),
    $: selector => doc.querySelector(selector), esc: V.esc, skinPicker: () => "", synergyPanel: () => "",
    opponentCard: () => '<section id="enemy-thumbnail"></section>',
    appOpponent: () => ({ faction: "google", pageName: "Other", decor: [] }), appEnemyBoard: () => [],
    render() { c.renderSide(); }, renderShop() {}, renderCoach() {}, afterBuildChange() {},
    scheduleFit() {}, mountAudienceLabControl() {}, previewAction() {}, toast: message => toasts.push(message),
  });
  vm.runInContext(compiled, c); c.save(); c.editor.select(["p6"]);
  return {
    c, doc, values, writes, toasts, editor: c.editor,
    item: id => c.run.owned.find(part => part.id === id),
    control: key => doc.querySelector(`[data-reddit-sidebar-placement="${key}"]`),
    controls: () => doc.querySelectorAll("[data-reddit-sidebar-placement]"),
    click(key, node = doc.querySelector(`[data-reddit-sidebar-placement="${key}"]`)) {
      assert.ok(node, `actual inspector renders ${key} placement button`);
      for (const listener of listeners.get("click") ?? []) listener({ target: node, preventDefault() {} });
    },
    select(ids = ["p6"]) { c.editor.select(ids); },
    stored: () => JSON.parse(values.get("reddit-sidebar-lab")),
  };
}
const clone = value => structuredClone(value);
const state = h => JSON.stringify({ run: h.c.run, history: h.editor.history, future: h.editor.future, values: [...h.values], writes: h.writes });
const unchanged = (h, action) => { const before = state(h); action(); assert.equal(state(h), before); };
const marker = h => h.controls().filter(node => node.getAttribute("aria-pressed") === "true").map(node => node.dataset.redditSidebarPlacement);

test("actual sidebar buttons move only the selected original link or font in one durable Undo/Redo transaction", t => {
  const h = host(t), before = clone(h.c.run);
  assert.equal(h.controls().length, 3); assert.deepEqual(marker(h), ["thread"]);
  h.click("reading");
  const moved = clone(before); Object.assign(moved.owned[5], { x: 692, y: 492 });
  assert.deepEqual(h.c.run, moved); assert.deepEqual(h.stored(), moved); assert.equal(h.editor.history.length, 1);
  h.editor.undo(); h.select(); assert.deepEqual(h.c.run, before); assert.deepEqual(h.stored(), before);
  h.editor.redo(); h.select(); assert.deepEqual(h.c.run, moved); assert.deepEqual(h.stored(), moved);
  h.click("thread"); assert.deepEqual(h.c.run, before);
  h.select(["p8"]); assert.equal(h.controls().length, 2); h.click("inside");
  const inside = clone(before); Object.assign(inside.owned[7], { x: 316, y: 492 });
  assert.deepEqual(h.c.run, inside); assert.deepEqual(h.stored(), inside); assert.equal(h.editor.history.length, 3);
  h.click("sidebar"); assert.deepEqual(h.c.run, before); assert.deepEqual(h.stored(), before);
});

test("current target keeps focus and redo without creating another transaction", t => {
  const h = host(t); h.click("reading"); h.editor.undo(); h.select();
  const node = h.control("thread"); assert.equal(node.disabled, false); node.focus();
  unchanged(h, () => h.click("thread")); assert.equal(h.editor.future.length, 1);
  assert.ok(h.doc.activeElement === node); assert.ok(h.control("thread") === node);
});

test("counterpart prerequisites and mismatched supported positions offer only selected-piece recovery", t => {
  const h = host(t); h.click("reading"); h.select(["p8"]);
  assert.equal(h.control("inside").disabled, true); assert.match(h.doc.querySelector(".reddit-sidebar-placement-guide").textContent, /リンク|返信/);
  unchanged(h, () => h.click("inside"));
  assert.equal(UIRaidEditor.patchItem(h.c.run.owned, "p8", { x: 316, y: 492 }), true);
  h.c.renderSide(); const before = clone(h.c.run); h.click("sidebar");
  const expected = clone(before); Object.assign(expected.owned[7], { x: 692, y: 444 });
  assert.deepEqual(h.c.run, expected); assert.deepEqual([h.item("p6").x, h.item("p6").y], [692, 492]);
  assert.equal(UIRaidEditor.patchItem(h.c.run.owned, "p8", { x: 316, y: 492 }), true);
  h.select(["p6"]); assert.equal(h.control("reading").disabled, true); assert.equal(h.control("detached").disabled, true);
  h.click("thread"); assert.deepEqual([h.item("p8").x, h.item("p8").y], [316, 492]);
});

test("fresh labels and source appearances survive both kinds of move exactly", t => {
  const h = host(t);
  for (const part of h.c.run.owned) Object.assign(part, { label: `<edited ${part.id} &>`,
    appearanceId: `appearance_${part.id.slice(1).repeat(64)}`, provenanceId: `capture_${part.id.slice(1).repeat(64)}`, fusionLocked: true });
  assert.equal(R.validateRun(h.c.run), true); h.c.save(); h.c.renderSide(); const before = clone(h.c.run);
  h.click("reading"); h.click("thread"); h.select(["p8"]); h.click("inside"); h.click("sidebar");
  assert.deepEqual(h.c.run, before); assert.deepEqual(h.stored(), before);
});

for (const [label, block] of [
  ["campaign", h => { h.c.run.mode = "campaign"; }], ["story", h => { h.c.storyActive = true; }],
  ["wrong template", h => { h.c.run.page.templateId = "site_reddit"; }], ["non-build", h => { h.c.run.phase = "reward"; }],
  ["battle", h => { h.c.battle = new E.Battle(h.c.run.owned, []); }], ["preview", h => { h.c.preview = true; }],
  ["enemy view", h => { h.c.view = "enemy"; }], ["settling", h => { h.c.settling = true; }],
  ["pending settlement", h => { h.c.pendingStorySettlement = {}; }],
  ["open dialog", h => { h.doc.querySelector("#modal").open = true; }],
  ["drag", h => { h.editor.drag = { active: true }; }], ["pending placement", h => { h.editor.pending = { type: "ab_link" }; }],
  ["Editor owns another Run", h => { h.editor.o.getRun = () => clone(h.c.run); }],
]) test(`sidebar action refuses ${label} without a transaction`, t => {
  const h = host(t), node = h.control("reading"); block(h); unchanged(h, () => h.click("reading", node));
});

for (const ids of [[], ["p1"], ["p6", "missing"], ["p6", "p8"]]) test(`exact sidebar selection rejects ${JSON.stringify(ids)}`, t => {
  const h = host(t), node = h.control("reading"); h.editor.selection = new Set(ids); unchanged(h, () => h.click("reading", node));
  h.c.renderSide(); assert.equal(h.controls().length, 0);
});

test("detached reattached forged or retargeted controls cannot recreate an old binding", t => {
  const h = host(t), old = h.control("reading"); h.c.renderSide();
  unchanged(h, () => h.click("reading", old)); h.doc.querySelector("#inspector").append(old);
  unchanged(h, () => h.click("reading", old)); old.remove();
  const forged = h.doc.createElement("button"); forged.dataset.redditSidebarPlacement = "reading"; forged.dataset.sourceId = "p6";
  h.doc.querySelector("#inspector").append(forged); unchanged(h, () => h.click("reading", forged)); forged.remove();
  const tampered = h.control("reading"); tampered.dataset.redditSidebarPlacement = "detached";
  unchanged(h, () => h.click("reading", tampered));
});

for (const [label, mutate] of [
  ["label", h => { h.item("p1").label = "changed"; }], ["appearance", h => { h.item("p6").appearanceId = "changed"; }],
  ["geometry", h => { h.item("p5").w -= 4; }], ["counterpart", h => { h.item("p8").x = 316; h.item("p8").y = 492; }],
  ["replacement Run", h => { h.c.run = clone(h.c.run); }], ["Editor Run", h => { h.editor.o.getRun = () => clone(h.c.run); }],
  ["selection", h => { h.editor.selection = new Set(["p8"]); }], ["dialog", h => { h.doc.querySelector("#modal").open = true; }],
  ["binding repaint", h => { h.c.renderSide(); }],
]) test(`sidebar inner commit rejects ${label} races`, t => {
  const h = host(t), commit = h.editor.commit.bind(h.editor); let raced;
  h.editor.commit = callback => { mutate(h); raced = state(h); return commit(callback); };
  h.click("reading"); assert.ok(raced); assert.equal(state(h), raced);
});

test("successful placement follows only the same operated button and never steals deliberate focus", t => {
  const h = host(t), old = h.control("reading"); old.focus(); h.click("reading");
  assert.equal(old.isConnected, false); assert.ok(h.doc.activeElement === h.control("reading"));
  assert.equal(h.doc.focusCalls.at(-1).options.preventScroll, true);
  const input = h.doc.createElement("input"); h.doc.body.append(input); input.focus(); h.click("thread");
  assert.ok(h.doc.activeElement === input);
  const render = h.c.render; h.control("reading").focus(); h.c.render = () => { render(); input.focus(); }; h.click("reading");
  assert.ok(h.doc.activeElement === input);
});

test("conflicting durable journal is preserved with an honest undoable local placement", t => {
  const h = host(t), newer = h.stored(); newer.page.name = "Newer other tab"; const raw = JSON.stringify(newer);
  h.values.set("reddit-sidebar-lab", raw); h.click("reading");
  assert.deepEqual([h.item("p6").x, h.item("p6").y], [692, 492]);
  assert.equal(h.values.get("reddit-sidebar-lab"), raw); assert.equal(h.c.saveOK, false); assert.equal(h.editor.history.length, 1);
  assert.match(h.doc.querySelector("#storage-notice").textContent, /別の画面/);
});

test("sidebar placement labels have narrowly scoped wrapping and uncapped button height", () => {
  const css = readFileSync(new URL("../src/catalog/reddit-sidebar.css", import.meta.url), "utf8");
  const block = css.match(/\.reddit-sidebar-placement-guide\s+\.sel-actions\s+button\s*\{([^}]+)\}/)?.[1];
  assert.ok(block); assert.match(block, /height:\s*auto\s*;/); assert.match(block, /min-height:\s*38px\s*;/);
  assert.match(block, /min-width:\s*0\s*;/); assert.match(block, /white-space:\s*normal\s*;/);
  assert.match(block, /overflow-wrap:\s*anywhere\s*;/);
});

test("repainting a different template retires lesson nodes even if its metadata is later restored", t => {
  const h = host(t), old = h.control("reading");
  h.c.run.page.templateId = "site_reddit"; h.c.renderSide();
  h.c.run.page.templateId = "lesson_reddit_sidebar";
  h.doc.querySelector("#inspector").append(old);
  unchanged(h, () => h.click("reading", old));
});
