import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { parseFragment } from 'parse5';
import D from '../src/data.js';
import C from '../src/document.js';
import R from '../src/run.js';
import { createRunPersistence } from '../src/persistence.js';
import { createLabBattleController } from '../src/lab-audience-control.js';
import { createDeferredMount } from '../src/feature-loader.js';
import * as state from '../src/story/state.js';
import * as content from '../src/story/content.js';
import * as StorySession from '../src/story/session.js';
import { mountStoryHub } from '../src/story/hub.js';

const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL('../src/app.ts', import.meta.url), 'utf8');
const functions = ['load', 'save', 'commitStorySession', 'enterStory', 'storyCommand', 'openStoryHub',
  'deferredModalFeature', 'storyRewardPanel', 'storyInboxPanel', 'importFile', 'switchMode', 'start', 'leaveBattle'];
const declarations = functions.map(name => {
  const match = source.match(new RegExp(`^(?:async )?function ${name}(?:<[^>]+>)?\\([^]*?^}`, 'm'));
  assert.ok(match, `execute the real ${name} host function`);
  return match[0];
}).join('\n');
const modalSource = source.slice(source.indexOf('let modalFeatureDispose:'), source.indexOf('/* ---------- Isolated story profile'));
const restoreSource = source.slice(source.indexOf('    case "story-use-saved": {'), source.indexOf('    case "story-export-pending":'));
assert.ok(restoreSource.includes('storyPersistence.load()'));
const restoreAction = `function useSavedStory() { switch ('story-use-saved') { ${restoreSource} } }`;
const compiled = transformSync(restoreAction + '\n' + modalSource + '\nlet importRequestId = 0;\n' + declarations.replace('import("./story/panel.js")', 'loadStoryModule()'), {loader: 'ts', target: 'es2022'}).code;

// Real app modal/navigation/persistence, deferred helper and hub renderer. Only
// DOM operations, module delivery, ceremonies and page painting are adapters;
// these checks do not assert browser paint, CSS loading, focus or network timing.
function application(initial = StorySession.createStorySession(), options = {}) {
  const noop = () => {};
  class Element {
    constructor(tagName) {
      this.tagName = tagName; this.children = []; this.dataset = {}; this.attributes = {};
      this.events = {}; this.style = {}; this.className = ''; this.textContent = ''; this.value = '';
      this.ownerDocument = doc; this.disabled = false; this.open = false;
      this.classList = {
        add: name => { this.className = [...new Set([...this.className.split(' '), name])].join(' ').trim(); },
        remove: name => { this.className = this.className.split(' ').filter(n => n !== name).join(' '); },
        toggle: (name, on) => { on ? this.classList.add(name) : this.classList.remove(name); },
      };
    }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parent = null; }); this.children = []; this.append(...nodes); }
    setAttribute(name, value) {
      this.attributes[name] = value;
      if (name === 'id') this.id = value;
      if (name === 'class') this.className = value;
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    addEventListener(name, fn) { this.events[name] = fn; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
    focus() {}
    showModal() { this.open = true; }
    close() { if (this.open) { this.open = false; queued.push(() => this.events.close?.({target: this})); } }
    set innerHTML(html) {
      this.replaceChildren();
      const convert = item => {
        const node = new Element(item.tagName ?? '#text'); node.textContent = item.value ?? '';
        item.attrs?.forEach(attr => node.setAttribute(attr.name, attr.value));
        item.childNodes?.forEach(child => node.append(convert(child)));
        return node;
      };
      parseFragment(html).childNodes.forEach(item => this.append(convert(item)));
    }
  }
  const doc = {createElement: tag => new Element(tag)};
  const queued = [], modal = new Element('dialog'), body = new Element('div'), controls = new Map();
  const walk = root => [root, ...root.children.flatMap(walk)];
  const find = predicate => walk(body).find(predicate);
  const $ = selector => selector === '#modal' ? modal : selector === '#modal-content' ? body :
    find(node => node.id === selector.slice(1)) ?? controls.get(selector);
  for (const name of ['#import-file', '#pause-button']) controls.set(name, new Element('input'));
  const values = new Map(), storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const storyPersistence = StorySession.createStorySessionPersistence(storage);
  assert.equal(storyPersistence.save(initial).ok, true);
  const loads = [], styleLoads = [], mounts = [], toasts = [];
  const module = {loadStyles() {
    if (!options.manualStyles) return Promise.resolve();
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    styleLoads.push({resolve, reject: () => reject(new Error('stylesheet offline'))});
    return promise;
  }, mountStoryHub(host, callbacks) {
    const handle = mountStoryHub(host, callbacks); const observed = {host, callbacks, disposed: 0}; mounts.push(observed);
    return {dispose() { observed.disposed++; handle.dispose(); }};
  }};
  const context = {
    JSON, Error, crypto, clone, R, C, P: D.PARTS, StorySession, createDeferredMount, window: {confirm: () => true},
    Story: {...state, ...content, ...module}, ...state, ...content,
    storyPersistence, runPersistence: createRunPersistence(storage, 'qa-story-load-'),
    storySession: clone(initial), run: clone(initial.run), storyActive: true, storyMatchId: null,
    storyBattleEncounter: null, pendingStorySettlement: null, battle: null, preBattle: null,
    settling: false, paused: false, speed: 1, lastTime: 0, coachHidden: false, battleStage: 0,
    saveOK: true, saveProblem: '', profileProblem: '', profileStore: null, profileWrites: Promise.resolve(),
    memory: {}, preview: false, view: 'self', eraInstant: false, manualZoom: null, pendingFusions: [],
    $, $$: () => [], document: doc, labBattleController: createLabBattleController(),
    editor: {reset: noop, selection: new Set(), pending: null},
    render: noop, renderSide: noop, renderStorageNotice: noop, resetBuildSnap: noop, toast: message => toasts.push(message),
    tutorialDone: () => true, rewardModal: noop, finishModal: noop, roundIntro: async () => {}, celebrateFusions: noop,
    modalHead: (title, subtitle) => `<h2>${title}: ${subtitle}</h2><button data-close-modal>Close</button>`,
    audio: {setMusic: noop, setIntensity: noop, sfx: noop}, fx: {reset: noop, clear: noop},
    Cer: {showPublish: async () => {}, showVersus: async () => {}},
    publishLog: () => [], particles: {flash: noop, clear: noop}, traffic: {start: noop, stop: noop},
    performance: {now: () => 0}, requestAnimationFrame: noop, tick: noop,
    V: {render: noop, palettePreview: () => new Element('div')},
    async raidPanel() { context.openModal('<p id="other-screen">URL panel</p>'); },
    loadStoryModule() {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      loads.push({resolve: () => resolve(module), reject: () => reject(new Error('chunk offline'))});
      return promise;
    },
  };
  vm.runInNewContext(compiled, context);
  return {c: context, $, modal, body, loads, styleLoads, mounts, toasts, values,
    find, nodes: () => walk(body), action: id => find(node => node.dataset.storyAction === id),
    field: id => find(node => node.dataset.storyField === id),
    form: id => find(node => node.dataset.storyForm === id),
    flushClose() { while (queued.length) queued.shift()(); },
    saved: () => JSON.parse(values.get(StorySession.STORY_SAVE_KEY)),
  };
}
const named = name => {
  const result = StorySession.commandStorySession(StorySession.createStorySession(), {type: 'name-page', name});
  assert.equal(result.ok, true); return result.session;
};
const submit = form => form.events.submit({preventDefault() {}});
const hasClose = h => !!h.find(node => 'closeModal' in node.dataset);
async function show(h) { h.c.openStoryHub(); await tick(); }
async function resolveLatest(h) { h.loads.at(-1).resolve(); await tick(); }

// The old synchronous hub has no loading Close and mounts before delivery, so
// removing deferred delivery or disposal makes these behavioral assertions fail.
test('QA: story loading remains closable; late success and late failure cannot redraw a replacement', async () => {
  for (const fail of [false, true]) {
    const h = application(); await show(h);
    assert.equal(hasClose(h), true, 'Close is outside the pending optional module');
    assert.equal(h.mounts.length, 0, 'hub does not run before chunk delivery');
    const oldHost = h.$('#story-feature-host'), oldNodes = [...oldHost.children];
    h.c.closeModal(); h.c.openModal('<p id="other-screen">A newer screen</p>'); h.flushClose();
    assert.equal(h.modal.open, true);
    fail ? h.loads[0].reject() : h.loads[0].resolve(); await tick();
    assert.ok(h.$('#other-screen')); assert.equal(h.mounts.length, 0);
    assert.deepEqual(oldHost.children, oldNodes, 'no late error writes even to the detached old host');
  }
});

test('QA: duplicate retry is single-flight, retains Close on error, then mounts one real interactive hub', async () => {
  const h = application(); await show(h); h.loads[0].reject(); await tick();
  assert.equal(hasClose(h), true);
  assert.ok(h.nodes().some(node => node.attributes.role === 'alert'));
  const retry = h.find(node => node.textContent === '画面をもう一度読み込む'); assert.ok(retry);
  retry.onclick(); retry.onclick(); await tick(); assert.equal(h.loads.length, 2);
  assert.equal(hasClose(h), true); await resolveLatest(h);
  assert.equal(h.mounts.length, 1); assert.equal(h.$('#story-loading-head'), undefined);
  h.field('page-name').value = 'A working retry'; await submit(h.form('name')); await tick();
  assert.equal(h.c.storySession.story.pageName, 'A working retry');
  assert.equal(h.saved().story.pageName, 'A working retry'); assert.ok(h.action('machine'));
  await h.action('close').events.click(); h.flushClose(); retry.onclick(); await tick();
  assert.equal(h.modal.open, false);
  assert.equal(h.loads.length, 2); assert.equal(h.mounts[0].disposed, 1);
});

test('QA: immediate Close and reopen ignores queued old close and old delivery but current hub stays usable', async () => {
  const h = application(); await show(h); h.c.closeModal(); await show(h); h.flushClose();
  assert.equal(h.loads.length, 2); assert.equal(h.modal.open, true);
  h.loads[0].resolve(); await tick(); assert.equal(h.mounts.length, 0);
  await resolveLatest(h); assert.equal(h.mounts.length, 1);
  h.field('page-name').value = 'Reopened'; await submit(h.form('name')); await tick();
  assert.equal(h.c.storySession.story.pageName, 'Reopened');
  h.modal.close(); h.flushClose();
  assert.equal(h.mounts[0].disposed, 1); assert.equal(h.mounts[0].host.children.length, 0);
});

test('QA: replacing a mounted story makes old naming and object handlers inert', async () => {
  const h = application(); await show(h); await resolveLatest(h);
  const oldForm = h.form('name'); h.field('page-name').value = 'Must not name the fresh journey';
  h.c.enterStory(true); await tick(); await submit(oldForm); await tick();
  assert.equal(h.c.storySession.story.phase, 'naming');
  assert.equal(h.mounts[0].disposed, 1); await resolveLatest(h);
  h.field('page-name').value = 'New journey'; await submit(h.form('name')); await tick();
  const oldMachine = h.action('machine'); h.c.switchMode('lab', true); await oldMachine.events.click(); await tick();
  assert.equal(h.c.storyActive, false); assert.equal(h.c.run.mode, 'lab');
  assert.equal(h.modal.open, false); assert.equal(h.mounts[1].disposed, 1);
  assert.equal(h.saved().story.pageName, 'New journey');
});

test('QA: new story and restored story supersede older module delivery with current persisted content', async () => {
  for (const restore of [false, true]) {
    const h = application(named('Original')); await show(h);
    if (restore) {
      const raw = JSON.stringify(named('Restored backup'));
      await h.c.importFile({size: Buffer.byteLength(raw), text: async () => raw});
    } else h.c.enterStory(true);
    await tick(); assert.equal(h.loads.length, 2);
    h.loads[0].resolve(); await tick(); assert.equal(h.mounts.length, 0);
    await resolveLatest(h); assert.equal(h.mounts.length, 1);
    if (restore) {
      assert.equal(h.c.storySession.story.pageName, 'Restored backup');
      assert.ok(h.nodes().some(node => node.textContent === 'Restored backup'));
    } else {
      assert.equal(h.c.storySession.story.phase, 'naming'); assert.ok(h.form('name'));
    }
    assert.deepEqual(h.saved(), h.c.storySession);
  }
});

test('QA: leaving for a new run before delivery cannot reopen the story or mutate the new run', async () => {
  for (const mode of ['lab', 'campaign']) {
    const h = application(named('Old story')); await show(h);
    h.c.switchMode(mode, true, false); const expected = clone(h.c.run), saved = h.values.get('qa-story-load-' + mode);
    h.loads[0].resolve(); await tick(); h.flushClose();
    assert.equal(h.c.storyActive, false); assert.equal(h.modal.open, false); assert.equal(h.mounts.length, 0);
    assert.deepEqual(h.c.run, expected); assert.equal(h.values.get('qa-story-load-' + mode), saved);
  }
});

test('QA: actual battle start disposes a pending story load without late mount or combat mutation', async () => {
  const session = named('Battle page');
  const bought = R.purchase(session.run, 'ab_link'); assert.equal(bought.ok, true);
  assert.equal(R.move(session.run, bought.item.id, 16, 16), true);
  const h = application(session); await show(h); await h.c.start();
  const battle = h.c.battle; assert.ok(battle); assert.equal(h.modal.open, false);
  h.loads[0].resolve(); await tick(); h.flushClose();
  assert.equal(h.mounts.length, 0); assert.equal(h.c.battle, battle);
  assert.equal(h.c.storySession.story.phase, 'encounter'); assert.equal(h.c.run.phase, 'battle');
});

test('QA: story guards never load for inactive mode, missing session, live battle, pending reward or exhausted lives', async () => {
  for (const alter of [
    h => { h.c.storyActive = false; }, h => { h.c.storySession = null; }, h => { h.c.battle = {}; },
    h => { h.c.storySession.reward = {choices: [], encounterId: 'guard'}; }, h => { h.c.run.lives = 0; },
  ]) {
    const h = application(named('Guarded')); alter(h); await show(h);
    assert.equal(h.loads.length, 0); assert.equal(h.mounts.length, 0);
  }
});


test('QA: replacing a hub during its real command never performs a late redraw', async () => {
  const h = application(); await show(h); await resolveLatest(h);
  const old = h.mounts[0].host, form = h.form('name'); h.field('page-name').value = 'One committed name';
  const pending = submit(form); const repeated = submit(form);
  h.c.openModal('<p id="other-screen">Newer dialog</p>');
  await Promise.all([pending, repeated]); await tick();
  assert.ok(h.$('#other-screen')); assert.equal(old.children.length, 0);
  assert.equal(h.mounts[0].disposed, 1); assert.equal(h.saved().story.pageName, 'One committed name');
  assert.deepEqual(h.c.storySession, h.saved());
});

test('QA: saved-result recovery leaves battle, survives queued close, and mounts only the saved story', async () => {
  const h = application(named('Saved journey')); await show(h);
  h.c.openModal('<p id="save-error">A result could not be saved</p>');
  h.c.pendingStorySettlement = named('Unsaved result'); h.c.battle = {result: {winner: 'player'}};
  h.c.useSavedStory(); await tick(); h.flushClose();
  assert.equal(h.c.pendingStorySettlement, null); assert.equal(h.c.battle, null); assert.equal(h.modal.open, true);
  assert.equal(h.loads.length, 2); h.loads[0].reject(); await tick();
  assert.equal(h.mounts.length, 0); assert.equal(hasClose(h), true);
  await resolveLatest(h); assert.equal(h.mounts.length, 1);
  assert.equal(h.c.storySession.story.pageName, 'Saved journey');
  assert.ok(h.nodes().some(node => node.textContent === 'Saved journey'));
  assert.deepEqual(h.c.storySession, h.saved());
});


test('QA: real story host retains Close and withholds mount until stylesheet readiness succeeds on retry', async () => {
  const h = application(undefined, {manualStyles: true}); await show(h); await resolveLatest(h);
  assert.equal(h.mounts.length, 0, 'successful module delivery is not successful stylesheet readiness');
  assert.equal(h.styleLoads.length, 1); assert.equal(hasClose(h), true);
  h.styleLoads[0].reject(); await tick();
  assert.ok(h.nodes().some(node => node.attributes.role === 'alert')); assert.equal(hasClose(h), true);
  const retry = h.find(node => node.textContent === '画面をもう一度読み込む');
  retry.onclick(); retry.onclick(); await tick(); await resolveLatest(h);
  assert.equal(h.loads.length, 2); assert.equal(h.styleLoads.length, 2); assert.equal(h.mounts.length, 0);
  h.styleLoads[1].resolve(); await tick();
  assert.equal(h.mounts.length, 1); assert.ok(h.form('name')); assert.equal(h.$('#story-loading-head'), undefined);
});

test('QA: replacing the story while its CSS is pending ignores old readiness and errors', async () => {
  for (const fails of [false, true]) {
    const h = application(undefined, {manualStyles: true}); await show(h); await resolveLatest(h);
    assert.equal(h.mounts.length, 0); const oldHost = h.$('#story-feature-host'), oldNodes = [...oldHost.children];
    h.c.closeModal(); await show(h); await resolveLatest(h); h.flushClose();
    assert.equal(h.styleLoads.length, 2);
    fails ? h.styleLoads[0].reject() : h.styleLoads[0].resolve(); await tick();
    assert.equal(h.mounts.length, 0); assert.deepEqual(oldHost.children, oldNodes);
    h.styleLoads[1].resolve(); await tick(); assert.equal(h.mounts.length, 1); assert.equal(h.modal.open, true);
  }
});
