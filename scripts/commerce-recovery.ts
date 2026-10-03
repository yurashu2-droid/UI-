/** Seed 101 commerce: retain its real loss, then connect owned income to 1-Click.
 * A bounded witness, not a policy change, optimizer or population win rate.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import C from "../src/document.js";
import R from "../src/run.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import * as S from "../src/story/session.js";
import { currentStoryEncounter } from "../src/story/state.js";
import { ARCHIVE_COORDINATES } from "../src/story/content.js";
import { simulateStoryPath } from "./story-progression-benchmark.js";
import type { Run } from "../src/types.js";

type BoardRow = [string, number, number, number, number];
interface ReferenceRound {
  encounter: string;
  cashAtBattle: number;
  winner: string;
  seconds: number;
  hp: number;
  reward: string | null;
  board: BoardRow[];
}
interface Transaction {
  type: string;
  encounter: string;
  item?: string;
  cost: number;
  cash: number;
}
const clone = <T>(value: T): T => structuredClone(value);
function accept(result: {
  ok: boolean;
  session: S.StorySession;
  error?: string;
}) {
  assert.equal(result.ok, true, result.error ?? "story operation must succeed");
  assert.equal(S.validateStorySession(result.session), true);
  const session = JSON.parse(JSON.stringify(result.session)) as S.StorySession;
  assert.equal(S.validateStorySession(session), true);
  return session;
}
function build(session: S.StorySession, run: Run) {
  assert.ok(
    run.owned.filter(C.placed).every((p) => C.canPlace(run.owned, p, p.x, p.y)),
  );
  return accept(S.updateStoryBuild(session, run));
}
function battle(session: S.StorySession, matchId: string) {
  const prepared = S.prepareStoryBattle(session, matchId);
  assert.equal(
    prepared.ok,
    true,
    !prepared.ok ? prepared.error : "battle must prepare",
  );
  assert.equal(prepared.battle.combatVersion, BATTLE_RULES_VERSION);
  const before = clone(session);
  session = accept(prepared);
  for (let i = 0; i < 5000 && !prepared.battle.result; i++)
    prepared.battle.step(0.05);
  assert.ok(prepared.battle.result);
  const settled = S.settleStoryBattle(session, matchId, prepared.battle);
  session = accept(settled);
  assert.ok("summary" in settled && settled.summary);
  const summary = settled.summary;
  return {
    session,
    before,
    summary,
    round: {
      encounter: prepared.encounter.id,
      winner: summary.winner,
      seconds: Math.round(summary.time * 100) / 100,
      hp: summary.hp,
      enemyHp: prepared.battle.enemy.hp,
      cashAtBattle: before.run.cash,
      cashAfter: session.run.cash,
      lifeAfter: session.run.lives,
      load: C.analyze(before.run.owned).load,
      capacity: R.capacity(before.run),
      board: before.run.owned
        .filter(C.placed)
        .map((p) => [p.type, p.x, p.y, p.w, p.h]),
      rawIncome: prepared.battle.player.income,
      income: summary.income,
      total: summary.total,
      conversion: {
        routed: prepared.battle.metrics.player.routed,
        spent: prepared.battle.metrics.player.spent,
        unconverted: prepared.battle.metrics.player.unconverted,
        charges: prepared.battle.player.parts
          .filter((p) => p.charge > 0)
          .map((p): [string, number] => [p.id, p.charge]),
      },
      fusions:
        "fusions" in settled ? settled.fusions.map((f) => f.item.type) : [],
      reward: null as string | null,
    },
  };
}
function progress(session: S.StorySession) {
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

export function simulateCommerceRecovery() {
  // Replay the existing policy's own recorded purchases, placements and loot
  // through a fresh production session. No inventory or economy is imported.
  const baseline = simulateStoryPath(101, "commerce");
  const reference = baseline.rounds as unknown as ReferenceRound[];
  const referenceTransactions =
    baseline.transactions as unknown as Transaction[];
  const firstLoss = reference.findIndex((round) => round.winner !== "player");
  assert.equal(firstLoss, 10);
  assert.equal(reference[firstLoss].encounter, "permission-desk");
  let session = S.createStorySession();
  session.run.seed = 101;
  session = accept(
    S.commandStorySession(session, {
      type: "name-page",
      name: "Paid commerce 101",
    }),
  );
  const rounds: ReturnType<typeof battle>["round"][] = [];
  const transactions: Transaction[] = [];
  const ledger: {
    action: string;
    encounter: string | null;
    delta: number;
    cash: number;
  }[] = [{ action: "initial", encounter: null, delta: 11, cash: 11 }];
  let purchases = 0,
    rerollSpend = 0,
    earnings = 0;
  let beforeLoss = clone(session);
  const reconcile = () =>
    assert.equal(session.run.cash, 11 - purchases - rerollSpend + earnings);
  const buy = (type: string) => {
    const run = clone(session.run),
      before = run.cash;
    const purchased = R.purchase(run, type);
    assert.equal(purchased.ok, true);
    session = build(session, run);
    const cost = before - run.cash;
    purchases += cost;
    ledger.push({
      action: "buy",
      encounter: currentStoryEncounter(session.story)!.id,
      delta: -cost,
      cash: session.run.cash,
    });
    transactions.push({
      type: "buy",
      encounter: currentStoryEncounter(session.story)!.id,
      item: type,
      cost,
      cash: run.cash,
    });
    reconcile();
    return "item" in purchased ? purchased.item.id : null;
  };
  for (let i = 0; i <= firstLoss; i++) {
    const expected = reference[i];
    if (
      session.story.stageId === "delivery" &&
      !session.story.fusionWitnessed
    ) {
      const run = clone(session.run);
      for (const p of run.owned)
        assert.equal(R.move(run, p.id, null, null), true);
      const mail = run.owned.find(
        (p) => session.protectedKitIds.includes(p.id) && p.type === "ab_mail",
      )!;
      const coupon = run.owned.find(
        (p) => session.protectedKitIds.includes(p.id) && p.type === "am_coupon",
      )!;
      assert.ok(mail && coupon);
      assert.equal(R.move(run, mail.id, 32, 32), true);
      assert.equal(R.move(run, coupon.id, 256, 32), true);
      session = accept(S.rehearseStoryFusion(build(session, run)));
    }
    while (session.run.cash !== expected.cashAtBattle) {
      const transaction = referenceTransactions[transactions.length];
      assert.ok(transaction);
      assert.equal(transaction.encounter, expected.encounter);
      assert.ok(session.run.cash > expected.cashAtBattle);
      if (transaction.type === "buy") buy(transaction.item!);
      else {
        assert.equal(transaction.type, "reroll");
        session = accept(S.rerollStoryMarket(session));
        rerollSpend += R.REROLL;
        ledger.push({
          action: "reroll",
          encounter: expected.encounter,
          delta: -R.REROLL,
          cash: session.run.cash,
        });
        transactions.push(clone(transaction));
        reconcile();
      }
      assert.equal(session.run.cash, transaction.cash);
    }
    const run = clone(session.run),
      available = [...run.owned];
    for (const item of run.owned)
      assert.equal(R.move(run, item.id, null, null), true);
    for (const [type, x, y, w, h] of expected.board) {
      const index = available.findIndex((p) => p.type === type);
      assert.ok(index >= 0);
      const [item] = available.splice(index, 1);
      assert.equal(R.move(run, item.id, x, y, w, h), true);
    }
    session = build(session, run);
    if (i === firstLoss) beforeLoss = clone(session);
    const played = battle(session, `paid-101-commerce-${i}`);
    session = played.session;
    earnings += played.summary.total;
    ledger.push({
      action: "battle",
      encounter: expected.encounter,
      delta: played.summary.total,
      cash: session.run.cash,
    });
    assert.equal(played.round.winner, expected.winner);
    assert.equal(played.round.seconds, expected.seconds);
    assert.equal(played.round.hp, expected.hp);
    assert.deepEqual(played.round.board, expected.board);
    if (session.reward)
      session = accept(S.claimStoryReward(session, expected.reward));
    played.round.reward = expected.reward;
    rounds.push(played.round);
    session = progress(session);
    reconcile();
  }
  assert.deepEqual(
    transactions,
    referenceTransactions.slice(0, transactions.length),
  );
  const afterLoss = clone(session);

  // Every move is separately accepted and reloaded, as in the real editor.
  // Stashing Newsletter first opens the heading destination; sizes never change.
  const moves = [
    { id: "p9", type: "am_newsletter", x: null, y: null },
    { id: "p1", type: "ab_heading", x: 592, y: 16 },
    { id: "p9", type: "am_newsletter", x: 544, y: 80 },
    { id: "p11", type: "am_wish", x: 32, y: 288 },
    { id: "p14", type: "ab_mail", x: 320, y: 96 },
  ];
  for (const move of moves) {
    const run = clone(session.run);
    assert.equal(run.owned.find((p) => p.id === move.id)?.type, move.type);
    assert.equal(R.move(run, move.id, move.x, move.y), true);
    session = build(session, run);
    reconcile();
  }
  const beforeRetry = clone(session);
  let afterDeskRetry = clone(session);
  // Keep all new loot in inventory: no later purchases, rerolls or layout edits.
  for (let i = 0; i < 5; i++) {
    const played = battle(session, `commerce-recovery-ending-${i}`);
    session = played.session;
    earnings += played.summary.total;
    ledger.push({
      action: "battle",
      encounter: played.round.encounter,
      delta: played.summary.total,
      cash: session.run.cash,
    });
    assert.equal(played.summary.winner, "player");
    if (i === 0) afterDeskRetry = clone(session);
    if (session.reward) {
      const reward = session.reward.choices[0];
      session = accept(S.claimStoryReward(session, reward));
      played.round.reward = reward;
    }
    rounds.push(played.round);
    session = progress(session);
    reconcile();
  }
  assert.equal(session.story.phase, "archive");
  for (const command of [
    {
      type: "open-archive",
      url: ARCHIVE_COORDINATES.url,
      date: ARCHIVE_COORDINATES.date,
    },
    { type: "restore-archive" },
    { type: "place-ending-link" },
    { type: "visit-restored-page" },
  ] as const)
    session = accept(S.commandStorySession(session, command));
  reconcile();
  return {
    note: "One fixed paid commerce continuation, not a new baseline rate. Moving Wish also links it to a counter: original loss raw income is 41; the repair and matched source-disconnect controls earn 42. Income charge and run cash are separate.",
    complete: session.story.phase === "complete",
    rulesVersion: BATTLE_RULES_VERSION,
    seed: 101,
    policy: "commerce" as const,
    beforeLoss,
    afterLoss,
    moves,
    beforeRetry,
    afterDeskRetry,
    finalSession: clone(session),
    purchases,
    rerollSpend,
    earnings,
    rounds,
    transactions,
    ledger,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(simulateCommerceRecovery(), null, 2));
