import test from "node:test";
import assert from "node:assert/strict";
import * as raid from "../src/raid/index.ts";

test("local appearance registration verifies snapshot identity before making skins available", async () => {
  const blueprint = await raid.createFixtureRaid("archive");
  assert.equal(typeof raid.registerRaidBlueprint, "function");
  assert.equal((await raid.registerRaidBlueprint(blueprint)).ok, true);
  const c = blueprint.components[0];
  assert.deepEqual(raid.getRaidAppearance(c.appearanceId), c.appearance);
  const tampered = structuredClone(blueprint);
  tampered.components[0].appearance.background = "#ff0000";
  assert.equal((await raid.registerRaidBlueprint(tampered)).ok, false);
  assert.deepEqual(raid.getRaidAppearance(c.appearanceId), c.appearance);
});

test("one immutable encounter grants only the clicked defeated component after persisted success", async () => {
  const b = await raid.createFixtureRaid("commerce"),
    submitted = [];
  let calls = 0,
    resolveBattle;
  const controller = raid.createRaidEncounterController({
    onChallenge: async (blueprint) => {
      calls++;
      assert.equal(blueprint.captureId, b.captureId);
      return await new Promise((r) => {
        resolveBattle = r;
      });
    },
    onClaim: async (reward, blueprint) => {
      submitted.push({ reward, blueprint });
      return { ok: true };
    },
  });
  assert.equal((await controller.select(b)).ok, true);
  const started = controller.challenge();
  assert.equal((await controller.challenge()).ok, false);
  assert.equal(
    (await controller.select(await raid.createFixtureRaid("archive"))).ok,
    false,
  );
  resolveBattle({ battleId: "battle-100", winner: "player" });
  assert.equal((await started).ok, true);
  assert.equal(calls, 1);
  assert.equal((await controller.claim("component-04")).ok, true);
  assert.equal((await controller.claim("component-04")).ok, false);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].reward.componentId, "component-04");
  assert.equal(submitted[0].reward.appearanceId, b.components[4].appearanceId);
  assert.equal(controller.state.phase, "claimed");
});

test("storage failure keeps exact pending reward claim retryable without replaying battle", async () => {
  const b = await raid.createFixtureRaid("archive");
  let tries = 0;
  const ids = [];
  const controller = raid.createRaidEncounterController({
    onChallenge: async () => ({ battleId: "battle-persist", winner: "player" }),
    onClaim: async (reward) => {
      ids.push(reward.rewardId);
      return ++tries === 1 ? { ok: false, error: "quota" } : { ok: true };
    },
  });
  await controller.select(b);
  await controller.challenge();
  assert.equal((await controller.claim("component-00")).ok, false);
  assert.equal(controller.state.phase, "won");
  assert.equal(
    (await controller.select(await raid.createFixtureRaid("commerce"))).ok,
    false,
  );
  assert.equal((await controller.claim("component-00")).ok, true);
  assert.deepEqual(ids, [ids[0], ids[0]]);
});

test("defeat cannot claim or manufacture a source UI reward", async () => {
  const controller = raid.createRaidEncounterController({
    onChallenge: async () => ({ battleId: "battle-loss", winner: "enemy" }),
    onClaim: async () => {
      assert.fail("must not persist a lost battle reward");
    },
  });
  await controller.select(await raid.createFixtureRaid("archive"));
  await controller.challenge();
  assert.equal(controller.state.phase, "lost");
  assert.equal((await controller.claim("component-00")).ok, false);
});

test("persisted victory restores the same reward IDs after reload without replaying combat", async () => {
  const b = await raid.createFixtureRaid("archive"),
    claims = [];
  const restored = raid.createRaidEncounterController({
    onChallenge: async () => {
      assert.fail("must not replay a persisted victory");
    },
    onClaim: async (r) => {
      claims.push(r);
      return { ok: true };
    },
  });
  assert.equal(typeof restored.restore, "function");
  assert.equal(
    (
      await restored.restore({
        blueprint: b,
        battleId: "saved-victory",
        winner: "player",
      })
    ).ok,
    true,
  );
  assert.equal(restored.state.phase, "won");
  assert.equal((await restored.claim("component-02")).ok, true);
  assert.equal(claims[0].rewardId, "raid:saved-victory:component-02");
});

test("closing a controller ignores late battle completion while persisted victory remains integration owned", async () => {
  let done;
  const controller = raid.createRaidEncounterController({
    onChallenge: () =>
      new Promise((r) => {
        done = r;
      }),
    onClaim: async () => ({ ok: true }),
  });
  await controller.select(await raid.createFixtureRaid("archive"));
  const pending = controller.challenge();
  controller.dispose();
  done({ battleId: "late", winner: "player" });
  const result = await pending;
  assert.equal(result.ok, false);
  assert.notEqual(controller.state.phase, "won");
});

test("malformed saved encounters fail closed without replacing the selected page", async () => {
  const controller = raid.createRaidEncounterController({
    onChallenge: async () => ({ battleId: "unused", winner: "player" }),
    onClaim: async () => {
      assert.fail("malformed resume must never grant");
    },
  });
  const b = await raid.createFixtureRaid("archive");
  await controller.select(b);
  for (const bad of [
    null,
    undefined,
    {},
    { blueprint: b, winner: "player" },
    { blueprint: b, winner: "enemy", battleId: "saved" },
    { blueprint: b, winner: "player", battleId: {} },
  ]) {
    assert.equal((await controller.restore(bad)).ok, false);
    assert.equal(controller.state.phase, "ready");
    assert.equal(controller.state.blueprint.captureId, b.captureId);
  }
});

test("discard persists before clearing and blocks duplicate claim/discard while saving", async () => {
  const b = await raid.createFixtureRaid("archive");
  let resolveDiscard,
    attempts = 0;
  const controller = raid.createRaidEncounterController({
    onChallenge: async () => ({ battleId: "discard-once", winner: "player" }),
    onClaim: async () => {
      assert.fail("must not claim during discard");
    },
    onDiscard: () => {
      attempts++;
      return new Promise((r) => {
        resolveDiscard = r;
      });
    },
  });
  await controller.select(b);
  await controller.challenge();
  const first = controller.discard();
  assert.equal((await controller.discard()).ok, false);
  assert.equal((await controller.claim("component-00")).ok, false);
  resolveDiscard({ ok: false, error: "quota" });
  assert.equal((await first).ok, false);
  assert.equal(controller.state.phase, "won");
  assert.equal(controller.state.rewards[0].battleId, "discard-once");
  const retry = controller.discard();
  resolveDiscard({ ok: true });
  assert.equal((await retry).ok, true);
  assert.equal(controller.state.phase, "ready");
  assert.deepEqual(controller.state.rewards, []);
  assert.equal(attempts, 2);
});

test("overflow is a persisted pending award and keeps exact appearance on retry or restoration", async () => {
  const b = await raid.createFixtureRaid("commerce"),
    awards = [];
  const controller = raid.createRaidEncounterController({
    onChallenge: async () => ({ battleId: "full-inventory", winner: "player" }),
    onClaim: async (reward) => {
      awards.push(reward);
      return { ok: true, message: "容量不足のため受け取り箱に保存しました。" };
    },
  });
  await controller.restore({
    blueprint: b,
    battleId: "full-inventory",
    winner: "player",
  });
  assert.equal((await controller.claim("component-04")).ok, true);
  assert.equal(controller.state.phase, "claimed");
  assert.match(controller.state.message, /受け取り箱/);
  assert.equal(awards[0].appearanceId, b.components[4].appearanceId);
  assert.equal((await controller.claim("component-04")).ok, false);
});
