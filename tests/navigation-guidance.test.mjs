import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { simulateNavigationRecovery } from "../scripts/navigation-recovery.ts";

// An absent presentation module fails an assertion before implementation exists.
const guidance = await import("../src/navigation-guidance.js").catch(
  (error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return {};
    throw error;
  },
);
function view(info, selected) {
  assert.equal(typeof guidance.navigationGuidance, "function");
  return guidance.navigationGuidance(info, selected);
}
function render(info, selected) {
  assert.equal(typeof guidance.renderNavigationGuidance, "function");
  return guidance.renderNavigationGuidance(view(info, selected));
}
const link = (id, x, y) => C.makeItem("ab_link", id, x, y, 192, 32);
function assertLegal(board) {
  assert.ok(
    board.filter(C.placed).every((p) => C.canPlace(board, p, p.x, p.y)),
  );
}
function orderedBoard() {
  return [
    link("later", 32, 192),
    link("right", 400, 96),
    C.makeItem("ab_nav", "navigation", 32, 24, 176, 32),
    link("left", 32, 96),
    link("stash", null, null),
  ];
}
function thresholdBoard(height, secondHeight = 0) {
  const board = [
    C.makeItem("ab_table", "container", 0, 0, 816, height),
    link("link", 24, 48),
  ];
  if (secondHeight)
    board.push(
      C.makeItem("ab_guestbook", "filler", 0, height + 10, 816, secondHeight),
    );
  assertLegal(board);
  return board;
}
function firstHits(board, ids, options = {}) {
  const battle = new E.Battle(board, [], {
    playerHp: 1000,
    enemyHp: 10000,
    ...options,
  });
  const hits = new Map();
  for (let i = 0; i < 400 && ids.some((id) => !hits.has(id)); i++)
    for (const event of battle.step(0.05))
      if (
        event.kind === "damage" &&
        event.side === "player" &&
        ids.includes(event.id) &&
        !hits.has(event.id)
      )
        hits.set(event.id, event);
  assert.ok(
    ids.every((id) => hits.has(id)),
    "every requested attack naturally fires",
  );
  return { battle, hits };
}

test("navigation guidance copies actual highlighted IDs in engine order without changing analysis", () => {
  const board = orderedBoard();
  assertLegal(board);
  board.find((p) => p.id === "left").label = "Home";
  const info = E.analyze(board),
    before = structuredClone(info);
  const actual = view(info);
  assert.deepEqual(actual.targets, [
    { id: "left", name: "Home" },
    { id: "right", name: D.PARTS.ab_link.name },
  ]);
  assert.deepEqual(
    actual.targets.map((p) => p.id),
    info.navigation.highlightedLinks,
  );
  assert.equal(actual.tierBonus, 3);
  assert.equal(actual.appliedBonus, 3);
  assert.equal(actual.nextThresholdPercent, null);
  assert.deepEqual(info, before);
  assert.deepEqual(view(E.analyze([...board].reverse())), actual);
});

test("guidance follows movement, stashing, and non-ab_link navigation eligibility", () => {
  const board = orderedBoard();
  const later = board.find((p) => p.id === "later");
  let info = E.analyze(board);
  assert.deepEqual(view(info, later).selected, {
    id: "later",
    state: "unhighlighted",
    bonus: 0,
  });
  const left = board.find((p) => p.id === "left");
  left.y = 320;
  info = E.analyze(board);
  assert.deepEqual(
    view(info, later).targets.map((p) => p.id),
    ["right", "later"],
  );
  assert.deepEqual(view(info, later).selected, {
    id: "later",
    state: "eligible",
    bonus: 3,
  });
  later.x = later.y = null;
  info = E.analyze(board);
  assert.deepEqual(view(info, later).selected, {
    id: "later",
    state: "stashed",
    bonus: 0,
  });
  assert.deepEqual(
    view(info).targets.map((p) => p.id),
    ["right", "left"],
  );
  const nav = board.find((p) => p.id === "navigation");
  assert.deepEqual(view(info, nav).selected, {
    id: "navigation",
    state: "not-link",
    bonus: 0,
  });
  assert.match(render(info, later), /未配置.*加算 \+0/);
  assert.match(render(info, nav), /青いハイパーリンク専用.*加算 \+0/);
});

test("exact 60 percent and just below it report different tiers and real first-hit values", () => {
  for (const [height, freePercentText, bonus, damage] of [
    [320, "60.000%", 3, 7],
    [320.0001, "59.999%", 2, 6],
  ]) {
    const board = thresholdBoard(height);
    const { battle, hits } = firstHits(board, ["link"]);
    const actual = view(battle.player.info);
    assert.equal(actual.freePercentText, freePercentText);
    assert.equal(actual.tierBonus, bonus);
    assert.equal(actual.appliedBonus, bonus);
    assert.equal(hits.get("link").value, damage);
    assert.equal(
      hits.get("link").value,
      D.PARTS.ab_link.value + actual.appliedBonus,
    );
    assert.match(render(battle.player.info), /小数第3位まで切り捨て/);
  }
});

test("all four additive tiers and the next relevant threshold agree with natural hits", () => {
  for (const [height, secondHeight, bonus, threshold] of [
    [500, 170, 0, 20],
    [400, 160, 1, 40],
    [400, 0, 2, 60],
    [320, 0, 3, null],
  ]) {
    const board = thresholdBoard(height, secondHeight);
    const { battle, hits } = firstHits(board, ["link"]);
    const actual = view(battle.player.info);
    assert.equal(actual.tierBonus, bonus);
    assert.equal(actual.nextThresholdPercent, threshold);
    assert.equal(hits.get("link").value, D.PARTS.ab_link.value + bonus);
    const html = render(battle.player.info);
    assert.match(html, new RegExp(`基礎値 \\+${bonus} / 回`));
    if (threshold === null) assert.doesNotMatch(html, /次の段階/);
    else
      assert.match(
        html,
        new RegExp(`次の段階：余白${threshold}%以上で \\+${bonus + 1}`),
      );
  }
});

test("no applicable link or an excluded selection never receives a next-tier promise", () => {
  const board = thresholdBoard(400);
  board.push(link("second", 24, 112), link("third", 24, 176));
  assertLegal(board);
  const info = E.analyze(board);
  assert.equal(view(info).nextThresholdPercent, 60);
  assert.equal(view(info, board.at(-1)).nextThresholdPercent, null);
  assert.equal(view(info, link("held", null, null)).nextThresholdPercent, null);
  assert.match(render(info, board.at(-1)), /対象外.*加算 \+0/);
  const noLinks = E.analyze([C.makeItem("ab_nav", "nav", 24, 24)]);
  assert.deepEqual(view(noLinks).targets, []);
  assert.equal(view(noLinks).appliedBonus, 0);
  assert.equal(view(noLinks).nextThresholdPercent, null);
  assert.match(render(noLinks), /対象の青リンクは未配置/);
  assert.doesNotMatch(render(noLinks), /次の段階|基礎値 \+3/);
});

test("only named eligible blue links get the base addition in actual first natural hits", () => {
  const board = orderedBoard();
  const { battle, hits } = firstHits(board, [
    "left",
    "right",
    "later",
    "navigation",
  ]);
  const actual = view(battle.player.info);
  for (const part of battle.player.parts.filter(
    (p) => D.PARTS[p.type].kind === "attack",
  )) {
    const additive = actual.targets.some((target) => target.id === part.id)
      ? actual.appliedBonus
      : 0;
    assert.equal(hits.get(part.id).value, D.PARTS[part.type].value + additive);
  }
  assert.equal(hits.get("later").value, 4);
  assert.equal(hits.get("navigation").value, 5);
});

test("navigation attention is an independent interval factor from actual analysis", () => {
  const board = Array.from({ length: 7 }, (_, i) =>
    link(`link${i}`, 24, 24 + i * 70),
  );
  board.push(C.makeItem("ab_mail", "mail", 480, 24));
  assertLegal(board);
  const info = E.analyze(board),
    actual = view(info);
  assert.deepEqual(actual.attention, { entries: 7, slowdown: 1.05 });
  assert.equal(actual.tierBonus, 3);
  assert.equal(actual.targets.length, 2);
  const html = render(info);
  assert.match(html, /ナビの注目分散/);
  assert.match(html, /攻撃ナビ7個.*発動間隔 ×1\.05/);
  assert.match(html, /余白加算とは別/);
  const current = new E.Battle(board, []),
    legacy = new E.Battle(board, [], { combatVersion: "combat-v2" });
  for (const part of current.player.parts.filter((p) => p.type === "ab_link"))
    assert.ok(
      Math.abs(
        part.period / legacy.player.parts.find((p) => p.id === part.id).period -
          actual.attention.slowdown,
      ) < 1e-12,
    );
});

test("legacy and experimental analysis determine coverage without inventing the first-two rule", () => {
  const board = orderedBoard();
  for (const [options, eligibleCount, attention] of [
    [{ combatVersion: "combat-v2" }, 3, null],
    [
      { combatVersion: "combat-v2", experimentalRules: "navigation-v1" },
      2,
      { entries: 4, slowdown: 1 },
    ],
    [{ combatVersion: "combat-v3" }, 2, { entries: 4, slowdown: 1 }],
  ]) {
    const { battle, hits } = firstHits(
      board,
      ["left", "right", "later"],
      options,
    );
    const actual = view(battle.player.info);
    assert.equal(actual.targets.length, eligibleCount);
    assert.deepEqual(actual.attention, attention);
    assert.equal(hits.get("later").value, eligibleCount === 3 ? 7 : 4);
    if (!attention)
      assert.doesNotMatch(render(battle.player.info), /先頭2|注目分散/);
  }
});

test("renderer escapes target labels and distinguishes additive basis from power and net HP loss", () => {
  const board = [
    link("link", 24, 24),
    C.makeItem("gov_font", "font", 24, 72, 208, 32),
  ];
  board[0].label = "<img src=x onerror=\"alert(1)\"> & 'link'";
  const { battle, hits } = firstHits(board, ["link"]);
  assert.equal(battle.player.info.mods.link.power, 1.5);
  assert.equal(hits.get("link").value, 10.5);
  const actual = view(battle.player.info, board[0]);
  assert.equal(actual.selected.bonus, 3);
  const html = guidance.renderNavigationGuidance(actual);
  assert.match(
    html,
    /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;link&#39;/,
  );
  assert.doesNotMatch(html, /<img|\+45%|×3/);
  assert.match(html, /威力倍率の前/);
  assert.match(html, /シールド.*実際のHP減少/);
});

test("the maintained paid navigation witness exposes the winning and oversized tiers honestly", () => {
  const route = simulateNavigationRecovery();
  assert.equal(route.complete, true);
  const small = route.beforeProof.run.owned;
  const largeRun = structuredClone(route.beforeProof.run);
  const result = largeRun.owned.find((part) => part.type === "go_result");
  assert.equal(R.move(largeRun, result.id, 32, 272, 280, 96), true);
  for (const [board, percentage, bonus, threshold] of [
    [small, "60.110%", 3, null],
    [largeRun.owned, "59.178%", 2, 60],
  ]) {
    const { battle, hits } = firstHits(board, ["p2", "p4"]);
    const actual = view(battle.player.info);
    assert.equal(actual.freePercentText, percentage);
    assert.equal(actual.tierBonus, bonus);
    assert.equal(actual.nextThresholdPercent, threshold);
    assert.deepEqual(
      actual.targets.map((p) => p.id),
      ["p2", "p4"],
    );
    for (const id of ["p2", "p4"])
      assert.equal(hits.get(id).value, D.PARTS.ab_link.value + bonus);
  }
});
