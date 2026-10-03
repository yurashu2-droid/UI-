import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import V from "../src/components.js";

const classic = ["tw_post", "tw_retweet", "tw_favorite", "tw_follow"];
const modern = ["x_post", "x_quote", "x_note", "x_bookmark"];
const catalogue = await import("../src/catalog/index.js").catch(() => ({}));

test("classic Twitter and X have distinct experimental native component families", () => {
  for (const [ids, faction] of [[classic, "twitter"], [modern, "x"]]) {
    for (const id of ids) {
      assert.ok(D.PARTS[id], `${id} is a canonical part`);
      assert.equal(D.PARTS[id].faction, faction);
      assert.equal(D.PARTS[id].status, "experimental");
      assert.ok(D.PARTS[id].price > 0);
    }
  }
  assert.ok(D.PARTS.tw_post.cd < D.PARTS.x_post.cd);
  assert.ok(D.PARTS.tw_post.load < D.PARTS.x_post.load);
  assert.ok(D.PARTS.tw_retweet.value < D.PARTS.x_quote.value);
});

test("both recognizable site templates are legal 960x680 pages with different structures", () => {
  assert.ok(Array.isArray(catalogue.SITE_TEMPLATES), "site template catalogue exists");
  const old = catalogue.SITE_TEMPLATES.find((t) => t.id === "site_twitter_classic");
  const current = catalogue.SITE_TEMPLATES.find((t) => t.id === "site_x");
  assert.ok(old && current, "old Twitter and X remain separately selectable");
  assert.match(old.name, /旧Twitter/);
  assert.match(current.name, /X風/);
  assert.notEqual(old.faction, current.faction);
  assert.notDeepEqual(old.decor.map((d) => d[0]), current.decor.map((d) => d[0]));
  assert.ok(D.PRESETS.site_twitter_classic, "classic template can be loaded as one's own page");
  assert.ok(D.PRESETS.site_x, "X template can be loaded as one's own page");
  for (const template of [old, current]) {
    assert.equal(template.status, "experimental");
    assert.ok(template.references.every((url) => url.startsWith("https://blog.x.com/") || url.startsWith("https://help.x.com/")));
    const board = template.layout.map(([type, x, y, w, h], i) => C.makeItem(type, `${template.id}-${i}`, x, y, w, h));
    for (const part of board) assert.equal(C.canPlace(board, part, part.x, part.y), true, `${template.id}: ${part.type}`);
    for (const [, x, y, w, h] of template.decor) assert.ok(x >= 0 && y >= 0 && x + w <= 960 && y + h <= 680);
    assert.ok(template.loot.every((id) => board.some((p) => p.type === id)));
  }
});

test("all new social components execute a documented generic combat role", () => {
  assert.ok(D.PARTS.tw_post && D.PARTS.x_post);
  const board = [
    C.makeItem("tw_post", "post", 24, 24, 520, 108),
    C.makeItem("tw_retweet", "rt", 24, 140, 128, 32),
    C.makeItem("tw_favorite", "favorite", 160, 140, 128, 32),
    C.makeItem("tw_follow", "follow", 296, 140, 132, 32),
    C.makeItem("x_post", "xpost", 24, 200, 480, 140),
    C.makeItem("x_quote", "quote", 24, 348, 480, 124),
    C.makeItem("x_note", "note", 24, 480, 480, 92),
    C.makeItem("x_bookmark", "bookmark", 24, 580, 144, 36),
  ];
  const enemy = [C.makeItem("gov_pdf", "enemy", 24, 24)];
  const battle = new E.Battle(board, enemy, { playerHp: 10000, enemyHp: 10000 });
  const events = [];
  for (let i = 0; i < 400; i++) events.push(...battle.step(0.05));
  for (const part of board) assert.ok(events.some((e) => e.kind === "fire" && e.id === part.id), `${part.type} has a real activation`);
  for (const id of ["rt", "quote"]) assert.ok(events.some((e) => e.kind === "echo" && e.id === id));
  assert.ok(events.some((e) => e.kind === "heal" && e.id === "follow"));
  assert.ok(events.some((e) => e.kind === "shield" && e.id === "note"));
});

test("social markup uses timelines, native actions and quoted context without external code", () => {
  assert.ok(D.PARTS.tw_post && D.PARTS.x_quote);
  const old = V.markup(C.makeItem("tw_post", "a", 0, 0));
  const quote = V.markup(C.makeItem("x_quote", "b", 0, 0));
  assert.match(old, /classic-post/);
  assert.match(old, /<article/);
  assert.match(quote, /<blockquote/);
  assert.match(V.markup(C.makeItem("tw_favorite", "c", 0, 0)), /☆/);
  assert.match(V.markup(C.makeItem("x_note", "d", 0, 0)), /背景情報/);
  for (const id of [...classic, ...modern]) {
    const item = C.makeItem(id, id, 0, 0);
    item.label = '<script>alert("private")</script>';
    const html = V.markup(item);
    assert.doesNotMatch(html, /<script|<iframe|<img[^>]+https?:|onclick=/i);
    assert.match(html, /&lt;script&gt;/);
  }
  assert.match(V.header("twitter"), /旧Twitter風/);
  assert.match(V.header("x"), /X風/);
});
