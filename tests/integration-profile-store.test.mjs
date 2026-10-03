import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import R from '../src/run.js';
import { createFixtureRaid, prepareRaidRewards } from '../src/raid/index.js';
import * as P from '../src/profile-store.js';

test('a raid claim atomically stores exact source identity and pays only once', async () => {
  assert.equal(typeof P.createProfileStore, 'function');
  const store = P.createProfileStore(new IDBFactory());
  const bp = await createFixtureRaid('archive');
  const reward = prepareRaidRewards(bp, 'battle-atomic')[0];
  const run = R.newRun('lab');
  await store.recordRaidVictory(bp, reward.battleId);
  const [a,b] = await Promise.all([store.claimRaidReward(run,reward,bp),store.claimRaidReward(run,reward,bp)]);
  assert.equal([a,b].filter(x=>x.created).length,1);
  assert.equal((await store.listTrophies()).length,1);
  const saved = await store.getBlueprint(bp.captureId);
  assert.deepEqual(saved,bp);
  assert.deepEqual(await store.loadRun('lab'),run);
  assert.equal(a.trophy.item.appearanceId,reward.appearanceId);
  assert.equal(a.trophy.item.provenanceId,bp.captureId);
});
test('a second choice in one victorious raid cannot obtain a second trophy', async () => {
  assert.equal(typeof P.createProfileStore, 'function');
  const store=P.createProfileStore(new IDBFactory());
  const bp=await createFixtureRaid('archive');
  const rewards=prepareRaidRewards(bp,'battle-choice');
  await store.recordRaidVictory(bp,'battle-choice');
  await store.claimRaidReward(R.newRun('lab'),rewards[0],bp);
  await assert.rejects(()=>store.claimRaidReward(R.newRun('lab'),rewards[1],bp),/選択済み/);
  assert.equal((await store.listTrophies()).length,1);
});

test('unclaimed victories survive reload and only a proven victory can be claimed', async () => {
  assert.equal(typeof P.createProfileStore, 'function');
  const factory=new IDBFactory(), store=P.createProfileStore(factory);
  const bp=await createFixtureRaid('archive');
  const reward=prepareRaidRewards(bp,'battle-reload')[0];
  await assert.rejects(()=>store.claimRaidReward(R.newRun('lab'),reward,bp),/勝利/);
  await store.recordRaidVictory(bp,'battle-reload');
  const reloaded=P.createProfileStore(factory);
  const [pending]=await reloaded.listPendingRaids();
  assert.equal(pending.battleId,'battle-reload');
  assert.deepEqual(pending.blueprint,bp);
  await reloaded.claimRaidReward(R.newRun('lab'),reward,bp);
  assert.deepEqual(await reloaded.listPendingRaids(),[]);
});
test('legacy run migration preserves data and will not overwrite an existing v4 profile', async () => {
  assert.equal(typeof P.createProfileStore, 'function');
  const store=P.createProfileStore(new IDBFactory());
  const first=R.newRun('campaign');
  const later=structuredClone(first); later.cash=99;
  await store.migrateLegacy(first);
  await store.saveRun(later);
  await store.migrateLegacy(first);
  assert.deepEqual(await store.loadRun('campaign'),later);
});

test('a journal guard can skip a stale mirror without damaging the existing profile', async () => {
  const store = P.createProfileStore(new IDBFactory());
  const current = R.newRun('campaign'); current.page.name = 'Latest saved progress';
  await store.saveRun(current);
  const old = structuredClone(current); old.page.name = 'Delayed older progress';
  let checked = 0;
  await store.saveRun(old, { isCurrent: snapshot => { checked++; assert.deepEqual(snapshot, old); return false; } });
  assert.equal(checked, 1);
  assert.deepEqual(await store.loadRun('campaign'), current);
});

test('mirror eligibility is checked when its write transaction becomes active, after prior queued writes', async () => {
  const factory = new IDBFactory(), store = P.createProfileStore(factory, 'guarded-queue');
  const old = R.newRun('campaign'); old.page.name = 'Old snapshot';
  await store.saveRun(old);
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('guarded-queue', 2);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const latest = structuredClone(old); latest.page.name = 'Newly committed paid state';
  let eligible = true, checks = 0;
  const ahead = db.transaction('profiles', 'readwrite');
  const request = ahead.objectStore('profiles').put(latest, 'campaign');
  request.onsuccess = () => { eligible = false; };
  const pending = store.saveRun(old, { isCurrent: () => { checks++; return eligible; } });
  await Promise.resolve();
  assert.equal(checks, 0, 'creating a blocked transaction is not permission to overwrite later');
  await pending;
  assert.equal(checks, 1);
  assert.deepEqual(await store.loadRun('campaign'), latest);
  db.close();
});

test('a throwing journal guard aborts only its own mirror transaction', async () => {
  const store = P.createProfileStore(new IDBFactory());
  const current = R.newRun('campaign'); await store.saveRun(current);
  const old = structuredClone(current); old.page.name = 'Unverified replacement';
  await assert.rejects(() => store.saveRun(old, { isCurrent: () => { throw Error('journal unavailable'); } }), /journal unavailable/);
  assert.deepEqual(await store.loadRun('campaign'), current);
});
