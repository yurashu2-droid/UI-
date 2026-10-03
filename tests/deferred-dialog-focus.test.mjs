import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { parseFragment } from 'parse5';
import { createDeferredMount } from '../src/feature-loader.js';
import { createStorySession } from '../src/story/session.js';
import { mountStoryHub } from '../src/story/hub.js';
import D from '../src/data.js';
import C from '../src/document.js';
import R from '../src/run.js';
import E from '../src/engine.js';
import { OnlineError } from '../src/online/client.js';

const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL('../src/app.ts', import.meta.url), 'utf8');
const hostSource = [
  source.slice(source.indexOf('let modalFeatureDispose:'), source.indexOf('/* ---------- Isolated story profile')),
  source.slice(source.indexOf('function openStoryHub()'), source.indexOf('function storyRewardPanel()')),
  source.slice(source.indexOf('function deferredModalFeature'), source.indexOf('async function playRaidChallenge')),
  source.match(/\$<HTMLDialogElement>\("#modal"\)\.addEventListener\("cancel", \(event\) => \{[^]*?^\}\);/m)[0],
].join('\n').replace('import("./story/panel.js")', 'loadModule("story")').replace('import("./online/panel.js")', 'loadModule("online")');
const hostCode = transformSync(hostSource, {loader: 'ts', target: 'es2022'}).code;
const panelSource = readFileSync(process.env.UI_RAID_QA_ONLINE_SOURCE || new URL('../src/online/panel.ts', import.meta.url), 'utf8')
  .replace(/^import\b[^]*?;\n/gm, '')
  .replace('export function mountOnlinePanel', 'function mountOnlinePanel')
  .replace('export const loadStyles', 'const loadStyles');
const panelCode = transformSync(panelSource, {loader: 'ts', target: 'es2022'}).code + '\nmountOnlinePanel;';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const camel = name => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Explicit DOM focus adapter, not browser verification. It models connected
// elements, activeElement, and focus falling to body when its node is removed.
// Real app host functions, createDeferredMount and both real panel renderers run.
// Module/CSS readiness, page painting and the online connection are controlled
// boundaries; no
// browser, rendered pixels, actual keyboard events or network timing are claimed.
function application() {
  const queuedClose = [], focusCalls = [], loads = [], styles = [], mounts = [], connections = [];
  const doc = {activeElement: null};
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
      this.parentElement = null; this.dataset = {}; this.attributes = {}; this.events = {};
      this.className = ''; this.style = {}; this._text = ''; this.value = ''; this.open = false;
      this.disabled = false;
      this.classList = {
        add: name => { this.className += ' ' + name; },
        remove: name => { this.className = this.className.split(/\s+/).filter(x => x !== name).join(' '); },
        contains: name => this.className.split(/\s+/).includes(name),
      };
    }
    get firstElementChild() { return this.children.find(child => child.tagName !== '#TEXT') ?? null; }
    get clientWidth() { return 960; }
    get isConnected() { return this === doc.body || !!this.parentElement?.isConnected; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
    remove() {
      if (this.isConnected && this.contains(doc.activeElement)) doc.activeElement = doc.body;
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
      this.parentElement = null;
    }
    replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this._text = ''; this.append(...nodes); }
    set textContent(text) { this.replaceChildren(); this._text = String(text); }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'class') this.className = value;
      if (name === 'id') this.id = value;
      if (name.startsWith('data-')) this.dataset[camel(name.slice(5))] = String(value);
    }
    getAttribute(name) { return name.startsWith('data-') ? this.dataset[camel(name.slice(5))] ?? null : this.attributes[name] ?? null; }
    matches(selector) {
      return selector.split(',').some(value => {
        const simple = value.trim();
        if (simple.startsWith('#')) return this.id === simple.slice(1);
        if (simple.startsWith('.')) return this.classList.contains(simple.slice(1));
        const attr = simple.match(/^\[([\w-]+)(?:=['"]?([^'"]*)['"])?\]$/);
        if (attr) return this.getAttribute(attr[1]) !== null && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
        return this.tagName === simple.toUpperCase();
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    set innerHTML(html) {
      const convert = item => {
        const node = new Element(item.tagName ?? '#text'); node._text = item.value ?? '';
        item.attrs?.forEach(({name, value}) => node.setAttribute(name, value));
        item.childNodes?.forEach(child => node.append(convert(child)));
        return node;
      };
      this.replaceChildren(...parseFragment(html).childNodes.map(convert));
    }
    addEventListener(type, fn, options) {
      (this.events[type] ??= []).push(fn);
      options?.signal?.addEventListener('abort', () => { this.events[type] = this.events[type].filter(item => item !== fn); });
    }
    focus(options) {
      focusCalls.push({node: this, options});
      const dialog = this.closest('dialog');
      if (this.isConnected && !this.disabled && (!dialog || dialog.open)) doc.activeElement = this;
    }
    // Native dialog autofocus is intentionally outside this bounded adapter.
    showModal() { this.open = true; }
    cancel() {
      const event = {defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }};
      this.events.cancel?.forEach(fn => fn(event));
      if (!event.defaultPrevented) this.close();
    }
    close() {
      if (!this.open) return;
      this.open = false;
      if (this.contains(doc.activeElement)) doc.activeElement = doc.body;
      queuedClose.push(() => this.events.close?.forEach(fn => fn({target: this})));
    }
  }
  doc.createElement = tag => new Element(tag);
  doc.body = new Element('body'); doc.activeElement = doc.body;
  const modal = new Element('dialog'), content = new Element('div'), outside = new Element('button');
  modal.setAttribute('id', 'modal'); content.setAttribute('id', 'modal-content');
  modal.append(content); doc.body.append(outside, modal);
  doc.querySelector = selector => doc.body.querySelector(selector);
  const noop = () => {};
  const onlineMount = vm.runInNewContext(panelCode, {
    document: doc, D, C, R, E, OnlineError, Error, V: {esc: text => String(text), render: noop}, AbortController,
    ResizeObserver: class { observe() {} disconnect() {} },
    window: {addEventListener: noop}, cancelAnimationFrame: noop,
    createOnlineClient: () => ({connect() { const connection = deferred(); connections.push(connection); return connection.promise; }, dispose: noop}),
  });
  const context = {
    document: doc, createDeferredMount, pendingStorySettlement: null, storyActive: true, battle: null,
    storySession: createStorySession(), run: {lives: 3, owned: []}, renderSide: noop,
    $: selector => doc.querySelector(selector),
    modalHead: () => '<button data-close-modal>Close</button>',
    storyCommand: noop, storyRewardPanel: noop, storyInboxPanel: noop,
    loadModule(kind) {
      const request = deferred(); loads.push({kind, ...request});
      return request.promise.then(() => ({
        loadStyles() { const ready = deferred(); styles.push({kind, ...ready}); return ready.promise; },
        mountStoryHub(host, callbacks) { const panel = mountStoryHub(host, callbacks); mounts.push({kind, host}); return panel; },
        mountOnlinePanel(host, options) { const panel = onlineMount(host, options); mounts.push({kind, host}); return panel; },
      }));
    },
  };
  vm.runInNewContext(hostCode, context);
  const $ = selector => doc.querySelector(selector);
  return {
    c: context, doc, modal, content, outside, focusCalls, loads, styles, mounts, connections, $,
    open(kind) { kind === 'story' ? context.openStoryHub() : context.onlinePanel(); },
    close: () => context.closeModal(),
    flushClose() { while (queuedClose.length) queuedClose.shift()(); },
    pendingClose: kind => $(`#${kind}-loading-head`)?.querySelector('[data-close-modal]'),
    realClose: kind => $(`#${kind}-feature-host`)?.querySelector(kind === 'story' ? '[data-story-action="close"]' : '[data-arena="close"]'),
    retry: kind => $(`#${kind}-feature-host`)?.querySelector('button'),
    async deliver(index = loads.length - 1) { loads[index].resolve(); await tick(); },
    async ready(index = styles.length - 1) { styles[index].resolve(); await tick(); },
  };
}

for (const kind of ['story', 'online']) {
  test(`DOM focus adapter: ${kind} transfers its focused loading Close only after real panel mount`, async () => {
    const h = application(); h.open(kind); await tick();
    const close = h.pendingClose(kind); assert.ok(close); close.focus();
    await h.deliver();
    assert.equal(h.doc.activeElement, close, 'module delivery alone must retain loading Close focus');
    assert.equal(h.mounts.length, 0); await h.ready();
    const replacement = h.realClose(kind); assert.ok(replacement, 'the actual renderer supplies a Close button');
    assert.equal(close.isConnected, false);
    assert.equal(h.doc.activeElement === replacement, true, 'removing focused loading Close must transfer focus to the real panel Close, not body');
    assert.equal(h.focusCalls.at(-1).options?.preventScroll, true);
  });

  test(`DOM focus adapter: ${kind} focused retry moves to safe pending Close through another failure and success`, async () => {
    const h = application(); h.open(kind); await tick(); await h.deliver();
    h.styles[0].reject(new Error('stylesheet unavailable')); await tick();
    const retry = h.retry(kind), close = h.pendingClose(kind); assert.ok(retry); retry.focus();
    retry.onclick(); retry.onclick();
    assert.equal(retry.isConnected, false);
    assert.equal(h.doc.activeElement === close, true, 'synchronous status replacement must not strand retry focus on body');
    await tick(); assert.equal(h.loads.length, 2); await h.deliver();
    h.styles[1].reject(new Error('still unavailable')); await tick();
    assert.equal(h.doc.activeElement, close, 'error UI must preserve pending Close focus');
    h.retry(kind).focus(); h.retry(kind).onclick(); await tick(); await h.deliver(); await h.ready();
    assert.equal(h.doc.activeElement === h.realClose(kind), true);
    assert.equal(h.mounts.length, 1);
  });

  test(`DOM focus adapter: ${kind} neither opening nor readiness steals body or another control's focus`, async () => {
    for (const mode of ['body', 'other', 'moved-away', 'moved-to-body']) {
      const h = application(); h.open(kind); await tick();
      assert.equal(h.focusCalls.length, 0, 'opening does not unconditionally autofocus');
      const other = kind === 'story' ? h.$('#story-open-inbox') : h.outside;
      if (mode.startsWith('moved-')) h.pendingClose(kind).focus();
      await h.deliver(); if (mode !== 'body') other.focus();
      if (mode === 'moved-to-body') other.remove();
      const expected = h.doc.activeElement, count = h.focusCalls.length;
      await h.ready();
      assert.equal(h.doc.activeElement, expected); assert.equal(h.focusCalls.length, count);
    }
  });

  test(`DOM focus adapter: ${kind} an unfocused retry cannot take another control's focus`, async () => {
    const h = application(); h.open(kind); await tick();
    h.loads[0].reject(new Error('module unavailable')); await tick();
    const retry = h.retry(kind); h.outside.focus(); const count = h.focusCalls.length;
    retry.onclick(); await tick(); await h.deliver(); await h.ready();
    assert.equal(h.doc.activeElement, h.outside); assert.equal(h.focusCalls.length, count);
  });

  test(`DOM focus adapter: ${kind} disposed and superseded CSS delivery never focuses a stale host`, async () => {
    for (const route of ['close', 'native-close', 'replace', 'reopen', 'new-run']) for (const fail of [false, true]) {
      const h = application(); h.open(kind); await tick(); h.pendingClose(kind).focus(); await h.deliver();
      if (route === 'native-close') h.modal.cancel();
      else if (route === 'replace') h.c.openModal('<button id="new-panel">New panel</button>');
      else { h.close(); if (route === 'reopen') h.open(kind); }
      if (route === 'new-run') { h.c.storyActive = false; h.c.run = {lives: 99, marker: 'new run'}; }
      h.flushClose();
      const target = h.$('#new-panel') ?? (route === 'reopen' ? h.pendingClose(kind) : h.outside);
      target.focus(); const count = h.focusCalls.length, run = JSON.stringify(h.c.run);
      fail ? h.styles[0].reject(new Error('stale stylesheet')) : h.styles[0].resolve(); await tick();
      assert.equal(h.mounts.length, 0); assert.equal(h.doc.activeElement, target);
      assert.equal(h.focusCalls.length, count); assert.equal(JSON.stringify(h.c.run), run);
      if (route === 'reopen') { await h.deliver(); await h.ready(); assert.equal(h.mounts.length, 1); assert.equal(h.doc.activeElement === h.realClose(kind), true); }
    }
  });

  for (const pending of ['module', 'stylesheet']) for (const fail of [false, true]) {
    test(`DOM focus adapter: ${kind} native cancel suppresses ${pending} ${fail ? 'failure' : 'success'} before queued close notification`, async () => {
      const h = application(); h.open(kind); await tick(); h.pendingClose(kind).focus();
      if (pending === 'stylesheet') await h.deliver();
      const oldHost = h.$(`#${kind}-feature-host`), oldChildren = [...oldHost.children];
      h.modal.cancel(); assert.equal(h.modal.open, false);
      const count = h.focusCalls.length;
      // Intentionally do NOT flushClose until after Promise delivery: the
      // browser's native cancellation and its queued close event are separate.
      if (pending === 'module') {
        fail ? h.loads[0].reject(new Error('late module failure')) : h.loads[0].resolve(); await tick();
        if (!fail && h.styles.length) await h.ready();
      } else {
        fail ? h.styles[0].reject(new Error('late stylesheet failure')) : h.styles[0].resolve(); await tick();
      }
      assert.equal(h.mounts.length, 0, 'native cancellation must suppress mount before the close event');
      assert.deepEqual(oldHost.children, oldChildren, 'late failure must not redraw a natively closed host');
      assert.equal(h.focusCalls.length, count, 'native cancellation must not attempt focus on the closed dialog');
      h.flushClose();
    });
  }

  test(`DOM focus adapter: ${kind} pending settlement prevents native cancel and keeps the current host live`, async () => {
    const h = application(); h.open(kind); await tick(); h.pendingClose(kind).focus(); await h.deliver();
    h.c.pendingStorySettlement = {unsaved: true}; h.modal.cancel();
    assert.equal(h.modal.open, true); await h.ready();
    assert.equal(h.mounts.length, 1); assert.equal(h.doc.activeElement === h.realClose(kind), true);
  });

  test(`DOM focus adapter: ${kind} old retry is inert after replacement`, async () => {
    const h = application(); h.open(kind); await tick(); h.loads[0].reject(new Error('module unavailable')); await tick();
    const retry = h.retry(kind); retry.focus(); h.c.openModal('<button id="new-panel">New panel</button>');
    const target = h.$('#new-panel'); target.focus(); const count = h.focusCalls.length;
    retry.onclick(); await tick();
    assert.equal(h.loads.length, 1); assert.equal(h.doc.activeElement, target); assert.equal(h.focusCalls.length, count);
  });
}

const onlineView = () => ({
  revision: 0,
  online: {id: 'connected-run', roundLimit: 8, rating: 1000, requiresNewRun: false,
    publishedSnapshotId: null, pendingMatchId: null, inbox: []},
  run: {...createStorySession().run, phase: 'build', shop: [], owned: [], admin: [], history: []},
  rules: {lives: 3}, match: null,
});

for (const failure of [false, true]) {
  test(`DOM focus adapter: online initial connection ${failure ? 'failure' : 'success'} preserves its actually focused real Close`, async () => {
    const h = application(); h.open('online'); await tick(); await h.deliver(); await h.ready();
    const close = h.realClose('online'); assert.ok(close); close.focus();
    assert.equal(h.connections.length, 1);
    failure ? h.connections[0].reject(new Error('arena unavailable')) : h.connections[0].resolve(onlineView()); await tick();
    const replacement = h.realClose('online');
    assert.ok(h.$('#online-feature-host').querySelector(failure ? '.is-error' : '.arena-metrics'), 'the requested connection outcome actually renders');
    assert.ok(replacement); assert.notEqual(replacement, close, 'connection settlement really replaces the Close node');
    assert.equal(close.isConnected, false);
    assert.equal(h.doc.activeElement === replacement, true, 'the response rerender must preserve currently owned Close focus');
    assert.equal(h.focusCalls.at(-1).options?.preventScroll, true);
  });

  test(`DOM focus adapter: online transferred loading Close survives connection ${failure ? 'failure' : 'success'}`, async () => {
    const h = application(); h.open('online'); await tick(); h.pendingClose('online').focus();
    await h.deliver(); await h.ready();
    assert.equal(h.doc.activeElement === h.realClose('online'), true, 'host first transfers ownership to the real panel Close');
    failure ? h.connections[0].reject(new Error('arena unavailable')) : h.connections[0].resolve(onlineView()); await tick();
    assert.equal(h.doc.activeElement === h.realClose('online'), true, 'the connection rerender preserves that same current focus ownership');
  });

  test(`DOM focus adapter: online connection ${failure ? 'failure' : 'success'} never steals moved-away or superseded focus`, async () => {
    for (const route of ['move-away', 'replacement', 'native-cancel']) {
      const h = application(); h.open('online'); await tick(); await h.deliver(); await h.ready();
      h.realClose('online').focus();
      if (route === 'replacement') h.c.openModal('<button id="new-panel">New panel</button>');
      if (route === 'native-cancel') h.modal.cancel();
      const target = h.$('#new-panel') ?? h.outside; target.focus(); const count = h.focusCalls.length;
      failure ? h.connections[0].reject(new Error('arena unavailable')) : h.connections[0].resolve(onlineView()); await tick();
      assert.equal(h.doc.activeElement, target); assert.equal(h.focusCalls.length, count);
      if (route !== 'move-away') assert.equal(h.realClose('online') == null, true, 'disposed panel is absent before queued close');
      h.flushClose();
    }
  });
}
