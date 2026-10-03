import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import E from "../src/engine.js";
const p = (type, id, x, y, w, h) => C.makeItem(type, id, x, y, w, h);
function make(extra = [], rules = "audience-v1") {
  return new E.Battle([p("yt_play", "video", 24, 24, 560, 280), ...extra], [], {
    playerHp: 1000,
    enemyHp: 1000,
    experimentalRules: rules,
  });
}
const sub = (id = "sub", y = 24) => p("yt_sub", id, 592, y, 184, 40);
const ad = (id = "ad", y = 24) => p("yt_ad", id, 592, y, 160, 48);
function play(b, n = 1, spacing = 50) {
  for (let i = 0; i < n; i++) {
    b.ticks += spacing;
    b._activate(
      b.player,
      b.enemy,
      b.player.parts.find((p) => p.id === "video"),
    );
  }
}
const snap = (b) => b.audience?.player.snapshot();

test("canonical subscriptions retain their existing payout while the experiment trades one dollar for loyalty", () => {
  const base = make([sub()], null),
    candidate = make([sub()]);
  play(base, 3);
  play(candidate, 3);
  assert.equal(base.player.income, 2);
  assert.equal(candidate.player.income, 1);
  assert.equal(snap(candidate).loyalty, 2);
  assert.equal(candidate.player.hp, 1000);
});
test("one ordinary ad beside naturally playing content does not cause churn", () => {
  const b = make([ad()]);
  play(b, 8);
  assert.equal(b.player.income, 8);
  assert.equal(b.player.hp, 1000);
  assert.equal(snap(b).churn, 0);
});
test("dense real ad exposure causes bounded departures, not fake incoming traffic", () => {
  const b = make([ad("a", 24), ad("b", 80), ad("c", 136), ad("d", 192)]);
  play(b, 1);
  assert.equal(b.player.income, 4);
  assert.ok(b.player.hp < 1000);
  assert.ok(1000 - b.player.hp <= 3);
  assert.equal(snap(b).churn, 1000 - b.player.hp);
  assert.ok(
    b.events.some((e) => e.kind === "audience" && e.action === "churn"),
  );
});
test("duplicate memberships share view progress and a bounded loyalty reserve", () => {
  const one = make([sub()]),
    two = make([sub(), sub("sub2", 80)]);
  play(one, 3);
  play(two, 3);
  assert.equal(snap(one).loyalty, 2);
  assert.equal(snap(two).loyalty, 2);
  play(two, 30);
  assert.equal(snap(two).loyalty, 8);
});
test("loyalty retains ordinary departures without healing or protecting piercing damage", () => {
  const b = make([sub()]);
  play(b, 3);
  b.player.shield = 0;
  b._hit(b.enemy, b.player, { damage: 0 }, 10, 0.5);
  assert.equal(b.player.hp, 991.25);
  assert.equal(snap(b).retained, 1.25);
  const before = snap(b).loyalty;
  b._hit(b.enemy, b.player, { damage: 0 }, 10, 1);
  assert.equal(b.player.hp, 981.25);
  assert.equal(snap(b).loyalty, before);
});
test("replays do not manufacture subscriber loyalty or additional ad exposure", () => {
  const b = make([
    sub(),
    ad("a", 80),
    p("yt_autoplay", "echo", 24, 312, 176, 40),
  ]);
  play(b, 1);
  const before = snap(b);
  assert.ok(before);
  b._activate(
    b.player,
    b.enemy,
    b.player.parts.find((p) => p.id === "echo"),
  );
  assert.deepEqual(snap(b), before);
});
test("loyalty expires without continued views and cannot stop server overload", () => {
  const b = make([sub()]);
  play(b, 3);
  assert.equal(snap(b).loyalty, 2);
  b.audience.player.advance(b.ticks + 201);
  assert.equal(snap(b).loyalty, 0);
  const a = make([sub()]),
    plain = make([sub()], null);
  play(a, 3);
  play(plain, 3);
  a.ticks = plain.ticks = 910;
  play(a, 3, 1);
  play(plain, 3, 1);
  a.ticks = plain.ticks = 919;
  a.player.parts = [];
  plain.player.parts = [];
  a.step(0.05);
  plain.step(0.05);
  assert.equal(a.player.hp, plain.player.hp);
  assert.ok(snap(a).loyalty > 0);
  assert.equal(snap(a).retained, 0);
});

test("exposure cannot be diluted by enlarging the same content surface", () => {
  const small = new E.Battle(
    [
      p("yt_play", "video", 24, 24, 240, 144),
      ...Array.from({ length: 3 }, (_, i) =>
        p("yt_ad", "a" + i, 272, 24 + i * 56, 160, 48),
      ),
    ],
    [],
    { playerHp: 1000, enemyHp: 1000, experimentalRules: "audience-v1" },
  );
  const large = make([ad("a0", 24), ad("a1", 80), ad("a2", 136)]);
  play(small, 10);
  play(large, 10);
  assert.equal(snap(small).ads, snap(large).ads);
  assert.equal(snap(small).churn, snap(large).churn);
});
test("splitting semantic sources cannot mint unlimited free page exposure", async () => {
  const { AudienceState, AUDIENCE_RULES } =
    await import("../src/audience-experiment.js");
  const state = new AudienceState();
  let loss = 0;
  for (let i = 0; i < 12; i++) loss += state.ad("module" + i, 0);
  assert.equal(
    state.snapshot().excessExposures,
    12 - AUDIENCE_RULES.pageExposureCapacity,
  );
  assert.equal(loss, AUDIENCE_RULES.churnBurst);
  for (let t = 1; t <= 100; t++)
    for (let i = 0; i < 6; i++) loss += state.ad("module" + i, t);
  assert.ok(
    loss <=
      AUDIENCE_RULES.churnBurst + 5 * AUDIENCE_RULES.churnPerSecond + 1e-9,
  );
});
test("audience variants remain identical across mirror seats and rendering frame partitions", () => {
  const layout = [
    p("yt_play", "video", 24, 24, 560, 280),
    sub(),
    ad("a", 80),
    ad("b", 136),
    ad("c", 192),
  ];
  const outputs = [];
  for (const dt of [0.05, 0.2, 0.07]) {
    const b = new E.Battle(
      layout,
      layout.map((x) => ({ ...x, id: "e" + x.id })),
      {
        playerHp: 1000,
        enemyHp: 1000,
        experimentalRules: "navigation-audience-v1",
      },
    );
    while (!b.result) b.step(dt);
    assert.equal(b.player.hp, b.enemy.hp);
    assert.deepEqual(b.audience.player.snapshot(), b.audience.enemy.snapshot());
    outputs.push({
      result: b.result,
      hp: b.player.hp,
      audience: b.audience.player.snapshot(),
    });
  }
  assert.deepEqual(outputs[0], outputs[1]);
  assert.deepEqual(outputs[0], outputs[2]);
});
