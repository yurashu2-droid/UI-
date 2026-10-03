import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredMount } from '../src/feature-loader.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('optional panel loading is single-flight and owns its mounted cleanup exactly once', async () => {
  const waiting = deferred();
  let loads = 0, mounts = 0, cleanups = 0;
  const feature = createDeferredMount({
    load: () => { loads++; return waiting.promise; },
    mount: value => { assert.equal(value, 'module'); mounts++; return { dispose() { cleanups++; } }; },
  });
  const first = feature.start();
  const second = feature.start();
  await Promise.resolve();
  assert.equal(loads, 1);
  waiting.resolve('module');
  await Promise.all([first, second]);
  await feature.start();
  assert.equal(mounts, 1);
  feature.dispose(); feature.dispose();
  assert.equal(cleanups, 1);
});

test('closing or replacing a loading panel prevents late mount and errors from touching newer UI', async () => {
  for (const fails of [false, true]) {
    const waiting = deferred();
    const seen = [];
    const feature = createDeferredMount({
      load: () => waiting.promise,
      mount: () => { seen.push('mounted'); return { dispose() {} }; },
      onError: () => seen.push('error'),
    });
    const ready = feature.start();
    feature.dispose();
    if (fails) waiting.reject(new Error('late failure')); else waiting.resolve({});
    await ready;
    await feature.start();
    assert.deepEqual(seen, []);
  }
});

test('a failed chunk download exposes a retry and a successful retry mounts the real feature', async () => {
  let attempts = 0, mounted = 0;
  const events = [];
  const feature = createDeferredMount({
    load: async () => { if (++attempts === 1) throw new Error('offline'); return 'loaded'; },
    mount: value => { assert.equal(value, 'loaded'); mounted++; return { dispose() {} }; },
    onLoading: () => events.push('loading'),
    onError: error => events.push(error.message),
  });
  await feature.start();
  assert.deepEqual(events, ['loading', 'offline']);
  await feature.start();
  assert.equal(attempts, 2);
  assert.equal(mounted, 1);
  assert.deepEqual(events, ['loading', 'offline', 'loading']);
  feature.dispose();
});

test('a synchronous mount that closes its own modal still releases the just-created feature', async () => {
  let cleanups = 0;
  const feature = createDeferredMount({
    load: async () => ({}),
    mount: () => { feature.dispose(); return { dispose() { cleanups++; } }; },
  });
  await feature.start();
  assert.equal(cleanups, 1);
});

test('optional online loading does not place the dark arena under generic modal text styling (source boundary)', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/app.ts', import.meta.url), 'utf8');
  const online = source.slice(source.indexOf('function onlinePanel()'), source.indexOf('async function playRaidChallenge'));
  assert.match(online, /id="online-loading-head"[^`]*<\/div><div id="online-feature-host"/);
  assert.match(online, /loadingHead\s*=\s*\$\("#online-loading-head"\)/);
  assert.match(online, /loadingHead\.remove\(\)/);
});
