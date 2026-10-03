import test from "node:test";
import assert from "node:assert/strict";
import { simulateCommerceRecovery } from "../scripts/commerce-recovery.ts";
import { simulateStoryPath } from "../scripts/story-progression-benchmark.ts";
import C from "../src/document.ts";
import E from "../src/engine.ts";
import R from "../src/run.ts";
import * as S from "../src/story/session.ts";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.ts";
import { ARCHIVE_COORDINATES, STORY_STAGES } from "../src/story/content.ts";

const clone = (value) => structuredClone(value);
function accept(result) {
  assert.equal(result.ok, true, result.error);
  assert.equal(S.validateStorySession(result.session), true);
  const session = JSON.parse(JSON.stringify(result.session));
  assert.equal(S.validateStorySession(session), true);
  return session;
}
function build(session, run) {
  assert.ok(
    run.owned.filter(C.placed).every((p) => C.canPlace(run.owned, p, p.x, p.y)),
  );
  return accept(S.updateStoryBuild(session, run));
}
function play(session, matchId) {
  const prepared = S.prepareStoryBattle(session, matchId);
  assert.equal(prepared.ok, true, prepared.error);
  assert.equal(prepared.battle.combatVersion, BATTLE_RULES_VERSION);
  const started = accept(prepared),
    events = [];
  for (let i = 0; i < 5000 && !prepared.battle.result; i++)
    events.push(...prepared.battle.step(0.05));
  assert.ok(prepared.battle.result);
  const result = S.settleStoryBattle(started, matchId, prepared.battle);
  return {
    session: accept(result),
    summary: result.summary,
    fusions: result.fusions,
    battle: prepared.battle,
    events,
  };
}
function progress(session) {
  if (session.story.phase === "record") {
    session = accept(
      S.commandStorySession(session, { type: "collect-record" }),
    );
    if (session.story.phase !== "archive")
      session = accept(
        S.commandStorySession(session, { type: "advance-stage" }),
      );
  }
  return session;
}

// Reconstruct the original paid path independently. Only the shop RNG seed is
// fixed; every item, payout, fusion, capacity purchase and reward is transacted.
function paidPrefix() {
  const baseline = simulateStoryPath(101, "commerce");
  assert.equal(baseline.complete, false);
  let session = S.createStorySession();
  session.run.seed = 101;
  session = accept(
    S.commandStorySession(session, {
      type: "name-page",
      name: "Paid commerce 101",
    }),
  );
  let cursor = 0,
    purchases = 0,
    rerollSpend = 0,
    earnings = 0;
  const fusions = [];
  const reconcile = () =>
    assert.equal(session.run.cash, 11 - purchases - rerollSpend + earnings);
  for (let index = 0; index < baseline.rounds.length; index++) {
    const expected = baseline.rounds[index];
    if (
      session.story.stageId === "delivery" &&
      !session.story.fusionWitnessed
    ) {
      const run = clone(session.run);
      for (const p of run.owned)
        assert.equal(R.move(run, p.id, null, null), true);
      const mail = run.owned.find(
        (p) => p.type === "ab_mail" && session.protectedKitIds.includes(p.id),
      );
      const coupon = run.owned.find(
        (p) => p.type === "am_coupon" && session.protectedKitIds.includes(p.id),
      );
      assert.ok(mail && coupon);
      assert.equal(R.move(run, mail.id, 32, 32), true);
      assert.equal(R.move(run, coupon.id, 256, 32), true);
      const rehearsed = S.rehearseStoryFusion(build(session, run));
      session = accept(rehearsed);
      fusions.push(...rehearsed.fusions);
    }
    while (session.run.cash > expected.cashAtBattle) {
      const transaction = baseline.transactions[cursor++],
        cash = session.run.cash;
      assert.ok(transaction);
      assert.equal(transaction.encounter, expected.encounter);
      if (transaction.type === "reroll") {
        session = accept(S.rerollStoryMarket(session));
        assert.equal(cash - session.run.cash, R.REROLL);
        rerollSpend += R.REROLL;
      } else {
        assert.equal(transaction.type, "buy");
        const run = clone(session.run);
        assert.ok(run.shop.some((q) => q.type === transaction.item && !q.sold));
        assert.equal(R.purchase(run, transaction.item).ok, true);
        session = build(session, run);
        purchases += cash - session.run.cash;
      }
      assert.equal(cash - session.run.cash, transaction.cost);
      assert.equal(session.run.cash, transaction.cash);
      reconcile();
    }
    assert.equal(session.run.cash, expected.cashAtBattle);
    const run = clone(session.run),
      remaining = [...run.owned];
    for (const p of run.owned)
      assert.equal(R.move(run, p.id, null, null), true);
    for (const [type, x, y, w, h] of expected.board) {
      const index = remaining.findIndex((p) => p.type === type);
      assert.notEqual(
        index,
        -1,
        "the expected board uses an actually owned part",
      );
      const [item] = remaining.splice(index, 1);
      assert.equal(R.move(run, item.id, x, y, w, h), true);
    }
    session = build(session, run);
    const before = clone(session),
      played = play(session, `paid-101-commerce-${index}`);
    session = played.session;
    earnings += played.summary.total;
    fusions.push(...played.fusions);
    assert.equal(played.summary.winner, expected.winner);
    assert.equal(Math.round(played.summary.time * 100) / 100, expected.seconds);
    assert.equal(played.summary.hp, expected.hp);
    assert.equal(session.run.cash, expected.cashAfter);
    assert.equal(C.analyze(before.run.owned).load, expected.load);
    assert.equal(R.capacity(before.run), expected.capacity);
    reconcile();
    if (played.summary.winner !== "player") {
      assert.equal(index, 10);
      assert.equal(expected.encounter, "permission-desk");
      assert.deepEqual(played.fusions, []);
      assert.ok(fusions.some((f) => f.item.type === "am_newsletter"));
      assert.ok(
        fusions.some(
          (f) =>
            f.item.id === "p18" &&
            f.item.type === "am_oneclick" &&
            f.from.includes("am_buy") &&
            f.from.includes("am_cart"),
        ),
      );
      return {
        beforeLoss: before,
        afterLoss: session,
        purchases,
        rerollSpend,
        earnings,
      };
    }
    session = accept(S.claimStoryReward(session, expected.reward));
    session = progress(session);
    reconcile();
  }
  assert.fail(
    "the unchanged seed 101 commerce path must reach its real first loss",
  );
}
function moveOnly(session, id, x, y) {
  const run = clone(session.run),
    expected = clone(session);
  Object.assign(
    expected.run.owned.find((p) => p.id === id),
    { x, y },
  );
  assert.equal(R.move(run, id, x, y), true);
  const updated = build(session, run);
  assert.deepEqual(updated, expected, "only the requested coordinates change");
  return updated;
}
const recoveryMoves = [
  ["p9", null, null],
  ["p1", 592, 16],
  ["p9", 544, 80],
  ["p11", 32, 288],
  ["p14", 320, 96],
];

test("QA: commerce recovery reproduces the actual paid prefix and exact coordinate-only repair", () => {
  const route = simulateCommerceRecovery(),
    prefix = paidPrefix();
  assert.deepEqual(route.beforeLoss, prefix.beforeLoss);
  assert.deepEqual(route.afterLoss, prefix.afterLoss);
  assert.deepEqual(prefix.afterLoss.run.owned, prefix.beforeLoss.run.owned);
  assert.equal(prefix.afterLoss.run.cash, 126);
  assert.equal(prefix.afterLoss.run.lives, 2);
  assert.equal(prefix.afterLoss.run.owned.length, 18);
  assert.deepEqual(
    [prefix.purchases, prefix.rerollSpend, prefix.earnings],
    [55, 17, 187],
  );
  let repaired = prefix.afterLoss;
  for (const move of recoveryMoves) repaired = moveOnly(repaired, ...move);
  assert.deepEqual(repaired, route.beforeRetry);
  assert.deepEqual(repaired.run.admin, []);
  assert.equal(R.capacity(repaired.run), 35);
  assert.equal(R.playerHp(repaired.run), 380);
  const original = E.analyze(prefix.afterLoss.run.owned),
    actual = E.analyze(repaired.run.owned);
  assert.equal(actual.load, 33);
  assert.equal(actual.freeRatio, original.freeRatio);
  assert.deepEqual(actual.mods, original.mods);
  assert.deepEqual(actual.groups, original.groups);
  assert.deepEqual(actual.navigation, original.navigation);
  for (const part of repaired.run.owned)
    assert.equal(
      E.naturalPeriod(part, actual, 35),
      E.naturalPeriod(
        prefix.afterLoss.run.owned.find((p) => p.id === part.id),
        original,
        35,
      ),
    );
  assert.ok(
    actual.relations.some(
      (r) => r.from === "p11" && r.to === "p24" && r.kind === "income",
    ),
  );
  assert.ok(
    !original.relations.some(
      (r) => r.from === "p11" && r.to === "p24" && r.kind === "income",
    ),
  );
});

test("QA: conversion events and equal-income disconnect controls distinguish a retry from the full route", () => {
  const route = simulateCommerceRecovery();
  const unchanged = play(route.afterLoss, "qa-commerce-unchanged");
  assert.equal(unchanged.summary.winner, "enemy");
  assert.equal(unchanged.summary.rawIncome, 41);
  assert.equal(unchanged.battle.metrics.player.routed, 0);
  const full = play(route.beforeRetry, "qa-commerce-both");
  assert.equal(full.summary.winner, "player");
  assert.equal(full.summary.hp, 60);
  assert.equal(
    full.summary.rawIncome,
    42,
    "Wish also gains a counter relationship; baseline income is not identical",
  );
  const events = full.events.filter(
    (e) => e.kind === "conversion" && e.side === "player",
  );
  const routed = events.filter((e) => e.action === "route"),
    spent = events.filter((e) => e.action === "spend");
  assert.deepEqual([...new Set(routed.map((e) => e.id))].sort(), ["p14", "p9"]);
  assert.ok(events.every((e) => e.to === "p18"));
  assert.equal(
    routed.reduce((sum, e) => sum + e.value, 0),
    23,
  );
  assert.equal(spent.length, 7);
  assert.ok(spent.every((e) => e.id === "p18" && e.value === 3));
  assert.equal(full.battle.player.parts.find((p) => p.id === "p18").charge, 2);
  assert.equal(full.battle.metrics.player.unconverted, 19);
  assert.equal(
    full.battle.player.income,
    42,
    "spending charge does not subtract cumulative income",
  );
  assert.equal(full.session.run.cash - route.beforeRetry.run.cash, 20);

  const analysis = E.analyze(route.beforeRetry.run.owned);
  for (const [name, moves, enemyHp, routed, spent] of [
    ["mail-disconnected", [["p14", 320, 144]], 0, 15, 15],
    ["newsletter-disconnected", [["p9", 592, 488]], 27, 8, 6],
    [
      "both-disconnected",
      [
        ["p14", 320, 144],
        ["p9", 592, 488],
      ],
      64,
      0,
      0,
    ],
  ]) {
    let session = route.beforeRetry;
    for (const move of moves) session = moveOnly(session, ...move);
    const info = E.analyze(session.run.owned);
    assert.deepEqual(info.mods, analysis.mods);
    assert.deepEqual(info.groups, analysis.groups);
    assert.equal(info.freeRatio, analysis.freeRatio);
    assert.equal(info.load, analysis.load);
    const played = play(session, `qa-commerce-${name}`);
    assert.equal(played.summary.rawIncome, 42);
    assert.equal(played.battle.metrics.player.routed, routed);
    assert.equal(played.battle.metrics.player.spent, spent);
    assert.ok(Math.abs(played.battle.enemy.hp - enemyHp) < 1e-8);
    if (name === "mail-disconnected") {
      assert.equal(played.summary.winner, "player");
      assert.equal(played.summary.hp, 29);
      session = accept(
        S.claimStoryReward(played.session, played.session.reward.choices[0]),
      );
      const proof = play(session, "qa-commerce-newsletter-only-proof");
      assert.equal(proof.summary.winner, "enemy");
      assert.ok(Math.abs(proof.battle.enemy.hp - 21) < 1e-8);
    } else assert.equal(played.summary.winner, "enemy");
  }
});

test("QA: the independently transacted commerce continuation reaches all canonical victories and the first restored visit", () => {
  const route = simulateCommerceRecovery(),
    prefix = paidPrefix();
  let session = prefix.afterLoss,
    earnings = prefix.earnings;
  for (const move of recoveryMoves) session = moveOnly(session, ...move);
  const board = session.run.owned.filter(C.placed),
    hp = [];
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(session.run.owned.filter(C.placed), board);
    assert.deepEqual(session.run.admin, []);
    assert.equal(R.capacity(session.run), 35);
    const played = play(session, `qa-commerce-ending-${i}`);
    assert.equal(played.summary.winner, "player");
    assert.deepEqual(played.fusions, []);
    hp.push(played.summary.hp);
    session = played.session;
    earnings += played.summary.total;
    assert.equal(
      session.run.cash,
      11 - prefix.purchases - prefix.rerollSpend + earnings,
    );
    if (session.reward)
      session = accept(S.claimStoryReward(session, session.reward.choices[0]));
    session = progress(session);
  }
  assert.deepEqual(hp, [60, 29, 322, 283, 163]);
  assert.equal(session.story.phase, "archive");
  for (const command of [
    { type: "open-archive", ...ARCHIVE_COORDINATES },
    { type: "restore-archive" },
    { type: "place-ending-link" },
    { type: "visit-restored-page" },
  ])
    session = accept(S.commandStorySession(session, command));
  assert.equal(session.story.phase, "complete");
  assert.equal(session.story.completedEncounters.length, 15);
  assert.deepEqual(
    session.story.records,
    STORY_STAGES.map((stage) => stage.record.id),
  );
  assert.equal(session.story.restored, true);
  assert.equal(session.story.endingLinkPlaced, true);
  assert.equal(session.story.restoredVisits, 1);
  assert.equal(session.run.cash, 226);
  assert.deepEqual(
    [route.purchases, route.rerollSpend, route.earnings],
    [55, 17, 287],
  );
  const comparable = clone(session);
  comparable.story.resolvedMatches = route.finalSession.story.resolvedMatches;
  assert.deepEqual(
    comparable,
    route.finalSession,
    "only the independent match IDs differ",
  );
});
