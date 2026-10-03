import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import R from "../src/run.js";
import { createRunPersistence, selectRecoveredRun } from "../src/persistence.js";
import { createProfileStore } from "../src/profile-store.js";

function applicationSave() {
  const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const declaration = source.match(/^function save\(\) \{[\s\S]*?(?=^function renderStorageNotice\(\))/m)?.[0];
  assert.ok(declaration, "execute the actual application save entry point");
  return transformSync(declaration, { loader: "ts", target: "es2022" }).code;
}
function tab(persistence, store, run, queue = Promise.resolve()) {
  const host = {
    run, storyActive: false, storySession: null, memory: {},
    saveOK: true, saveProblem: "", profileProblem: "",
    clone: structuredClone, runPersistence: persistence, profileStore: store,
    profileWrites: queue, renderStorageNotice() {},
  };
  vm.runInNewContext(applicationSave(), host);
  return host;
}

// This delays BEFORE creating A's IDB write transaction. It models its pending
// per-tab promise queue / suspended tab, not illegal reordering of already-created
// overlapping IndexedDB readwrite transactions. Both profile connections share
// one real fake-indexeddb database, and both local writes are accepted.
test("QA: an accepted save delayed in one tab cannot roll back a newer recovery mirror", async (t) => {
  const prefix = "qa-delayed-profile-", values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const factory = new IDBFactory();
  const storeA = createProfileStore(factory), storeB = createProfileStore(factory);
  const initial = R.newRun("campaign");
  initial.seed = 401; initial.shop = R.market(initial);
  values.set(prefix + "campaign", JSON.stringify(initial));
  await storeA.saveRun(initial);
  await storeB.loadRun("campaign"); // Both connections are ready before the schedule begins.
  const persistenceA = createRunPersistence(storage, prefix);
  const runA = persistenceA.load("campaign").run;
  runA.page.name = "Earlier accepted edit";
  let resumeA;
  const queued = new Promise(resolve => { resumeA = resolve; });
  const tabA = tab(persistenceA, storeA, runA, queued);
  vm.runInNewContext("save();", tabA);
  assert.equal(tabA.saveOK, true);
  assert.deepEqual(await storeB.loadRun("campaign"), initial, "A has committed only its journal while its queue is delayed");

  const persistenceB = createRunPersistence(storage, prefix);
  const runB = persistenceB.load("campaign").run;
  const offer = runB.shop.find(stock => !stock.sold && !stock.type.startsWith("plan:") && R.purchase(structuredClone(runB), stock.type).ok);
  assert.ok(offer, "newer progress is a real affordable purchase");
  assert.equal(R.purchase(runB, offer.type).ok, true);
  runB.page.name = "Newer paid inventory";
  const tabB = tab(persistenceB, storeB, runB);
  vm.runInNewContext("save();", tabB);
  await tabB.profileWrites;
  assert.equal(tabB.saveOK, true);
  assert.equal(tabB.profileProblem, "");
  assert.deepEqual(await storeB.loadRun("campaign"), runB, "B's newer mirror has really committed");
  const newestRaw = values.get(prefix + "campaign");

  resumeA();
  await tabA.profileWrites;
  assert.equal(tabA.profileProblem, "");
  const mirrored = await createProfileStore(factory).loadRun("campaign");
  assert.equal(values.get(prefix + "campaign"), newestRaw, "a late mirror does not roll back the synchronous journal");
  const journal = createRunPersistence(storage, prefix).load("campaign");
  assert.deepEqual(selectRecoveredRun(journal, mirrored), runB, "normal recovery still prefers the newest valid journal");

  // Check the specific consequence without calling it unconditional data loss:
  // missing/corrupt/unavailable journal recovery uses the secondary profile.
  for (const local of [{ status: "empty" }, { status: "corrupt", raw: "{broken", error: "damaged" }, { status: "unavailable", error: "blocked" }])
    assert.deepEqual(selectRecoveredRun(local, mirrored), mirrored);
  t.diagnostic(JSON.stringify({
    journalName: journal.run.page.name,
    mirrorName: mirrored.page.name,
    journalOwned: journal.run.owned.length,
    mirrorOwned: mirrored.owned.length,
    latestPurchasedType: offer.type,
    fallbackKeepsLatestPaidInventory: mirrored.owned.length === runB.owned.length,
  }));
  assert.deepEqual(mirrored, runB, "a late accepted snapshot must not replace the newer paid inventory in secondary recovery");
});
