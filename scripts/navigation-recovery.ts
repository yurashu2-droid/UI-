/** One real paid navigation recovery. This does not alter the baseline policy. */
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

export function simulateNavigationRecovery() {
  // Replay the existing policy's own recorded purchases, placements and loot
  // through a fresh production session. No inventory or economy is imported.
  const baseline = simulateStoryPath(101, "navigation");
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
      name: "Paid navigation 101",
    }),
  );
  const rounds: ReturnType<typeof battle>["round"][] = [];
  const transactions: Transaction[] = [];
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
    const played = battle(session, `paid-101-navigation-${i}`);
    session = played.session;
    earnings += played.summary.total;
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

  const resultId = buy("go_result")!;
  let run = clone(session.run);
  assert.equal(R.move(run, resultId, 32, 272, 260, 80), true);
  session = build(session, run);
  const beforeDeskRetry = clone(session);
  let played = battle(session, "navigation-recovery-desk");
  session = played.session;
  earnings += played.summary.total;
  assert.equal(played.summary.winner, "player");
  const afterDeskRetry = clone(session);
  session = accept(S.claimStoryReward(session, "gov_breadcrumb"));
  played.round.reward = "gov_breadcrumb";
  rounds.push(played.round);
  reconcile();

  const reviewId = buy("am_rating")!;
  run = clone(session.run);
  assert.equal(run.owned.find((p) => p.id === "p1")?.type, "ab_heading");
  assert.equal(R.move(run, "p1", 32, 384), true);
  assert.equal(R.move(run, reviewId, 512, 96, 280, 32), true);
  session = build(session, run);
  const beforeProof = clone(session);
  for (let i = 0; i < 4; i++) {
    played = battle(session, `navigation-recovery-ending-${i}`);
    session = played.session;
    earnings += played.summary.total;
    assert.equal(played.summary.winner, "player");
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
    complete: session.story.phase === "complete",
    rulesVersion: BATTLE_RULES_VERSION,
    beforeLoss,
    afterLoss,
    beforeDeskRetry,
    afterDeskRetry,
    beforeProof,
    finalSession: clone(session),
    purchases,
    rerollSpend,
    earnings,
    rounds,
    transactions,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(simulateNavigationRecovery(), null, 2));
