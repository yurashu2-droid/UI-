import test from "node:test";
import assert from "node:assert/strict";
import R from "../src/run.ts";
const session = await import("../src/story/session.ts").catch(() => ({}));
const move = (run, type, x, y) => {
  const bought = R.purchase(run, type);
  assert.equal(bought.ok, true);
  assert.equal(R.move(run, bought.item.id, x, y), true);
};
test("story session names the actual blank editor page without writing a legacy save", () => {
  assert.equal(typeof session.createStorySession, "function");
  const initial = session.createStorySession();
  assert.equal(initial.run.owned.length, 0);
  const named = session.commandStorySession(initial, {
    type: "name-page",
    name: "小さなページ",
  });
  assert.equal(named.ok, true);
  assert.equal(named.session.run.page.name, "小さなページ");
  assert.equal(session.validateStorySession(named.session), true);
  assert.equal(Object.hasOwn(named.session.story, "cash"), false);
});
test("actual story engine battle has authored opponent and settles money and progress only once", () => {
  assert.equal(typeof session.prepareStoryBattle, "function");
  let p = session.commandStorySession(session.createStorySession(), {
    type: "name-page",
    name: "test",
  }).session;
  move(p.run, "ab_heading", 32, 24);
  move(p.run, "ab_link", 32, 100);
  const prepared = session.prepareStoryBattle(p, "session-first");
  assert.equal(prepared.ok, true);
  const battle = prepared.battle;
  while (!battle.result) battle.step(0.05);
  assert.equal(battle.result.winner, "player");
  const won = session.settleStoryBattle(
    prepared.session,
    "session-first",
    battle,
  );
  assert.equal(won.ok, true);
  assert.equal(won.summary.enemy, "わたしのホームページ");
  assert.equal(won.session.run.cash, p.run.cash + won.summary.total);
  assert.equal(won.session.story.completedEncounters.length, 1);
  assert.equal(won.session.run.stage, 0);
  const duplicate = session.settleStoryBattle(
    won.session,
    "session-first",
    battle,
  );
  assert.equal(duplicate.ok, true);
  assert.deepEqual(duplicate.session, won.session);
  assert.equal(session.validateStorySession(won.session), true);
});
test("one atomic story-storage write keeps progress and build together and preserves foreign keys", () => {
  assert.equal(typeof session.createStorySessionPersistence, "function");
  const values = new Map([
    ["ui-raid-studio-v3-campaign", "legacy"],
    ["online", "remote"],
  ]);
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  const store = session.createStorySessionPersistence(storage);
  const p = session.createStorySession();
  assert.equal(store.save(p).ok, true);
  assert.deepEqual(store.load().session, p);
  assert.equal(values.get("ui-raid-studio-v3-campaign"), "legacy");
  assert.equal(values.get("online"), "remote");
  values.set(session.STORY_SAVE_KEY, "{bad");
  const corrupt = session.createStorySessionPersistence(storage);
  assert.equal(corrupt.load().status, "corrupt");
  assert.equal(corrupt.save(p).ok, false);
  assert.equal(values.get(session.STORY_SAVE_KEY), "{bad");
});

test("successful optional analysis caches the validated result and energy charge in one profile snapshot", async () => {
  assert.equal(typeof session.cacheStoryAnalysis, "function");
  const { createFixtureRaid } = await import("../src/raid/index.ts");
  const blueprint = await createFixtureRaid("archive");
  const before = session.commandStorySession(session.createStorySession(), {
    type: "name-page",
    name: "cache",
  }).session;
  const result = await session.cacheStoryAnalysis(before, blueprint, "new");
  assert.equal(result.ok, true);
  assert.equal(
    result.session.story.analysisEnergy,
    before.story.analysisEnergy - 1,
  );
  assert.equal(
    session.findStoryCapture(result.session, blueprint.source.displayUrl)
      .captureId,
    blueprint.captureId,
  );
  const again = await session.cacheStoryAnalysis(
    result.session,
    blueprint,
    "new",
  );
  assert.deepEqual(again.session, result.session);
  const invalid = structuredClone(blueprint);
  invalid.components[0].canonicalType = "unknown";
  const rejected = await session.cacheStoryAnalysis(before, invalid, "new");
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.session, before);
});

test("optional analysis snapshots the caller's profile before asynchronous hashing", async () => {
  const { createFixtureRaid } = await import("../src/raid/index.ts");
  const blueprint = await createFixtureRaid("archive");
  const before = session.commandStorySession(session.createStorySession(), {
    type: "name-page",
    name: "Original",
  }).session;
  const snapshot = structuredClone(before);
  const pending = session.cacheStoryAnalysis(before, blueprint, "new");
  before.run.cash += 50;
  before.run.page.name = "Changed";
  before.story.pageName = "Changed";
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.session.run.cash, snapshot.run.cash);
  assert.equal(result.session.run.page.name, "Original");
});

test("story inbox validation rejects inherited object keys as UI definitions", () => {
  const p = session.createStorySession();
  p.inbox = [{ id: "bad-item", type: "__proto__", reason: "loot" }];
  assert.equal(session.validateStorySession(p), false);
});

test("explicit story recovery backs up corrupt bytes before replacing only the story key", () => {
  const raw = "{broken-story";
  const values = new Map([
    [session.STORY_SAVE_KEY, raw],
    ["ui-raid-studio-v3-campaign", "legacy"],
  ]);
  const store = session.createStorySessionPersistence({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  assert.equal(typeof store.recover, "function");
  const result = store.recover(session.createStorySession());
  assert.equal(result.ok, true);
  assert.equal(values.get(session.STORY_SAVE_KEY + "-recovery"), raw);
  assert.equal(values.get("ui-raid-studio-v3-campaign"), "legacy");
});
