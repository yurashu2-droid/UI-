import test from "node:test";
import assert from "node:assert/strict";
import { simulateCommerceRecovery } from "../scripts/commerce-recovery.ts";
import { simulateStoryPath } from "../scripts/story-progression-benchmark.ts";
import C from "../src/document.ts";
import E from "../src/engine.ts";
import R from "../src/run.ts";
import * as S from "../src/story/session.ts";
import { STORY_STAGES } from "../src/story/content.ts";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.ts";

const accept = (result) => {
  assert.equal(result.ok, true, result.error);
  assert.equal(S.validateStorySession(result.session), true);
  const session = JSON.parse(JSON.stringify(result.session));
  assert.equal(S.validateStorySession(session), true);
  return session;
};
function move(session, id, x, y) {
  const run = structuredClone(session.run);
  assert.equal(R.move(run, id, x, y), true);
  return accept(S.updateStoryBuild(session, run));
}
function retry(session, id) {
  const prepared = S.prepareStoryBattle(session, id);
  assert.equal(prepared.ok, true, prepared.error);
  assert.equal(prepared.battle.combatVersion, BATTLE_RULES_VERSION);
  session = accept(prepared);
  for (let i = 0; i < 5000 && !prepared.battle.result; i++)
    prepared.battle.step(0.05);
  assert.ok(prepared.battle.result);
  const settled = S.settleStoryBattle(session, id, prepared.battle);
  return {
    session: accept(settled),
    summary: settled.summary,
    enemyHp: prepared.battle.enemy.hp,
    rawIncome: prepared.battle.player.income,
    metrics: prepared.battle.metrics.player,
    charges: prepared.battle.player.parts
      .filter((p) => p.charge)
      .map((p) => [p.id, p.charge]),
  };
}
const board = (run) =>
  run.owned.filter(C.placed).map(({ type, x, y, w, h }) => [type, x, y, w, h]);

test("commerce seed 101 retains its first loss and completes the canonical ending", () => {
  const route = simulateCommerceRecovery();
  assert.equal(route.complete, true);
  assert.equal(route.rulesVersion, BATTLE_RULES_VERSION);
  assert.equal(route.rounds.length, 16);
  assert.deepEqual(
    route.rounds
      .filter((r) => r.winner !== "player")
      .map((r) => [r.encounter, r.seconds]),
    [["permission-desk", 20.65]],
  );
  assert.ok(Math.abs(route.rounds[10].enemyHp - 65.2) < 1e-8);
  const story = route.finalSession.story;
  assert.equal(story.phase, "complete");
  assert.equal(story.completedEncounters.length, 15);
  assert.deepEqual(
    story.records,
    STORY_STAGES.map((s) => s.record.id),
  );
  assert.equal(story.restoredVisits, 1);
  assert.ok(route.finalSession.endingLinkId);
  assert.equal(route.finalSession.run.cash, 226);
});

test("the commerce witness replays the paid prefix without replacing the genuine loss settlement", () => {
  const route = simulateCommerceRecovery();
  const baseline = simulateStoryPath(101, "commerce");
  assert.equal(baseline.complete, false);
  const keys = [
    "encounter",
    "winner",
    "seconds",
    "hp",
    "cashAtBattle",
    "cashAfter",
    "lifeAfter",
    "load",
    "capacity",
    "board",
    "reward",
  ];
  for (let i = 0; i < 11; i++)
    for (const key of keys)
      assert.deepEqual(
        route.rounds[i][key],
        baseline.rounds[i][key],
        `prefix ${i} ${key}`,
      );
  assert.deepEqual(
    route.transactions,
    baseline.transactions.slice(0, route.transactions.length),
  );
  assert.equal(route.beforeLoss.run.cash, 110);
  assert.equal(route.beforeLoss.run.lives, 3);
  assert.equal(route.afterLoss.run.cash, 126);
  assert.equal(route.afterLoss.run.lives, 2);
  assert.deepEqual(route.afterLoss.run.owned, route.beforeLoss.run.owned);
  assert.equal(route.afterLoss.run.owned.length, 18);
  assert.deepEqual(route.rounds[10].fusions, []);
  assert.equal(route.purchases, 55);
  assert.equal(route.rerollSpend, 17);
  assert.equal(route.earnings, 287);
  assert.equal(
    route.finalSession.run.cash,
    11 - route.purchases - route.rerollSpend + route.earnings,
  );
  let cash = 0;
  for (const entry of route.ledger) {
    cash += entry.delta;
    assert.equal(cash, entry.cash, `${entry.action}: ${entry.encounter}`);
  }
  assert.equal(cash, route.finalSession.run.cash);
  assert.deepEqual(
    route.ledger
      .filter((entry) => entry.action === "battle")
      .map((entry) => entry.delta),
    route.rounds.map((round) => round.total),
  );
});

test("five legal owned-item moves preserve resources, modifiers and whitespace", () => {
  const route = simulateCommerceRecovery();
  assert.deepEqual(
    route.moves.map(({ id, x, y }) => [id, x, y]),
    [
      ["p9", null, null],
      ["p1", 592, 16],
      ["p9", 544, 80],
      ["p11", 32, 288],
      ["p14", 320, 96],
    ],
  );
  let replay = route.afterLoss;
  for (const action of route.moves) {
    assert.equal(
      replay.run.owned.find((p) => p.id === action.id).type,
      action.type,
    );
    replay = move(replay, action.id, action.x, action.y);
  }
  assert.deepEqual(replay, route.beforeRetry);
  const before = route.afterLoss.run,
    after = route.beforeRetry.run;
  assert.deepEqual({ ...after, owned: before.owned }, before);
  assert.deepEqual(
    after.owned.map(({ x, y, ...p }) => p),
    before.owned.map(({ x, y, ...p }) => p),
  );
  assert.deepEqual(after.admin, []);
  const original = E.analyze(before.owned),
    repaired = E.analyze(after.owned);
  assert.deepEqual(repaired.mods, original.mods);
  assert.equal(repaired.freeRatio, original.freeRatio);
  assert.equal(repaired.freeRatio, 0.629656862745098);
  assert.equal(repaired.load, 33);
  assert.equal(R.capacity(after), 35);
  assert.deepEqual(
    repaired.relations
      .filter((r) => r.kind === "conversion")
      .map((r) => [r.from, r.to]),
    [
      ["p9", "p18"],
      ["p14", "p18"],
    ],
  );
  assert.equal(
    original.relations.some(
      (r) => r.from === "p11" && r.to === "p24" && r.kind === "income",
    ),
    false,
  );
  assert.equal(
    repaired.relations.some(
      (r) => r.from === "p11" && r.to === "p24" && r.kind === "income",
    ),
    true,
  );
});

test("the repaired board remains intact while later rewards stay in inventory", () => {
  const route = simulateCommerceRecovery();
  const rounds = route.rounds.slice(11);
  assert.deepEqual(
    rounds.map((r) => r.hp),
    [60, 29, 322, 283, 163],
  );
  assert.deepEqual(
    rounds.map((r) => r.seconds),
    [18.4, 20.4, 12.5, 17.05, 21.25],
  );
  const loot = [
    "gov_breadcrumb",
    "gov_breadcrumb",
    "gov_form",
    "gov_form",
    "go_search",
  ];
  assert.deepEqual(
    rounds.map((r) => r.reward),
    loot,
  );
  for (const round of rounds) {
    assert.deepEqual(round.board, board(route.beforeRetry.run));
    assert.equal(round.load, 33);
    assert.equal(round.capacity, 35);
  }
  for (const item of route.beforeRetry.run.owned)
    assert.deepEqual(
      route.finalSession.run.owned.find((p) => p.id === item.id),
      item,
    );
  assert.deepEqual(
    route.finalSession.run.owned.filter((p) => !C.placed(p)).map((p) => p.type),
    loot,
  );
  assert.equal(R.capacity(route.finalSession.run), 35);
  assert.deepEqual(route.finalSession.run.admin, []);
});

test("conversion spends charge, with cumulative income and paid-run cash independently preserved", () => {
  const route = simulateCommerceRecovery();
  assert.equal(route.rounds[10].rawIncome, 41);
  assert.equal(route.rounds[10].conversion.routed, 0);
  assert.equal(route.rounds[10].conversion.spent, 0);
  const full = retry(route.beforeRetry, "commerce-full-conversion-control");
  assert.equal(full.summary.winner, "player");
  assert.equal(full.rawIncome, 42);
  assert.equal(full.metrics.routed, 23);
  assert.equal(full.metrics.spent, 21);
  assert.equal(full.metrics.unconverted, 19);
  assert.deepEqual(full.charges, [["p18", 2]]);
  assert.equal(full.summary.income, 10);
  assert.equal(full.summary.total, 20);
  assert.equal(full.session.run.cash, route.beforeRetry.run.cash + 20);
  assert.deepEqual(route.rounds[11].conversion, {
    routed: 23,
    spent: 21,
    unconverted: 19,
    charges: [["p18", 2]],
  });
});

test("matched source disconnects lose despite equal income, modifiers, load and area", () => {
  const route = simulateCommerceRecovery();
  const unchanged = retry(route.afterLoss, "commerce-control-unchanged");
  assert.equal(unchanged.summary.winner, "enemy");
  assert.ok(Math.abs(unchanged.enemyHp - 65.2) < 1e-8);
  assert.equal(unchanged.session.run.lives, 1);
  const base = E.analyze(route.beforeRetry.run.owned);
  const mailDisconnected = move(route.beforeRetry, "p14", 320, 144);
  const newsletterDisconnected = move(route.beforeRetry, "p9", 592, 488);
  for (const session of [mailDisconnected, newsletterDisconnected]) {
    const info = E.analyze(session.run.owned);
    assert.deepEqual(info.mods, base.mods);
    assert.equal(info.load, base.load);
    assert.equal(info.freeRatio, base.freeRatio);
    assert.equal(
      info.relations.some(
        (r) => r.from === "p11" && r.to === "p24" && r.kind === "income",
      ),
      true,
    );
    assert.equal(session.run.cash, route.beforeRetry.run.cash);
  }
  const mail = retry(mailDisconnected, "commerce-control-mail-desk");
  assert.equal(mail.rawIncome, 42);
  assert.equal(mail.metrics.routed, 15);
  assert.equal(mail.metrics.spent, 15);
  assert.equal(mail.summary.winner, "player");
  const next = accept(
    S.claimStoryReward(mail.session, mail.session.reward.choices[0]),
  );
  const proof = retry(next, "commerce-control-mail-proof");
  assert.equal(proof.rawIncome, 42);
  assert.equal(proof.summary.winner, "enemy");
  assert.ok(Math.abs(proof.enemyHp - 21) < 1e-8);
  const newsletter = retry(
    newsletterDisconnected,
    "commerce-control-newsletter-desk",
  );
  assert.equal(newsletter.rawIncome, 42);
  assert.equal(newsletter.metrics.routed, 8);
  assert.equal(newsletter.metrics.spent, 6);
  assert.equal(newsletter.summary.winner, "enemy");
  assert.ok(Math.abs(newsletter.enemyHp - 27) < 1e-8);
});
