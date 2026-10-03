import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
const make = (type, id, x = 24, y = 24, w, h) =>
  C.makeItem(type, id, x, y, w, h);
function battle(extra = []) {
  assert.ok(D.PARTS.go_history, "experimental history definition");
  return new E.Battle(
    [make("go_history", "h"), ...extra],
    [make("gov_pdf", "pdf")],
    { playerHp: 100, enemyHp: 100 },
  );
}
test("real history restores only the consumed latest ordinary UI damage", () => {
  const b = battle();
  b._hit(b.enemy, b.player, b.enemy.parts[0], 20, 0.5);
  b._activate(b.player, b.enemy, b.player.parts[0]);
  assert.equal(b.player.hp, 85);
  assert.equal(b.historyView("player").consumed, true);
  b._activate(b.player, b.enemy, b.player.parts[0]);
  assert.equal(b.player.hp, 85);
  assert.ok(
    b.events.some(
      (e) => e.kind === "history" && e.action === "restore" && e.value === 5,
    ),
  );
});
test("real history has the actual Google starting-clock modifier and an exclusive five-second expiry", () => {
  const b = battle([
    make("go_result", "r", 600, 24, 280, 80),
    make("go_tabs", "t", 600, 112, 280, 36),
  ]);
  const h = b.player.parts.find((p) => p.id === "h");
  assert.equal(h.remaining, h.period * 0.5 * 0.75);
  b._hit(b.enemy, b.player, b.enemy.parts[0], 20, 0);
  assert.equal(b.historyView("player").expiresAt, 100);
  b.ticks = 100;
  b._activate(b.player, b.enemy, h);
  assert.equal(b.player.hp, 80);
  assert.equal(b.historyView("player").recoverable, 0);
});
test("real history empty polls do not create economy; successful restoration does", () => {
  const b = battle([
      make("ad_retarget", "ad", 312, 24, 280, 80),
      make("am_cart", "cart", 600, 24, 280, 100),
    ]),
    h = b.player.parts.find((p) => p.id === "h");
  b._activate(b.player, b.enemy, h);
  assert.equal(h.fires, 0);
  assert.equal(b.player.income, 0);
  b._hit(b.enemy, b.player, b.enemy.parts[0], 30, 0);
  b._activate(b.player, b.enemy, h);
  assert.equal(b.player.hp, 82);
  assert.equal(h.fires, 1);
  assert.equal(b.player.income, 1);
  assert.equal(b.player.parts.find((p) => p.id === "cart").charge, 1);
});
test("history ignores server and administrator loss while accepting ordinary UI loss after45s", () => {
  const b = battle(),
    h = b.player.parts[0];
  b._hit(b.enemy, b.player, { damage: 0 }, 20, 1, "troll");
  assert.equal(b.historyView("player"), null);
  b.ticks = 901;
  b.elapsed = 45.05;
  b._hit(b.enemy, b.player, b.enemy.parts[0], 20, 0);
  b._activate(b.player, b.enemy, h);
  assert.equal(b.player.hp, 70);
  b._hit(b.enemy, b.player, b.enemy.parts[0], 1000, 0);
  b._activate(b.player, b.enemy, h);
  assert.equal(b.player.hp, 0);
});
test("history remains excluded from the real campaign market", async () => {
  const { default: R } = await import("../src/run.js");
  assert.ok(D.PARTS.go_history, "experimental history definition");
  assert.equal(D.PARTS.go_history.status, "experimental");
  for (let seed = 1; seed <= 20; seed++) {
    const r = R.newRun("campaign");
    r.seed = seed;
    r.stage = 7;
    assert.ok(R.market(r).every((p) => p.type !== "go_history"));
  }
});
test("a due restoration attempt discards an already fully healed revision without minting an activation", () => {
  const b = battle(),
    h = b.player.parts[0];
  b._hit(b.enemy, b.player, b.enemy.parts[0], 20, 0);
  b.player.hp = b.player.maxHp;
  b._activate(b.player, b.enemy, h);
  assert.equal(b.historyView("player").consumed, true);
  assert.equal(h.fires, 0);
  b.player.hp -= 10;
  b._activate(b.player, b.enemy, h);
  assert.equal(b.player.hp, 90);
});
