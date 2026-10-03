import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.ts";
import C from "../src/document.ts";
const story = await import("../src/story/index.ts").catch(() => ({}));

test("first stage uses a blank page, a separate analysis machine, retro encounters and guaranteed counter record", () => {
  assert.ok(story.STORY_STAGES, "canonical chapter content exists");
  const chapter = story.STORY_STAGES[0];
  assert.equal(chapter.title, "白紙のホームページ");
  assert.ok(
    chapter.encounters.length > 1,
    "eight stages must not be eight fights",
  );
  assert.equal(chapter.record.id, "broken-counter");
  assert.match(chapter.record.title, /訪問カウンター/);
  assert.equal(chapter.encounters.at(-1).boss, true);
  for (const encounter of chapter.encounters) {
    assert.equal(encounter.enemy.faction, "retro");
    assert.ok(encounter.enemy.address.startsWith("archive://"));
  }
});

test("story enemies are local, valid canonical UI layouts with no live network dependency", () => {
  assert.ok(story.STORY_STAGES);
  for (const stage of story.STORY_STAGES)
    for (const encounter of stage.encounters) {
      assert.ok(encounter.enemy.address.startsWith("archive://"));
      assert.ok(encounter.enemy.layout.length > 0);
      const board = encounter.enemy.layout.map(([type, x, y, w, h], i) => {
        assert.ok(D.PARTS[type], `${encounter.id} references existing ${type}`);
        return C.makeItem(type, `${encounter.id}-${i}`, x, y, w, h);
      });
      for (const part of board)
        assert.equal(
          C.canPlace(board, part, part.x, part.y),
          true,
          `${encounter.id}: ${part.type}`,
        );
      assert.ok(encounter.enemy.admin.every((id) => D.ADMIN[id]));
    }
});

test("stage two introduces a six-UI commercial boss with one server upgrade, without weakening later stages", () => {
  const boss = story.STORY_STAGES[1].encounters.at(-1).enemy;
  assert.equal(boss.hp, 270);
  assert.deepEqual(boss.admin, ["server"]);
  assert.deepEqual(
    boss.layout.map((row) => row[0]).sort(),
    [
      "am_product",
      "am_quantity",
      "am_buy",
      "am_wish",
      "am_coupon",
      "am_cart",
    ].sort(),
  );
  assert.ok(
    boss.decor.length > 0,
    "the reduced combat budget still looks like a complete store page",
  );
  assert.equal(story.STORY_STAGES[7].encounters[0].enemy.hp, 560);
});
