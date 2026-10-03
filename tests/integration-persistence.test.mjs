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
