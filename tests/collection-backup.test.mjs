import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import R from '../src/run.js';
import { createProfileStore } from '../src/profile-store.js';
import { createFixtureRaid, createRaidLootItem, prepareRaidRewards, sealRaidBlueprint } from '../src/raid/index.js';

const STORES = ['captures', 'trophies', 'receipts', 'encounters'];
const LIMIT = 16 * 1024 * 1024;
function setup() {
  const factory = new IDBFactory(), name = 'collection-test';
  return { factory, name, store: createProfileStore(factory, name) };
}
async function database({ factory, name }) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function mutate(context, action) {
  const db = await database(context);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([...STORES, 'profiles'], 'readwrite');
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      action(tx);
    });
  } finally { db.close(); }
}
async function snapshot(context) {
  const db = await database(context);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([...STORES, 'profiles']), data = {};
      tx.oncomplete = () => resolve(data); tx.onerror = tx.onabort = () => reject(tx.error);
      for (const name of [...STORES, 'profiles']) {
        const records = tx.objectStore(name).getAll(), keys = tx.objectStore(name).getAllKeys();
        records.onsuccess = () => { data[name] ??= {}; data[name].values = records.result; };
        keys.onsuccess = () => { data[name] ??= {}; data[name].keys = keys.result; };
      }
    });
  } finally { db.close(); }
}
async function claim(store, bp, battleId, index = 0) {
  const reward = prepareRaidRewards(bp, battleId)[index];
  await store.recordRaidVictory(bp, battleId);
  return (await store.claimRaidReward(R.newRun('lab'), reward, bp, { writeRunProfile: false })).trophy;
}
async function archiveFor(bp, ids = ['backup-a'], acquiredAt = 1700000000000) {
  return {
    format: 'ui-raid-collection', version: 1, exportedAt: '2026-10-03T00:00:00.000Z',
    trophies: ids.map(battleId => {
      const reward = prepareRaidRewards(bp, battleId)[0];
      return { rewardId: reward.rewardId, battleId, captureId: bp.captureId, componentId: reward.componentId, item: createRaidLootItem(reward, 'p0'), acquiredAt };
    }), captures: [bp],
  };
}
function requireAPI(store) {
  for (const name of ['exportCollectionBackup', 'inspectCollectionBackup', 'restoreCollectionBackup'])
    assert.equal(typeof store[name], 'function', `${name} must implement the explicit collection boundary`);
}

test('export is a complete, deduplicated archive of acquired entries only', async () => {
  const context = setup(), { store } = context; requireAPI(store);
  const bp = await createFixtureRaid('archive'), other = await createFixtureRaid('commerce');
  const first = await claim(store, bp, 'acquired-a'), second = await claim(store, bp, 'acquired-b', 1);
  await store.recordRaidVictory(other, 'pending-other');
  await store.recordRaidVictory(other, 'discarded-other'); await store.discardRaidVictory('discarded-other');
  const run = R.newRun('campaign'); await store.saveRun(run);
  const before = await snapshot(context), result = await store.exportCollectionBackup(), archive = JSON.parse(result.text);
  assert.deepEqual(Object.keys(archive).sort(), ['captures', 'exportedAt', 'format', 'trophies', 'version']);
  assert.equal(archive.format, 'ui-raid-collection'); assert.equal(archive.version, 1);
  assert.equal(new Date(archive.exportedAt).toISOString(), archive.exportedAt);
  assert.deepEqual(archive.trophies, [first, second]); assert.deepEqual(archive.captures, [bp]);
  assert.equal(result.trophyCount, 2); assert.equal(result.captureCount, 1);
  assert.equal(result.byteLength, new TextEncoder().encode(result.text).length);
  assert.deepEqual(await snapshot(context), before, 'export never writes any store');
});

test('restore preserves exact appearances and claims without reopening rewards or changing profiles', async () => {
  const source = setup(); requireAPI(source.store);
  const bp = await createFixtureRaid('archive'); await claim(source.store, bp, 'round-trip');
  const exported = await source.store.exportCollectionBackup(), target = setup();
  const run = R.newRun('campaign'); run.cash = 99; await target.store.saveRun(run);
  const preview = await target.store.inspectCollectionBackup(exported.text);
  assert.deepEqual([preview.trophyCount, preview.captureCount, preview.addCount, preview.unchangedCount], [1, 1, 1, 0]);
  assert.deepEqual(preview.conflicts, []); assert.ok(Object.isFrozen(preview.candidate));
  assert.deepEqual(await target.store.listTrophies(), [], 'inspection is read-only');
  assert.deepEqual(await target.store.restoreCollectionBackup(preview.candidate), { added: 1, unchanged: 0 });
  assert.deepEqual(await target.store.getBlueprint(bp.captureId), bp);
  assert.deepEqual(await target.store.listTrophies(), await source.store.listTrophies());
  assert.deepEqual(await target.store.listPendingRaids(), []);
  assert.deepEqual(await target.store.loadRun('campaign'), run);
  assert.equal(await target.store.loadRun('lab'), undefined);
  const again = await target.store.inspectCollectionBackup(exported.text);
  assert.deepEqual([again.addCount, again.unchangedCount], [0, 1]);
  const before = await snapshot(target);
  assert.deepEqual(await target.store.restoreCollectionBackup(again.candidate), { added: 0, unchanged: 1 });
  assert.deepEqual(await snapshot(target), before);
  await assert.rejects(() => target.store.claimRaidReward(R.newRun('lab'), prepareRaidRewards(bp, 'round-trip')[1], bp), /選択済み/);
  await assert.rejects(() => target.store.restoreCollectionBackup({}), /確認|検証|候補/);
});

test('import rejects malformed envelopes, incomplete references, duplicates and altered exact loot', async () => {
  const { store } = setup(); requireAPI(store);
  const bp = await createFixtureRaid('archive'), valid = await archiveFor(bp);
  const cases = [
    a => { a.version = 2; }, a => { a.format = 'ui-raid-run'; }, a => { a.extra = 1; },
    a => { a.exportedAt = '2026-02-31T00:00:00.000Z'; },
    a => { a.trophies.push(structuredClone(a.trophies[0])); },
    a => { a.captures.push(structuredClone(a.captures[0])); },
    a => { a.captures = []; }, a => { a.trophies = []; },
    a => { a.trophies[0].extra = 1; }, a => { a.trophies[0].acquiredAt = 0.5; },
    a => { a.trophies[0].acquiredAt = -1; }, a => { a.trophies[0].acquiredAt = Number.MAX_SAFE_INTEGER + 1; },
    a => { a.trophies[0].battleId = '../bad'; }, a => { a.trophies[0].rewardId += '-bad'; },
    a => { a.trophies[0].componentId = 'component-99'; }, a => { a.trophies[0].item.label = 'edited'; },
    a => { a.trophies[0].item.x = 0; }, a => { a.trophies[0].item.id = 'p9'; },
    a => { a.trophies[0].item.extra = 'ignored'; }, a => { a.trophies[0].item.provenanceId = 'elsewhere'; },
    a => { a.captures[0].source.name = 'changed bytes, old hash'; },
    a => { a.captures[0].components[0].appearance.primitives[0].text = 'tampered'; },
    a => { a.captures[0].html = '<script>no</script>'; },
    a => { a.captures[0].components = Array(13).fill(a.captures[0].components[0]); },
  ];
  const before = await store.listTrophies();
  for (const [index, change] of cases.entries()) {
    const bad = structuredClone(valid); change(bad);
    await assert.rejects(() => store.inspectCollectionBackup(JSON.stringify(bad)), Error, `case ${index}`);
  }
  for (const text of ['{', 'null', '[]', JSON.stringify(R.newRun('lab'))])
    await assert.rejects(() => store.inspectCollectionBackup(text));
  const secondChoice = structuredClone(valid), reward = prepareRaidRewards(bp, 'backup-a')[1];
  secondChoice.trophies.push({ ...secondChoice.trophies[0], rewardId: reward.rewardId, componentId: reward.componentId, item: createRaidLootItem(reward, 'p0') });
  await assert.rejects(() => store.inspectCollectionBackup(JSON.stringify(secondChoice)), /重複|対戦/);
  assert.deepEqual(await store.listTrophies(), before);
});

test('byte and count ceilings reject before cryptographic work and never truncate stored collections', async () => {
  const context = setup(), { store } = context; requireAPI(store);
  const bp = await createFixtureRaid('archive'), valid = await archiveFor(bp);
  const original = crypto.subtle.digest; let digests = 0;
  crypto.subtle.digest = async function (...args) { digests++; return original.apply(this, args); };
  try {
    const tooManyTrophies = structuredClone(valid); tooManyTrophies.trophies = Array(257).fill(valid.trophies[0]);
    const tooManyCaptures = structuredClone(valid); tooManyCaptures.captures = Array(257).fill(bp);
    for (const text of [' '.repeat(LIMIT + 1), 'あ'.repeat(Math.floor(LIMIT / 3) + 1), JSON.stringify(tooManyTrophies), JSON.stringify(tooManyCaptures)])
      await assert.rejects(() => store.inspectCollectionBackup(text), /上限|容量|256|16/);
    assert.equal(digests, 0);
  } finally { crypto.subtle.digest = original; }
  const full = await archiveFor(bp, Array.from({ length: 256 }, (_, i) => `batch-a-${i}`));
  const next = await archiveFor(bp, Array.from({ length: 256 }, (_, i) => `batch-b-${i}`));
  await store.restoreCollectionBackup((await store.inspectCollectionBackup(JSON.stringify(full))).candidate);
  assert.equal((await store.exportCollectionBackup()).trophyCount, 256);
  await store.restoreCollectionBackup((await store.inspectCollectionBackup(JSON.stringify(next))).candidate);
  assert.equal((await store.listTrophies()).length, 512, 'archive limits are not storage capacity limits');
  const before = await snapshot(context);
  await assert.rejects(() => store.exportCollectionBackup(), /上限|256/);
  assert.deepEqual(await snapshot(context), before);
});

test('export refuses corrupt captures and missing, different or inconsistent claim markers', async () => {
  const bp = await createFixtureRaid('archive');
  for (const damage of [
    (tx, trophy) => tx.objectStore('captures').delete(bp.captureId),
    (tx, trophy) => tx.objectStore('captures').put({ ...bp, source: { ...bp.source, name: 'modified' } }, bp.captureId),
    (tx, trophy) => tx.objectStore('receipts').delete(trophy.battleId),
    (tx, trophy) => tx.objectStore('receipts').put({ ...trophy, acquiredAt: trophy.acquiredAt + 1 }, trophy.battleId),
    (tx, trophy) => tx.objectStore('encounters').delete(trophy.battleId),
    (tx, trophy) => tx.objectStore('encounters').put({ battleId: trophy.battleId, captureId: trophy.captureId, winner: 'player' }, trophy.battleId),
    (tx, trophy) => tx.objectStore('encounters').put({ battleId: trophy.battleId, captureId: trophy.captureId, winner: 'player', claimed: trophy.rewardId, discarded: true }, trophy.battleId),
    (tx, trophy) => { tx.objectStore('trophies').delete(trophy.rewardId); tx.objectStore('trophies').put(trophy, 'wrong-key'); },
  ]) {
    const context = setup(); requireAPI(context.store);
    const trophy = await claim(context.store, bp, 'corrupt'); await mutate(context, tx => damage(tx, trophy));
    const before = await snapshot(context);
    await assert.rejects(() => context.store.exportCollectionBackup(), Error);
    assert.deepEqual(await snapshot(context), before);
  }
});

test('preflight reports conflicts and a conflict aborts every otherwise-new trophy', async () => {
  const context = setup(), { store } = context; requireAPI(store);
  const bp = await createFixtureRaid('archive'), archive = await archiveFor(bp, ['new-entry', 'conflict-entry']);
  const existing = await claim(store, bp, 'conflict-entry');
  assert.notEqual(existing.acquiredAt, archive.trophies[1].acquiredAt);
  const preview = await store.inspectCollectionBackup(JSON.stringify(archive));
  assert.ok(preview.conflicts.some(conflict => conflict.kind === 'reward' || conflict.kind === 'battle'));
  assert.equal(preview.trophyCount, 2); assert.equal(preview.captureCount, 1);
  const before = await snapshot(context);
  await assert.rejects(() => store.restoreCollectionBackup(preview.candidate), /競合|一致|異な/);
  assert.deepEqual(await snapshot(context), before);
});

test('same-key pending or discarded encounters block restoration while disjoint pending rewards stay untouched', async () => {
  const bp = await createFixtureRaid('archive'), archive = await archiveFor(bp, ['imported']);
  for (const discarded of [false, true]) {
    const context = setup(), { store } = context; requireAPI(store);
    await store.recordRaidVictory(bp, 'imported');
    if (discarded) await store.discardRaidVictory('imported');
    const preview = await store.inspectCollectionBackup(JSON.stringify(archive));
    assert.ok(preview.conflicts.some(c => c.kind === 'battle' && c.id === 'imported'));
    const before = await snapshot(context);
    await assert.rejects(() => store.restoreCollectionBackup(preview.candidate));
    assert.deepEqual(await snapshot(context), before);
  }
  const context = setup(), { store } = context;
  await store.recordRaidVictory(bp, 'disjoint-pending');
  const pending = await store.listPendingRaids();
  await store.restoreCollectionBackup((await store.inspectCollectionBackup(JSON.stringify(archive))).candidate);
  assert.deepEqual(await store.listPendingRaids(), pending);
});

test('commit rechecks a concurrent claim after preflight instead of trusting its counts', async () => {
  const context = setup(), { store } = context; requireAPI(store);
  const bp = await createFixtureRaid('archive'), archive = await archiveFor(bp, ['race-a', 'race-b']);
  const preview = await store.inspectCollectionBackup(JSON.stringify(archive));
  assert.equal(preview.addCount, 2);
  const otherTab = createProfileStore(context.factory, context.name);
  await claim(otherTab, bp, 'race-b', 1);
  const before = await snapshot(context);
  await assert.rejects(() => store.restoreCollectionBackup(preview.candidate), /競合|一致|異な/);
  assert.deepEqual(await snapshot(context), before);
});

test('racing identical restores are one atomic add and one no-op; differing timestamps cannot overwrite', async () => {
  const context = setup(), { store } = context; requireAPI(store);
  const otherTab = createProfileStore(context.factory, context.name), bp = await createFixtureRaid('archive');
  const archive = await archiveFor(bp, ['simultaneous']);
  const [a, b] = await Promise.all([store.inspectCollectionBackup(JSON.stringify(archive)), otherTab.inspectCollectionBackup(JSON.stringify(archive))]);
  const result = await Promise.all([store.restoreCollectionBackup(a.candidate), otherTab.restoreCollectionBackup(b.candidate)]);
  assert.deepEqual(result.map(r => r.added).sort(), [0, 1]);
  assert.deepEqual(result.map(r => r.unchanged).sort(), [0, 1]);
  const newContext = setup(), first = await newContext.store.inspectCollectionBackup(JSON.stringify(archive));
  archive.trophies[0].acquiredAt++;
  const second = await newContext.store.inspectCollectionBackup(JSON.stringify(archive));
  const races = await Promise.allSettled([newContext.store.restoreCollectionBackup(first.candidate), newContext.store.restoreCollectionBackup(second.candidate)]);
  assert.equal(races.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(races.filter(r => r.status === 'rejected').length, 1);
  assert.equal((await newContext.store.listTrophies()).length, 1);
});

test('an export uses one immutable snapshot when a different tab mutates records during hashing', async () => {
  const context = setup(), { store } = context; requireAPI(store);
  const bp = await createFixtureRaid('archive'), trophy = await claim(store, bp, 'snapshot');
  const original = crypto.subtle.digest; let release, entered;
  const paused = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  let first = true;
  crypto.subtle.digest = async function (...args) {
    if (first) { first = false; entered(); await gate; }
    return original.apply(this, args);
  };
  try {
    const pending = store.exportCollectionBackup(); await paused;
    await mutate(context, tx => tx.objectStore('receipts').delete(trophy.battleId));
    release(); const exported = await pending;
    assert.deepEqual(JSON.parse(exported.text).trophies, [trophy]);
    assert.deepEqual(JSON.parse(exported.text).captures, [bp]);
  } finally { release?.(); crypto.subtle.digest = original; }
  await assert.rejects(() => store.exportCollectionBackup());
});

test('restore liveness is checked at the transaction and a failed write rolls all stores back', async () => {
  const context = setup(), { store } = context; requireAPI(store);
  const bp = await createFixtureRaid('archive'), archive = await archiveFor(bp, ['rollback-a', 'rollback-b']);
  const preview = await store.inspectCollectionBackup(JSON.stringify(archive));
  const before = await snapshot(context);
  await assert.rejects(() => store.restoreCollectionBackup(preview.candidate, { isCurrent: () => false }), /中止|画面|現在/);
  assert.deepEqual(await snapshot(context), before);
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    const request = original.apply(this, args);
    if (this.name === 'receipts') request.addEventListener('success', () => this.transaction.abort(), { once: true });
    return request;
  };
  try { await assert.rejects(() => store.restoreCollectionBackup(preview.candidate)); }
  finally { IDBObjectStore.prototype.add = original; }
  assert.deepEqual(await snapshot(context), before, 'capture, trophy, receipt and encounter are one transaction');
});

test('wrong-key identity aliases and incomplete existing entries cannot be silently repaired', async () => {
  const bp = await createFixtureRaid('archive'), archive = await archiveFor(bp), trophy = archive.trophies[0];
  const marker = { battleId: trophy.battleId, captureId: bp.captureId, winner: 'player', claimed: trophy.rewardId };
  for (const damage of [
    tx => tx.objectStore('trophies').put(trophy, 'wrong-reward-key'),
    tx => tx.objectStore('receipts').put(trophy, 'wrong-battle-key'),
    tx => tx.objectStore('encounters').put(marker, 'wrong-encounter-key'),
    tx => tx.objectStore('trophies').put(trophy, trophy.rewardId),
    tx => tx.objectStore('receipts').put(trophy, trophy.battleId),
    tx => tx.objectStore('encounters').put(marker, trophy.battleId),
    tx => tx.objectStore('captures').put({ ...bp, source: { ...bp.source, name: 'different capture bytes' } }, bp.captureId),
  ]) {
    const context = setup(); requireAPI(context.store); await context.store.listTrophies();
    await mutate(context, damage);
    const preview = await context.store.inspectCollectionBackup(JSON.stringify(archive));
    assert.ok(preview.conflicts.length > 0);
    const before = await snapshot(context);
    await assert.rejects(() => context.store.restoreCollectionBackup(preview.candidate));
    assert.deepEqual(await snapshot(context), before);
  }
});

test('queued restore checks the current screen only after older collection writes finish', async () => {
  const context = setup(), { store } = context; requireAPI(store);
  const bp = await createFixtureRaid('archive'), archive = await archiveFor(bp, ['queued-guard']);
  const preview = await store.inspectCollectionBackup(JSON.stringify(archive)), before = await snapshot(context);
  const db = await database(context);
  const { restoreCollectionDatabase } = await import('../src/collection-backup.js');
  let current = true, checked = 0;
  const ahead = db.transaction(STORES, 'readwrite');
  const request = ahead.objectStore('trophies').get('not-present');
  request.onsuccess = () => { current = false; };
  const pending = restoreCollectionDatabase(db, preview.candidate, { isCurrent: () => { checked++; return current; } });
  assert.equal(current, true, 'the request starts while this screen is current');
  assert.equal(checked, 0);
  await assert.rejects(() => pending, /画面|中止/);
  assert.equal(checked, 1); assert.deepEqual(await snapshot(context), before);
  await assert.rejects(() => store.restoreCollectionBackup(preview.candidate, { isCurrent: () => { throw new Error('detached screen'); } }), /detached screen/);
  assert.deepEqual(await snapshot(context), before); db.close();
});

test('exact UTF-8 byte ceiling is accepted for a valid empty archive', async () => {
  const { store } = setup(); requireAPI(store);
  const text = JSON.stringify({ format: 'ui-raid-collection', version: 1, exportedAt: '2026-10-03T00:00:00.000Z', trophies: [], captures: [] });
  const padded = text + ' '.repeat(LIMIT - new TextEncoder().encode(text).length);
  assert.equal(new TextEncoder().encode(padded).length, LIMIT);
  const preview = await store.inspectCollectionBackup(padded);
  assert.deepEqual([preview.trophyCount, preview.captureCount, preview.addCount, preview.unchangedCount], [0, 0, 0, 0]);
  assert.deepEqual(await store.restoreCollectionBackup(preview.candidate), { added: 0, unchanged: 0 });
  await assert.rejects(() => store.inspectCollectionBackup(padded + ' '), /上限/);
});


test('valid signed-zero primitive coordinates round-trip without changing their stored bytes', async () => {
  const { captureId, ...draft } = await createFixtureRaid('archive');
  draft.decor[0].rect.x = -0;
  const bp = await sealRaidBlueprint(draft), source = setup(), target = setup();
  await claim(source.store, bp, 'signed-zero');
  const exported = await source.store.exportCollectionBackup();
  assert.ok(Object.is(JSON.parse(exported.text).captures[0].decor[0].rect.x, -0));
  const preview = await target.store.inspectCollectionBackup(exported.text);
  await target.store.restoreCollectionBackup(preview.candidate);
  assert.deepEqual(await target.store.getBlueprint(bp.captureId), bp);
  assert.equal((await source.store.inspectCollectionBackup(exported.text)).conflicts.length, 0);
});
