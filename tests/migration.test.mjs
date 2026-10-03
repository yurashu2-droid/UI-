import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { BATTLE_RULES_VERSION } from "../src/combat-rules.js";
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import Editor from "../src/editor.js";

const original = readFileSync(
  new URL("../UI_RAID_STUDIO.html", import.meta.url),
  "utf8",
);
const source = original.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({ Date });
vm.runInContext(source.slice(0, source.indexOf("/* Native UI state")), context);
const legacy = {
  D: context.UIRaidData,
  C: context.UIRaidDocument,
  E: context.UIRaidEngine,
  R: context.UIRaidRun,
  Editor: context.UIRaidEditor,
};
const json = (value) =>
  JSON.parse(JSON.stringify(value, (_, v) => (v instanceof Set ? [...v] : v)));

function fight(api, preset, stage, mode = "lab") {
  // newRun builds the shop immediately, so fix time before creation too.
  const now = Date.now;
  let run;
  try {
    Date.now = () => 123456;
    run = api.R.newRun(mode, preset, { tutorial: mode === "campaign" });
  } finally {
    Date.now = now;
  }
  run.stage = stage;
  if (mode === "campaign") {
    assert.equal(api.R.purchase(run, "ab_heading").ok, true);
    const item = run.owned.at(-1);
    assert.equal(api.R.move(run, item.id, 32, 24), true);
  }
  const started = api.R.startBattle(run);
  assert.equal(started.ok, true);
  const battle = started.battle;
  const events = [];
  for (let i = 0; i < 1201 && !battle.result; i++)
    events.push(...battle.step(0.05));
  assert.ok(battle.result, "battle terminates within 60 seconds");
  const settled = api.R.settleBattle(run, battle);
  assert.equal(settled.ok, true);
  const final = {
    result: battle.result,
    events,
    summary: settled.summary,
    run,
  };
  assert.equal(api.R.validateRun(json(run)), true);
  if (run.phase === "reward") {
    assert.equal(api.R.claimLoot(run, run.pending.loot[0]).ok, true);
    assert.equal(api.R.validateRun(json(run)), true);
  }
  return json(final);
}

// Fusion-only UIs (src/fusion.ts) are new content; every prototype UI must stay exactly as it was.
const withoutFusion = (d) => {
  const j = json(d);
  return {
    ...j,
    PARTS: Object.fromEntries(
      Object.entries(j.PARTS).filter(([, p]) => !p.fused),
    ),
  };
};
test("prototype identities and legacy documents remain compatible while content expands", () => {
  for (const type of Object.keys(legacy.D.PARTS))
    assert.ok(D.PARTS[type], type);
  for (const preset of Object.keys(legacy.D.PRESETS))
    assert.equal(
      R.validateRun(json(legacy.R.newRun("lab", preset))),
      true,
      preset,
    );
  assert.equal(
    readFileSync(new URL("../src/styles/game.css", import.meta.url), "utf8"),
    original.match(/<style>([\s\S]*?)<\/style>/)[1],
  );
  const strip = (s) =>
    s
      .replace(/<style>[\s\S]*?<\/style>/, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/, "");
  assert.equal(
    strip(readFileSync(new URL("../index.html", import.meta.url), "utf8")),
    strip(original),
  );
});

function verifyFrozenCombat(
  version,
  explicitVersion,
  runtimeVersion = version,
) {
  const fixture = JSON.parse(
    readFileSync(
      new URL(`./fixtures/${version}.json`, import.meta.url),
      "utf8",
    ),
  );
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(fixture.rulesVersion, version);
  assert.equal(fixture.cases.length, 20);
  for (const sample of fixture.cases) {
    assert.equal(
      digest(sample.input),
      sample.inputHash,
      `${sample.key}: input changed`,
    );
    const options = {
      ...sample.input.options,
      ...(explicitVersion ? { combatVersion: version } : {}),
    };
    const battle = new E.Battle(
      sample.input.playerBoard,
      sample.input.enemyBoard,
      options,
    );
    assert.equal(battle.combatVersion, runtimeVersion);
    const events = [];
    for (let i = 0; i < 1201 && !battle.result; i++)
      events.push(...battle.step(0.05));
    assert.deepEqual(
      {
        result: battle.result,
        ticks: battle.ticks,
        playerHp: battle.player.hp,
        enemyHp: battle.enemy.hp,
        eventsHash: digest(events),
      },
      sample.expected,
      sample.key,
    );
  }
}
test("20 immutable combat-v2 replay fixtures retain explicit legacy compatibility", () => {
  verifyFrozenCombat("combat-v2", true);
});
test("20 frozen combat-v3 battles retain explicit legacy results and event hashes", () => {
  verifyFrozenCombat("combat-v3", true);
});
test("the same twenty non-repeat legacy inputs retain their hashes under default combat-v4", () => {
  assert.equal(BATTLE_RULES_VERSION, "combat-v4");
  verifyFrozenCombat("combat-v3", false, BATTLE_RULES_VERSION);
});

test("campaign settlement retains eight rounds, three lives and original economy", () => {
  const actual = fight({ D, C, E, R }, "mixed", 0, "campaign");
  const win = actual.result.winner === "player";
  assert.equal(R.ROUNDS, 8);
  assert.equal(actual.summary.base, 6);
  assert.equal(actual.summary.bonus, win ? 4 : 0);
  assert.equal(
    actual.summary.income,
    Math.min(10, Math.floor(actual.summary.rawIncome / 2)),
  );
  assert.equal(actual.run.lives, win ? 3 : 2);
  assert.equal(actual.run.phase, win ? "reward" : "build");
});

test("legacy save JSON loads and editing preserves valid geometry", () => {
  const run = json(legacy.R.newRun("lab", "text"));
  assert.equal(R.validateRun(run), true);
  const first = run.owned.find(C.placed);
  assert.equal(
    Editor.patchItem(run.owned, first.id, { label: "移行確認" }),
    true,
  );
  assert.equal(R.validateRun(json(run)), true);
  const before = JSON.stringify(run.owned);
  assert.equal(Editor.patchItem(run.owned, first.id, { x: -500 }), false);
  assert.equal(JSON.stringify(run.owned), before);
});

test("typed editor keeps resize, move, join and duplicate transactions identical", () => {
  for (const preset of Object.keys(D.PRESETS)) {
    const initial = json(legacy.R.newRun("lab", preset));
    const selected = initial.owned.filter(C.placed).slice(0, 3);
    const edits = [
      (api, run) =>
        api.patchItem(run.owned, selected[0].id, { x: selected[0].x + 8 }),
      (api, run) =>
        api.patchItem(run.owned, selected[0].id, { w: selected[0].w + 16 }),
      (api, run) =>
        api.joinSelection(
          run.owned,
          selected.map((p) => p.id),
          "horizontal",
        ),
      (api, run) =>
        api.joinSelection(
          run.owned,
          selected.map((p) => p.id),
          "vertical",
        ),
      (api, run) => api.duplicateSelection(run, [selected[0].id]),
    ];
    for (const edit of edits) {
      const actual = json(initial),
        expected = json(initial);
      assert.deepEqual(
        json(edit(Editor, actual)),
        json(edit(legacy.Editor, expected)),
        preset,
      );
      // Legacy constructors run in a VM realm; compare JSON data, not prototypes.
      assert.deepEqual(json(actual), json(expected), preset);
    }
  }
});

test("save type guard rejects malformed nested JSON and accepts legacy optional fields", () => {
  const saved = json(legacy.R.newRun("lab", "text"));
  delete saved.tutorial;
  delete saved.tutorialAck;
  assert.equal(R.validateRun(saved), true);
  const summary = fight(legacy, "text", 0).summary;
  const invalid = [
    null,
    [],
    {},
    { ...saved, history: [null] },
    { ...saved, history: [{ winner: "player" }] },
    { ...saved, history: [{ ...summary, winner: ["player"] }] },
    {
      ...saved,
      pending: { loot: ["ab_link"], summary: null },
      phase: "reward",
    },
    { ...saved, owned: [{ ...saved.owned[0], w: "wide" }] },
    { ...saved, shop: [{ type: "ab_link", sold: "false" }] },
  ];
  for (const value of invalid) assert.equal(R.validateRun(value), false);
});

test("near recipe pairs fuse after a battle, and fused UIs never appear in shops", () => {
  const run = R.newRun("campaign", "mixed");
  run.owned = [
    C.makeItem("go_search", "p1", 32, 40, 420, 44),
    C.makeItem("go_suggest", "p2", 32, 84, 420, 84),
    C.makeItem("ab_link", "p3", 600, 40, 192, 32),
  ];
  run.nextId = 10;
  assert.equal(R.fusionPairs(run.owned).length, 1);
  const done = R.fuse(run);
  assert.equal(done.length, 1);
  assert.deepEqual(run.owned.map((q) => q.type).sort(), [
    "ab_link",
    "go_instant",
  ]);
  const fused = run.owned.find((q) => q.type === "go_instant");
  assert.equal(fused.x, 32);
  assert.equal(fused.y, 40);
  assert.equal(R.validateRun(json(run)), true);
  for (let stage = 0; stage < 8; stage++) {
    run.stage = stage;
    for (let reroll = 0; reroll < 5; reroll++) {
      run.rerolls = reroll;
      for (const s of R.market(run)) assert.ok(!D.PARTS[s.type]?.fused, s.type);
    }
  }
});
