import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import E from "../src/engine.js";
const p = (type, id, x, y, w, h) => C.makeItem(type, id, x, y, w, h);
const battle = (board) =>
  new E.Battle(board, [], { playerHp: 1000, enemyHp: 1000 });
const part = (b, id) => b.player.parts.find((p) => p.id === id);

test("a typed replay source can target video while ignoring earlier adjacent text", () => {
  const b = battle([
    p("gov_pdf", "pdf", 464, 0, 280, 48),
    p("nc_player", "video", 216, 56, 240, 144),
    p("nc_comment", "replay", 464, 56, 360, 36),
  ]);
  b._activate(b.player, b.enemy, part(b, "pdf"));
  b._activate(b.player, b.enemy, part(b, "video"));
  const before = b.enemy.hp;
  b._activate(b.player, b.enemy, part(b, "replay"));
  assert.equal(before - b.enemy.hp, 3.5);
  assert.equal(part(b, "video").fires, 1);
});

test("semantic video sources receive seek, speed, captions and notification support", () => {
  const board = [
    p("nc_player", "video", 24, 24, 560, 280),
    p("yt_progress", "seek", 24, 304, 560, 22),
    p("yt_speed", "speed", 24, 326, 104, 40),
    p("yt_caption", "cc", 128, 326, 88, 40),
    p("yt_notify", "bell", 216, 326, 72, 40),
  ];
  const a = E.analyze(board);
  assert.equal(a.mods.video.speed, 2);
  assert.equal(a.mods.video.power, 1.25 * 1.15);
  assert.equal(a.mods.video.pierce, 0.25);
  const b = battle(board),
    before = b.player.shield;
  b._activate(b.player, b.enemy, part(b, "bell"));
  assert.equal(b.player.shield - before, 7);
});

function healing(children) {
  const b = battle([p("rd_thread", "thread", 24, 24, 560, 360), ...children]);
  b.player.hp = 800;
  b._activate(b.player, b.enemy, part(b, "thread"));
  return b.player.hp - 800;
}
test("a discussion heals extra only for two distinct directly contained text attacks", () => {
  assert.equal(
    healing([
      p("rd_post", "post", 40, 88, 240, 140),
      p("ab_link", "link", 288, 88, 192, 32),
    ]),
    12,
  );
  assert.equal(
    healing([
      p("rd_post", "a", 40, 88, 240, 140),
      p("rd_post", "b", 288, 88, 240, 140),
    ]),
    8,
  );
  assert.equal(
    healing([
      p("rd_post", "post", 40, 88, 240, 140),
      p("rd_vote", "vote", 288, 88, 48, 128),
    ]),
    8,
  );
});
test("nested text attacks and replay controllers do not count as direct conversation diversity", () => {
  assert.equal(
    healing([
      p("rd_post", "post", 40, 88, 240, 140),
      p("ab_table", "table", 288, 88, 272, 176),
      p("ab_link", "nested", 300, 134, 192, 32),
    ]),
    8,
  );
  assert.equal(
    healing([
      p("rd_post", "post", 40, 88, 240, 140),
      p("go_page", "replay", 288, 88, 240, 36),
    ]),
    8,
  );
});
