import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import D from "../src/data.js";
import C from "../src/document.js";
import R from "../src/run.js";
import { createProfileStore } from "../src/profile-store.js";
import { createFixtureRaid, prepareRaidRewards } from "../src/raid/index.js";

test("a full 64-item inventory still durably collects one exact trophy without replacing owned UI", async () => {
  const factory = new IDBFactory(),
    store = createProfileStore(factory),
    run = R.newRun("lab");
  run.owned = Array.from({ length: D.MAX_ITEMS }, (_, i) =>
    C.makeItem("am_buy", `p${i + 1}`, null, null),
  );
  run.nextId = D.MAX_ITEMS + 1;
  assert.equal(run.owned.length, 64);
  assert.equal(R.validateRun(run), true);
  const before = structuredClone(run),
    blueprint = await createFixtureRaid("commerce");
  const reward = prepareRaidRewards(blueprint, "full-64-inventory")[4];
  await store.saveRun(run);
  await store.recordRaidVictory(blueprint, reward.battleId);
  const claim = await store.claimRaidReward(run, reward, blueprint);
  assert.equal(claim.created, true);
  const reloaded = createProfileStore(factory);
  assert.deepEqual(await reloaded.loadRun("lab"), before);
  const trophies = await reloaded.listTrophies();
  assert.equal(trophies.length, 1);
  assert.equal(trophies[0].item.appearanceId, reward.appearanceId);
  assert.equal(trophies[0].item.provenanceId, reward.provenanceId);
  assert.deepEqual(await reloaded.getBlueprint(reward.captureId), blueprint);
  assert.deepEqual(await reloaded.listPendingRaids(), []);
  assert.equal(
    (await reloaded.claimRaidReward(run, reward, blueprint)).created,
    false,
  );
  assert.equal((await reloaded.listTrophies()).length, 1);
});
