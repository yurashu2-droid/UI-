import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import R from "../src/run.js";
import V from "../src/components.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { reconstructStaticCode } from "../server/site-ingest/code.js";
import * as raid from "../src/raid/index.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

const { createProfileStore } = await import(
  process.env.UI_RAID_COLLECTION_PROFILE_SOURCE || "../src/profile-store.js"
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = (name) => readFile(new URL(`../fixtures/raid/${name}`, import.meta.url), "utf8");
const [html, css, appSource] = await Promise.all([
  fixture("public-source/books.html"),
  fixture("public-source/books.css"),
  readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
]);

// Real engine, parser, persistence, archive, registry and renderer, with only
// browser DOM and download/file-read boundaries adapted. This does not verify
// browser pixels, a file picker or assistive technology. The local archive is
// unsigned integrity data, not authentication of real-world victories.
// Omitting captures, claim markers or hydration must break this player journey.
function withDocument(t) {
  const prior = new Map(["document", "Element"].map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const document = {
    createElement(tag) { return new ElementAdapter(this, tag); },
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.document = document;
  globalThis.Element = ElementAdapter;
  t.after(() => {
    V.setAppearanceRenderer(null);
    for (const [key, descriptor] of prior)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  });
  return document;
}

// Run the unchanged production Run JSON entry points; do not invent an archive
// import path for ordinary run files. Callbacks stand in for unrelated app UI.
function ordinaryRunFiles(run) {
  const extract = (name) => {
    const fn = appSource.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"))?.[0];
    assert.ok(fn, `production ${name} entry point`);
    return fn;
  };
  const state = {
    run, storyActive: false, storySession: null, pendingStorySettlement: null,
    battle: null, preview: false, view: "self", R, Blob, JSON,
    clone: structuredClone, exports: [], messages: [], saves: [],
    importInput: { value: "chosen-run.json" },
    editor: { reset() {} }, labBattleController: { reset() {} },
    render() {}, setTimeout() {},
  };
  state.save = () => state.saves.push(structuredClone(state.run));
  state.toast = (text) => state.messages.push(text);
  state.$ = () => state.importInput;
  state.URL = {
    createObjectURL(blob) { state.exports.push({ blob }); return "blob:local-test"; },
    revokeObjectURL() {},
  };
  state.document = { createElement(tag) {
    assert.equal(tag, "a");
    return { click() { state.exports.at(-1).filename = this.download; } };
  } };
  vm.createContext(state);
  vm.runInContext(transformSync(`${extract("exportFile")}\nlet importRequestId = 0;\n${extract("importFile")}`,
    { loader: "ts", target: "es2022" }).code, state);
  return state;
}

function victory(run, blueprint) {
  const prepared = prepareRaidChallenge(run, blueprint);
  for (let tick = 0; tick < 1800 && !prepared.battle.result; tick++) prepared.battle.step(0.05);
  assert.equal(prepared.battle.result?.winner, "player", "record only a real engine victory");
  return prepared;
}
const paintedPrimitives = (node) => node.children.map((child) => ({
  text: child.textContent,
  style: Object.fromEntries(Object.entries(child.style).filter(([, value]) => typeof value !== "function")),
}));

test("Books victory collection survives a separate database and restores the appearance omitted by ordinary Run JSON", async (t) => {
  const document = withDocument(t);
  assert.equal(hash(html), "9fdd63da34161ebd13408d7a85105f83ec3c9f351c5d77cd0aa578790e121c1e");
  assert.equal(hash(css), "d497d4a0d52686ccd30f5941b02867075870372cdfe37adbcb0be74fdeed94cf");
  const books = await reconstructStaticCode({
    requestedUrl: "https://books.toscrape.com/", html, sourceHash: hash(html),
    bytes: Buffer.byteLength(html), capturedAt: "2026-10-03T03:20:00.000Z",
    extraction: { title: "Books", candidates: [] },
    stylesheets: [{ css, sourceHash: hash(css), url: "https://books.toscrape.com/static/oscar/css/styles.css" }],
  });
  const purchase = books.components.find((part) => part.componentId === "component-05");
  assert.equal(books.captureId, "capture_b51a0697f50e53fd012abd53d1225079e61099a4f71884658397e90dd5624fd5");
  assert.equal(purchase.appearanceId, "appearance_2bc659d6b8bd15a3e0638bd69134a491b9f1ff163e99d812898bb05da979e825");
  const originalBooks = structuredClone(books), sourceRun = R.newRun("lab"), beforeBattle = structuredClone(sourceRun);
  const won = victory(sourceRun, books);
  assert.deepEqual(won.battle.result, { winner: "player", time: 10.5, income: 32 });
  assert.deepEqual(sourceRun, beforeBattle);
  const sourceFactory = new IDBFactory(), source = createProfileStore(sourceFactory);
  await source.recordRaidVictory(won.blueprint, won.battleId);
  const sourceReload = createProfileStore(sourceFactory), [pendingSource] = await sourceReload.listPendingRaids();
  assert.deepEqual(pendingSource.blueprint, books);
  const reward = raid.prepareRaidRewards(pendingSource.blueprint, pendingSource.battleId)
    .find((entry) => entry.componentId === purchase.componentId);
  const claim = await sourceReload.claimRaidReward(sourceRun, reward, pendingSource.blueprint);
  assert.equal(claim.created, true);
  assert.equal(claim.trophy.rewardId, `raid:${won.battleId}:component-05`);
  assert.equal(claim.trophy.item.appearanceId, purchase.appearanceId);
  assert.equal(claim.trophy.item.provenanceId, books.captureId);
  assert.deepEqual(sourceRun, beforeBattle, "claim does not change run economy or inject a run item");
  assert.deepEqual(await sourceReload.listPendingRaids(), []);

  // Same ordinary lab collection-to-inventory operations as collectionPanel.
  const placed = R.nextItem(sourceRun, claim.trophy.item.type, null, null, claim.trophy.item.w, claim.trophy.item.h);
  Object.assign(placed, { appearanceId: claim.trophy.item.appearanceId, provenanceId: claim.trophy.item.provenanceId });
  sourceRun.owned.push(placed);
  assert.equal(R.validateRun(sourceRun), true);
  const ordinarySource = ordinaryRunFiles(sourceRun);
  ordinarySource.exportFile();
  const runText = await ordinarySource.exports[0].blob.text();
  assert.equal(ordinarySource.exports[0].filename, "ui-raid-page.json");
  assert.equal(runText, JSON.stringify(sourceRun, null, 2), "ordinary Run JSON format is unchanged");
  assert.equal(JSON.parse(runText).version, 3);
  assert.ok(!runText.includes('"captures"') && !runText.includes('"primitives"'));
  assert.ok(!runText.includes("Add to basket"), "a run carries IDs, not the source artwork");

  const sourceClosedOver = createProfileStore(sourceFactory);
  assert.equal(typeof sourceClosedOver.exportCollectionBackup, "function", "collection export must close the cross-database loss gap");
  const backup = await sourceClosedOver.exportCollectionBackup();
  assert.deepEqual([backup.trophyCount, backup.captureCount], [1, 1]);
  assert.equal(backup.byteLength, Buffer.byteLength(backup.text));
  const archive = JSON.parse(backup.text);
  assert.deepEqual(archive.trophies, [claim.trophy]);
  assert.deepEqual(archive.captures, [books]);

  const targetFactory = new IDBFactory(), target = createProfileStore(targetFactory);
  assert.deepEqual(await target.listTrophies(), []);
  assert.deepEqual(await target.listPendingRaids(), []);
  assert.equal(await target.loadRun("lab"), undefined);
  assert.equal(await target.getBlueprint(books.captureId), undefined);
  const ordinaryTarget = ordinaryRunFiles(R.newRun("lab"));
  await ordinaryTarget.importFile({ size: Buffer.byteLength(runText), text: async () => runText });
  assert.deepEqual(ordinaryTarget.run, sourceRun, "production import preserves every ordinary run value");
  assert.equal(ordinaryTarget.importInput.value, "");
  assert.equal(ordinaryTarget.saves.length, 2);
  const importedItem = ordinaryTarget.run.owned.find((item) => item.id === placed.id);
  assert.deepEqual(importedItem, placed);
  await target.saveRun(ordinaryTarget.run);
  V.setAppearanceRenderer(raid.applyRaidAppearance);
  assert.equal(raid.getRaidAppearance(importedItem.appearanceId), undefined);
  const beforeRestore = V.create(importedItem);
  assert.equal(beforeRestore.querySelector(".raid-skin"), null);
  assert.equal(beforeRestore.querySelector(".native-button").getAttribute("aria-label"), null);
  assert.equal(beforeRestore.querySelector(".native-button").textContent, "カートに入れる");
  assert.deepEqual(await target.listTrophies(), [], "Run import alone cannot transfer the collection");

  // A separate genuine target encounter remains pending throughout the merge.
  const other = await raid.createFixtureRaid("archive"), otherWon = victory(R.newRun("lab"), other);
  assert.notEqual(other.captureId, books.captureId);
  await target.recordRaidVictory(other, otherWon.battleId);
  const pendingBefore = await target.listPendingRaids(), profileBefore = await target.loadRun("lab");
  const inspection = await target.inspectCollectionBackup(backup.text);
  assert.deepEqual([inspection.addCount, inspection.unchangedCount], [1, 0]);
  assert.deepEqual(inspection.conflicts, []);
  assert.deepEqual(await target.listTrophies(), [], "inspection is not restore approval");
  assert.equal(await target.getBlueprint(books.captureId), undefined);
  assert.deepEqual(await target.listPendingRaids(), pendingBefore);
  assert.deepEqual(await target.restoreCollectionBackup(inspection.candidate, { isCurrent: () => true }), { added: 1, unchanged: 0 });

  const reopened = createProfileStore(targetFactory);
  assert.deepEqual(await reopened.listTrophies(), [claim.trophy]);
  assert.deepEqual(await reopened.getBlueprint(books.captureId), originalBooks);
  assert.deepEqual(await reopened.loadRun("lab"), profileBefore);
  assert.deepEqual(await reopened.listPendingRaids(), pendingBefore);
  // Follow the app's startup/collection hydration from restored, verified storage.
  for (const trophy of await reopened.listTrophies())
    assert.equal((await raid.registerRaidBlueprint(await reopened.getBlueprint(trophy.captureId))).ok, true);
  assert.deepEqual(raid.getRaidAppearance(purchase.appearanceId), purchase.appearance);
  const afterRestore = V.create(importedItem), skin = afterRestore.querySelector(".raid-skin");
  assert.ok(skin);
  assert.equal(skin.getAttribute("aria-hidden"), "true");
  const originalAppearance = document.createElement("div");
  raid.renderRaidAppearance(originalAppearance, purchase.appearance);
  assert.deepEqual(paintedPrimitives(skin), paintedPrimitives(originalAppearance));
  assert.ok(skin.textContent.includes("Add to basket"));
  assert.equal(afterRestore.querySelector(".native-button").getAttribute("aria-label"), "Add to basket");
  assert.equal(afterRestore.querySelector(".native-button").dataset.ui, "buy");
  assert.deepEqual(importedItem, placed, "hydration does not rewrite IDs or native item data");
  assert.equal(JSON.stringify(ordinaryTarget.run, null, 2), runText);

  const repeated = await reopened.inspectCollectionBackup(backup.text);
  assert.deepEqual([repeated.addCount, repeated.unchangedCount], [0, 1]);
  assert.deepEqual(await reopened.restoreCollectionBackup(repeated.candidate), { added: 0, unchanged: 1 });
  const finalStore = createProfileStore(targetFactory);
  const repeatedClaim = await finalStore.claimRaidReward(ordinaryTarget.run, reward, books);
  assert.equal(repeatedClaim.created, false);
  assert.deepEqual(repeatedClaim.trophy, claim.trophy);
  const alternative = raid.prepareRaidRewards(books, won.battleId).find((entry) => entry.componentId !== purchase.componentId);
  await assert.rejects(() => finalStore.claimRaidReward(ordinaryTarget.run, alternative, books), /選択済み/);
  assert.deepEqual(await finalStore.listTrophies(), [claim.trophy], "restore never grants a second loot choice");
  assert.deepEqual(await finalStore.listPendingRaids(), pendingBefore);
  assert.deepEqual(await finalStore.loadRun("lab"), profileBefore);
  assert.deepEqual(await finalStore.getBlueprint(other.captureId), other);
  assert.deepEqual(await sourceClosedOver.listTrophies(), [claim.trophy]);
  assert.deepEqual(books, originalBooks);
});
