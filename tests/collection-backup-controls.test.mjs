import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

// Only browser mechanics and controlled completion timing are adapted. All
// interaction tests mount the production controls and dispatch DOM events.
class ElementAdapter extends EventTarget {
  constructor(tag, document) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.parentElement = null; this.attributes = new Map();
    this.disabled = false; this.hidden = false; this.value = ''; this.files = [];
    this._text = ''; this.className = '';
  }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  replaceChildren(...nodes) { for (const node of this.children) node.parentElement = null; this.children = []; this._text = ''; this.append(...nodes); }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  set innerHTML(_value) { throw Error('Use safe native text sinks'); }
  get isConnected() { return this === this.ownerDocument.body || !!this.parentElement?.isConnected; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.tagName.toLowerCase() === selector ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  dispatchEvent(event) { const accepted = super.dispatchEvent(event); const handler = this[`on${event.type}`]; if (handler) handler.call(this, event); return accepted; }
  click() { if (this.disabled) return; if (this.tagName === 'A') this.ownerDocument.downloads.push({ href: this.href, filename: this.download, connected: this.isConnected }); this.dispatchEvent(new Event('click')); }
  focus() { this.ownerDocument.focusCalls++; this.ownerDocument.activeElement = this; }
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = async () => { for (let n = 0; n < 12; n++) await new Promise(resolve => setImmediate(resolve)); };
async function until(predicate) { const end = Date.now() + 5000; while (!predicate()) { assert.ok(Date.now() < end, 'expected asynchronous UI state did not arrive'); await new Promise(resolve => setTimeout(resolve, 5)); } }
const candidate = Object.freeze({ opaque: 'validated' });
const preview = (count = 1) => ({ candidate, trophyCount: count, captureCount: 1, addCount: count, unchangedCount: 0, conflicts: [] });
function fakeStore(overrides = {}) {
  return {
    exportCollectionBackup: async () => ({ text: '{"validated":true}', byteLength: 18, trophyCount: 1, captureCount: 1 }),
    inspectCollectionBackup: async () => preview(),
    restoreCollectionBackup: async () => ({ added: 1, unchanged: 0 }), ...overrides,
  };
}
function mount(options = {}) {
  const compiled = buildSync({ entryPoints: [new URL('../src/collection-backup-controls.ts', import.meta.url).pathname], bundle: true, write: false, format: 'iife', globalName: 'BackupControls', platform: 'browser', target: 'es2022' }).outputFiles[0].text;
  const document = { downloads: [], focusCalls: 0, createElement(tag) { return new ElementAdapter(tag, this); } };
  document.body = document.createElement('body'); document.activeElement = document.body;
  const host = document.createElement('section'); document.body.append(host);
  const blobs = [], revoked = [], timers = [];
  const context = vm.createContext({ Blob, Error, TextEncoder, structuredClone, console, URL: { createObjectURL(blob) { blobs.push(blob); return `blob:archive-${blobs.length}`; }, revokeObjectURL(url) { revoked.push(url); } }, setTimeout(callback) { timers.push(callback); return timers.length; } });
  vm.runInContext(compiled, context);
  const handle = context.BackupControls.mountCollectionBackupControls(host, { store: fakeStore(), ...options });
  const buttons = () => host.querySelectorAll('button');
  const button = text => buttons().find(element => element.textContent === text);
  return { host, document, handle, blobs, revoked, timers, button, input: host.querySelector('input'), exportButton: button('取得外観を書き出す'), importButton: button('取得外観を読み込む'), restoreButton: button('追加して復元') };
}
function choose(ui, text = '{}', options = {}) {
  let reads = 0;
  const file = { name: options.name ?? 'local.json', size: options.size ?? text.length, async text() { reads++; return options.promise ?? text; } };
  ui.input.files = [file]; ui.input.value = 'C:\\fakepath\\local.json';
  ui.input.dispatchEvent(new Event('change'));
  return { file, get reads() { return reads; } };
}

test('collection controls mount even without trophies and describe a separate local appearance archive', () => {
  const ui = mount();
  assert.ok(ui.exportButton); assert.ok(ui.importButton); assert.ok(ui.restoreButton.disabled);
  assert.equal(ui.input.type, 'file'); assert.match(ui.input.accept, /json/);
  assert.match(ui.host.textContent, /外観.*由来/);
  assert.match(ui.host.textContent, /Run|ラン/); assert.match(ui.host.textContent, /物語/);
  assert.match(ui.host.textContent, /未受取|受取待ち/); assert.match(ui.host.textContent, /勝利.*証明/);
  assert.match(ui.host.textContent, /16\s*MiB/); assert.match(ui.host.textContent, /256/);
  assert.equal(ui.document.focusCalls, 0);
});

test('file selection only previews verified counts; a separate explicit click commits once', async () => {
  const writes = [], restored = [];
  const ui = mount({ store: fakeStore({ restoreCollectionBackup: async (...args) => { writes.push(args); return { added: 1, unchanged: 0 }; } }), onRestored: (...args) => restored.push(args) });
  choose(ui, '{}', { name: '<img src=x onerror=alert(1)>' }); await settle();
  assert.equal(writes.length, 0); assert.equal(ui.restoreButton.disabled, false); assert.equal(ui.input.value, '');
  assert.match(ui.host.textContent, /外観.*1/); assert.match(ui.host.textContent, /キャプチャ.*1/);
  assert.doesNotMatch(ui.host.textContent, /<img|onerror/);
  ui.restoreButton.click(); ui.restoreButton.dispatchEvent(new Event('click')); await settle();
  assert.equal(writes.length, 1); assert.equal(writes[0][0], candidate);
  assert.equal(typeof writes[0][1].isCurrent, 'function'); assert.equal(restored.length, 1);
  assert.equal(restored[0][1](), true); assert.equal(ui.restoreButton.disabled, true);
  assert.match(ui.host.textContent, /復元/); assert.equal(ui.document.focusCalls, 0);
});

test('oversized file is rejected before reading and import can be retried with the same file', async () => {
  let inspections = 0;
  const ui = mount({ store: fakeStore({ inspectCollectionBackup: async () => { inspections++; return preview(); } }) });
  const first = choose(ui, '{}', { size: 16 * 1024 * 1024 + 1 }); await settle();
  assert.equal(first.reads, 0); assert.equal(inspections, 0); assert.equal(ui.input.value, '');
  assert.match(ui.host.textContent, /16.*MiB/); assert.equal(ui.importButton.disabled, false);
  choose(ui); await settle(); assert.equal(inspections, 1); assert.equal(ui.restoreButton.disabled, false);
});

test('invalid archive and file read failures stay readable and retryable without writes', async () => {
  let inspections = 0, writes = 0;
  const ui = mount({ store: fakeStore({ inspectCollectionBackup: async () => { inspections++; throw Error('<invalid> archive'); }, restoreCollectionBackup: async () => { writes++; return { added: 1, unchanged: 0 }; } }) });
  choose(ui); await settle(); assert.match(ui.host.textContent, /<invalid> archive/);
  assert.equal(ui.restoreButton.disabled, true); assert.equal(ui.importButton.disabled, false); assert.equal(writes, 0);
  const read = deferred(); choose(ui, '', { promise: read.promise }); read.reject(Error('file unavailable')); await settle();
  assert.match(ui.host.textContent, /file unavailable/); assert.equal(inspections, 1); assert.equal(ui.input.value, '');
  assert.equal(ui.importButton.disabled, false);
});

test('conflict counts are previewed without source identifiers and prevent restore', async () => {
  let writes = 0;
  const ui = mount({ store: fakeStore({ inspectCollectionBackup: async () => ({ ...preview(), conflicts: [{ kind: 'battle', id: '<private-id>', message: '<untrusted message>' }] }), restoreCollectionBackup: async () => { writes++; } }) });
  choose(ui); await settle(); assert.match(ui.host.textContent, /競合.*1/);
  assert.doesNotMatch(ui.host.textContent, /private-id|untrusted message/);
  assert.equal(ui.restoreButton.disabled, true); ui.restoreButton.dispatchEvent(new Event('click')); await settle(); assert.equal(writes, 0);
});

test('all archive actions are busy-gated during export and object URL is revoked after download', async () => {
  const exporting = deferred(); let exports = 0, inspections = 0;
  const ui = mount({ store: fakeStore({ exportCollectionBackup: () => { exports++; return exporting.promise; }, inspectCollectionBackup: async () => { inspections++; return preview(); } }) });
  ui.exportButton.click(); ui.exportButton.dispatchEvent(new Event('click')); ui.importButton.dispatchEvent(new Event('click')); choose(ui);
  assert.equal(exports, 1); assert.equal(inspections, 0); assert.ok(ui.exportButton.disabled && ui.importButton.disabled && ui.input.disabled && ui.restoreButton.disabled);
  exporting.resolve({ text: 'validated archive', byteLength: 17, trophyCount: 1, captureCount: 1 }); await settle();
  assert.equal(ui.document.downloads.length, 1); assert.equal(ui.document.downloads[0].connected, true);
  assert.match(ui.document.downloads[0].filename, /\.json$/); assert.equal(await ui.blobs[0].text(), 'validated archive');
  assert.equal(ui.revoked.length, 0); ui.timers.forEach(callback => callback()); assert.deepEqual(ui.revoked, ['blob:archive-1']);
  assert.equal(ui.exportButton.disabled, false); assert.equal(ui.document.focusCalls, 0);
});

test('failed export never creates a download and can be retried explicitly', async () => {
  let calls = 0;
  const ui = mount({ store: fakeStore({ exportCollectionBackup: async () => { calls++; if (calls === 1) throw Error('保存データを検証できません'); return { text: '{}', byteLength: 2, trophyCount: 0, captureCount: 0 }; } }) });
  ui.exportButton.click(); await settle(); assert.equal(ui.document.downloads.length, 0); assert.match(ui.host.textContent, /検証できません/);
  ui.exportButton.click(); await settle(); assert.equal(ui.document.downloads.length, 1); assert.equal(calls, 2);
});

test('native chooser cancellation leaves an existing preview unchanged', async () => {
  const ui = mount(); choose(ui); await settle(); const before = ui.host.textContent;
  ui.importButton.click(); ui.input.files = []; ui.input.dispatchEvent(new Event('cancel')); ui.input.dispatchEvent(new Event('change'));
  assert.equal(ui.host.textContent, before); assert.equal(ui.restoreButton.disabled, false); assert.equal(ui.input.value, '');
});

test('a newer file supersedes a delayed read and old callbacks cannot clear its state', async () => {
  const older = deferred(), newer = deferred(); const inspected = [];
  const ui = mount({ store: fakeStore({ inspectCollectionBackup: async text => { inspected.push(text); return preview(2); } }) });
  choose(ui, '', { promise: older.promise }); choose(ui, '', { promise: newer.promise });
  older.resolve('older'); await settle(); assert.deepEqual(inspected, []); assert.equal(ui.importButton.disabled, true);
  newer.resolve('newer'); await settle(); assert.deepEqual(inspected, ['newer']); assert.match(ui.host.textContent, /外観.*2/);
  assert.equal(ui.importButton.disabled, false); assert.equal(ui.restoreButton.disabled, false);
});

test('a newer file supersedes pending verification and never inherits commit intent', async () => {
  const older = deferred(); let writes = 0;
  const ui = mount({ store: fakeStore({ inspectCollectionBackup: text => text === 'older' ? older.promise : Promise.resolve(preview(2)), restoreCollectionBackup: async () => { writes++; } }) });
  choose(ui, 'older'); await settle(); ui.restoreButton.dispatchEvent(new Event('click'));
  choose(ui, 'newer'); await settle(); const latestText = ui.host.textContent;
  older.resolve(preview(1)); await settle(); assert.equal(ui.host.textContent, latestText); assert.equal(writes, 0); assert.equal(ui.restoreButton.disabled, false);
});

for (const stage of ['read', 'inspect', 'export', 'restore']) {
  for (const invalidate of ['dispose', 'detach', 'replace', 'ownership']) {
    test(`${invalidate} suppresses late ${stage} completion and refresh`, async () => {
      const pending = deferred(); let active = true, inspections = 0, restored = 0, guard;
      const ui = mount({ isCurrent: () => active, onRestored: () => { restored++; }, store: fakeStore({
        exportCollectionBackup: () => pending.promise,
        inspectCollectionBackup: () => { inspections++; return stage === 'inspect' ? pending.promise : Promise.resolve(preview()); },
        restoreCollectionBackup: (_candidate, options) => { guard = options.isCurrent; return pending.promise; },
      }) });
      if (stage === 'export') ui.exportButton.click();
      else { choose(ui, '', { ...(stage === 'read' ? { promise: pending.promise } : {}) }); await settle(); if (stage === 'restore') ui.restoreButton.click(); }
      if (invalidate === 'dispose') ui.handle.dispose(); else if (invalidate === 'detach') ui.host.remove(); else if (invalidate === 'replace') ui.host.replaceChildren(ui.document.createElement('p')); else active = false;
      const text = ui.host.textContent;
      if (guard) assert.equal(guard(), false);
      pending.resolve(stage === 'read' ? '{}' : stage === 'inspect' ? preview(7) : stage === 'restore' ? { added: 7, unchanged: 0 } : { text: '{}', byteLength: 2, trophyCount: 0, captureCount: 0 });
      await settle(); assert.equal(ui.host.textContent, text); assert.equal(restored, 0); assert.equal(ui.document.downloads.length, 0);
      if (stage === 'read') assert.equal(inspections, 0);
    });
  }
}

test('restore errors preserve preview for an explicit retry and never auto-retry', async () => {
  let calls = 0;
  const ui = mount({ store: fakeStore({ restoreCollectionBackup: async () => { calls++; if (calls === 1) throw Error('保存領域がいっぱいです'); return { added: 1, unchanged: 0 }; } }) });
  choose(ui); await settle(); ui.restoreButton.click(); await settle();
  assert.equal(calls, 1); assert.match(ui.host.textContent, /保存領域がいっぱい/); assert.equal(ui.restoreButton.disabled, false);
  ui.restoreButton.click(); await settle(); assert.equal(calls, 2); assert.equal(ui.restoreButton.disabled, true);
});

test('commit disables file replacement and overlapping archive operations', async () => {
  const pending = deferred(); let inspections = 0, exports = 0;
  const ui = mount({ store: fakeStore({ inspectCollectionBackup: async () => { inspections++; return preview(); }, restoreCollectionBackup: () => pending.promise, exportCollectionBackup: async () => { exports++; } }) });
  choose(ui); await settle(); ui.restoreButton.click(); choose(ui, 'replacement'); ui.exportButton.dispatchEvent(new Event('click'));
  assert.equal(inspections, 1); assert.equal(exports, 0); assert.ok(ui.importButton.disabled && ui.exportButton.disabled && ui.input.disabled);
  pending.resolve({ added: 1, unchanged: 0 }); await settle(); assert.equal(ui.importButton.disabled, false);
});

test('successful persistence is never described as failed when refresh throws', async () => {
  let writes = 0;
  const ui = mount({ store: fakeStore({ restoreCollectionBackup: async () => { writes++; return { added: 1, unchanged: 0 }; } }), onRestored: async () => { throw Error('registry refresh failed'); } });
  choose(ui); await settle(); ui.restoreButton.click(); await settle();
  assert.equal(writes, 1); assert.match(ui.host.textContent, /復元は保存済み/);
  assert.match(ui.host.textContent, /開き直して/); assert.equal(ui.restoreButton.disabled, true);
  assert.equal(ui.importButton.disabled, false);
});

test('an async refresh guard expires when collection ownership is replaced', async () => {
  const pending = deferred(); let guard, calls = 0, active = true;
  const ui = mount({ isCurrent: () => active, onRestored: async (_result, isCurrent) => { guard = isCurrent; calls++; await pending.promise; } });
  choose(ui); await settle(); ui.restoreButton.click(); await settle();
  assert.equal(calls, 1); assert.equal(guard(), true); assert.equal(ui.importButton.disabled, true);
  active = false; const text = ui.host.textContent; pending.reject(Error('late refresh')); await settle();
  assert.equal(guard(), false); assert.equal(ui.host.textContent, text);
});

test('old verification rejection cannot overwrite the newer verified preview', async () => {
  const pending = deferred();
  const ui = mount({ store: fakeStore({ inspectCollectionBackup: text => text === 'old' ? pending.promise : Promise.resolve(preview(9)) }) });
  choose(ui, 'old'); await settle(); choose(ui, 'new'); await settle(); const before = ui.host.textContent;
  pending.reject(Error('old error')); await settle();
  assert.equal(ui.host.textContent, before); assert.equal(ui.restoreButton.disabled, false);
});

test('disposed controls leave no active handlers when saved DOM nodes are clicked', async () => {
  let calls = 0;
  const ui = mount({ store: fakeStore({ exportCollectionBackup: async () => { calls++; }, inspectCollectionBackup: async () => { calls++; } }) });
  ui.handle.dispose(); ui.handle.dispose(); ui.exportButton.dispatchEvent(new Event('click')); choose(ui); await settle();
  assert.equal(calls, 0); assert.equal(ui.document.downloads.length, 0);
});

test('the real validated archive round trip adds collection data only after explicit restore', async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  const { createProfileStore } = await import('../src/profile-store.js');
  const { createFixtureRaid, prepareRaidRewards } = await import('../src/raid/index.js');
  const { default: R } = await import('../src/run.js');
  const source = createProfileStore(new IDBFactory(), 'controls-source');
  const destination = createProfileStore(new IDBFactory(), 'controls-destination');
  const blueprint = await createFixtureRaid('archive');
  const run = R.newRun('lab'); run.page.name = 'Keep my current Run';
  const [reward] = prepareRaidRewards(blueprint, 'controls-fixture-victory');
  await source.recordRaidVictory(blueprint, reward.battleId);
  await source.claimRaidReward(run, reward, blueprint);
  await destination.saveRun(run);
  const exporting = mount({ store: source }); exporting.exportButton.click(); await until(() => exporting.document.downloads.length === 1);
  assert.equal(exporting.document.downloads.length, 1);
  const text = await exporting.blobs[0].text();
  let refreshed = 0;
  const importing = mount({ store: destination, onRestored: async (_result, isCurrent) => { assert.equal(isCurrent(), true); refreshed++; } });
  choose(importing, text); await until(() => !importing.restoreButton.disabled);
  assert.equal((await destination.listTrophies()).length, 0);
  assert.equal(importing.restoreButton.disabled, false);
  importing.restoreButton.click(); await until(() => refreshed === 1);
  assert.equal((await destination.listTrophies()).length, 1);
  assert.deepEqual(await destination.getBlueprint(blueprint.captureId), blueprint);
  assert.deepEqual(await destination.loadRun('lab'), run);
  assert.deepEqual(await destination.listPendingRaids(), []);
  assert.equal(refreshed, 1); assert.match(importing.host.textContent, /復元しました/);
  await until(() => !importing.importButton.disabled);
  choose(importing, text); await until(() => !importing.restoreButton.disabled); importing.restoreButton.click(); await until(() => refreshed === 2);
  assert.equal((await destination.listTrophies()).length, 1);
  assert.match(importing.host.textContent, /追加 0件/);
});
