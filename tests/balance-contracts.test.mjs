import test from "node:test";
import assert from "node:assert/strict";
import E from "../src/engine.js";
import C from "../src/document.js";
const p = (type, id, x, y, w, h) => C.makeItem(type, id, x, y, w, h);
const opponent = () => [p("ab_link", "enemy", 700, 500)];
const battle = (board, options = {}) =>
  new E.Battle(board, opponent(), {
    playerHp: 10000,
    enemyHp: 10000,
    ...options,
  });
const part = (b, id) => b.player.parts.find((p) => p.id === id);
function run(b, time) {
  const events = [];
  for (let i = 0; i < time * 20; i++) events.push(...b.step(0.05));
  return events;
}

test("a stretched speed button cannot accelerate unrelated text attacks", () => {
  const a = E.analyze([
    p("ab_link", "link", 24, 24, 192, 32),
    p("yt_speed", "speed", 224, 24, 104, 200),
  ]);
  assert.equal(a.mods.link.speed, 1);
});
test("speed accelerates video only inside its own recognized player", () => {
  const a = E.analyze([
    p("yt_play", "v", 24, 24, 560, 280),
    p("yt_progress", "seek", 24, 304, 560, 22),
    p("yt_speed", "speed", 24, 326, 104, 40),
    p("yt_autoplay", "echo", 128, 326, 176, 40),
  ]);
  assert.equal(a.mods.v.speed, 2);
  assert.ok(a.mods.echo.speed < 2);
});
test("replay cannot publish an attack before its first natural activation", () => {
  const b = battle([
    p("gov_pdf", "pdf", 24, 24, 280, 48),
    p("gov_page", "echo", 312, 24, 280, 36),
  ]);
  b._activate(b.player, b.enemy, part(b, "echo"));
  assert.equal(b.enemy.hp, 10000);
  assert.equal(part(b, "pdf").fires, 0);
});
test("replay copies last natural payload without advancing stacks or notifying earners", () => {
  const b = battle([
    p("go_lucky", "lucky", 24, 24, 184, 40),
    p("go_page", "echo", 24, 72, 320, 36),
    p("go_ads", "ad", 24, 116, 400, 84),
  ]);
  const lucky = part(b, "lucky"),
    echo = part(b, "echo");
  b._activate(b.player, b.enemy, lucky);
  const earned = b.player.income,
    before = b.enemy.hp;
  b._activate(b.player, b.enemy, echo);
  assert.equal(lucky.fires, 1);
  assert.equal(b.player.income, earned);
  assert.equal(before - b.enemy.hp, 3);
});
test("adnet retains fractional revenue rather than doubling every dollar", () => {
  const b = battle([p("ab_mail", "mail", 24, 24)], { playerAdmin: ["adnet"] });
  b._earn(b.player, b.enemy, part(b, "mail"), 1);
  assert.equal(b.player.income, 1.5);
});
test("a revenue event routes once instead of copying to multiple carts", () => {
  const b = battle([
    p("ab_mail", "mail", 24, 24, 224, 32),
    p("am_cart", "a", 24, 64, 280, 100),
    p("am_cart", "b", 256, 24, 280, 100),
  ]);
  b._earn(b.player, b.enemy, part(b, "mail"), 3);
  assert.equal(b.enemy.hp, 9985);
  assert.equal(b.player.income, 3);
  assert.equal(
    b.player.parts.reduce((s, p) => s + p.charge, 0),
    0,
  );
});
test("built-in suggestion and external suggestion share one effect family", () => {
  const a = E.analyze([
    p("go_instant", "instant", 24, 24, 420, 44),
    p("go_suggest", "suggest", 24, 76, 420, 84),
  ]);
  assert.equal(a.mods.instant.power, 1.45);
});
test("battle outcome and opening clocks do not depend on insertion order", () => {
  const board = [
    p("gov_pdf", "pdf", 24, 24, 280, 48),
    p("go_page", "echo", 312, 24, 280, 36),
    p("ab_link", "link", 24, 200),
  ];
  const a = battle(board),
    b = battle([...board].reverse());
  const ea = run(a, 20),
    eb = run(b, 20);
  assert.deepEqual(ea, eb);
  assert.equal(a.enemy.hp, b.enemy.hp);
});
test("backup can recover from lethal endgame overload", () => {
  const b = battle([p("ab_link", "link", 24, 24)], { playerAdmin: ["backup"] });
  b.player.hp = 5;
  b.ticks = 899;
  b.elapsed = 44.95;
  b.step(0.05);
  assert.equal(b.player.adminState.restored, true);
  assert.equal(b.player.hp, 3000);
  assert.equal(b.result, null);
});
test("same total elapsed time produces same combat events across step chunks", () => {
  const board = [p("gov_pdf", "pdf", 24, 24), p("ab_link", "link", 24, 120)];
  const a = battle(board),
    b = battle(board);
  const ea = run(a, 6),
    eb = [];
  for (let i = 0; i < 3; i++) eb.push(...b.step(2));
  assert.deepEqual(eb, ea);
});
test("mirrored simultaneous attack and sustain resolves without seat advantage", () => {
  const a = [p("gov_pdf", "pdf", 24, 24), p("am_wish", "heal", 24, 100)];
  const b = new E.Battle(
    a,
    a.map((x) => ({ ...x, id: "e" + x.id })),
    { playerHp: 30, enemyHp: 30 },
  );
  while (!b.result) b.step(0.05);
  assert.equal(b.result.winner, "draw");
  assert.equal(b.player.hp, b.enemy.hp);
});
test("metrics separate actual HP damage from absorbed shield and overkill", () => {
  const b = battle([p("gov_pdf", "pdf", 24, 24)]);
  b.enemy.hp = 2;
  b.enemy.shield = 4;
  b._hit(b.player, b.enemy, part(b, "pdf"), 20);
  assert.equal(b.metrics.player.hpDamage, 2);
  assert.equal(b.metrics.player.shieldDamage, 4);
  assert.equal(b.metrics.player.overkill, 14);
});
test("suggestion family chooses strongest provider regardless of source position", () => {
  const a = E.analyze([
    p("go_suggest", "weak", 24, 24, 420, 84),
    p("gov_pdf", "target", 24, 116, 280, 48),
    p("go_instant", "strong", 24, 172, 420, 44),
  ]);
  assert.equal(a.mods.target.power, 1.45);
});
test("explicit revenue routing selects exactly one eligible consumer", () => {
  const mail = { ...p("ab_mail", "mail", 24, 24, 224, 32), routeTo: "b" };
  const b = battle([
    mail,
    p("am_cart", "a", 24, 64, 280, 100),
    p("am_cart", "b", 256, 24, 280, 100),
  ]);
  b._earn(b.player, b.enemy, part(b, "mail"), 3);
  assert.equal(part(b, "a").fires, 0);
  assert.equal(part(b, "b").fires, 1);
});
test("missing revenue route safely chooses an eligible target without creating income", () => {
  const b = battle([
    { ...p("ab_mail", "mail", 24, 24, 224, 32), routeTo: "gone" },
    p("am_cart", "a", 24, 64, 280, 100),
  ]);
  b._earn(b.player, b.enemy, part(b, "mail"), 3);
  assert.equal(b.player.income, 3);
  assert.equal(part(b, "a").fires, 1);
});
test("fortress mirror healing and shielding are seat symmetric", async () => {
  const { BUILDS } = await import("../src/builds.js");
  const layout = BUILDS.find((b) => b.id === "b_fort");
  const make = (prefix) =>
    layout.layout.map(([t, x, y, w, h], i) => p(t, prefix + i, x, y, w, h));
  const b = new E.Battle(make("p"), make("e"), {
    playerHp: 440,
    enemyHp: 440,
    playerAdmin: layout.admin,
    enemyAdmin: layout.admin,
    playerCapacity: 200,
    enemyCapacity: 200,
  });
  while (!b.result) b.step(0.05);
  assert.equal(b.result.winner, "draw");
  assert.ok(Math.abs(b.player.hp - b.enemy.hp) < 1e-8);
});
test("analysis exposes one chosen revenue route and one cache target", () => {
  const a = E.analyze([
    { ...p("ab_mail", "mail", 24, 24, 224, 32), routeTo: "b" },
    p("am_cart", "a", 24, 64, 280, 100),
    p("am_cart", "b", 256, 24, 280, 100),
    p("gov_pdf", "pdf", 24, 220),
    p("go_cache", "cache", 24, 276),
  ]);
  const routes = a.relations.filter(
    (r) => r.kind === "conversion" && r.from === "mail",
  );
  assert.equal(routes.length, 1);
  assert.equal(routes[0].to, "b");
  assert.equal(
    a.relations.filter((r) => r.kind === "cache" && r.from === "cache")[0]?.to,
    "pdf",
  );
});
test("new site cultures cannot increase search diversity beyond four credited cultures", () => {
  const b = battle([
    p("go_search", "search", 24, 250, 920, 44),
    p("yt_caption", "yt", 24, 210, 64, 32),
    p("am_buy", "am", 96, 210, 128, 32),
    p("gov_submit", "gov", 232, 210, 136, 32),
    p("ab_link", "retro", 376, 210, 96, 32),
    p("tw_retweet", "tw", 480, 210, 112, 32),
    p("x_bookmark", "x", 600, 210, 144, 32),
  ]);
  b._activate(b.player, b.enemy, part(b, "search"));
  assert.equal(10000 - b.enemy.hp, 16);
});
test("telemetry includes back-office shield and healing rather than only UI parts", () => {
  const b = battle([p("ab_link", "link", 24, 24)], {
    playerAdmin: ["moderator", "sns"],
  });
  b.ticks = 40;
  b._admin(b.player, b.enemy);
  assert.equal(b.metrics.player.shielding, 6);
  b.player.hp = 9998;
  b.ticks = 60;
  b._admin(b.player, b.enemy);
  assert.equal(b.metrics.player.healing, 2);
  assert.equal(b.metrics.player.overheal, 4);
});
test("analysis reports power lost to caps for mixed completed support combinations", () => {
  const a = E.analyze([
    p("gov_font", "font", 24, 0, 788, 36),
    p("go_search", "search", 24, 40, 420, 44),
    p("gov_submit", "submit", 444, 40, 184, 44),
    p("go_translate", "translate", 628, 40, 184, 44),
    p("go_suggest", "suggest", 24, 84, 788, 84),
  ]);
  assert.equal(a.mods.submit.power, 3);
  assert.ok(Array.isArray(a.capWaste));
  assert.ok(a.capWaste.find((w) => w.id === "submit").power > 0);
});
