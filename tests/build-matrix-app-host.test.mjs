import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { parseFragment } from 'parse5';
import { createDeferredMount } from '../src/feature-loader.js';
import * as Lab from '../src/buildlab.js';
import { roundRobinAsync } from '../src/buildlab-async.js';
import { BUILDS } from '../src/builds.js';
import D from '../src/data.js';
import R from '../src/run.js';

// The real app host, deferred lifecycle and async combat helper execute here.
// This bounded Node DOM/focus/host-task adapter is not browser/AT acceptance.
// Only module delivery and the host-task queue are controlled boundaries.
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL('../src/app.ts', import.meta.url), 'utf8');
const part = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `actual app section ${from}`);
  return source.slice(start, end);
};
const hostCode = transformSync([
  part('let modalFeatureDispose:', '/* ---------- Isolated story profile'),
  part('function deferredModalFeature', 'function onlinePanel()'),
  part('function modalHead(', 'function help()'),
  part('function buildBook()', 'function settings()'),
  source.match(/\$<HTMLDialogElement>\("#modal"\)\.addEventListener\("cancel", \(event\) => \{[^]*?^\}\);/m)[0],
].join('\n').replace('import("./buildlab-async.js")', 'loadMatrixModule()'), {loader: 'ts', target: 'es2022'}).code;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const camel = name => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function application({list} = {}) {
  const queuedClose = [], focusCalls = [], loads = [], computations = [], writes = [];
  const tasks = new Map(); let timerId = 0, timerFailure = false, syncCalls = 0;
  const doc = {activeElement: null};
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
      this.parentElement = null; this.dataset = {}; this.attributes = {}; this.events = {};
      this.className = ''; this.style = {}; this._text = ''; this.value = ''; this.open = false; this.disabled = false;
      this.classList = {
        add: name => { this.className += ' ' + name; },
        remove: name => { this.className = this.className.split(/\s+/).filter(x => x !== name).join(' '); },
        contains: name => this.className.split(/\s+/).includes(name),
      };
    }
    get isConnected() { return this === doc.body || !!this.parentElement?.isConnected; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
    remove() {
      if (this.isConnected && this.contains(doc.activeElement)) doc.activeElement = doc.body;
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
      this.parentElement = null;
    }
    replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this._text = ''; this.append(...nodes); }
    set textContent(text) { this.replaceChildren(); this._text = String(text); writes.push({node: this, text: this._text}); }
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
    addEventListener(type, fn) { (this.events[type] ??= []).push(fn); }
    focus(options) {
      focusCalls.push({node: this, options}); const dialog = this.closest('dialog');
      if (this.isConnected && !this.disabled && (!dialog || dialog.open)) doc.activeElement = this;
    }
    showModal() { this.open = true; }
    cancel() {
      const event = {defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }};
      this.events.cancel?.forEach(fn => fn(event)); if (!event.defaultPrevented) this.close();
    }
    close() {
      if (!this.open) return;
      this.open = false; if (this.contains(doc.activeElement)) doc.activeElement = doc.body;
      queuedClose.push(() => this.events.close?.forEach(fn => fn({target: this})));
    }
  }
  doc.createElement = tag => new Element(tag);
  doc.body = new Element('body'); doc.activeElement = doc.body;
  const modal = new Element('dialog'), content = new Element('div'), outside = new Element('button');
  modal.setAttribute('id', 'modal'); content.setAttribute('id', 'modal-content');
  modal.append(content); doc.body.append(outside, modal);
  doc.querySelector = selector => doc.body.querySelector(selector);
  doc.getElementById = id => doc.querySelector('#' + id);
  const setTimeout = callback => {
    if (timerFailure) { timerFailure = false; throw new Error('host scheduler unavailable <unsafe>'); }
    const id = ++timerId; tasks.set(id, callback); return id;
  };
  const clearTimeout = id => tasks.delete(id);
  const moduleValue = {roundRobinAsync(input, options) {
    const work = {options, progress: [], result: null, error: null}; computations.push(work);
    const promise = roundRobinAsync(list ?? input, {...options, onProgress(progress) {
      work.progress.push({...progress}); options.onProgress?.(progress);
    }});
    promise.then(result => { work.result = result; }, error => { work.error = error; });
    return promise;
  }};
  const context = {
    document: doc, createDeferredMount, AbortController, Error, D, BUILDS, esc,
    Lab: {...Lab, roundRobin(...args) { syncCalls++; return Lab.roundRobin(...args); }},
    window: {setTimeout, clearTimeout}, setTimeout, clearTimeout,
    pendingStorySettlement: null, battle: null, run: R.newRun('lab', 'mixed'),
    renderSide() {}, leaveBattle() {}, $: selector => doc.querySelector(selector),
    localStorage: {setItem() { throw new Error('matrix must not store'); }},
    fetch() { throw new Error('matrix must not access network'); },
    loadMatrixModule() { const request = deferred(); loads.push(request); return request.promise; },
  };
  vm.runInNewContext(hostCode, context);
  return {
    c: context, doc, modal, content, outside, tasks, loads, computations, focusCalls, writes,
    $: selector => doc.querySelector(selector), open: () => context.buildBook(), close: () => context.closeModal(),
    get syncCalls() { return syncCalls; }, failNextTimer() { timerFailure = true; },
    host: () => doc.querySelector('#bd-matrix'), action: () => doc.querySelector('#bd-matrix')?.querySelector('button'),
    closeControl: () => content.querySelector('[data-close-modal]'),
    flushClose() { while (queuedClose.length) queuedClose.shift()(); },
    async deliver(index = loads.length - 1) { assert.ok(loads[index], 'matrix must load its optional async module'); loads[index].resolve(moduleValue); await flush(); },
    async turn() { const next = tasks.entries().next().value; if (next) { tasks.delete(next[0]); next[1](); } await flush(); },
    async finish() { for (let i = 0; tasks.size && i < 1000; i++) await this.turn(); assert.equal(tasks.size, 0); },
  };
}

async function loaded(options) { const h = application(options); h.open(); await flush(); await h.deliver(); return h; }

test('actual build book lazy-loads cancellable work and reports real progress without synchronously computing', async () => {
  const h = application(); const before = structuredClone(h.c.run); h.open(); await flush();
  assert.equal(h.loads.length, 1, 'opening the book must request the async module');
  assert.equal(h.syncCalls, 0); assert.equal(h.computations.length, 0);
  assert.equal(h.content.querySelectorAll('[data-build-load]').length, BUILDS.length);
  assert.equal(h.content.querySelectorAll('[data-build-foe]').length, BUILDS.filter(b => b.labOpponent !== false).length);
  assert.match(h.content.textContent, /CPU\s*56/); assert.match(h.content.textContent, /管理画面\s*4枠/);
  await h.deliver(); assert.equal(h.computations.length, 1); assert.equal(h.tasks.size, 1);
  const progress = h.host().querySelector('progress'), status = h.host().querySelector('[role="status"]');
  assert.ok(progress, 'native progress element'); assert.ok(progress.getAttribute('aria-label'));
  assert.equal(status.getAttribute('aria-live'), 'polite'); assert.equal(progress.max, 240); assert.equal(progress.value, 0);
  assert.match(h.action().textContent, /中止/); await h.turn();
  assert.ok(progress.value > 0 && progress.value <= 4, 'first real batch completes at most four matches');
  assert.equal(h.host().querySelector('table'), null); h.close(); await flush();
  assert.equal(h.tasks.size, 0); assert.equal(h.computations[0].options.signal.aborted, true);
  assert.equal(h.syncCalls, 0); assert.deepEqual(h.c.run, before);
});

test('actual async matrix preserves every synchronous result, table ordering, titles and card action data', async () => {
  const h = await loaded(); const expected = Lab.roundRobin(); const before = structuredClone(h.c.run);
  await h.finish(); assert.deepEqual(h.computations[0].result, expected); assert.equal(h.syncCalls, 0);
  const order = expected.list.map((_, i) => i).sort((a, b) => expected.wins[b] - expected.wins[a]);
  const table = h.host().querySelector('table'); assert.ok(table); const rows = table.querySelectorAll('tr');
  assert.equal(rows.length, order.length + 1);
  assert.deepEqual(rows[0].querySelectorAll('th').slice(1, -1).map(n => n.textContent), order.map(i => expected.list[i].name.slice(0, 5)));
  for (const [rowIndex, i] of order.entries()) {
    const row = rows[rowIndex + 1], heading = row.querySelector('th'), cells = row.querySelectorAll('td');
    assert.equal(heading.textContent, expected.list[i].name); assert.equal(heading.className, expected.list[i].build ? 'is-build' : '');
    assert.equal(cells.at(-1).textContent, String(expected.wins[i]));
    order.forEach((j, column) => {
      const actual = cells[column], c = expected.cells[i][j];
      if (!c) { assert.equal(actual.className, 'bd-self'); assert.equal(actual.textContent, '—'); return; }
      const k = c.winner === 'player' ? 'w' : c.winner === 'draw' ? 'd' : 'l';
      assert.equal(actual.className, 'bd-' + k);
      assert.equal(actual.textContent, (k === 'w' ? '勝' : k === 'd' ? '分' : '負') + c.time.toFixed(0) + 's');
      assert.equal(actual.getAttribute('title'), `${expected.list[i].name} vs ${expected.list[j].name}：${c.time.toFixed(1)}秒 / 残り ${Math.round(c.hpA * 100)}% 対 ${Math.round(c.hpB * 100)}%`);
    });
  }
  const status = h.host().querySelector('[role="status"]'); assert.match(status.textContent, /240.*240.*100%/);
  const updates = h.writes.filter(w => w.node === status);
  assert.ok(updates.length <= 13, `coarse progress must not announce every batch (${updates.length})`);
  assert.equal(h.host().querySelector('progress'), null); assert.equal(h.action(), null); assert.deepEqual(h.c.run, before);
});

test('actual build matrix preserves escaped names using real combat results', async () => {
  const list = Lab.entrants().slice(0, 3).map((entry, i) => ({...entry, name: `${i} <img src=x onerror=attack()> & "quoted"`}));
  const h = await loaded({list}); await h.finish();
  assert.equal(h.host().querySelector('img'), null);
  const rows = h.host().querySelector('table').querySelectorAll('tr').slice(1);
  assert.deepEqual(new Set(rows.map(row => row.querySelector('th').textContent)), new Set(list.map(e => e.name)));
});

for (const route of ['close', 'native-cancel', 'native-close', 'replace', 'reopen']) {
  for (const fail of [false, true]) test(`late matrix module ${fail ? 'failure' : 'success'} is inert after ${route}, before queued close`, async () => {
    const h = application(); h.open(); await flush(); assert.equal(h.loads.length, 1);
    const oldHost = h.host(), children = [...oldHost.children];
    if (route === 'close') h.close();
    else if (route === 'native-cancel') h.modal.cancel();
    else if (route === 'native-close') h.modal.close();
    else if (route === 'replace') h.c.openModal('<button id="replacement">replacement</button>');
    else { h.close(); h.open(); await flush(); }
    h.outside.focus(); const focusCount = h.focusCalls.length;
    fail ? h.loads[0].reject(new Error('stale module')) : h.loads[0].resolve({roundRobinAsync() { throw new Error('stale computation started'); }});
    await flush(); assert.deepEqual(oldHost.children, children); assert.equal(h.computations.length, 0); assert.equal(h.tasks.size, 0);
    assert.equal(h.focusCalls.length, focusCount); assert.equal(h.doc.activeElement, h.outside); h.flushClose();
    if (route === 'reopen') { await h.deliver(1); assert.equal(h.computations.length, 1); h.close(); await flush(); }
  });
}

for (const route of ['close', 'native-cancel', 'native-close', 'replace', 'reopen']) test(`pending real combat batch is invalidated on ${route}`, async () => {
  const h = await loaded(); await h.turn(); const work = h.computations[0], count = work.progress.at(-1).completed;
  const oldHost = h.host(), text = oldHost.textContent;
  if (route === 'close') h.close();
  else if (route === 'native-cancel') h.modal.cancel();
  else if (route === 'native-close') h.modal.close();
  else if (route === 'replace') h.c.openModal('<button id="replacement">replacement</button>');
  else { h.close(); h.open(); await flush(); }
  if (route !== 'native-close') assert.equal(h.tasks.size, 0, 'known disposal must remove the pending host task');
  await h.turn(); assert.equal(work.options.signal.aborted, true); assert.equal(work.progress.at(-1).completed, count);
  assert.equal(work.result, null); assert.equal(oldHost.textContent, text); h.flushClose();
  if (route === 'reopen') { await h.deliver(1); assert.equal(h.computations.length, 2); h.close(); await flush(); }
});

test('explicit cancel permits a fresh retry without old abort delivery clobbering it', async () => {
  const h = await loaded({list: Lab.entrants().slice(0, 3)}); await h.turn();
  const action = h.action(); action.focus(); action.onclick();
  assert.equal(h.computations[0].options.signal.aborted, true); assert.equal(h.tasks.size, 0);
  assert.match(h.host().textContent, /中止/); assert.match(h.action().textContent, /再試行|もう一度/);
  assert.equal(h.doc.activeElement, h.action(), 'current action focus remains usable after cancellation');
  h.action().onclick(); assert.equal(h.computations.length, 2); await flush();
  assert.match(h.action().textContent, /中止/); assert.equal(h.tasks.size, 1); await h.finish();
  assert.ok(h.host().querySelector('table')); assert.equal(h.computations[0].result, null);
});

test('real async scheduler errors show a safe explicit retry, then recover', async () => {
  const h = application({list: Lab.entrants().slice(0, 3)}); h.open(); await flush(); h.failNextTimer(); await h.deliver();
  assert.equal(h.computations[0].error?.message, 'host scheduler unavailable <unsafe>');
  assert.match(h.host().textContent, /計算.*できません|計算.*失敗/); assert.equal(h.host().querySelector('unsafe'), null);
  assert.match(h.action().textContent, /再試行|もう一度/); h.action().focus(); h.action().onclick(); await flush(); await h.finish();
  assert.equal(h.computations.length, 2); assert.ok(h.host().querySelector('table'));
});

test('module failure retries through the established deferred host with live focus continuity', async () => {
  const h = application({list: Lab.entrants().slice(0, 3)}); h.open(); await flush(); h.loads[0].reject(new Error('missing chunk')); await flush();
  assert.match(h.host().textContent, /読み込めません/); const retry = h.action(); assert.ok(retry); retry.focus(); retry.onclick(); retry.onclick(); await flush();
  assert.equal(h.loads.length, 2); assert.equal(h.doc.activeElement, h.closeControl()); await h.deliver(1); await h.finish();
  assert.equal(h.doc.activeElement, h.closeControl()); assert.equal(h.computations.length, 1);
});

test('native-closed module retry is inert even before close notification', async () => {
  const h = application(); h.open(); await flush(); h.loads[0].reject(new Error('missing chunk')); await flush();
  const retry = h.action(), children = [...h.host().children]; h.modal.close(); retry.onclick(); await flush();
  assert.equal(h.loads.length, 1); assert.deepEqual(h.host().children, children); h.flushClose();
});

for (const moved of [false, true]) test(`successful matrix preserves ${moved ? 'moved-away' : 'current action'} focus without stealing it`, async () => {
  const h = await loaded({list: Lab.entrants().slice(0, 3)}); h.action().focus();
  if (moved) h.outside.focus(); const focusCount = h.focusCalls.length; await h.finish();
  assert.equal(h.doc.activeElement, moved ? h.outside : h.closeControl());
  assert.equal(h.focusCalls.length, focusCount + (moved ? 0 : 1));
  if (!moved) assert.equal(h.focusCalls.at(-1).options.preventScroll, true);
});

test('cancel and retry callbacks retained from a replaced book cannot restart computation', async () => {
  const h = await loaded(); const cancel = h.action(); cancel.onclick(); const retry = h.action();
  h.c.openModal('<button id="replacement">replacement</button>'); cancel.onclick(); retry.onclick(); await flush();
  assert.equal(h.computations.length, 1); assert.equal(h.tasks.size, 0); assert.equal(h.$('#replacement').textContent, 'replacement');
});

test('a retained completed action cannot overwrite the final matrix status', async () => {
  const h = await loaded({list: Lab.entrants().slice(0, 3)}); const action = h.action(), cancel = action.onclick;
  await h.finish(); const text = h.host().textContent;
  assert.equal(action.isConnected, false); cancel(); await flush();
  assert.equal(h.host().textContent, text); assert.equal(h.computations.length, 1);
});

test('empty real entrant lists finish truthfully at zero of zero with no scheduled combat', async () => {
  const h = await loaded({list: []}); await h.finish();
  assert.match(h.host().querySelector('[role="status"]').textContent, /0 \/ 0試合（100%）/);
  assert.equal(h.computations[0].result.list.length, 0); assert.equal(h.tasks.size, 0);
});

test('cancellation reports completed helper matches rather than mutable meter properties', async () => {
  const h = await loaded(); await h.turn(); const real = h.computations[0].progress.at(-1);
  const progress = h.host().querySelector('progress'); progress.value = 999; progress.max = 1000;
  h.action().onclick(); await flush();
  assert.ok(h.host().textContent.includes(`${real.completed} / ${real.total}試合`));
});
