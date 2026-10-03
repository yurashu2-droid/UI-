import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";
import R from "../src/run.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { reconstructLocalCode } from "../src/raid/local-code.js";
import { createFixtureRaid } from "../src/raid/fixtures.js";
import { verifyRaidBlueprint, prepareRaidRewards, createRaidLootItem } from "../src/raid/blueprint.js";
import { createRaidEncounterController } from "../src/raid/encounter.js";
import { requestRaidCapture } from "../src/raid/capture.js";
import { createProfileStore } from "../src/profile-store.js";
import { placementPayload } from "../src/online/layout.js";
import { ArenaService } from "../server/arena/service.js";
import { STORY_STAGES } from "../src/story/content.js";
import { transitionStory } from "../src/story/state.js";
import {
  STORY_SAVE_KEY,
  createStorySession,
  commandStorySession,
  prepareStoryBattle,
  settleStoryBattle,
  cacheStoryAnalysis,
  findStoryCapture,
  validateStorySession,
  createStorySessionPersistence,
} from "../src/story/session.js";

const encoded = new TextEncoder().encode("<title>Local Boundary Map</title><h1>Night Map</h1>");
async function localCapture() {
  const result = await reconstructLocalCode({ html: encoded, capturedAt: "2026-10-03T03:20:00.000Z" });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.value.source.kind, "local-file");
  assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
  return result.value;
}
async function publicCapture() {
  const text = await readFile(new URL("../fixtures/raid/compatibility/books-before-child-selectors.json", import.meta.url), "utf8");
  const result = JSON.parse(text);
  assert.equal(result.source.kind, "static-public");
  assert.equal((await verifyRaidBlueprint(result)).ok, true);
  return result;
}
function namedStory() {
  const result = commandStorySession(createStorySession(), { type: "name-page", name: "Boundary story" });
  assert.equal(result.ok, true);
  return result.session;
}
function armedStory() {
  const session = namedStory();
  for (const [type, x, y] of [["ab_heading", 32, 24], ["ab_link", 32, 100]]) {
    const purchase = R.purchase(session.run, type);
    assert.equal(purchase.ok, true);
    assert.equal(R.move(session.run, purchase.item.id, x, y), true);
  }
  assert.equal(validateStorySession(session), true);
  return session;
}
function finish(battle) {
  for (let ticks = 0; ticks < 1201 && !battle.result; ticks++) battle.step(0.05);
  assert.ok(battle.result, "the actual unchanged engine must reach a result");
  return battle.result;
}
function storyWithPendingReward() {
  const start = prepareStoryBattle(armedStory(), "local-boundary-story-win");
  assert.equal(start.ok, true);
  assert.equal(finish(start.battle).winner, "player");
  const settled = settleStoryBattle(start.session, "local-boundary-story-win", start.battle);
  assert.equal(settled.ok, true);
  assert.ok(settled.session.reward);
  return settled.session;
}
async function databaseSnapshot(factory, name) {
  const db = await new Promise((resolve, reject) => {
    const request = factory.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const names = Array.from(db.objectStoreNames), tx = db.transaction(names), result = {};
      for (const name of names) {
        const store = tx.objectStore(name), keys = store.getAllKeys(), values = store.getAll();
        values.onsuccess = () => { result[name] = keys.result.map((key, i) => [key, values.result[i]]); };
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

// Removing the source/mode guard must admit this valid local opponent into campaign.
test("a sealed local opponent cannot start a campaign challenge or mutate its valid run", async () => {
  const session = armedStory(), local = await localCapture();
  const before = JSON.stringify(session), captureBefore = JSON.stringify(local);
  assert.throws(() => prepareRaidChallenge(session.run, local), /実験室/);
  assert.equal(JSON.stringify(session), before);
  assert.equal(JSON.stringify(local), captureBefore);
});

test("fixture and saved static-public opponents retain campaign challenge support", async () => {
  const run = armedStory().run, before = JSON.stringify(run);
  for (const blueprint of [await createFixtureRaid("archive"), await publicCapture()]) {
    const captureBefore = JSON.stringify(blueprint), prepared = prepareRaidChallenge(run, blueprint);
    assert.equal(prepared.blueprint.captureId, blueprint.captureId);
    assert.notEqual(prepared.snapshot, run);
    assert.notEqual(prepared.blueprint, blueprint);
    finish(prepared.battle);
    assert.equal(JSON.stringify(run), before);
    assert.equal(JSON.stringify(blueprint), captureBefore);
  }
});

// Removing the cache guard must charge energy and cache the real local capture.
test("local analysis is rejected before new/reanalysis receipts and preserves pending story rewards", async () => {
  const local = await localCapture(), fixture = await createFixtureRaid("archive");
  const cached = await cacheStoryAnalysis(storyWithPendingReward(), fixture, "new");
  assert.equal(cached.ok, true);
  const session = cached.session, before = JSON.stringify(session);
  for (const kind of ["new", "reanalyze"]) {
    const rejected = await cacheStoryAnalysis(session, local, kind);
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /実験室/);
    assert.equal(JSON.stringify(rejected.session), before);
    assert.equal(JSON.stringify(session), before);
    assert.deepEqual(rejected.effects, []);
  }
  const spent = transitionStory(session.story, { type: "spend-analysis", receiptId: `analysis_${local.captureId}`, kind: "new" });
  assert.equal(spent.ok, true);
  const oldReceipt = { ...structuredClone(session), story: spent.state };
  assert.equal(validateStorySession(oldReceipt), true);
  const rejected = await cacheStoryAnalysis(oldReceipt, local, "new");
  assert.equal(rejected.ok, false, "a matching receipt cannot bypass the source boundary");
  assert.deepEqual(rejected.session, oldReceipt);
});

// Removing the cache-entry validator must accept a coherent imported local entry.
test("coherent story JSON cannot smuggle a local capture through load save or recovery", async () => {
  const local = await localCapture(), original = storyWithPendingReward();
  const spent = transitionStory(original.story, { type: "spend-analysis", receiptId: `analysis_${local.captureId}`, kind: "new" });
  assert.equal(spent.ok, true);
  const smuggled = { ...structuredClone(original), story: spent.state, analysisCache: [local] };
  const imported = JSON.parse(JSON.stringify(smuggled));
  assert.equal(R.validateRun(imported.run), true);
  assert.equal((await verifyRaidBlueprint(imported.analysisCache[0])).ok, true);
  assert.equal(validateStorySession(imported), false);
  const values = new Map([[STORY_SAVE_KEY, JSON.stringify(original)], ["legacy", "keep"]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const persistence = createStorySessionPersistence(storage), before = [...values];
  assert.equal(persistence.save(imported).ok, false);
  assert.equal(persistence.recover(imported).ok, false);
  assert.deepEqual([...values], before);
  values.set(STORY_SAVE_KEY, JSON.stringify(imported));
  const corrupted = [...values];
  assert.equal(createStorySessionPersistence(storage).load().status, "corrupt");
  assert.deepEqual([...values], corrupted);
  assert.deepEqual(imported, smuggled);
});

test("URL cache lookup skips local entries even in an externally constructed invalid session", async () => {
  const local = await localCapture(), publicBlueprint = await publicCapture();
  const session = namedStory();
  session.analysisCache = [local];
  assert.equal(findStoryCapture(session, local.source.displayUrl), undefined);
  // Even a local entry with a spoofed public URL must not hide the older valid URL capture.
  const masquerading = structuredClone(local);
  masquerading.source.displayUrl = publicBlueprint.source.displayUrl;
  session.analysisCache = [publicBlueprint, masquerading];
  const before = JSON.stringify(session);
  assert.deepEqual(findStoryCapture(session, publicBlueprint.source.displayUrl + "#part"), publicBlueprint);
  assert.equal(JSON.stringify(session), before);
});

test("old fixture/public analysis receipts remain idempotent without resealing saved captures", async () => {
  assert.equal(STORY_STAGES.length, 8);
  assert.equal(STORY_STAGES.flatMap(stage => stage.encounters).length, 15);
  let session = namedStory();
  for (const blueprint of [await createFixtureRaid("archive"), await publicCapture()]) {
    const text = JSON.stringify(blueprint), before = structuredClone(session);
    const cached = await cacheStoryAnalysis(session, blueprint, "new");
    assert.equal(cached.ok, true, cached.error);
    session = cached.session;
    assert.equal(session.story.analysisEnergy, before.story.analysisEnergy - 1);
    assert.deepEqual(session.run, before.run);
    assert.equal(JSON.stringify(findStoryCapture(session, blueprint.source.displayUrl)), text);
    assert.equal(JSON.stringify(blueprint), text);
    assert.equal(validateStorySession(JSON.parse(JSON.stringify(session))), true);
    assert.deepEqual((await cacheStoryAnalysis(session, blueprint, "reanalyze")).session, session);
  }
});

test("campaign reward claims reject local capture before any transaction and retain exact pending records", async () => {
  const local = await localCapture(), factory = new IDBFactory(), name = "local-claim-boundary";
  const store = createProfileStore(factory, name), campaign = armedStory().run, lab = R.newRun("lab");
  await store.saveRun(campaign);
  await store.saveRun(lab);
  const prepared = prepareRaidChallenge(lab, local);
  assert.equal(finish(prepared.battle).winner, "player");
  await store.recordRaidVictory(prepared.blueprint, prepared.battleId);
  const reward = prepareRaidRewards(local, prepared.battleId)[0];
  const before = await databaseSnapshot(factory, name), runBefore = JSON.stringify(campaign);
  const pendingBefore = await store.listPendingRaids();
  const transaction = IDBDatabase.prototype.transaction;
  let transactionCount = 0;
  try {
    IDBDatabase.prototype.transaction = function (...args) { transactionCount++; return transaction.apply(this, args); };
    for (const options of [{}, { writeRunProfile: false }]) {
      await assert.rejects(store.claimRaidReward(campaign, reward, local, options), /実験室/);
      assert.equal(transactionCount, 0);
    }
  } finally { IDBDatabase.prototype.transaction = transaction; }
  assert.deepEqual(await databaseSnapshot(factory, name), before);
  assert.deepEqual(await store.listPendingRaids(), pendingBefore);
  assert.equal(JSON.stringify(campaign), runBefore);
  assert.equal((await store.claimRaidReward(lab, reward, local)).created, true);
  assert.equal((await store.listPendingRaids()).length, 0);
  assert.equal((await store.listTrophies()).length, 1);
});

test("permitted lab callbacks complete real cloned-run combat and claim one local cosmetic reward", async () => {
  const local = await localCapture(), run = R.newRun("lab"), before = JSON.stringify(run);
  const store = createProfileStore(new IDBFactory(), "local-lab-victory"), submissions = [];
  const controller = createRaidEncounterController({
    isLocalImportAllowed: () => true,
    onChallenge: async blueprint => {
      const prepared = prepareRaidChallenge(run, blueprint);
      assert.notEqual(prepared.snapshot, run);
      assert.notEqual(prepared.blueprint, blueprint);
      const result = finish(prepared.battle);
      assert.equal(result.winner, "player");
      await store.recordRaidVictory(prepared.blueprint, prepared.battleId);
      return { battleId: prepared.battleId, winner: result.winner };
    },
    onClaim: async (reward, blueprint) => {
      submissions.push({ reward, blueprint });
      await store.claimRaidReward(run, reward, blueprint);
      return { ok: true };
    },
  });
  assert.equal((await controller.select(local)).ok, true);
  const challenged = await controller.challenge();
  assert.equal(challenged.ok, true);
  assert.equal(controller.state.phase, "won");
  assert.equal(JSON.stringify(run), before);
  assert.equal((await store.listPendingRaids()).length, 1);
  const selected = challenged.value[0];
  assert.equal((await controller.claim(selected.componentId)).ok, true);
  assert.equal(controller.state.phase, "claimed");
  assert.equal((await controller.claim(selected.componentId)).ok, false);
  assert.equal(submissions.length, 1);
  const [trophy] = await store.listTrophies();
  assert.equal(trophy.captureId, local.captureId);
  assert.equal(trophy.item.appearanceId, selected.appearanceId);
  assert.equal(trophy.item.provenanceId, local.captureId);
  assert.deepEqual(await store.getBlueprint(local.captureId), local);
  assert.equal((await store.listPendingRaids()).length, 0);
  assert.equal(JSON.stringify(run), before);
});

test("fixture/static-public campaign claims keep their existing collection-only economy behavior", async () => {
  const store = createProfileStore(new IDBFactory(), "normal-campaign-claims"), run = armedStory().run;
  const before = JSON.stringify(run);
  for (const [i, blueprint] of [await createFixtureRaid("archive"), await publicCapture()].entries()) {
    const battleId = `existing-campaign-${i}`;
    await store.recordRaidVictory(blueprint, battleId);
    const reward = prepareRaidRewards(blueprint, battleId)[0];
    assert.equal((await store.claimRaidReward(run, reward, blueprint)).created, true);
    assert.equal((await store.claimRaidReward(run, reward, blueprint)).created, false);
    assert.equal(JSON.stringify(run), before);
    assert.equal(JSON.stringify(await store.getBlueprint(blueprint.captureId)), JSON.stringify(blueprint));
  }
  assert.equal((await store.listTrophies()).length, 2);
  assert.equal(JSON.stringify(await store.loadRun("campaign")), before);
});

for (const [label, endpoint, capabilities] of [
  ["code", "/api/raid-captures/code", { publicCodeReconstruction: true, sourceJavascript: false, supportedUrls: ["https://books.toscrape.com/"] }],
  ["static", "/api/raid-captures", { publicStaticCapture: true, networkIsolation: true, rendererJavascript: false }],
]) {
  test(`public ${label} capture transport rejects a valid sealed local response while old public snapshots still pass`, async () => {
    for (const [blueprint, expected] of [[await localCapture(), false], [await publicCapture(), true]]) {
      const calls = [];
      const result = await requestRaidCapture("https://books.toscrape.com/", undefined, async (url, options) => {
        calls.push({ url, options });
        return Response.json(url.endsWith("/capabilities") ? { schemaVersion: 1, ...capabilities } : blueprint);
      });
      assert.equal(result.ok, expected, result.error);
      if (!expected) assert.equal(result.code, "invalid-capture");
      else assert.deepEqual(result.value, blueprint);
      assert.deepEqual(calls.map(call => call.url), ["/api/raid-captures/capabilities", endpoint]);
      assert.equal(calls[0].options.body, undefined);
      assert.equal(JSON.parse(calls[1].options.body).url, "https://books.toscrape.com/");
      for (const call of calls) {
        assert.equal(call.options.credentials, "omit");
        assert.equal(call.options.redirect, "error");
        assert.equal(call.options.cache, "no-store");
      }
      assert.doesNotMatch(calls[1].options.body, /local:\/\/|Local Boundary|Night Map|sourceHash|appearanceId/);
    }
  });
}

test("online geometry strips local loot appearance/provenance without reading source metadata", async () => {
  const local = await localCapture(), reward = prepareRaidRewards(local, "local-online-boundary")[0];
  const item = createRaidLootItem(reward, "p1");
  Object.assign(item, { x: 32, y: 24, routeTo: "p2", label: "Private local text", lineage: [{ appearanceId: reward.appearanceId, provenanceId: local.captureId }] });
  for (const key of ["source", "analysis", "blueprint"]) Object.defineProperty(item, key, {
    enumerable: true, get() { throw Error("online geometry must never consume local source metadata"); },
  });
  assert.deepEqual(placementPayload([item]), [{ id: "p1", x: 32, y: 24, w: item.w, h: item.h, routeTo: "p2" }]);
  assert.doesNotMatch(JSON.stringify(placementPayload([item])), /appearance|provenance|lineage|label|local|source|analysis|capture/);
});

test("online service rejects injected local acquisition metadata without spending or publishing", async () => {
  const local = await localCapture(), dir = await mkdtemp(join(tmpdir(), "local-online-boundary-"));
  const service = new ArenaService({ filePath: join(dir, "store.json") });
  try {
    const session = service.openSession(), before = service.view(session.token);
    for (const [i, extra] of [{ blueprint: local }, { source: local.source }, { captureId: local.captureId }, { appearanceId: local.components[0].appearanceId }].entries()) {
      assert.throws(() => service.command(session.token, { commandId: `local-boundary-${i}`, expectedRevision: before.revision, kind: "publish", ...extra }), /INVALID_COMMAND/);
      assert.deepEqual(service.view(session.token), before);
    }
  } finally { service.close(); await rm(dir, { recursive: true, force: true }); }
});
