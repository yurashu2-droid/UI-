import test from "node:test";
import assert from "node:assert/strict";
import { createDeferredMount } from "../src/feature-loader.js";
import { loadFeatureStylesheet } from "../src/feature-styles.js";

const tick = () => new Promise(resolve => setImmediate(resolve));
const href = "./assets/workshop.css";

// EventTarget dispatches actual load/error events. Only browser-owned link and
// document properties are adapted; the loader and deferred lifecycle are real.
function environment() {
  const links = [], created = [];
  const document = {
    baseURI: "https://fixture.invalid/app/index.html",
    querySelectorAll: () => links.filter(link => link.rel === "stylesheet"),
    head: { appendChild(link) { links.push(link); link.isConnected = true; return link; } },
    createElement(tag) { assert.equal(tag, "link"); const link = new Link(); created.push(link); return link; },
  };
  class Link extends EventTarget {
    rel = "";
    href = "";
    disabled = false;
    isConnected = false;
    sheet = null;
    listeners = new Map();
    addEventListener(type, listener, options) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
      super.addEventListener(type, listener, options);
    }
    removeEventListener(type, listener, options) {
      this.listeners.get(type)?.delete(listener);
      super.removeEventListener(type, listener, options);
    }
    remove() { this.isConnected = false; const index = links.indexOf(this); if (index >= 0) links.splice(index, 1); }
    load() { this.sheet = {}; this.dispatchEvent(new Event("load")); }
    fail() { this.dispatchEvent(new Event("error")); }
    get listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
  }
  function foreign(loaded = true) {
    const link = new Link(); link.rel = "stylesheet";
    link.href = new URL(href, document.baseURI).href;
    if (loaded) link.sheet = {};
    document.head.appendChild(link);
    return link;
  }
  return { document, links, created, foreign };
}

test("stylesheet failure stays retryable and cannot resolve before a later successful load", async () => {
  const h = environment(); let ready = 0;
  const first = loadFeatureStylesheet(href, h.document);
  first.then(() => ready++, () => {});
  await tick(); assert.equal(ready, 0); assert.equal(h.links.length, 1);
  const failed = h.links[0]; const failure = assert.rejects(first, /stylesheet/i);
  failed.fail(); await failure;
  assert.equal(ready, 0); assert.equal(h.links.length, 0); assert.equal(failed.listenerCount, 0);
  const retry = loadFeatureStylesheet(href, h.document);
  retry.then(() => ready++);
  assert.notEqual(retry, first); assert.equal(h.created.length, 2);
  failed.load(); await tick(); assert.equal(ready, 0, "late event from the failed request is inert");
  h.links[0].load(); await retry;
  assert.equal(ready, 1); assert.equal(h.links[0].listenerCount, 0);
});

test("simultaneous hosts share one pending sheet and successful reopening reuses it", async () => {
  const h = environment();
  const first = loadFeatureStylesheet(href, h.document);
  const shared = loadFeatureStylesheet(new URL(href, h.document.baseURI).href, h.document);
  assert.equal(first, shared); assert.equal(h.created.length, 1);
  h.links[0].load(); await first;
  assert.equal(loadFeatureStylesheet(href, h.document), first);
  assert.equal(h.created.length, 1); assert.equal(h.links.length, 1);
});

test("unknown or failed foreign links are not readiness and are never removed", async () => {
  const h = environment(); const existing = h.foreign(false);
  const load = loadFeatureStylesheet(href, h.document);
  assert.equal(h.links.length, 2); assert.equal(existing.listenerCount, 0);
  const failure = assert.rejects(load, /stylesheet/i); h.created[0].fail(); await failure;
  assert.deepEqual(h.links, [existing]); assert.equal(existing.isConnected, true);
  const retry = loadFeatureStylesheet(href, h.document);
  h.created[1].load(); await retry;
  assert.deepEqual(h.links, [existing, h.created[1]]);
});

test("an enabled connected existing stylesheet is reused without listeners or new links", async () => {
  const h = environment(); const existing = h.foreign();
  await loadFeatureStylesheet(href, h.document);
  assert.equal(h.created.length, 0); assert.deepEqual(h.links, [existing]); assert.equal(existing.listenerCount, 0);
});

test("disabled or detached sheets cannot satisfy a new request", async () => {
  for (const change of [link => { link.disabled = true; }, link => { link.remove(); }]) {
    const h = environment(); const existing = h.foreign();
    await loadFeatureStylesheet(href, h.document); change(existing);
    let ready = false; const next = loadFeatureStylesheet(href, h.document); next.then(() => { ready = true; });
    await tick(); assert.equal(ready, false); assert.equal(h.created.length, 1);
    h.created[0].load(); await next;
  }
});

test("stylesheet caches are isolated by document and URL", async () => {
  const a = environment(), b = environment();
  const requests = [loadFeatureStylesheet(href, a.document), loadFeatureStylesheet(href, b.document), loadFeatureStylesheet("./assets/online.css", a.document)];
  assert.equal(a.links.length, 2); assert.equal(b.links.length, 1);
  for (const link of [...a.links, ...b.links]) link.load();
  await Promise.all(requests);
});

test("timeout removes the owned link and explicit retry needs its own load event", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = environment(); const first = loadFeatureStylesheet(href, h.document);
  const timedOut = assert.rejects(first, /timed out/i); const expired = h.links[0];
  t.mock.timers.tick(15_000); await timedOut;
  assert.equal(h.links.length, 0); assert.equal(expired.listenerCount, 0);
  let ready = false; const retry = loadFeatureStylesheet(href, h.document); retry.then(() => { ready = true; });
  expired.load(); await tick(); assert.equal(ready, false);
  h.links[0].load(); await retry;
  t.mock.timers.tick(30_000);
  assert.equal(h.links.length, 1, "a successful load cancels its timeout");
});

test("repeated CSS errors never mount a cached module, and close/reopen cannot revive a disposed host", async () => {
  const h = environment(); const mounts = [], errors = [], disposals = [];
  // A module can already be cached after the first import; CSS still gates every attempt.
  const module = { loadStyles: () => loadFeatureStylesheet(href, h.document) };
  const open = id => createDeferredMount({
    load: async () => { await module.loadStyles(); return module; },
    mount: () => { mounts.push(id); return { dispose: () => disposals.push(id) }; },
    onError: error => errors.push([id, error.message]),
  });
  const old = open("old");
  for (let attempt = 0; attempt < 3; attempt++) {
    const request = old.start(); assert.equal(old.start(), request); await tick();
    assert.equal(h.links.length, 1); h.links[0].fail(); await request;
    assert.equal(mounts.length, 0); assert.equal(h.links.length, 0);
  }
  const closedRequest = old.start(); await tick(); old.dispose();
  const current = open("current"), peer = open("peer");
  const currentRequest = current.start(), peerRequest = peer.start(); await tick();
  assert.equal(h.links.length, 1); assert.equal(h.created.length, 4);
  h.links[0].load(); await Promise.all([closedRequest, currentRequest, peerRequest]);
  assert.deepEqual(mounts, ["current", "peer"]); assert.equal(errors.length, 3);
  current.dispose(); peer.dispose(); assert.deepEqual(disposals, ["current", "peer"]);
  const reopened = open("reopened"); await reopened.start(); reopened.dispose();
  assert.deepEqual(mounts, ["current", "peer", "reopened"]);
  assert.equal(h.created.length, 4); assert.ok(h.created.every(link => link.listenerCount === 0));
});

test("late CSS error is silent for closed hosts and the next opening can retry", async () => {
  const h = environment(); let errors = 0, mounts = 0;
  const open = () => createDeferredMount({ load: () => loadFeatureStylesheet(href, h.document), mount: () => { mounts++; return { dispose() {} }; }, onError: () => errors++ });
  const old = open(); const pending = old.start(); await tick(); old.dispose(); h.links[0].fail(); await pending;
  assert.equal(errors, 0); assert.equal(mounts, 0);
  const next = open(); const ready = next.start(); await tick(); h.links[0].load(); await ready;
  assert.equal(mounts, 1); assert.equal(errors, 0); next.dispose();
});

test("a late load event cannot accept a detached, disabled, restricted, or sheet-less pending link", async () => {
  for (const invalidate of [link => link.remove(), link => { link.disabled = true; }, link => { link.media = "print"; }, link => { link.sheet = null; }]) {
    const h = environment(); let mounted = 0;
    const pending = loadFeatureStylesheet(href, h.document);
    pending.then(() => mounted++, () => {});
    const rejected = assert.rejects(pending, /stylesheet/i);
    const old = h.created[0]; old.sheet = {}; invalidate(old); old.dispatchEvent(new Event("load"));
    await rejected;
    assert.equal(mounted, 0); assert.equal(old.listenerCount, 0); assert.equal(h.links.length, 0);
    const retry = loadFeatureStylesheet(href, h.document); h.created[1].load(); await retry;
    assert.equal(h.links.length, 1);
  }
});

test("changing a reused link's asset or relation invalidates cached readiness", async () => {
  for (const change of [link => { link.href = "https://fixture.invalid/other.css"; }, link => { link.rel = "preload"; }]) {
    const h = environment(); const existing = h.foreign();
    await loadFeatureStylesheet(href, h.document); change(existing);
    let ready = false; const pending = loadFeatureStylesheet(href, h.document); pending.then(() => { ready = true; });
    await tick(); assert.equal(ready, false); assert.equal(h.created.length, 1);
    h.created[0].load(); await pending;
    assert.equal(existing.isConnected, true, "the loader must not remove an altered foreign link");
  }
});
