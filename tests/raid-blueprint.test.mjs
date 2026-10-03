import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.ts";
import C from "../src/document.ts";

import * as raid from "../src/raid/index.ts";

test("a controlled page becomes a reproducible canonical opponent with distinct acquired appearances", async () => {
  const first = await raid.createFixtureRaid("archive");
  assert.ok(first, "fixture reconstruction must exist");
  const again = await raid.createFixtureRaid("archive");
  assert.equal(first.captureId, again.captureId);
  assert.equal(first.source.kind, "fixture");
  assert.equal(first.viewport.width, 960);
  assert.equal(first.viewport.height, 680);
  assert.ok(first.components.length >= 6 && first.components.length <= 12);
  const board = raid.createRaidEnemy(first);
  assert.equal(board.length, first.components.length);
  for (const item of board) {
    assert.ok(Object.hasOwn(D.PARTS, item.type));
    assert.ok(
      C.canPlace(
        board.filter((other) => other.id !== item.id),
        item,
        item.x,
        item.y,
      ),
    );
    assert.match(item.appearanceId, /^appearance_[a-f0-9]{64}$/);
  }
  assert.ok(new Set(board.map((item) => item.appearanceId)).size >= 3);
  assert.ok(board.some((item) => D.PARTS[item.type].kind === "attack"));
  assert.equal(C.analyze(board).load <= D.LOAD_LIMIT, true);
});

test("blueprint validation rejects executable fields, unknown types and invalid geometry", async () => {
  const blueprint = await raid.createFixtureRaid("archive");
  assert.equal(raid.validateRaidBlueprint(blueprint).ok, true);
  for (const mutate of [
    (b) => {
      b.html = '<img onerror="alert(1)">';
    },
    (b) => {
      b.components[0].canonicalType = "__proto__";
    },
    (b) => {
      b.components[0].combatRect.x = NaN;
    },
    (b) => {
      b.components[0].combatRect.w = 9999;
    },
    (b) => {
      b.components[0].appearance.html = "<script>1</script>";
    },
    (b) => {
      b.components[0].appearance.background = "url(https://bad.invalid)";
    },
    (b) => {
      b.components[0].appearance.primitives[0].href = "javascript:alert(1)";
    },
    (b) => {
      b.components.push(
        ...Array.from({ length: 13 }, () => structuredClone(b.components[0])),
      );
    },
    (b) => {
      b.components[1].componentId = b.components[0].componentId;
    },
  ]) {
    const bad = structuredClone(blueprint);
    mutate(bad);
    assert.equal(raid.validateRaidBlueprint(bad).ok, false);
  }
});

test("received blueprint hashes are verified, not trusted as opaque strings", async () => {
  const blueprint = await raid.createFixtureRaid("archive");
  assert.equal((await raid.verifyRaidBlueprint(blueprint)).ok, true);
  const tampered = structuredClone(blueprint);
  tampered.components[0].appearance.primitives[0].text = "different trophy";
  assert.equal((await raid.verifyRaidBlueprint(tampered)).ok, false);
});

test("rewards name exact frozen defeated components and preserve original appearance", async () => {
  const blueprint = await raid.createFixtureRaid("archive");
  const rewards = raid.prepareRaidRewards(blueprint, "battle-0001");
  assert.equal(rewards.length, blueprint.components.length);
  assert.deepEqual(rewards, raid.prepareRaidRewards(blueprint, "battle-0001"));
  assert.notEqual(
    rewards[0].rewardId,
    raid.prepareRaidRewards(blueprint, "battle-0002")[0].rewardId,
  );
  for (const reward of rewards) {
    const component = blueprint.components.find(
      (c) => c.componentId === reward.componentId,
    );
    assert.equal(reward.canonicalType, component.canonicalType);
    assert.equal(reward.appearanceId, component.appearanceId);
    const item = raid.createRaidLootItem(reward, "p900");
    assert.equal(item.type, component.canonicalType);
    assert.equal(item.appearanceId, component.appearanceId);
    assert.equal(item.provenanceId, blueprint.captureId);
    assert.equal(item.x, null);
    assert.equal(item.y, null);
    assert.equal(
      item.label,
      "",
      "external source labels never become combat item labels",
    );
  }
});

test("verification freezes caller data before asynchronous hashing", async () => {
  const original = await raid.createFixtureRaid("archive");
  const pending = raid.verifyRaidBlueprint(original);
  original.source.name = "changed after submission";
  const checked = await pending;
  assert.equal(checked.ok, true);
  assert.notEqual(checked.value.source.name, original.source.name);
});
