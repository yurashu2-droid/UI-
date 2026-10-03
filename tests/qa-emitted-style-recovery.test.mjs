import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { build } from 'vite';
import { createStoryState } from '../src/story/state.js';

// Evaluate only the real emitted story module graph in Node's native ESM VM.
// No app entry, browser, network, page navigation or external stylesheet request.
// The DOM port delivers explicit link load/error events; visual QA is separate.
const probe = String.raw`
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const origin = 'https://ui-raid-fixture.invalid/';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture() {
  const timers = new Map(); let timerId = 0;
  const setTimer = callback => { const id = ++timerId; timers.set(id, callback); return id; };
  const clearTimer = id => timers.delete(id);
  const madeLinks = [];
  let doc;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentNode = null;
      this.dataset = {}; this.style = {}; this.attributes = {}; this.events = new Map();
      this.className = ''; this.textContent = ''; this.sheet = null; this.disabled = false;
      this.classList = {add: name => { this.className += ' ' + name; }, remove() {}, toggle() {}};
      if (tag === 'link') madeLinks.push(this);
    }
    get isConnected() { return this === doc.documentElement || !!this.parentNode?.isConnected; }
    appendChild(node) { node.remove(); node.parentNode = this; this.children.push(node); return node; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
    removeChild(node) { this.children = this.children.filter(child => child !== node); node.parentNode = null; return node; }
    remove() { this.parentNode?.removeChild(this); }
    setAttribute(name, value) { this.attributes[name] = value; if (name === 'href') this.href = value; if (name === 'rel') this.rel = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(type, callback) { const list = this.events.get(type) ?? new Set(); list.add(callback); this.events.set(type, list); }
    removeEventListener(type, callback) { this.events.get(type)?.delete(callback); }
    fire(type) { if (type === 'load') this.sheet = {}; for (const fn of [...this.events.get(type) ?? []]) fn({type, target: this}); }
    querySelectorAll(selector) { assert.ok(selector.startsWith('link'), 'only stylesheet DOM queries are needed'); return madeLinks.filter(link => link.isConnected); }
    focus() {}
  }
  doc = {baseURI: origin + 'index.html', createElement: tag => new Element(tag),
    querySelectorAll: selector => doc.documentElement.querySelectorAll(selector)};
  doc.documentElement = new Element('html'); doc.head = new Element('head'); doc.body = new Element('body');
  doc.documentElement.append(doc.head, doc.body);
  doc.defaultView = {setTimeout: setTimer, clearTimeout: clearTimer};
  const context = vm.createContext({document: doc, URL, Promise, Error, Event, structuredClone,
    setTimeout: setTimer, clearTimeout: clearTimer, window: doc.defaultView});
  const modules = new Map();
  function getModule(filename) {
    if (modules.has(filename)) return modules.get(filename);
    assert.ok(Object.hasOwn(input.code, filename), 'only local emitted modules may execute: ' + filename);
    const module = new vm.SourceTextModule(input.code[filename], {context, identifier: origin + filename,
      initializeImportMeta(meta, module) { meta.url = module.identifier; meta.resolve = id => new URL(id, module.identifier).href; }});
    modules.set(filename, module); return module;
  }
  const linker = (specifier, referencing) => {
    const url = new URL(specifier, referencing.identifier);
    assert.equal(url.origin, new URL(origin).origin); return getModule(url.pathname.slice(1));
  };
  const panel = getModule(input.panel); await panel.link(linker); await panel.evaluate();
  const helper = getModule('__qa__/feature-loader.js'); await helper.link(linker); await helper.evaluate();
  assert.equal(typeof panel.namespace.loadStyles, 'function', 'emitted panel must expose explicit stylesheet readiness');
  assert.equal(typeof panel.namespace.mountStoryHub, 'function');
  const createDeferredMount = helper.namespace.createDeferredMount;
  function feature() {
    const host = doc.createElement('div'); doc.body.append(host); const observations = {mounts: 0, errors: []};
    const handle = createDeferredMount({
      async load() { await panel.namespace.loadStyles(); return panel.namespace; },
      mount(value) { observations.mounts++; return value.mountStoryHub(host, {
        getState: () => input.story, onCommand: async () => ({ok: false, error: 'No test transaction', state: input.story, effects: []}),
        onEdit() {}, onBattle() {}, onOptionalRaid() {},
      }); }, onError: error => observations.errors.push(error.message),
    });
    return {handle, host, observations};
  }
  return {feature, madeLinks, timers};
}
function assertLocalStoryCss(link) {
  const url = new URL(link.href); assert.equal(url.origin, new URL(origin).origin);
  assert.ok(Object.hasOwn(input.assets, url.pathname.slice(1)), 'the emitted URL must name a real built local asset');
  assert.match(input.assets[url.pathname.slice(1)], /\.story-hub(?:[\s.{,:>]|$)/);
}
const first = await fixture(), current = first.feature();
const attempt = current.handle.start(); await tick();
assert.equal(first.madeLinks.length, 1); assertLocalStoryCss(first.madeLinks[0]);
assert.equal(current.observations.mounts, 0, 'module evaluation alone never mounts an unstyled hub');
first.madeLinks[0].fire('error'); await attempt;
assert.equal(current.observations.errors.length, 1); assert.equal(current.observations.mounts, 0);
assert.equal(first.madeLinks[0].isConnected, false, 'failed owned link is removed');
const retry = current.handle.start(), repeated = current.handle.start(); assert.equal(retry, repeated); await tick();
assert.equal(first.madeLinks.length, 2, 'explicit retry creates a fresh real stylesheet attempt');
assert.notEqual(first.madeLinks[0], first.madeLinks[1]); assertLocalStoryCss(first.madeLinks[1]);
assert.equal(current.observations.mounts, 0, 'retry is not successful until the CSS load event');
first.madeLinks[1].fire('load'); await retry;
assert.equal(current.observations.mounts, 1); assert.ok(current.host.children[0].className.includes('story-hub'));
current.handle.dispose(); assert.equal(current.host.children.length, 0);
const cached = first.feature(); await cached.handle.start();
assert.equal(cached.observations.mounts, 1); assert.equal(first.madeLinks.length, 2, 'a loaded owned sheet is reused');
cached.handle.dispose();
for (const outcome of ['load', 'error']) {
  const f = await fixture(), old = f.feature(); const pending = old.handle.start(); await tick(); old.handle.dispose();
  f.madeLinks[0].fire(outcome); await pending;
  assert.equal(old.observations.mounts, 0); assert.equal(old.observations.errors.length, 0); assert.equal(old.host.children.length, 0);
}
const f = await fixture(), old = f.feature(); const pending = old.handle.start(); await tick(); old.handle.dispose();
const newer = f.feature(); const ready = newer.handle.start(); await tick();
assert.equal(f.madeLinks.length, 1, 'reopening joins the same pending CSS attempt');
f.madeLinks[0].fire('load'); await Promise.all([pending, ready]);
assert.equal(old.observations.mounts, 0); assert.equal(newer.observations.mounts, 1); newer.handle.dispose();
assert.equal(first.timers.size + f.timers.size, 0, 'settled requests leave no timeout work');
console.log(JSON.stringify({freshLinksAfterRetry: first.madeLinks.length, mountedAfterLoad: current.observations.mounts, ignoredDisposedOutcomes: 2, onlyReopenedHubMounted: true}));
`;

test('QA: emitted story graph waits for real CSS readiness, retries a failed asset and ignores disposed outcomes', async () => {
  const root = process.env.UI_RAID_QA_BUILD_ROOT || fileURLToPath(new URL('../', import.meta.url));
  const result = await build({root, logLevel: 'silent', build: {write: false}});
  assert.ok(!Array.isArray(result));
  const output = new Map(result.output.map(item => [item.fileName, item]));
  const panel = result.output.find(item => item.type === 'chunk' && Object.keys(item.modules).some(id => id.endsWith('/src/story/panel.ts')));
  assert.ok(panel, 'emitted dynamic story panel exists');
  const code = {};
  function include(filename) {
    if (Object.hasOwn(code, filename)) return;
    const chunk = output.get(filename); assert.equal(chunk?.type, 'chunk');
    assert.ok(!Object.keys(chunk.modules).some(id => id.endsWith('/src/app.ts')), 'never evaluate the app entry or its side effects');
    code[filename] = chunk.code; chunk.imports.forEach(include);
  }
  include(panel.fileName);
  code['__qa__/feature-loader.js'] = transformSync(readFileSync(new URL('../src/feature-loader.ts', import.meta.url), 'utf8'), {loader: 'ts', target: 'es2022', format: 'esm'}).code;
  const assets = Object.fromEntries(result.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => [item.fileName, typeof item.source === 'string' ? item.source : Buffer.from(item.source).toString('utf8')]));
  const run = spawnSync(process.execPath, ['--no-warnings', '--experimental-vm-modules', '--input-type=module', '-e', probe], {
    cwd: root, encoding: 'utf8', input: JSON.stringify({panel: panel.fileName, code, assets, story: createStoryState()}), timeout: 15000, maxBuffer: 2_000_000,
  });
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.deepEqual(JSON.parse(run.stdout), {freshLinksAfterRetry: 2, mountedAfterLoad: 1, ignoredDisposedOutcomes: 2, onlyReopenedHubMounted: true});
});
