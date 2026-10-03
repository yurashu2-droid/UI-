import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../src/run.js';
import * as P from '../src/persistence.js';

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { entries, getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); } };
}
test('corrupt save bytes are retained and protected from a fallback overwrite', () => {
  assert.equal(typeof P.createRunPersistence, 'function');
  const storage = memoryStorage({ 'v3-campaign': '{broken' });
  const p = P.createRunPersistence(storage, 'v3-');
  assert.equal(p.load('campaign').status, 'corrupt');
  assert.equal(p.save(R.newRun('campaign')).ok, false);
  assert.equal(storage.entries.get('v3-campaign'), '{broken');
});
test('valid lab save loads and persists without losing appearance identity', () => {
  assert.equal(typeof P.createRunPersistence, 'function');
  const storage = memoryStorage();
  const p = P.createRunPersistence(storage, 'v3-');
  const run = R.newRun('lab');
  run.owned[0].appearanceId = 'appearance_' + 'a'.repeat(64);
  assert.equal(p.save(run).ok, true);
  assert.deepEqual(p.load('lab').run, run);
});
test('storage failures produce an explicit failure and leave the run valid', () => {
  assert.equal(typeof P.createRunPersistence, 'function');
  const p = P.createRunPersistence({ getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } }, 'v3-');
  assert.equal(p.load('campaign').status, 'unavailable');
  const run = R.newRun('campaign');
  assert.equal(p.save(run).ok, false);
  assert.equal(R.validateRun(run), true);
});
test('explicit recovery backs up old bytes before replacing a damaged save', () => {
  assert.equal(typeof P.createRunPersistence, 'function');
  const storage = memoryStorage({ 'v3-campaign': '{broken' });
  const p = P.createRunPersistence(storage, 'v3-');
  p.load('campaign');
  assert.equal(p.recover(R.newRun('campaign')).ok, true);
  assert.equal(storage.entries.get('v3-campaign-recovery'), '{broken');
  assert.equal(p.load('campaign').status, 'loaded');
});

test('a synchronous recovery journal wins over an older asynchronous profile mirror', () => {
  assert.equal(typeof P.selectRecoveredRun,'function');
  const older=R.newRun('campaign'), latest=structuredClone(older); latest.cash=99;
  assert.deepEqual(P.selectRecoveredRun({status:'loaded',run:latest},older),latest);
  assert.deepEqual(P.selectRecoveredRun({status:'empty'},older),older);
});

test('two empty journals cannot both claim first ownership of a save', () => {
  const storage = memoryStorage();
  const first = P.createRunPersistence(storage, 'v3-');
  const second = P.createRunPersistence(storage, 'v3-');
  first.load('campaign'); second.load('campaign');
  const current = R.newRun('campaign'); current.page.name = 'Newer journey';
  assert.equal(first.save(current).ok, true);
  assert.equal(second.save(R.newRun('campaign')).ok, false);
  assert.equal(JSON.parse(storage.entries.get('v3-campaign')).page.name, 'Newer journey');
});

test('an interrupted mode-pointer write permits retrying the already committed run', () => {
  const storage = memoryStorage();
  let fail = true;
  const store = P.createRunPersistence({ getItem: storage.getItem, setItem(key, value) {
    if (key === 'v3-mode' && fail) throw new Error('mode quota');
    storage.setItem(key, value);
  } }, 'v3-');
  const run = R.newRun('campaign');
  assert.equal(store.save(run).ok, false);
  fail = false;
  run.page.name = 'Retry after a partial write';
  assert.equal(store.save(run).ok, true);
  assert.equal(JSON.parse(storage.entries.get('v3-campaign')).page.name, run.page.name);
});

test('recovery cannot back up obsolete corrupt bytes over a newer tab save', () => {
  const storage = memoryStorage({ 'v3-campaign': '{old damaged' });
  const old = P.createRunPersistence(storage, 'v3-');
  old.load('campaign');
  const newer = R.newRun('campaign'); newer.page.name = 'Recovered elsewhere';
  const raw = JSON.stringify(newer); storage.entries.set('v3-campaign', raw);
  assert.equal(old.recover(R.newRun('campaign')).ok, false);
  assert.equal(storage.entries.get('v3-campaign'), raw);
});

test('mirror-current checks do not silently refresh a stale tab ownership baseline', () => {
  const storage = memoryStorage(), journal = P.createRunPersistence(storage, 'v3-');
  const first = R.newRun('campaign');
  assert.equal(journal.save(first).ok, true);
  assert.equal(journal.isCurrent(first), true);
  const newer = structuredClone(first); newer.page.name = 'Updated in another tab';
  storage.setItem('v3-campaign', JSON.stringify(newer));
  assert.equal(journal.isCurrent(first), false);
  assert.equal(journal.isCurrent(newer), true);
  assert.equal(journal.save(newer).ok, false, 'guard does not adopt the newer raw baseline');
  storage.entries.delete('v3-campaign');
  assert.equal(journal.isCurrent(first), false);
  const blocked = P.createRunPersistence({ getItem() { throw Error('blocked'); }, setItem() {} }, 'v3-');
  assert.equal(blocked.isCurrent(first), false);
});
