import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import R from "../src/run.js";
import C from "../src/document.js";
import Editor from "../src/editor.js";
import { createRunPersistence } from "../src/persistence.js";
import { createProfileStore } from "../src/profile-store.js";
import { createFixtureRaid, prepareRaidRewards, createRaidLootItem } from "../src/raid/index.js";

test("QA: inability to read an existing save cannot authorize overwriting it", () => {
  let original = "unreadable original bytes", writes = 0;
  const persistence = createRunPersistence({ getItem() { throw new Error("temporary read failure"); },
    setItem(_key, value) { original = value; writes++; } }, "qa-");
  assert.equal(persistence.load("campaign").status, "unavailable");
  assert.equal(persistence.save(R.newRun("campaign")).ok, false);
  assert.equal(original, "unreadable original bytes");
  assert.equal(writes, 0);
});

test("QA: asynchronous trophy hashing cannot store later mutations of caller state", async () => {
  const store = createProfileStore(new IDBFactory()), blueprint = await createFixtureRaid("archive");
  const run = R.newRun("lab"), expected = structuredClone(run);
  const reward = prepareRaidRewards(blueprint, "qa-immutable-input")[0];
  await store.recordRaidVictory(blueprint,reward.battleId);
  const claim = store.claimRaidReward(run, reward, blueprint);
  run.cash = NaN;
  await claim;
  assert.deepEqual(await store.loadRun("lab"), expected);
});

test("QA: a slow trophy claim cannot roll back a newer profile saved in another tab", async () => {
  const factory=new IDBFactory(), first=createProfileStore(factory), second=createProfileStore(factory);
  const blueprint=await createFixtureRaid("archive"), run=R.newRun("lab");
  await first.saveRun(run);
  const reward=prepareRaidRewards(blueprint,"qa-cross-tab-claim")[0];
  await first.recordRaidVictory(blueprint,reward.battleId);
  const pending=first.claimRaidReward(run,reward,blueprint).catch(error=>error);
  const newer=structuredClone(run); newer.cash=99;
  await second.saveRun(newer);
  const outcome=await pending;
  assert.ok(!(outcome instanceof Error) || /競合|更新|STALE/.test(outcome.message),
    "the claim must succeed or report an actual stale-write conflict, not fail for unrelated setup");
  if(!(outcome instanceof Error)) assert.equal((await first.listTrophies()).length,1);
  assert.deepEqual(await second.loadRun("lab"),newer,
    "a claim may report a conflict or merge safely, but must not overwrite a newer run");
});

test("QA: captured identity survives real editor commit undo redo resize and stash operations", async () => {
  const blueprint = await createFixtureRaid("archive"), reward = prepareRaidRewards(blueprint, "qa-continuity")[0];
  const item = createRaidLootItem(reward, "p1"), run = R.newRun("lab");
  run.owned = [item]; run.nextId = 2;
  // Exercise production state transaction methods without pretending that
  // this isolated receiver is browser/UI evidence or registering DOM handlers.
  const editor = Object.create(Editor.Editor.prototype);
  Object.assign(editor, { o:{ getRun:()=>run, enabled:()=>true, onChange(){}, onToast(){} },
    history:[], future:[], selection:new Set() });
  const sameIdentity = () => {
    assert.equal(run.owned[0].appearanceId, reward.appearanceId);
    assert.equal(run.owned[0].provenanceId, reward.provenanceId);
    assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))), true);
  };
  assert.equal(editor.commit(() => R.move(run, item.id, 32, 24)), true); sameIdentity();
  assert.equal(editor.commit(() => Editor.patchItem(run.owned, item.id, { w:500 })), true); sameIdentity();
  assert.equal(run.owned[0].w, 500);
  editor.undo(); sameIdentity(); assert.equal(run.owned[0].w, reward.width);
  editor.redo(); sameIdentity(); assert.equal(run.owned[0].w, 500);
  assert.equal(editor.commit(() => R.move(run, item.id, null, null)), true); sameIdentity();
  assert.equal(run.owned[0].x, null);
  editor.undo(); sameIdentity(); assert.equal(run.owned[0].x, 32);
});

test("QA: fusion retains source lineage and the original collected appearance", async () => {
  const blueprint = await createFixtureRaid("archive"), reward = prepareRaidRewards(blueprint, "qa-fusion")[0];
  const run = R.newRun("lab"), item = createRaidLootItem(reward, "p1");
  Object.assign(item, {x:32,y:24});
  run.owned = [item, C.makeItem("go_suggest", "p2", 32, 24+item.h, item.w, 84)]; run.nextId=3;
  assert.equal(R.validateRun(run), true);
  const store=createProfileStore(new IDBFactory());
  await store.recordRaidVictory(blueprint,reward.battleId);
  await store.claimRaidReward(run,reward,blueprint);
  const original=(await store.listTrophies())[0];
  assert.equal(R.fuse(run).length,1);
  assert.equal(run.owned[0].type,"go_instant");
  assert.deepEqual(run.owned[0].lineage,[{appearanceId:reward.appearanceId,provenanceId:reward.provenanceId}],
    "a recipe-specific fused appearance must retain the acquired source identity");
  assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))),true);
  await store.saveRun(run);
  assert.deepEqual((await store.loadRun("lab")).owned[0].lineage,run.owned[0].lineage);
  assert.deepEqual((await store.listTrophies())[0],original,"fusion must not alter the collection original");
  assert.deepEqual(await store.getBlueprint(blueprint.captureId),blueprint);
});

test("QA: tampered reward metadata cannot partially write a trophy or run", async () => {
  const store=createProfileStore(new IDBFactory()), blueprint=await createFixtureRaid("archive");
  const reward=prepareRaidRewards(blueprint,"qa-tamper")[0];
  reward.appearanceId=blueprint.components[1].appearanceId;
  await assert.rejects(()=>store.claimRaidReward(R.newRun("lab"),reward,blueprint),/一致/);
  assert.deepEqual(await store.listTrophies(),[]);
  assert.equal(await store.loadRun("lab"),undefined);
  assert.equal(await store.getBlueprint(blueprint.captureId),undefined);
});
