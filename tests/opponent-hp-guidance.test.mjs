import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { STORY_STAGES } from "../src/story/content.js";
import * as Story from "../src/story/session.js";

// A missing implementation fails a behavior assertion, rather than an import.
const guidance = await import("../src/opponent-hp-guidance.js").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
function project(opponent) {
  assert.equal(typeof guidance.opponentHpGuidance, "function");
  return guidance.opponentHpGuidance(opponent);
}
function readyRun(mode, stage) {
  const run = R.newRun(mode, "blank");
  run.stage = stage;
  run.owned = [C.makeItem("ab_link", "p1", 32, 32)];
  run.nextId = 2;
  run.admin = [];
  return run;
}
function checkBattle(opponent, battle, context) {
  const before = structuredClone(opponent);
  const view = project(opponent);
  assert.equal(view.baseHp, opponent.hp, context);
  assert.equal(view.startingHp, battle.enemy.maxHp, context);
  assert.equal(view.startingHp, battle.enemy.hp, `${context}: before the first tick`);
  assert.equal(view.baseLabel, "基礎HP");
  assert.equal(view.startingLabel, "開始HP");
  assert.equal(view.baseText, String(opponent.hp));
  assert.equal(view.startingText, String(battle.enemy.maxHp));
  assert.deepEqual(opponent, before, `${context}: metadata is not rewritten`);
  return view;
}

test("base 440 and equipped start 550 remain separate, explicitly labeled values", () => {
  const view = project({ hp: 440, admin: ["server", "backup"] });
  assert.equal(view.baseHp, 440);
  assert.equal(view.startingHp, 550);
  assert.equal(view.baseLabel, "基礎HP");
  assert.equal(view.startingLabel, "開始HP");
  assert.equal(view.baseText, "440");
  assert.equal(view.startingText, "550");
  assert.match(view.explanation, /サーバー増強/);
  assert.match(view.explanation, /1\.25|25%/);
  assert.match(view.explanation, /四捨五入/);
  assert.match(view.explanation, /CPU上限は変わりません/);
});

test("every canonical laboratory launch matches its own base HP and equipment", () => {
  const changed = [];
  const enemies = R.labEnemies();
  assert.equal(enemies.length, 42);
  for (const [index, enemy] of enemies.entries()) {
    const run = readyRun("lab", index), opponent = R.opponent(run);
    const started = R.startBattle(run);
    assert.equal(started.ok, true, enemy.id);
    const view = checkBattle(opponent, started.battle, enemy.id);
    assert.equal(started.battle.enemy.capacity, Infinity);
    if (view.baseHp !== view.startingHp) changed.push([enemy.id, view.baseHp, view.startingHp]);
  }
  assert.deepEqual(changed, [
    ["gov", 350, 438], ["google", 390, 488], ["amazon", 460, 575],
    ["b_cart", 440, 550], ["b_text", 440, 550], ["b_fort", 440, 550],
    ["b_echo", 440, 550], ["b_fort_native", 440, 550], ["b_documents_heavy", 440, 550],
  ]);
  assert.equal(project(R.opponent(readyRun("lab", 0))).startingHp, 270);
});

test("all eight legacy launches preserve round-specific equipment omissions", () => {
  const starting = [];
  for (let stage = 0; stage < R.ROUNDS; stage++) {
    const run = readyRun("campaign", stage), opponent = R.opponent(run);
    const started = R.startBattle(run);
    assert.equal(started.ok, true);
    starting.push(checkBattle(opponent, started.battle, `round ${stage + 1}`).startingHp);
  }
  assert.deepEqual(starting, [110, 150, 190, 230, 270, 320, 475, 560]);
  const earlyGovernment = R.opponent(readyRun("campaign", 1));
  assert.equal(D.ENEMIES[earlyGovernment.index].admin.includes("server"), true);
  assert.deepEqual(earlyGovernment.admin, []);
  assert.equal(project(earlyGovernment).startingHp, 150, "never borrow omitted source-site admins");
});

test("all fifteen story encounters agree with real prepareStoryBattle launches", () => {
  const starting = [];
  for (const [index, stage] of STORY_STAGES.entries()) {
    for (const [encounterIndex, encounter] of stage.encounters.entries()) {
      // Valid pre-launch states at each authored encounter, not claims of a paid journey.
      const session = Story.createStorySession();
      const earlierStages = STORY_STAGES.slice(0, index);
      Object.assign(session.story, {
        stageId: stage.id, phase: "hub", pageName: "HP projection", fusionWitnessed: true,
        completedEncounters: [
          ...earlierStages.flatMap(s => s.encounters.map(e => e.id)),
          ...stage.encounters.slice(0, encounterIndex).map(e => e.id),
        ],
        records: earlierStages.map(s => s.record.id),
        readRecords: earlierStages.map(s => s.record.id),
      });
      session.run.stage = index;
      session.run.page.name = session.story.pageName;
      session.run.owned = [C.makeItem("ab_link", "p1", 32, 32)];
      session.run.nextId = 2;
      assert.equal(Story.validateStorySession(session), true, encounter.id);
      const started = Story.prepareStoryBattle(session, `hp-${encounter.id}`);
      assert.equal(started.ok, true, encounter.id);
      assert.equal(started.encounter.id, encounter.id);
      starting.push(checkBattle(started.encounter.enemy, started.battle, encounter.id).startingHp);
    }
  }
  assert.deepEqual(starting, [100, 194, 210, 338, 290, 340, 438, 488, 390, 430, 550, 600, 490, 530, 700]);
});

test("every known admin subset matches engine construction without adding CPU or stacking HP bonuses", () => {
  const ids = Object.keys(D.ADMIN);
  for (let mask = 0; mask < 2 ** ids.length; mask++) {
    const admin = ids.filter((_, i) => mask & (1 << i));
    for (const hp of [350, 440, 441, 442, 443]) {
      const battle = new E.Battle([], [], { enemyHp: hp, enemyAdmin: admin, enemyCapacity: 17 });
      const view = checkBattle({ hp, admin }, battle, `${admin.join(",")}: ${hp}`);
      assert.equal(battle.enemy.capacity, 17);
      if (!admin.includes("server")) {
        assert.equal(view.startingHp, hp);
        assert.match(view.explanation, /設備補正なし/);
        assert.doesNotMatch(view.explanation, /1\.25|25%/);
      }
    }
  }
  const duplicate = { hp: 440, admin: ["server", "server", "backup"] };
  const battle = new E.Battle([], [], { enemyHp: duplicate.hp, enemyAdmin: duplicate.admin });
  assert.equal(checkBattle(duplicate, battle, "engine deduplicates admin IDs").startingHp, 550);
});

test("quarter, half and nearby rounding boundaries use the engine's exact arithmetic", () => {
  const samples = [
    [440, 550], [441, 551], [442, 553], [443, 554],
    [441.999999, 552], [442.000001, 553], [1.199999, 1], [1.2, 2], [1.200001, 2],
  ];
  for (const [hp, expected] of samples) {
    const opponent = { hp, admin: ["server"] };
    const battle = new E.Battle([], [], { enemyHp: hp, enemyAdmin: opponent.admin });
    assert.equal(battle.enemy.maxHp, expected);
    assert.equal(checkBattle(opponent, battle, `rounding ${hp}`).startingHp, expected);
  }
  const plain = { hp: 441.5, admin: [] };
  assert.equal(checkBattle(plain, new E.Battle([], [], { enemyHp: plain.hp }), "no implicit rounding").startingHp, 441.5);
});

test("server-pressure and audience laboratory modes do not change this HP projection", () => {
  const index = R.labEnemies().findIndex(enemy => enemy.id === "b_cart");
  for (const options of [
    { audienceExperiment: true },
    ...[15, 26, 38].map(pressureCapacity => ({ serverPressureExperiment: true, pressureCapacity })),
  ]) {
    const run = readyRun("lab", index), opponent = R.opponent(run);
    const started = R.startBattle(run, options);
    assert.equal(started.ok, true);
    assert.equal(checkBattle(opponent, started.battle, JSON.stringify(options)).startingHp, 550);
    assert.equal(started.battle.enemy.capacity, options.pressureCapacity ?? Infinity);
  }
});

test("starting HP stays metadata-only after damage, and never consumes a BattleSide as metadata", () => {
  const run = readyRun("lab", 6), opponent = R.opponent(run);
  const started = R.startBattle(run);
  assert.equal(started.ok, true);
  const before = project(opponent);
  for (let i = 0; i < 240 && !started.battle.result; i++) started.battle.step(0.05);
  assert.ok(started.battle.enemy.hp < started.battle.enemy.maxHp, "real combat damages the enemy");
  assert.deepEqual(project(opponent), before);
  assert.equal(project(opponent).startingHp, started.battle.enemy.maxHp);
  assert.equal(project(started.battle.enemy).startingHp, null, "live admin Set is not opponent metadata");
  assert.deepEqual(project({ ...opponent, maxHp: 1, currentHp: 2 }), before, "unscoped overrides are ignored");
});

test("missing or invalid HP is unknown rather than the engine's falsy 400 default", () => {
  for (const hp of [undefined, null, "440", NaN, Infinity, -Infinity, -1, 0, Number.MAX_VALUE]) {
    const view = project({ hp, admin: ["server"] });
    assert.equal(view.baseHp, null, String(hp));
    assert.equal(view.startingHp, null, String(hp));
    assert.equal(view.baseText, "不明");
    assert.equal(view.startingText, "不明");
    assert.match(view.explanation, /不明/);
  }
  for (const opponent of [undefined, null, 440, "440", [], {}]) {
    assert.equal(project(opponent).startingHp, null);
  }
});

test("unverified admins never silently become no equipment or a guessed multiplier", () => {
  for (const admin of [undefined, null, "server", new Set(["server"]), {}, ["future-admin"], ["__proto__"], ["toString"], [null], [1], Array(1)]) {
    const view = project({ hp: 440, admin });
    assert.equal(view.baseHp, 440);
    assert.equal(view.baseText, "440");
    assert.equal(view.startingHp, null, String(admin));
    assert.equal(view.startingText, "不明");
    assert.match(view.explanation, /不明/);
  }
  assert.equal(project({ hp: 440, admin: [] }).startingHp, 440);
  assert.equal(project({ hp: 440, admin: ["sns", "backup", "sakura"] }).startingHp, 440);
});

test("unsafe or nonpositive projected HP is refused and frozen metadata remains untouched", () => {
  const unsafe = project({ hp: Number.MAX_SAFE_INTEGER, admin: ["server"] });
  assert.equal(unsafe.baseHp, Number.MAX_SAFE_INTEGER);
  assert.equal(unsafe.startingHp, null);
  assert.equal(unsafe.startingText, "不明");
  assert.equal(project({ hp: 0.1, admin: ["server"] }).startingHp, null);
  const opponent = Object.freeze({ hp: 440, admin: Object.freeze(["server", "backup"]) });
  const view = project(opponent);
  assert.equal(view.startingHp, 550);
  assert.deepEqual(opponent, { hp: 440, admin: ["server", "backup"] });
});
