import test from "node:test";
import assert from "node:assert/strict";
import R from "../src/run.js";

const roundTrip = (value) => JSON.parse(JSON.stringify(value));

// Regression target: bounding every mode's stage by campaign ROUNDS rejects
// selectable lab opponents above that index and can cause save replacement.
test("QA: every selectable lab opponent survives save validation", () => {
  const enemies = R.labEnemies();
  assert.ok(enemies.length > 0);
  const invalid = [];
  for (let index = 0; index < enemies.length; index++) {
    const run = R.newRun("lab", "mixed");
    run.stage = index;
    assert.equal(R.opponent(run).index, index);
    if (!R.validateRun(roundTrip(run))) invalid.push({ index, name: enemies[index].name });
  }
  assert.deepEqual(invalid, [], "selectable lab opponents must be serializable");
});

test("QA: campaign build phase rejects an out-of-range round", () => {
  const run = R.newRun("campaign", "mixed");
  run.stage = R.ROUNDS;
  assert.equal(R.validateRun(roundTrip(run)), false);
});

function settledCampaign() {
  // Real engine and real transaction functions. This is a test-local populated
  // campaign page, not a claim that this loadout is purchasable in round one.
  const run = R.newRun("lab", "mixed");
  run.mode = "campaign";
  run.stage = 0;
  run.admin = [];
  run.capacity = 200;
  const started = R.startBattle(run);
  assert.equal(started.ok, true);
  for (let tick = 0; tick < 2400 && !started.battle.result; tick++) started.battle.step(0.05);
  assert.ok(started.battle.result, "battle must finish");
  const settled = R.settleBattle(run, started.battle);
  assert.equal(settled.ok, true);
  return { run, battle: started.battle };
}

test("QA: repeated local settlement does not pay or advance twice", () => {
  const { run, battle } = settledCampaign();
  const saved = roundTrip(run);
  const repeated = R.settleBattle(run, battle);
  assert.equal(repeated.ok, false);
  assert.deepEqual(roundTrip(run), saved);
});

test("QA: repeated local reward claim does not create a second item", () => {
  const { run } = settledCampaign();
  assert.equal(run.phase, "reward", "fixture must win before testing claim");
  assert.equal(R.validateRun(roundTrip(run)), true);
  const choice = run.pending.loot.find((type) => !type.startsWith("admin:"));
  assert.ok(choice);
  assert.equal(R.claimLoot(run, choice).ok, true);
  const saved = roundTrip(run);
  assert.equal(R.claimLoot(run, choice).ok, false);
  assert.deepEqual(roundTrip(run), saved);
  assert.equal(R.validateRun(roundTrip(run)), true);
});
