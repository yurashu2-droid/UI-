import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import E from "../src/engine.js";
import C from "../src/document.js";
import { BUILDS } from "../src/builds.js";
import { measureMatch } from "../src/buildlab.js";

function link(id, x, y) {
  return C.makeItem("ab_link", id, x, y, 192, 32);
}
function opening(
  board,
  experimentalRules = "navigation-v1",
  combatVersion = "combat-v3",
) {
  const b = new E.Battle(board, [], {
    playerHp: 1000,
    enemyHp: 1000,
    experimentalRules,
    combatVersion,
  });
  const damages = {};
  for (const p of b.player.parts) {
    const before = b.enemy.hp;
    b._activate(b.player, b.enemy, p);
    damages[p.id] = before - b.enemy.hp;
  }
  return damages;
}

test("a lone starter link keeps full damage, cheap cost and fast native cadence", () => {
  assert.equal(D.PARTS.ab_link.value, 4);
  assert.equal(D.PARTS.ab_nav.value, 5);
  for (const type of ["ab_link", "ab_nav"]) {
    assert.equal(D.PARTS[type].price, 3);
    assert.equal(D.PARTS[type].load, 1);
  }
  assert.equal(D.PARTS.ab_link.cd, 1.8);
  assert.equal(D.PARTS.ab_nav.cd, 2.4);
  assert.deepEqual(opening([link("solo", 24, 24)]), { solo: 7 });
});

test("the page shares whitespace emphasis across its first two links rather than every clone", () => {
  assert.deepEqual(
    opening([link("a", 24, 24), link("b", 24, 100), link("c", 24, 176)]),
    { a: 7, b: 7, c: 4 },
  );
});

test("splitting navigation groups does not duplicate the whitespace allotment", () => {
  const board = [
    link("a", 24, 24),
    link("b", 24, 56),
    link("c", 400, 24),
    link("d", 400, 56),
  ];
  const actual = opening(board);
  assert.deepEqual(actual, { a: 7, c: 7, b: 4, d: 4 });
  assert.deepEqual(opening([...board].reverse()), actual);
  assert.equal(E.analyze(board).mods.a.speed, 1.15 * 1.15);
});

test("experimental links retain favorable matchups without sweeping all five archetypes", () => {
  const list = BUILDS.map((b) => ({
    ...b,
    build: true,
    layout: b.layout.filter((r) => D.PARTS[r[0]].status !== "experimental"),
  }));
  const links = list.find((b) => b.id === "b_links");
  const matches = list
    .filter((b) => b !== links)
    .map((b) =>
      measureMatch(links, b, {
        hp: 440,
        capacity: 35,
        adminSlots: 0,
        experimentalRules: "navigation-v1",
      }),
    );
  assert.ok(
    matches.some((m) => m.winner === "enemy"),
    "a represented production counter",
  );
  assert.ok(
    matches.some((m) => m.winner === "player"),
    "cheap fast links retain a role",
  );
});

test("previous navigation behavior remains selectable and current attention is explained", () => {
  const board = Array.from({ length: 8 }, (_, i) =>
    link("n" + i, 24, 24 + i * 40),
  );
  const base = E.analyze(board, null, "combat-v2"),
    candidate = E.analyze(board, "navigation-v1");
  assert.equal(base.mods.n0.speed, 1.15 * 1.15);
  assert.equal(candidate.mods.n0.speed, base.mods.n0.speed / 1.1);
  assert.ok(candidate.mods.n0.notes.some((n) => n.includes("注目")));
  assert.deepEqual(
    opening(board, null, "combat-v2"),
    Object.fromEntries(board.map((p) => [p.id, 7])),
  );
});
