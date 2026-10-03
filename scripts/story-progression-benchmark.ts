/** Real, paid story routes. Seed fixes only the shop RNG; no economy/stat grants. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import R from "../src/run.js";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import * as S from "../src/story/session.js";
import { currentStoryEncounter } from "../src/story/state.js";
import { ARCHIVE_COORDINATES } from "../src/story/content.js";
import type { Item, Run } from "../src/types.js";

export type StoryPolicy = "navigation" | "commerce" | "mixed";
export interface StoryPathOptions {
  layout?: "packed" | "modules";
  navigationLimit?: number;
  retireTutorialFusionBeforeFinal?: boolean;
  excludedTypes?: string[];
}
const clone = <T>(value: T): T => structuredClone(value);
const accepted = (result: S.StorySessionResult): S.StorySession => {
  assert.equal(
    result.ok,
    true,
    "error" in result ? result.error : "story operation must succeed",
  );
  assert.equal(S.validateStorySession(result.session), true);
  // Every accepted step survives a full JSON round trip, like reloading a save.
  const session = JSON.parse(JSON.stringify(result.session)) as S.StorySession;
  assert.equal(S.validateStorySession(session), true);
  return session;
};
const navigation = (type: string) => ["ab_link", "ab_nav"].includes(type);

function partScore(
  run: Run,
  type: string,
  policy: StoryPolicy,
  options: StoryPathOptions,
) {
  if (options.excludedTypes?.includes(type)) return -1000;
  const p = D.PARTS[type];
  if (!p) return -1000;
  const count = (types: string[]) =>
    run.owned.filter((p) => types.includes(p.type)).length;
  const attacks = run.owned.filter(
    (p) => D.PARTS[p.type].kind === "attack",
  ).length;
  if (navigation(type)) {
    const n = count(["ab_link", "ab_nav"]);
    return n >= (policy === "navigation" ? (options.navigationLimit ?? 6) : 3)
      ? -100
      : 30 - n;
  }
  if (type === "ab_heading") return count([type]) ? -100 : 12;
  if (type === "ab_guestbook")
    return count([type, "ab_blog", "am_wish"]) ? -100 : 18;
  if (type === "ab_hr") return count([type]) ? -100 : 12;
  if (policy === "navigation") return -100;
  if (type === "am_buy")
    return count([type, "am_oneclick"]) >= 2
      ? -100
      : policy === "commerce"
        ? 40
        : 27;
  if (type === "am_cart")
    return count([type]) || !count(["am_buy"]) ? -100 : 42;
  if (["am_coupon", "am_deal", "ab_mail"].includes(type))
    return count(["am_coupon", "am_deal", "ab_mail", "am_newsletter"]) >= 2
      ? -100
      : 18;
  if (type === "am_quantity")
    return count([type]) || !count(["am_buy", "am_oneclick"]) ? -100 : 20;
  if (type === "am_wish")
    return count([type, "ab_guestbook", "ab_blog"]) >= 2 ? -100 : 19;
  if (type === "ab_counter")
    return count([type]) || !count(["ab_guestbook"]) ? -100 : 20;
  if (policy === "commerce") return -100;
  if (
    ["go_result", "go_search", "gov_pdf", "gov_submit", "yt_play"].includes(
      type,
    )
  )
    return count([type]) || attacks >= 9 ? -100 : 24;
  if (type === "go_suggest")
    return count([type, "go_instant"]) || !count(["go_search"]) ? -100 : 30;
  if (type === "yt_progress")
    return count([type, "yt_embed"]) || !count(["yt_play"]) ? -100 : 30;
  if (type === "gov_check")
    return count([type]) || !count(["gov_submit"]) ? -100 : 30;
  return -100;
}

/** Legal compact modules; geometry comes only from real resize/move transactions. */
function arrange(run: Run, options: StoryPathOptions) {
  for (const item of run.owned)
    assert.equal(R.move(run, item.id, null, null), true);
  const priority = (p: Item) =>
    navigation(p.type)
      ? 0
      : [
            "am_buy",
            "am_cart",
            "am_oneclick",
            "am_quantity",
            "am_newsletter",
            "am_coupon",
            "am_deal",
          ].includes(p.type)
        ? 1
        : 2;
  const ordered = [...run.owned].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      Number(a.id.slice(1)) - Number(b.id.slice(1)),
  );
  if (options.layout === "modules") {
    // Deliberate economy/cart neighborhood rather than accidental packer adjacency.
    const groups = [
      { types: ["am_newsletter", "am_coupon", "am_deal"], y: 112, height: 60 },
      { types: ["am_cart"], y: 180, height: 100 },
      {
        types: ["am_buy", "am_oneclick", "am_quantity", "am_prime"],
        y: 288,
        height: 44,
      },
    ];
    for (const group of groups) {
      let x = 32;
      for (const item of ordered.filter((p) => group.types.includes(p.type))) {
        const d = D.PARTS[item.type],
          w = Math.max(d.minW, Math.min(d.w, 280));
        if (R.move(run, item.id, x, group.y, w, Math.max(d.h, group.height)))
          x += w;
      }
    }
  }
  for (const item of ordered) {
    if (C.placed(item)) continue;
    const d = D.PARTS[item.type];
    // Ordinary 2-column-friendly widths, never below the canonical minimum.
    const w = Math.max(d.minW, Math.min(d.w, 280)),
      h = d.h;
    item.w = w;
    item.h = h;
    const spot = C.findSpace(run.owned, item);
    if (spot) assert.equal(R.move(run, item.id, spot.x, spot.y, w, h), true);
  }
  assert.ok(
    run.owned.filter(C.placed).every((p) => C.canPlace(run.owned, p, p.x, p.y)),
  );
}

export function simulateStoryPath(
  seed: number,
  policy: StoryPolicy,
  options: StoryPathOptions = {},
) {
  let session = S.createStorySession();
  session.run.seed = seed;
  session = accepted(
    S.commandStorySession(session, {
      type: "name-page",
      name: `Paid ${policy} ${seed}`,
    }),
  );
  const rounds: Record<string, unknown>[] = [],
    transactions: Record<string, unknown>[] = [];
  let purchases = 0,
    rerollSpend = 0,
    serverSpend = 0,
    earnings = 0,
    fusionAt: string | null = null;
  const buy = (type: string) => {
    const run = clone(session.run),
      before = run.cash;
    const result = R.purchase(run, type);
    if (!result.ok) return false;
    session = accepted(S.updateStoryBuild(session, run));
    const cost = before - run.cash;
    purchases += cost;
    if (type.startsWith("plan:")) serverSpend += cost;
    transactions.push({
      type: "buy",
      encounter: currentStoryEncounter(session.story)?.id,
      item: type,
      cost,
      cash: run.cash,
    });
    return true;
  };
  // Fixed guaranteed opening shop; all three together cost exactly the initial $11.
  for (const type of ["ab_heading", "ab_link", "ab_nav"])
    assert.equal(buy(type), true);
  let blocked: string | null = null;
  for (
    let attempt = 0;
    attempt < 40 && session.run.phase !== "gameover";
    attempt++
  ) {
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
      session = accepted(S.updateStoryBuild(session, run));
      session = accepted(S.rehearseStoryFusion(session));
      assert.equal(session.story.fusionWitnessed, true);
      fusionAt = currentStoryEncounter(session.story)?.id ?? null;
    }
    const encounter = currentStoryEncounter(session.story);
    if (!encounter) break;
    const cashBefore = session.run.cash;
    if (attempt > 0) {
      let rolls = 0;
      for (let choices = 0; choices < 6; choices++) {
        const offer = session.run.shop
          .filter(
            (q) =>
              !q.sold &&
              D.PARTS[q.type] &&
              D.PARTS[q.type].price <= session.run.cash,
          )
          .sort(
            (a, b) =>
              partScore(session.run, b.type, policy, options) -
                partScore(session.run, a.type, policy, options) ||
              a.type.localeCompare(b.type),
          )[0];
        if (offer && partScore(session.run, offer.type, policy, options) > 0) {
          buy(offer.type);
          continue;
        }
        if (rolls >= 2 || session.run.cash < 7) break;
        session = accepted(S.rerollStoryMarket(session));
        rerollSpend += R.REROLL;
        rolls++;
        transactions.push({
          type: "reroll",
          encounter: encounter.id,
          cost: R.REROLL,
          cash: session.run.cash,
        });
      }
    }
    let run = clone(session.run);
    arrange(run, options);
    session = accepted(S.updateStoryBuild(session, run));
    const plan = session.run.shop.find(
      (q) => !q.sold && q.type.startsWith("plan:"),
    );
    if (plan && C.analyze(session.run.owned).load > R.capacity(session.run))
      buy(plan.type);
    if (
      options.retireTutorialFusionBeforeFinal &&
      session.story.stageId === "last-browser"
    ) {
      const build = clone(session.run);
      for (const item of build.owned.filter((p) => p.type === "am_newsletter"))
        assert.equal(R.move(build, item.id, null, null), true);
      session = accepted(S.updateStoryBuild(session, build));
    }
    const snapshot = clone(session.run),
      matchId = `paid-${seed}-${policy}-${attempt}`;
    const prepared = S.prepareStoryBattle(session, matchId);
    if (!prepared.ok) {
      blocked = prepared.error;
      break;
    }
    session = prepared.session;
    for (let i = 0; i < 5000 && !prepared.battle.result; i++)
      prepared.battle.step(0.05);
    assert.ok(prepared.battle.result, "battle must end within 250s");
    const settled = S.settleStoryBattle(session, matchId, prepared.battle);
    session = accepted(settled);
    assert.ok("summary" in settled && settled.summary);
    earnings += settled.summary.total;
    let reward: string | null = null;
    if (session.reward) {
      reward =
        [...session.reward.choices].sort(
          (a, b) =>
            partScore(session.run, b, policy, options) -
              partScore(session.run, a, policy, options) || a.localeCompare(b),
        )[0] ?? null;
      session = accepted(S.claimStoryReward(session, reward));
    }
    rounds.push({
      encounter: encounter.id,
      stage: snapshot.stage + 1,
      winner: settled.summary.winner,
      seconds: Math.round(settled.summary.time * 100) / 100,
      hp: settled.summary.hp,
      maxHp: settled.summary.maxHp,
      cashBefore,
      cashAtBattle: snapshot.cash,
      cashAfter: session.run.cash,
      lifeAfter: session.run.lives,
      load: C.analyze(snapshot.owned).load,
      capacity: R.capacity(snapshot),
      income: settled.summary.income,
      reward,
      board: snapshot.owned
        .filter(C.placed)
        .map((p) => [p.type, p.x, p.y, p.w, p.h]),
      held: snapshot.owned.filter((p) => !C.placed(p)).map((p) => p.type),
      fusions:
        "fusions" in settled ? settled.fusions.map((f) => f.item.type) : [],
    });
    assert.equal(
      session.run.cash,
      11 - purchases - rerollSpend + earnings,
      "all cash must be accounted for by paid transactions and real results",
    );
    if (session.story.phase === "record") {
      session = accepted(
        S.commandStorySession(session, { type: "collect-record" }),
      );
      if (session.story.phase !== "archive")
        session = accepted(
          S.commandStorySession(session, { type: "advance-stage" }),
        );
    }
  }
  if (session.story.phase === "archive") {
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
      session = accepted(S.commandStorySession(session, command));
  }
  return {
    rulesVersion: BATTLE_RULES_VERSION,
    seed,
    policy,
    options,
    complete: session.story.phase === "complete",
    stage: session.story.stageId,
    wins: session.story.completedEncounters.length,
    losses: rounds.filter((r) => r.winner !== "player").length,
    blocked,
    cash: session.run.cash,
    lives: session.run.lives,
    purchases,
    rerollSpend,
    serverSpend,
    earnings,
    fusionAt,
    records: session.story.records,
    finalInventory: session.run.owned.map((p) => p.type),
    transactions,
    rounds,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const count = Number(
    process.argv.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 5,
  );
  const policy = process.argv
    .find((arg) => arg.startsWith("--policy="))
    ?.split("=")[1] as StoryPolicy | undefined;
  const policies: StoryPolicy[] = policy
    ? [policy]
    : ["navigation", "commerce", "mixed"];
  const rows = Array.from({ length: count }, (_, i) => 101 + i).flatMap(
    (seed) => policies.map((p) => simulateStoryPath(seed, p)),
  );
  console.log(
    JSON.stringify(
      {
        note: "Fixed-seed, paid heuristic paths with real story rewards, fusion and ending; not an optimal-play claim or population win rate",
        rows,
      },
      null,
      2,
    ),
  );
}
