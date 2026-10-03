import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { createDeferredMount } from "../src/feature-loader.js";

// Execute the actual app modal/deferred-online/cancel handlers. The panel boundary
// is injected here; its command/receipt behavior is covered by separate real-client
// tests. This event adapter is not browser focus, rendering or Escape acceptance.
function harness({ delayed = false } = {}) {
  const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const modal = source.slice(source.indexOf("let modalFeatureDispose:"), source.indexOf("/* ---------- Isolated story profile"));
  const online = source.slice(source.indexOf("function deferredModalFeature"), source.indexOf("function localRaidEditingAllowed"))
    .replace('import("./online/panel.js")', "loadModule()");
  const cancelStart = source.indexOf('$<HTMLDialogElement>("#modal").addEventListener("cancel"');
  const cancel = source.slice(cancelStart, source.indexOf("new ResizeObserver", cancelStart));
  const events = new Map(), queued = [], panels = [];
  let head, host, resolveModule, leaveCount = 0, sideRenders = 0;
  const element = () => ({
    isConnected: true, children: [], textContent: "", querySelector() { return null; },
    setAttribute() {}, replaceChildren() { this.children = []; }, append(...nodes) { this.children.push(...nodes); },
    remove() { this.isConnected = false; },
  });
  const dialog = {
    open: false, classList: { add() {}, remove() {} },
    addEventListener(type, handler) { events.set(type, handler); },
    showModal() { this.open = true; },
    close() { if (!this.open) return; this.open = false; queued.push(() => events.get("close")?.({ target: this })); },
  };
  const content = { set innerHTML(value) {
    if (host) host.isConnected = false;
    if (head) head.isConnected = false;
    host = element(); head = element(); this.value = value;
  }};
  const module = {
    async loadStyles() {},
    mountOnlinePanel(target, options) {
      const panel = {
        target, options, requests: 0, disposals: 0, pending: true,
        requestClose() { this.requests++; if (!this.pending) options.onClose(); },
        dispose() { this.disposals++; },
      };
      panels.push(panel); return panel;
    },
  };
  const context = {
    createDeferredMount,
    document: { body: {}, activeElement: null, createElement: element },
    $: selector => selector === "#modal" ? dialog : selector === "#modal-content" ? content : selector === "#online-feature-host" ? host : head,
    modalHead: () => '<button data-close-modal>Close</button>',
    renderSide() { sideRenders++; }, pendingStorySettlement: null, battle: null,
    leaveBattle() { leaveCount++; }, setTimeout(fn) { queued.push(fn); },
    loadModule: () => delayed ? new Promise(resolve => { resolveModule = resolve; }) : Promise.resolve(module),
  };
  vm.runInNewContext(transformSync(modal + online + cancel, { loader: "ts", target: "es2022" }).code + `
    globalThis.api = { onlinePanel, openModal, closeModal,
      getRequest: () => typeof modalFeatureRequestClose === "undefined" ? undefined : modalFeatureRequestClose,
      getDispose: () => modalFeatureDispose };
  `, context);
  return {
    ...context.api, context, dialog, panels,
    async openOnline() { context.api.onlinePanel(); await new Promise(resolve => setImmediate(resolve)); return panels.at(-1); },
    async resolve() { resolveModule(module); await new Promise(resolve => setImmediate(resolve)); },
    cancel() { const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; events.get("cancel")(event); if (!event.defaultPrevented) dialog.close(); return event; },
    flush() { while (queued.length) queued.shift()(); },
    counts: () => ({ leaveCount, sideRenders }),
  };
}

test("native cancel delegates to the active online panel without destroying its pending intent", async () => {
  const h = harness(), panel = await h.openOnline();
  const event = h.cancel();
  assert.equal(event.defaultPrevented, true);
  assert.equal(panel.requests, 1);
  assert.equal(panel.disposals, 0);
  assert.equal(h.dialog.open, true);
  assert.equal(typeof h.getDispose(), "function");
});

test("repeated native cancel keeps the same online owner until its acknowledged close", async () => {
  const h = harness(), panel = await h.openOnline();
  h.cancel(); h.cancel();
  assert.equal(panel.requests, 2);
  assert.equal(panel.disposals, 0);
  panel.options.onClose();
  assert.equal(panel.disposals, 1); assert.equal(h.dialog.open, false);
  assert.equal(h.getRequest(), undefined); h.flush();
  assert.equal(panel.disposals, 1);
});

test("an ordinary online close still delegates and closes immediately when no command is pending", async () => {
  const h = harness(), panel = await h.openOnline(); panel.pending = false;
  assert.equal(h.cancel().defaultPrevented, true);
  assert.equal(panel.requests, 1); assert.equal(panel.disposals, 1); assert.equal(h.dialog.open, false);
  assert.equal(h.getRequest(), undefined);
});

test("closing the online loading shell does not leave a cancel hook or mount late content", async () => {
  const h = harness({ delayed: true }); await h.openOnline();
  assert.equal(h.getRequest(), undefined);
  assert.equal(h.cancel().defaultPrevented, false); h.flush(); await h.resolve();
  assert.equal(h.panels.length, 0); assert.equal(h.dialog.open, false); assert.equal(h.getRequest(), undefined);
});

test("replacing online content removes its close hook and stale callbacks cannot close the new modal", async () => {
  const h = harness(), panel = await h.openOnline(), oldRequest = h.getRequest();
  h.openModal("new ordinary modal");
  assert.equal(panel.disposals, 1); assert.equal(h.getRequest(), undefined);
  assert.equal(typeof oldRequest, "function"); oldRequest();
  assert.equal(panel.requests, 0); assert.equal(h.dialog.open, true);
  assert.equal(h.cancel().defaultPrevented, false); h.flush(); assert.equal(h.dialog.open, false);
});

test("a queued old close and old disposal preserve the next online panel's hook", async () => {
  const h = harness(), first = await h.openOnline(), oldDispose = h.getDispose(), oldRequest = h.getRequest();
  first.options.onClose(); const second = await h.openOnline(), currentRequest = h.getRequest();
  oldDispose(); oldRequest(); h.flush();
  assert.equal(first.disposals, 1); assert.equal(second.disposals, 0);
  assert.equal(h.getRequest(), currentRequest); assert.equal(h.dialog.open, true);
  h.cancel(); assert.equal(second.requests, 1); assert.equal(first.requests, 0);
});

test("native close notification removes the online hook and disposes once", async () => {
  const h = harness(), panel = await h.openOnline(); h.dialog.close(); h.flush();
  assert.equal(panel.disposals, 1); assert.equal(h.getRequest(), undefined);
  assert.equal(h.counts().sideRenders, 1);
});

test("pending story settlement retains priority and ordinary result dismissal retains leaveBattle", async () => {
  const h = harness(), panel = await h.openOnline(); h.context.pendingStorySettlement = {};
  assert.equal(h.cancel().defaultPrevented, true); assert.equal(panel.requests, 0); assert.equal(panel.disposals, 0);
  h.context.pendingStorySettlement = null; h.openModal("battle result"); h.context.battle = { result: {} };
  assert.equal(h.cancel().defaultPrevented, false); h.flush();
  assert.equal(h.counts().leaveCount, 1); assert.equal(h.getRequest(), undefined);
});
