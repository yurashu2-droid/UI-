import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { mountStoryHub } from '../src/story/hub.ts';
import * as StorySession from '../src/story/session.ts';
import { createDeferredMount } from '../src/feature-loader.ts';
import { createHash } from 'node:crypto';
import { reconstructStaticCode } from '../src/raid/code.ts';
import { ElementAdapter } from './support/raid-dom-adapter.mjs';

// Execute the actual hub, app command/commit,
// optional-raid callback, modal lifecycle and story persistence. Only DOM,
// stylesheet/module delivery and local storage are adapters. Ordinary RED
// paths submit only the live form. Later stale dispatches are adversarial
// boundary checks, not claimed player actions; no retired DOM is reinserted.
// No browser/service/network is used. These are not browser-rendering, native
// validation, focus or accessibility acceptance tests.
// Removing current-owner form restoration must fail recovery assertions.
// Address data stays in the live form only, never in a save or diagnostic.
const source = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const names = ['commitStorySession', 'storyCommand', 'openStoryHub', 'deferredModalFeature', 'localRaidEditingAllowed', 'raidPanel'];
let declarations = names.map(name => {
  const match = source.match(new RegExp(`^(?:async )?function ${name}(?:<[^>]+>)?\\([^]*?^}`, 'm'));
  assert.ok(match, `execute actual ${name}`);
  return match[0];
}).join('\n');
declarations = declarations.replace('import("./story/panel.js")', 'loadStoryModule()')
  .replace('import("./raid/panel.js")', 'loadRaidModule()');
const modal = source.slice(source.indexOf('let modalFeatureDispose:'), source.indexOf('/* ---------- Isolated story profile'));
const compiled = transformSync(modal + '\n' + declarations, {loader: 'ts', target: 'es2022'}).code;
const tick = () => new Promise(resolve => setImmediate(resolve));
const clone = value => structuredClone(value);
const named = () => StorySession.commandStorySession(StorySession.createStorySession(), {type: 'name-page', name: 'Address recovery'}).session;

async function environment(initial = named()) {
  class Element extends ElementAdapter {
    constructor(doc, tag) { super(doc, tag); this.value = ''; this.open = false; this.disabled = false; }
    get isConnected() { return this === doc.body || !!this.parentElement?.isConnected; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() { doc.activeElement = this; }
  }
  const doc = {createElement: tag => new Element(doc, tag)};
  doc.body = doc.createElement('body'); doc.activeElement = doc.body;
  const dialog = doc.createElement('dialog'), content = doc.createElement('div');
  dialog.append(content); doc.body.append(dialog);
  const $ = selector => selector === '#modal' ? dialog : selector === '#modal-content' ? content : content.querySelector(`[id="${selector.slice(1)}"]`);
  const values = new Map(), toasts = [], raidLoads = [], raidRequests = [], mounts = [];
  let writes = 0;
  const persistence = StorySession.createStorySessionPersistence({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes++; values.set(key, value); },
  });
  assert.equal(persistence.save(initial).ok, true);
  const noop = () => {};
  const c = {
    clone, JSON, Error, URL, AbortController, StorySession, createDeferredMount,
    document: doc, $, pendingStorySettlement: null, storyActive: true, battle: null,
    storySession: clone(initial), run: clone(initial.run), storyPersistence: persistence,
    profileStore: null, editor: {reset: noop}, render: noop, renderSide: noop,
    renderStorageNotice: noop, storyInboxPanel: noop, toast: message => toasts.push(message),
    modalHead: () => '<button data-close-modal>Close</button>',
    loadStoryModule: async () => ({loadStyles: async () => {}, mountStoryHub(host, callbacks) {
      const panel = mountStoryHub(host, callbacks); mounts.push({host, callbacks, panel}); return panel;
    }}),
    loadRaidModule: async () => {
      raidLoads.push(true);
      return {mountRaidPanel(host, callbacks, resume, initialRequest) {
        raidRequests.push(initialRequest); host.replaceChildren(); return {dispose: noop};
      }};
    },
  };
  vm.runInNewContext(compiled, c);
  c.openStoryHub(); await tick();
  const action = id => content.querySelector(`[data-story-action="${id}"]`);
  assert.ok(action('machine'), 'normal named workshop reached');
  await action('machine').dispatch('click');
  const field = () => content.querySelector('[data-story-field="machine-url"]');
  const form = () => content.querySelector('[data-story-form="machine"]');
  const kind = () => form().querySelector('select');
  const details = () => form().closest('details');
  assert.equal(field().type, 'url'); assert.equal(field().required, true);
  return {c, doc, dialog, content, $, values, toasts, raidLoads, raidRequests, mounts, action, field, form, kind, details,
    get writes() { return writes; },
    saved: () => values.get(StorySession.STORY_SAVE_KEY),
    status: () => content.querySelector('.story-status').textContent,
    context: () => ({url: field().value, kind: kind().value, open: details().open}),
    fill(url, kind) { details().open = true; field().value = url; this.kind().value = kind; },
  };
}

for (const url of ['ftp://example.com/', 'https://site.onion/']) {
  test(`native absolute URL rejected by story policy retains editable context (${url})`, async () => {
    const h = await environment();
    const owner = h.c.storySession.story, saved = h.saved(), writes = h.writes;
    h.fill(url, 'cached'); const before = h.context(), old = h.form();
    assert.equal(new URL(url).href, url, 'syntactically valid absolute URL, unlike a native type mismatch');
    assert.equal(old.isConnected, true, 'submit only the current live form');
    await old.dispatch('submit');
    assert.equal(h.c.storySession.story, owner); assert.equal(h.saved(), saved); assert.equal(h.writes, writes);
    assert.match(h.status(), /公開HTTP\/HTTPS URL/);
    assert.equal(h.raidLoads.length, 0); assert.equal(h.toasts.length, 0);
    assert.equal(old.isConnected, false); assert.equal(h.form().isConnected, true);
    assert.deepEqual(h.context(), before, 'policy rejection should keep URL, mode and opened repair form');
  });
}

test('real app no-collection-store callback leaves same workshop repair context intact', async () => {
  const h = await environment();
  const owner = h.c.storySession.story, saved = h.saved(), writes = h.writes;
  h.fill('https://example.com/', 'cached'); const before = h.context();
  await h.form().dispatch('submit');
  assert.equal(h.c.storySession.story, owner); assert.equal(h.saved(), saved); assert.equal(h.writes, writes);
  assert.deepEqual(h.toasts, ['個人コレクションの保存領域を開けないため、回収を開始できません。']);
  assert.equal(h.mounts.length, 1); assert.equal(h.raidLoads.length, 0);
  assert.equal(h.dialog.open, true); assert.ok(h.$('#story-feature-host'));
  assert.deepEqual(h.context(), before, 'early app refusal should not clear the address form');
});

test('real analysis-ledger energy refusal preserves reanalysis URL and mode for repair', async () => {
  const html = '<h1>Recorded public page</h1><nav><a href="/">Home</a></nav>';
  const blueprint = await reconstructStaticCode({html, sourceHash: createHash('sha256').update(html).digest('hex'),
    requestedUrl: 'https://example.com/', capturedAt: '2026-10-03T00:00:00.000Z'});
  const result = await StorySession.cacheStoryAnalysis(named(), blueprint, 'reanalyze');
  assert.equal(result.ok, true); assert.equal(result.session.story.analysisEnergy, 1);
  assert.equal(StorySession.validateStorySession(result.session), true);
  const h = await environment(result.session);
  const owner = h.c.storySession.story, saved = h.saved(), writes = h.writes;
  h.fill('https://example.com/', 'reanalyze'); const before = h.context();
  await h.form().dispatch('submit');
  assert.equal(h.c.storySession.story, owner); assert.equal(h.saved(), saved); assert.equal(h.writes, writes);
  assert.match(h.status(), /エネルギーが足りません/);
  assert.equal(h.raidLoads.length, 0); assert.equal(h.toasts.length, 0);
  assert.deepEqual(h.context(), before, 'insufficient-energy repair should retain the selected mode');
});

test('policy repair changes only the entered URL and hands off the retained mode once on explicit resubmission', async () => {
  const h = await environment();
  const saved = h.saved(), writes = h.writes;
  h.fill('ftp://example.com/', 'cached');
  await h.form().dispatch('submit');
  assert.deepEqual(h.context(), {url: 'ftp://example.com/', kind: 'cached', open: true});
  h.field().value = 'https://EXAMPLE.com';
  h.c.profileStore = {listPendingRaids: async () => []};
  await tick();
  assert.equal(h.raidLoads.length, 0, 'a corrected value and available storage do not automatically submit');
  await h.form().dispatch('submit');
  assert.equal(h.raidLoads.length, 1); assert.equal(h.raidRequests.length, 1);
  assert.equal(h.raidRequests[0].url, 'https://example.com/');
  assert.equal(h.raidRequests[0].kind, 'cached');
  assert.equal(h.saved(), saved); assert.equal(h.writes, writes);
  assert.equal(h.content.querySelector('[data-story-form="machine"]'), null, 'real handoff disposes the hub');
});

test('a same-owner repaint preserves exact text and open or closed state without persisting or submitting', async () => {
  const h = await environment(); const saved = h.saved(), writes = h.writes;
  const url = 'ftp://example.com/repair?draft=one#section';
  h.fill(url, 'reanalyze'); h.mounts[0].panel.render();
  assert.deepEqual(h.context(), {url, kind: 'reanalyze', open: true});
  h.details().open = false; h.mounts[0].panel.render();
  assert.deepEqual(h.context(), {url, kind: 'reanalyze', open: false});
  assert.equal(h.saved(), saved); assert.equal(h.writes, writes); assert.equal(h.raidLoads.length, 0);
  assert.equal(h.saved().includes(url), false);
});

test('retired machine controls cannot submit or replace the current repair draft', async () => {
  const h = await environment();
  h.fill('ftp://example.com/', 'cached');
  const oldForm = h.form(), oldInput = h.field(), oldKind = h.kind();
  await oldForm.dispatch('submit');
  oldInput.value = 'https://example.com/'; oldKind.value = 'new';
  h.c.profileStore = {listPendingRaids: async () => []};
  await oldForm.dispatch('submit');
  assert.equal(h.raidLoads.length, 0); assert.equal(h.raidRequests.length, 0);
  assert.deepEqual(h.context(), {url: 'ftp://example.com/', kind: 'cached', open: true});
});

test('a replacement exact owner cannot inherit or submit the previous machine draft', async () => {
  const h = await environment(); h.fill('ftp://example.com/', 'cached');
  const oldForm = h.form();
  h.c.storySession = structuredClone(h.c.storySession);
  await oldForm.dispatch('submit');
  assert.equal(h.status(), '', 'owner replacement rejects the old form before validation');
  h.mounts[0].panel.render();
  assert.deepEqual(h.context(), {url: '', kind: 'new', open: false});
  assert.equal(h.raidLoads.length, 0);
});

test('leaving the machine, replacing its stage, or leaving its story screen retires the draft', async () => {
  const h = await environment(); h.fill('ftp://example.com/', 'cached');
  await h.action('power').dispatch('click');
  assert.equal(h.field(), null);
  await h.action('machine').dispatch('click');
  assert.deepEqual(h.context(), {url: '', kind: 'new', open: false});
  h.fill('ftp://example.com/', 'cached');
  const former = h.c.storySession;
  h.c.storySession = named(); h.mounts[0].panel.render();
  h.c.storySession = former; h.mounts[0].panel.render();
  assert.deepEqual(h.context(), {url: '', kind: 'new', open: false}, 'restoring an old identity cannot resurrect a retired context');
  h.fill('ftp://example.com/', 'cached');
  // A direct state mutation is a defensive boundary test, not a claimed normal
  // host transition. Real app story commits replace the exact owner instead.
  const stage = h.c.storySession.story.stageId;
  h.c.storySession.story.stageId = 'delivery'; h.mounts[0].panel.render();
  h.c.storySession.story.stageId = stage; h.mounts[0].panel.render();
  assert.deepEqual(h.context(), {url: '', kind: 'new', open: false});
  h.fill('ftp://example.com/', 'cached');
  h.c.storySession.story.phase = 'record'; h.mounts[0].panel.render();
  h.c.storySession.story.phase = 'hub'; h.mounts[0].panel.render();
  assert.deepEqual(h.context(), {url: '', kind: 'new', open: false});
});

test('disposal and remount cannot carry a URL draft or allow an old submit to affect the new hub', async () => {
  const h = await environment(); h.fill('ftp://example.com/', 'cached');
  const oldForm = h.form(); h.c.closeModal(); h.c.openStoryHub(); await tick();
  await h.action('machine').dispatch('click');
  await oldForm.dispatch('submit');
  assert.deepEqual(h.context(), {url: '', kind: 'new', open: false});
  assert.equal(h.status(), ''); assert.equal(h.raidLoads.length, 0);
});

test('only valid analysis modes are retained through a repaint', async () => {
  const h = await environment(); h.fill('https://example.com/', 'cached');
  h.kind().value = 'not-a-mode'; h.mounts[0].panel.render();
  assert.deepEqual(h.context(), {url: 'https://example.com/', kind: 'new', open: true});
  assert.equal(h.raidLoads.length, 0);
});

test('the current form keeps later edits through a delayed host rejection and blocks duplicate submissions', async () => {
  const h = await environment();
  const saved = h.saved(), writes = h.writes, callbacks = h.mounts[0].callbacks;
  const original = callbacks.onOptionalRaid;
  let release, calls = 0;
  const delivery = new Promise(resolve => { release = resolve; });
  // Delivery delay/error is a callback-boundary adapter. The ordinary failure
  // reproductions above use the unmodified real application callback instead.
  callbacks.onOptionalRaid = async (...args) => {
    calls++; await original(...args); await delivery;
    throw new Error('Temporary handoff failure');
  };
  h.fill('https://example.com/', 'cached');
  const oldForm = h.form(), waiting = oldForm.dispatch('submit');
  assert.deepEqual(h.context(), {url: 'https://example.com/', kind: 'cached', open: true});
  const activeForm = h.form();
  h.field().value = 'https://books.toscrape.com/'; h.kind().value = 'reanalyze';
  await activeForm.dispatch('submit'); await oldForm.dispatch('submit');
  assert.equal(calls, 1);
  release(); await waiting;
  assert.deepEqual(h.context(), {url: 'https://books.toscrape.com/', kind: 'reanalyze', open: true});
  assert.equal(h.status(), 'Temporary handoff failure');
  assert.equal(h.saved(), saved); assert.equal(h.writes, writes); assert.equal(h.raidLoads.length, 0);
});

test('late callback rejection after real modal replacement cannot affect the replacement hub', async () => {
  const h = await environment(), callbacks = h.mounts[0].callbacks;
  let reject;
  callbacks.onOptionalRaid = () => new Promise((resolve, fail) => { reject = fail; });
  h.fill('https://example.com/', 'cached');
  const oldForm = h.form(), waiting = oldForm.dispatch('submit');
  h.c.storySession = named(); h.c.openStoryHub(); await tick();
  await h.action('machine').dispatch('click');
  h.fill('ftp://example.com/new-context', 'reanalyze');
  const currentForm = h.form();
  reject(new Error('Old handoff failed')); await waiting; await oldForm.dispatch('submit');
  assert.equal(h.form(), currentForm);
  assert.deepEqual(h.context(), {url: 'ftp://example.com/new-context', kind: 'reanalyze', open: true});
  assert.equal(h.status(), ''); assert.equal(h.raidLoads.length, 0);
});

test('credential-bearing policy rejection keeps repair local and never echoes the entered address', async () => {
  const h = await environment(), saved = h.saved(), writes = h.writes;
  const url = 'https://test-user:example-password@example.com/';
  h.fill(url, 'cached'); await h.form().dispatch('submit');
  assert.deepEqual(h.context(), {url, kind: 'cached', open: true});
  assert.match(h.status(), /認証情報を含まない/);
  assert.equal(h.content.textContent.includes('example-password'), false);
  assert.equal(h.saved(), saved); assert.equal(h.writes, writes); assert.equal(h.raidLoads.length, 0);
});
