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
const placementHelpers = [...app.matchAll(/^function ((?:\w*Sidechannel\w*|sidechannel\w*))\(/gm)].map(([, name]) => extract(name));
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
  const run = R.newRun("lab", "site_slack");
  const values = new Map(), writes = [], toasts = [];
  const storage = { getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); writes.push([key, value]); } };
  let c;
  c = vm.createContext({
    ...globals, ...appGuidance, ...navigation, ...conversion, ...incomeRoutes, ...containment, ...placement,
    C, D, E, R, P: D.PARTS, UIRaidEditor, V: { ...V, render() {} }, targetCaption,
    run, storyActive: false, storySession: null, battle: null, preview: false, settling: false,
    pendingStorySettlement: null, view: "self", incomeRouteBinding: null, sidechannelPlacementBindings: new Map(),
    memory: {}, profileStore: null, profileProblem: "", profileWrites: Promise.resolve(),
    runPersistence: createRunPersistence(storage, "sidechannel-"), saveOK: true, saveProblem: "",
    clone: structuredClone, labBattleController: createLabBattleController(),
    $: selector => doc.querySelector(selector), esc: V.esc, skinPicker: () => "", synergyPanel: () => "",
    opponentCard: () => '<section id="enemy-thumbnail"></section>',
    appOpponent: () => ({ faction: "google", pageName: "Other", decor: [] }), appEnemyBoard: () => [],
    render() { c.renderSide(); }, renderShop() {}, renderCoach() {}, afterBuildChange() {},
    scheduleFit() {}, mountAudienceLabControl() {}, previewAction() {}, toast: message => toasts.push(message),
  });
  vm.runInContext(compiled, c); c.save(); c.editor.select(["p4"]);
  return {
    c, doc, values, writes, toasts, editor: c.editor,
    item: id => c.run.owned.find(part => part.id === id),
    control: key => doc.querySelector(`[data-sidechannel-placement="${key}"]`),
    controls: () => doc.querySelectorAll("[data-sidechannel-placement]"),
    click(key, node = doc.querySelector(`[data-sidechannel-placement="${key}"]`)) {
      assert.ok(node, `actual inspector renders ${key} placement button`);
      for (const listener of listeners.get("click") ?? []) listener({ target: node, preventDefault() {} });
    },
    select(ids = ["p4"]) { c.editor.select(ids); },
    stored: () => JSON.parse(values.get("sidechannel-lab")),
  };
}
const clone = value => structuredClone(value);
const state = h => JSON.stringify({ run: h.c.run, history: h.editor.history, future: h.editor.future, values: [...h.values], writes: h.writes });
const unchanged = (h, action, label) => { const before = state(h); action(); assert.equal(state(h), before, label); };
const marker = h => h.controls().filter(node => node.getAttribute("aria-pressed") === "true").map(node => node.dataset.sidechannelPlacement);

test("actual SIDECHANNEL inspector changes only owned p4 coordinates through Editor and durable Undo/Redo", t => {
  const h = host(t), before = clone(h.c.run);
  assert.equal(h.controls().length, 2, "actual host must include both placement destinations");
  assert.deepEqual(marker(h), ["history"]);
  h.click("pdf");
  const expected = clone(before); Object.assign(expected.owned[3], { x: 648, y: 228 });
  assert.deepEqual(h.c.run, expected); assert.deepEqual(h.stored(), expected);
  assert.equal(h.editor.history.length, 1); assert.deepEqual(h.editor.history[0], before);
  assert.equal(h.c.run.owned.length, 4);
  assert.ok(h.c.run.owned.every(part => C.canPlace(h.c.run.owned, part, part.x, part.y, part.w, part.h)));
  assert.deepEqual(marker(h), ["pdf"]);
  for (let i = 0; i < 3; i++) {
    h.click("undo", h.doc.querySelector("#undo-button")); assert.deepEqual(h.c.run, before); assert.deepEqual(h.stored(), before);
    h.select(); assert.deepEqual(marker(h), ["history"]);
    h.click("redo", h.doc.querySelector("#redo-button")); assert.deepEqual(h.c.run, expected); assert.deepEqual(h.stored(), expected);
    h.select(); assert.deepEqual(marker(h), ["pdf"]);
  }
  h.click("history"); assert.deepEqual(h.c.run, before); assert.deepEqual(h.stored(), before);
  assert.equal(h.editor.history.length, 2);
});

test("current placement is a focusable no-op preserving an existing redo and durable bytes", t => {
  const h = host(t); h.click("pdf"); h.editor.undo(); h.select();
  const control = h.control("history"); assert.equal(control.disabled, false); control.focus();
  const focusCalls = h.doc.focusCalls.length;
  unchanged(h, () => h.click("history"), "current position must not create a transaction or drop redo");
  assert.equal(h.editor.future.length, 1); assert.ok(h.doc.activeElement === control, "current control retains focus");
  assert.equal(h.doc.focusCalls.length, focusCalls); assert.ok(h.control("history") === control, "no-op keeps the same control node");
  h.editor.redo(); assert.deepEqual([h.item("p4").x, h.item("p4").y], [648, 228]);
});

test("freshly rendered owned labels, appearance and provenance survive both placement actions", t => {
  const h = host(t);
  for (const part of h.c.run.owned) Object.assign(part, {
    label: `<edited ${part.id} & "label">`, appearanceId: `appearance_${part.id.slice(1).repeat(64)}`,
    provenanceId: `capture_${part.id.slice(1).repeat(64)}`, fusionLocked: true,
    lineage: [{ appearanceId: `appearance_${"a".repeat(64)}`, provenanceId: `capture_${"b".repeat(64)}` }],
  });
  assert.equal(R.validateRun(h.c.run), true, "custom metadata remains persistable");
  h.c.save(); h.c.renderSide(); const before = clone(h.c.run), expected = clone(before);
  Object.assign(expected.owned[3], { x: 648, y: 228 });
  h.click("pdf"); assert.deepEqual(h.c.run, expected); assert.deepEqual(h.stored(), expected);
  h.click("history"); assert.deepEqual(h.c.run, before); assert.deepEqual(h.stored(), before);
});

for (const [label, block, hidden = false] of [
  ["campaign", h => { h.c.run.mode = "campaign"; }, true],
  ["different template", h => { h.c.run.page.templateId = "site_figma"; }, true],
  ["story", h => { h.c.storyActive = true; }, true],
  ["non-build", h => { h.c.run.phase = "reward"; }, true],
  ["battle", h => { h.c.battle = new E.Battle(h.c.run.owned, [], { playerCapacity: Infinity }); }],
  ["preview", h => { h.c.preview = true; }],
  ["enemy view", h => { h.c.view = "enemy"; }],
  ["settling", h => { h.c.settling = true; }],
  ["pending settlement", h => { h.c.pendingStorySettlement = {}; }],
  ["main dialog", h => { h.doc.querySelector("#modal").open = true; }],
  ["another dialog", h => { const dialog = h.doc.createElement("dialog"); dialog.open = true; h.doc.body.append(dialog); }],
  ["drag", h => { h.editor.drag = { active: true }; }],
  ["pending placement", h => { h.editor.pending = { type: "ab_link" }; }],
]) test(`actual placement action refuses ${label} before and after repaint`, t => {
  const h = host(t), stale = h.control("pdf"); assert.ok(stale); block(h);
  unchanged(h, () => h.click("pdf", stale), "previous enabled control cannot bypass current edit gate");
  h.c.renderSide();
  if (hidden) assert.equal(h.controls().length, 0);
  else {
    assert.equal(h.controls().length, 2); assert.ok(h.controls().every(control => control.disabled));
    unchanged(h, () => h.click("pdf"), "synthetic click on current disabled control is inert");
  }
});

for (const ids of [[], ["p1"], ["p4", "p2"], ["p4", "missing"]])
  test(`placement refuses stale selection ${JSON.stringify(ids)}`, t => {
    const h = host(t), control = h.control("pdf"); assert.ok(control);
    h.editor.selection = new Set(ids);
    unchanged(h, () => h.click("pdf", control));
    h.c.renderSide(); assert.equal(h.controls().length, 0, "rendering may not collapse a stale multi-ID selection to one owned ID");
  });

test("render-bound controls reject detached nodes, forged duplicates and a replacement run", t => {
  const h = host(t), old = h.control("pdf"); assert.ok(old);
  h.c.renderSide(); assert.equal(old.isConnected, false); unchanged(h, () => h.click("pdf", old));
  h.doc.querySelector("#inspector").append(old);
  unchanged(h, () => h.click("pdf", old), "reattaching a disposed original node cannot recreate its binding"); old.remove();
  const forged = h.doc.createElement("button"); forged.dataset.sidechannelPlacement = "pdf"; forged.dataset.sourceId = "p4";
  h.doc.body.append(forged); unchanged(h, () => h.click("pdf", forged));
  h.doc.querySelector("#inspector").append(forged); unchanged(h, () => h.click("pdf", forged), "forged duplicate inside inspector"); forged.remove();
  const current = h.control("pdf"); h.c.run = clone(h.c.run);
  unchanged(h, () => h.click("pdf", current), "same owned IDs in another live run do not authorize old controls");
});

for (const [attribute, value, original = "pdf"] of [
  ["sourceId", "p2"], ["sidechannelPlacement", "missing"], ["sidechannelPlacement", "pdf", "history"],
]) test(`tampering bound ${attribute} cannot retarget an inspector action`, t => {
  const h = host(t), control = h.control(original); assert.ok(control); control.dataset[attribute] = value;
  unchanged(h, () => h.click(value, control));
});

for (const [label, mutate] of [
  ["breadcrumb width", h => { h.item("p4").w += 4; }],
  ["other width", h => { h.item("p3").w += 4; }],
  ["breadcrumb position", h => { h.item("p4").y += 4; }],
  ["other geometry", h => { h.item("p1").x += 4; }],
  ["breadcrumb label", h => { h.item("p4").label = "new label"; }],
  ["other label", h => { h.item("p2").label = "new history"; }],
  ["appearance", h => { h.item("p1").appearanceId = "new appearance"; }],
  ["provenance", h => { h.item("p3").provenanceId = "new provenance"; }],
  ["fusion lock", h => { h.item("p4").fusionLocked = true; }],
  ["owned order", h => { h.c.run.owned.reverse(); }],
  ["extra owned part", h => { h.c.run.owned.push(C.makeItem("ab_link", "p5", null, null)); }],
  ["missing part", h => { h.c.run.owned.shift(); }],
]) test(`full owned-snapshot freshness refuses a stale control after ${label} changes`, t => {
  const h = host(t), control = h.control("pdf"); assert.ok(control); mutate(h);
  unchanged(h, () => h.click("pdf", control));
});

test("changed width remains disabled after repaint instead of restoring template geometry", t => {
  const h = host(t); h.item("p3").w += 4; h.c.renderSide();
  assert.equal(h.controls().length, 2); assert.ok(h.controls().every(control => control.disabled));
  assert.match(h.doc.querySelector(".sidechannel-placement-guide").textContent, /サイズ/);
  assert.deepEqual(marker(h), []); unchanged(h, () => h.click("pdf"));
});

for (const [label, invalidate] of [
  ["owned label", h => { h.item("p1").label = "Changed between guards"; }],
  ["width", h => { h.item("p4").w += 4; }],
  ["selection", h => { h.editor.selection = new Set(["p1"]); }],
  ["run identity", h => { h.c.run = clone(h.c.run); }],
  ["dialog", h => { h.doc.querySelector("#modal").open = true; }],
  ["preview", h => { h.c.preview = true; }],
  ["pending placement", h => { h.editor.pending = { type: "ab_link" }; }],
  ["disposed control", h => { h.control("pdf").remove(); }],
  ["replacement binding", h => { h.c.renderSide(); }],
]) test(`inner-commit revalidation rejects a ${label} race without history or save`, t => {
  const h = host(t), commit = h.editor.commit.bind(h.editor);
  let afterRace;
  h.editor.commit = callback => {
    invalidate(h); afterRace = state(h);
    return commit(callback);
  };
  h.click("pdf");
  assert.ok(afterRace, "actual control must reach the real commit boundary");
  assert.equal(state(h), afterRace, "the race state remains intact and the placement was not applied");
});

test("successful owned repaint restores only the same operated placement button", t => {
  const h = host(t), old = h.control("pdf"); assert.ok(old); old.focus(); h.click("pdf");
  assert.equal(old.isConnected, false); assert.notEqual(h.control("pdf"), old);
  assert.ok(h.doc.activeElement === h.control("pdf"), "focus follows the operated PDF target");
  assert.equal(h.doc.focusCalls.at(-1).options.preventScroll, true);
  assert.deepEqual(marker(h), ["pdf"]);
  h.control("history").focus(); h.click("history"); assert.ok(h.doc.activeElement === h.control("history"), "focus follows the operated history target");
});

test("background placement and focus deliberately moved during repaint cannot steal focus", t => {
  const h = host(t), input = h.doc.createElement("input"); h.doc.body.append(input); input.focus();
  h.click("pdf"); assert.ok(h.doc.activeElement === input, "input focus must not be stolen");
  h.control("history").focus(); const render = h.c.render;
  h.c.render = () => { render(); input.focus(); };
  h.click("history"); assert.ok(h.doc.activeElement === input, "input focus must not be stolen");
});

for (const [label, invalidate] of [
  ["new run", h => { h.c.run = clone(h.c.run); h.c.renderSide(); }],
  ["new selection", h => { h.editor.selection = new Set(["p1"]); h.c.renderSide(); }],
  ["stale multiple selection", h => { h.editor.selection = new Set(["p4", "missing"]); }],
  ["read-only preview", h => { h.c.preview = true; }],
  ["new dialog", h => { h.doc.querySelector("#modal").open = true; }],
  ["disposed replacement", h => { h.control("pdf").remove(); }],
]) test(`focus restoration never follows a ${label} after commit repaint`, t => {
  const h = host(t), render = h.c.render; h.control("pdf").focus();
  const calls = h.doc.focusCalls.length;
  h.c.render = () => { render(); invalidate(h); };
  h.click("pdf");
  assert.equal(h.doc.focusCalls.length, calls); assert.ok(h.doc.activeElement === h.doc.body, "focus must not follow a stale control");
});

test("placement journal conflict preserves newer durable bytes and leaves a truthful undoable local edit", t => {
  const h = host(t), newer = h.stored(); newer.page.name = "Newer other tab";
  const raw = JSON.stringify(newer); h.values.set("sidechannel-lab", raw); h.click("pdf");
  assert.deepEqual([h.item("p4").x, h.item("p4").y], [648, 228]);
  assert.equal(h.values.get("sidechannel-lab"), raw); assert.equal(h.c.saveOK, false);
  assert.match(h.doc.querySelector("#storage-notice").textContent, /別の画面/);
  assert.equal(h.editor.history.length, 1);
});
