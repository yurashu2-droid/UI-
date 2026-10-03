import test from "node:test";
import assert from "node:assert/strict";
import R from "../src/run.js";
import { createRunPersistence } from "../src/persistence.js";

const prefix = "qa-journal-";
function storedCampaign() {
  const run = R.newRun("campaign"), values = new Map();
  values.set(prefix + "campaign", JSON.stringify(run));
  const storage = { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value) };
  return { values, storage };
}

test("QA: stale legacy editor must not erase a real purchase saved by another tab", () => {
  const { values, storage } = storedCampaign();
  const current = createRunPersistence(storage, prefix), stale = createRunPersistence(storage, prefix);
  const a = current.load("campaign").run, b = stale.load("campaign").run;
  const offer = a.shop.find(stock => !stock.sold && !stock.type.startsWith("plan:"));
  assert.ok(offer);
  assert.equal(R.purchase(a, offer.type).ok, true);
  assert.equal(current.save(a).ok, true);
  const earned = values.get(prefix + "campaign");
  b.page.name = "An older tab's cosmetic edit";
  const result = stale.save(b);
  assert.equal(result.ok, false, "stale editor must reload or explicitly recover before replacing newer progress");
  assert.equal(values.get(prefix + "campaign"), earned, "paid inventory, cash and sold stock must survive");
  const refreshed = stale.load("campaign").run;
  assert.deepEqual(refreshed.owned, a.owned);
  refreshed.page.name = "Edit after reload";
  assert.equal(stale.save(refreshed).ok, true);
  assert.deepEqual(JSON.parse(values.get(prefix + "campaign")).owned, a.owned);
});

test("QA: a previously loaded legacy store must preserve newly corrupt save bytes", () => {
  const { values, storage } = storedCampaign(), store = createRunPersistence(storage, prefix);
  const old = store.load("campaign").run;
  const damaged = '{"version":999,"recoverable":"precious original bytes"';
  values.set(prefix + "campaign", damaged);
  old.page.name = "An already open editor";
  assert.equal(store.save(old).ok, false, "initially valid cached status must not authorize overwriting changed data");
  assert.equal(values.get(prefix + "campaign"), damaged);
});
