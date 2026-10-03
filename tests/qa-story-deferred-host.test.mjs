import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { createDeferredMount } from "../src/feature-loader.js";

// Execute real app modal/workshop functions with only the DOM and module-load
// boundary adapted. This verifies ownership/state, not browser paint or focus.
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const declarations = [
  source.slice(source.indexOf("let modalFeatureDispose:"), source.indexOf("/* ---------- Isolated story profile")),
  source.slice(source.indexOf("function openStoryHub()"), source.indexOf("function storyRewardPanel()")),
  source.slice(source.indexOf("function deferredModalFeature"), source.indexOf("function onlinePanel()")),
].join("\n").replace('import("./story/panel.js")', "loadModule()");
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function environment() {
  const elements = new Map(), requests = [], mounts = [], queuedClose = [], events = new Map();
  let markup = "", disposals = 0;
  const node = () => ({
    children: [], textContent: "", removed: false, attributes: {},
    classList: { add() {}, remove() {} },
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren(...nodes) { this.children = nodes; },
    append(...nodes) { this.children.push(...nodes); },
    remove() { this.removed = true; },
  });
  const dialog = {
    ...node(), open: false,
    addEventListener(type, fn) { events.set(type, fn); },
    showModal() { this.open = true; },
    close() { if (!this.open) return; this.open = false; queuedClose.push(() => events.get("close")?.()); },
  };
  const content = {
    set innerHTML(html) {
      markup = html; elements.clear();
      for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(`#${id}`, node());
    },
  };
  const mountStoryHub = (target, callbacks) => {
    mounts.push({ target, callbacks, state: callbacks.getState() });
    target.replaceChildren({ textContent: "mounted workshop" });
    return { dispose() { disposals++; } };
  };
  const context = {
    renderSide() {}, createDeferredMount, pendingStorySettlement: null, storyActive: true, battle: null,
    storySession: { inbox: [], story: { id: "original" } }, run: { lives: 3, owned: [] },
    document: { createElement: node },
    $: selector => selector === "#modal" ? dialog : selector === "#modal-content" ? content : elements.get(selector),
    modalHead: () => '<button data-close-modal aria-label="閉じる">×</button>',
    storyCommand() {}, storyRewardPanel() { context.api.openModal("reward panel"); },
    storyInboxPanel() { context.api.openModal("story inbox"); },
    enterStory() {},
    loadModule() { const request = deferred(); requests.push(request); return request.promise; },
    Story: { mountStoryHub }, // Baseline sync implementation must fail the pending-load assertion.
  };
  vm.runInNewContext(transformSync(declarations, { loader: "ts", target: "es2022" }).code + "\nglobalThis.api={openStoryHub,openModal,closeModal};", context);
  return {
    c: context, api: context.api, dialog, elements, requests, mounts,
    get markup() { return markup; }, get disposals() { return disposals; },
    flushClose() { while (queuedClose.length) queuedClose.shift()(); },
    resolve(index = 0) { requests[index].resolve({ loadStyles: async () => {}, mountStoryHub }); },
  };
}

test("QA: actual story host keeps Close during a pending/failed load and single-flight retry mounts once", async () => {
  const h = environment(); h.api.openStoryHub(); await tick();
  assert.equal(h.mounts.length, 0, "workshop must not mount before its optional module resolves");
  assert.equal(h.requests.length, 1);
  assert.match(h.markup, /id="story-loading-head"[^]*data-close-modal/);
  const host = h.elements.get("#story-feature-host"), head = h.elements.get("#story-loading-head");
  assert.equal(host.children[0].attributes.role, "status");
  h.requests[0].reject(new Error("offline")); await tick();
  assert.equal(head.removed, false, "failure retains an operable Close header");
  assert.equal(host.children[0].attributes.role, "alert");
  const retry = host.children.find(item => item.textContent === "画面をもう一度読み込む");
  assert.ok(retry); retry.onclick(); retry.onclick(); await tick();
  assert.equal(h.requests.length, 2, "double retry uses one module request");
  h.resolve(1); await tick();
  assert.equal(h.mounts.length, 1); assert.equal(h.mounts[0].target, host);
  assert.equal(head.removed, true, "only the successful workshop replaces the loading Close header");
  h.mounts[0].callbacks.onClose(); h.flushClose(); h.api.closeModal();
  assert.equal(h.disposals, 1);
});

test("QA: Close, native Escape, menu replacement and inbox navigation suppress late story success/failure", async () => {
  for (const route of ["close", "escape", "menu", "inbox"]) for (const fails of [false, true]) {
    const h = environment(); h.api.openStoryHub(); await tick();
    assert.equal(h.requests.length, 1, "opening workshop must request its optional module");
    const old = h.elements.get("#story-feature-host");
    if (route === "close") h.api.closeModal();
    else if (route === "escape") h.dialog.close();
    else if (route === "menu") h.api.openModal("new menu");
    else h.elements.get("#story-open-inbox").onclick();
    h.flushClose(); const expectedMarkup = h.markup, oldChildren = [...old.children];
    if (fails) h.requests[0].reject(new Error("late failure")); else h.resolve();
    await tick();
    assert.equal(h.mounts.length, 0, `${route}: no stale workshop mounts`);
    assert.equal(h.markup, expectedMarkup); assert.deepEqual(old.children, oldChildren);
  }
});

test("QA: rapid close/reopen preserves the new workshop across an old queued native close", async () => {
  const h = environment(); h.api.openStoryHub(); await tick();
  h.api.closeModal(); h.api.openStoryHub(); await tick();
  assert.equal(h.requests.length, 2, "each opening owns its pending mount");
  const currentHost = h.elements.get("#story-feature-host"), currentHead = h.elements.get("#story-loading-head");
  h.flushClose(); assert.equal(h.dialog.open, true);
  h.resolve(1); await tick(); h.resolve(0); await tick();
  assert.equal(h.mounts.length, 1); assert.equal(h.mounts[0].target, currentHost);
  assert.equal(currentHead.removed, true); assert.equal(h.disposals, 0);
  h.api.closeModal(); h.flushClose(); assert.equal(h.disposals, 1);
});

test("QA: new-story and restored-save replacement mount only the latest session without writing state", async () => {
  for (const kind of ["new story", "restored save"]) {
    const h = environment(); h.api.openStoryHub(); await tick();
    const latest = { inbox: [{ id: "latest item" }], story: { id: kind } };
    h.c.storySession = latest; h.api.openStoryHub(); await tick();
    assert.equal(h.requests.length, 2, "replacement opening owns the latest request");
    h.resolve(0); await tick(); assert.equal(h.mounts.length, 0);
    h.resolve(1); await tick();
    assert.equal(h.mounts.length, 1); assert.equal(h.mounts[0].state, latest.story);
    assert.equal(h.c.storySession, latest, "loading itself does not replace/commit the selected save");
    assert.match(h.elements.get("#story-open-inbox").textContent, /1/);
  }
});

test("QA: story host preserves inactive, battle, reward and exhausted-run entry guards", async () => {
  for (const guard of ["inactive", "battle", "reward", "exhausted"]) {
    const h = environment();
    if (guard === "inactive") h.c.storyActive = false;
    if (guard === "battle") h.c.battle = {};
    if (guard === "reward") h.c.storySession.reward = {};
    if (guard === "exhausted") h.c.run.lives = 0;
    h.api.openStoryHub(); await tick();
    assert.equal(h.requests.length, 0); assert.equal(h.mounts.length, 0);
  }
});
