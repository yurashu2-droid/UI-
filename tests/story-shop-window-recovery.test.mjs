import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { Editor } from "../src/editor.ts";
import { createWindowManager } from "../src/wm.ts";
import { mountStoryHub } from "../src/story/hub.ts";
import { STORY_SAVE_KEY, validateStorySession } from "../src/story/session.ts";
import { currentStoryEncounter } from "../src/story/state.ts";
import { STORY_STAGES } from "../src/story/content.ts";
import { simulateCommerceRecovery } from "../scripts/commerce-recovery.ts";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Execute the actual app callback through the real workshop and window manager.
// Only module loading, browser DOM/storage and unrelated page rendering are
// adapted. This does not establish browser layout or accessibility acceptance.
// Removing the app's shop-window reveal must fail the visibility assertions.
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const declarations = ["openModal", "closeModal", "openStoryHub"].map((name) => {
  const found = source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"));
  assert.ok(found, `production ${name} exists`);
  return found[0];
}).join("\n");
const compiled = transformSync(declarations, { loader: "ts", target: "es2022" }).code;
const afterLoss = simulateCommerceRecovery().afterLoss;
const layout = {
  crawl: { rect: { x: 31, y: 77, w: 287, h: 462 }, min: false },
  page: { rect: { x: 349, y: 39, w: 674, h: 752 }, min: false },
  clip: { rect: { x: 47, y: 572, w: 280, h: 181 }, min: false },
  props: { rect: { x: 1091, y: 93, w: 261, h: 538 }, min: false },
};

class WindowElement extends ElementAdapter {
  prepend(...nodes) {
    for (const node of nodes) { node.remove(); node.parentElement = this; }
    this.children.unshift(...nodes);
  }
  after(node) {
    const parent = this.parentElement;
    assert.ok(parent);
    node.remove(); node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  }
}

function environment(t, { persistedMinimized = false } = {}) {
  const doc = { createElement: (tag) => new WindowElement(doc, tag) };
  doc.body = doc.createElement("body");
  const session = structuredClone(afterLoss), savedLayout = structuredClone(layout);
  if (persistedMinimized) savedLayout.crawl.min = true;
  const values = new Map([
    ["ui-raid-wm", JSON.stringify(savedLayout)],
    [STORY_SAVE_KEY, JSON.stringify(session)],
    ["unrelated-save", "unchanged"],
  ]);
  const globals = {
    document: doc,
    window: { addEventListener() {} },
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const desktop = doc.createElement("main"), taskHost = doc.createElement("div");
  desktop.clientWidth = 1440; desktop.clientHeight = 900;
  doc.body.append(desktop, taskHost);
  const wm = createWindowManager(desktop, taskHost), windows = new Map();
  for (const id of Object.keys(layout)) {
    const element = doc.createElement("section");
    windows.set(id, element); desktop.append(element);
    wm.add(element, { id, title: id, icon: "x", rect: () => ({ x: 0, y: 0, w: 400, h: 300 }) });
  }
  const dialog = doc.createElement("dialog"), content = doc.createElement("div");
  dialog.setAttribute("id", "modal"); content.setAttribute("id", "modal-content");
  dialog.append(content); doc.body.append(dialog);
  dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  let renders = 0, changes = 0;
  const toasts = [];
  wm.onChange(() => { changes++; });
  const context = {
    storyActive: true, storySession: session, run: structuredClone(session.run),
    battle: null, pendingStorySettlement: null, modalFeatureDispose: undefined,
    view: "enemy", preview: true, wm,
    $: (selector) => {
      const node = doc.body.querySelector(selector.startsWith("#") ? `[id="${selector.slice(1)}"]` : selector);
      assert.ok(node, `app element ${selector} exists`);
      return node;
    },
    modalHead: () => '<button data-close-modal>閉じる</button>',
    render() { renders++; wm.setTitle("page", context.run.page.name); },
    toast: (message) => toasts.push(message),
    storyCommand() { assert.fail("opening a purchase window must not transact with the story"); },
    storyInboxPanel() {},
    deferredModalFeature(host, _load, mount) {
      let panel;
      return { start() { panel = mount({ mountStoryHub }); }, dispose() { panel?.dispose(); } };
    },
  };
  context.editor = Object.assign(Object.create(Editor.prototype), {
    history: [structuredClone(context.run)], future: [structuredClone(context.run)],
    selection: new Set([context.run.owned[0].id]), pending: null, drag: null,
  });
  vm.runInNewContext(compiled, context);
  const state = () => JSON.stringify({
    storySession: context.storySession, run: context.run,
    history: context.editor.history, future: context.editor.future,
    selection: [...context.editor.selection],
    saves: [...values].filter(([key]) => key !== "ui-raid-wm"),
  });
  return {
    c: context, dialog, windows, toasts, values, state,
    get renders() { return renders; }, get changes() { return changes; },
    layout: () => JSON.parse(values.get("ui-raid-wm")),
    tasks: () => doc.body.querySelectorAll(".tb-app"),
    action: (name) => content.querySelector(`[data-story-action="${name}"]`),
    minimize: (id) => windows.get(id).querySelector(".wm-min").dispatch("click"),
  };
}

test("post-loss workshop shelf restores only the minimized purchase window without changing the paid story or layout", async (t) => {
  assert.equal(validateStorySession(afterLoss), true);
  assert.equal(afterLoss.run.cash, 126);
  assert.equal(afterLoss.run.lives, 2);
  assert.equal(currentStoryEncounter(afterLoss.story).id, "permission-desk");
  assert.equal(afterLoss.run.history.at(-1).winner, "enemy");
  assert.equal(Math.round(afterLoss.run.history.at(-1).time * 100) / 100, 20.65);
  assert.equal(STORY_STAGES.length, 8);
  assert.equal(STORY_STAGES.reduce((n, stage) => n + stage.encounters.length, 0), 15);
  const h = environment(t);
  for (const id of ["crawl", "clip", "props"]) await h.minimize(id);
  const before = h.state(), savedLayout = h.layout(), run = h.c.run, session = h.c.storySession;
  h.c.openStoryHub();
  assert.equal(h.dialog.open, true);
  await h.action("shelf").dispatch("click");
  assert.equal(h.action("open-shop").textContent, "UIの取引を開く");
  await h.action("open-shop").dispatch("click");
  assert.equal(h.windows.get("crawl").classList.contains("wm-hidden"), false, "explicit shop action reveals its purchase window");
  assert.equal(h.windows.get("crawl").classList.contains("wm-front"), true);
  assert.equal(h.tasks()[0].getAttribute("aria-pressed"), "true");
  assert.equal(h.dialog.open, false);
  assert.equal(h.renders, 1); assert.equal(h.c.view, "self"); assert.equal(h.c.preview, false);
  savedLayout.crawl.min = false;
  assert.deepEqual(h.layout(), savedLayout, "only the shop minimized flag changes in the saved desktop");
  for (const id of ["clip", "props"]) assert.equal(h.windows.get(id).classList.contains("wm-hidden"), true);
  assert.equal(h.windows.get("page").classList.contains("wm-hidden"), false);
  assert.equal(h.state(), before);
  assert.equal(h.c.run, run); assert.equal(h.c.storySession, session);
  assert.deepEqual(h.toasts, []);
});

test("the direct workshop shop button restores a saved minimized window and remains safe on repeat openings", async (t) => {
  const h = environment(t, { persistedMinimized: true }), before = h.state();
  assert.equal(h.windows.get("crawl").classList.contains("wm-hidden"), true);
  h.c.openStoryHub();
  const oldButton = h.action("open-shop");
  assert.equal(oldButton.textContent, "棚のUIを見せてもらう");
  await oldButton.dispatch("click");
  assert.equal(h.windows.get("crawl").classList.contains("wm-hidden"), false);
  assert.deepEqual(h.layout(), layout);
  assert.equal(h.changes, 1);
  await oldButton.dispatch("click");
  assert.equal(h.renders, 1, "disposed workshop buttons do not open or render again");
  h.c.openStoryHub();
  await h.action("open-shop").dispatch("click");
  assert.equal(h.windows.get("crawl").classList.contains("wm-hidden"), false);
  assert.equal(h.changes, 1, "an already visible window does not reset or minimize on repeat");
  assert.deepEqual(h.layout(), layout);
  await h.minimize("crawl");
  h.c.openStoryHub(); await h.action("open-shop").dispatch("click");
  assert.equal(h.windows.get("crawl").classList.contains("wm-hidden"), false);
  assert.deepEqual(h.layout(), layout); assert.equal(h.state(), before);
});

for (const target of ["page", "server"]) {
  test(`workshop ${target} keeps its existing navigation without reopening minimized windows`, async (t) => {
    const h = environment(t);
    for (const id of ["crawl", "clip", "props"]) await h.minimize(id);
    const before = h.state(), savedLayout = h.layout();
    h.c.openStoryHub();
    await h.action(target === "page" ? "workbench" : "server").dispatch("click");
    if (target === "server") await h.action("open-server").dispatch("click");
    assert.equal(h.dialog.open, false); assert.equal(h.renders, 1);
    assert.equal(h.c.view, "self"); assert.equal(h.c.preview, false);
    assert.deepEqual(h.layout(), savedLayout); assert.equal(h.state(), before);
    for (const id of ["crawl", "clip", "props"]) assert.equal(h.windows.get(id).classList.contains("wm-hidden"), true);
    assert.deepEqual(h.toasts, target === "server" ? ["左の巡回先にあるサーバープランで処理能力を増やせます。"] : []);
  });
}
