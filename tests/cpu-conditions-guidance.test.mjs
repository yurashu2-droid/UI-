import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { createLabBattleController } from "../src/lab-audience-control.js";
import {
  createStorySession,
  commandStorySession,
  prepareStoryBattle,
  validateStorySession,
} from "../src/story/session.js";

const guidance = await import("../src/cpu-conditions-guidance.js").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
const links = (count = 64) => Array.from({ length: count }, (_, i) =>
  C.makeItem("ab_link", `p${i + 1}`, 16 + (i % 8) * 104,
    16 + Math.floor(i / 8) * 32, 96, 24));
function run(mode = "lab", count = 64) {
  const result = R.newRun(mode);
  result.admin = [];
  result.owned = links(count);
  result.nextId = count + 1;
  assert.equal(R.validateRun(result), true);
  assert.ok(result.owned.every(p => C.canPlace(result.owned, p, p.x, p.y)));
  return result;
}
function context(run, extra = {}) {
  return { mode: run.mode, storyActive: false, runCapacity: R.capacity(run),
    pressureCapacity: null, ...extra };
}
function view(info, context) {
  assert.equal(typeof guidance.cpuConditionsGuidance, "function",
    "actual CPU display projection must exist");
  return guidance.cpuConditionsGuidance(info, context);
}
function render(actual) {
  assert.equal(typeof guidance.renderCpuConditionsGuidance, "function");
  return guidance.renderCpuConditionsGuidance(actual);
}
function matchesEngine(actual, battle) {
  assert.equal(actual.capacity, battle.player.capacity);
  assert.equal(actual.baseLoad, battle.player.load);
  assert.equal(actual.transientLoad, battle.pressure?.player.work ?? 0);
  assert.equal(actual.load, battle.player.load + (battle.pressure?.player.work ?? 0));
  assert.equal(actual.lag, battle.player.lag);
  assert.equal(actual.cpuSpeed, 1 / battle.player.lag);
  assert.equal(actual.overloaded, actual.load > battle.player.capacity);
}

test("64 legal lab links have unbounded CPU, rather than the old false 64/56 overload and 92% speed", () => {
  const prepared = run(), info = C.analyze(prepared.owned);
  assert.equal(info.load, 64);
  assert.equal(R.capacity(prepared), 56);
  assert.equal(Math.round(R.pageSpeed(info.load, R.capacity(prepared)) * 100), 92);
  const started = R.startBattle(prepared);
  assert.equal(started.ok, true);
  assert.equal(started.battle.player.capacity, Infinity);
  assert.equal(started.battle.player.lag, 1);
  const actual = view(info, context(prepared));
  matchesEngine(actual, started.battle);
  assert.equal(actual.capacityState, "unbounded");
  assert.equal(actual.overloaded, false);
  assert.equal(actual.barPercent, null);
  assert.equal(actual.overloadBarPercent, null);
  const html = render(actual);
  assert.match(html, /64 \/ 無制限/);
  assert.match(html, /CPU速度 100%/);
  assert.doesNotMatch(html, /92%|64 \/ 56|class="[^"]*\bover\b|width:/);
});

test("standard and audience controller previews agree with the real unbounded player launch", () => {
  for (const variant of ["standard", "audience-v1"]) {
    const prepared = run(), controller = createLabBattleController();
    assert.equal(controller.choose(variant, { mode: "lab", storyActive: false, battleActive: false }), true);
    const before = structuredClone(prepared);
    const preview = view(C.analyze(prepared.owned), context(prepared));
    assert.deepEqual(prepared, before, "display projection must not mutate the run");
    const started = controller.start(prepared, false);
    assert.equal(started.ok, true);
    matchesEngine(preview, started.battle);
    assert.equal(started.battle.experimentalRules, variant === "standard" ? null : variant);
    // CPU lag is only one factor: dense navigation still changes real periods.
    assert.ok(started.battle.player.info.navigation.slowdown > 1);
    assert.ok(started.battle.player.parts.some(part => part.period !== D.PARTS[part.type].cd));
    assert.match(render(preview), /ナビの注目分散.*部品ごとの補正.*別/);
    assert.match(render(preview), /HP.*別/);
  }
});

test("all three explicit pressure capacities match real controller starts and finite bars", () => {
  for (const [variant, capacity] of [
    ["server-pressure-tight", 15], ["server-pressure-v1", 26], ["server-pressure-spare", 38],
  ]) {
    const prepared = run(), controller = createLabBattleController();
    assert.equal(controller.choose(variant, { mode: "lab", storyActive: false, battleActive: false }), true);
    const preview = view(C.analyze(prepared.owned), context(prepared, { pressureCapacity: capacity }));
    const started = controller.start(prepared, false);
    assert.equal(started.ok, true);
    matchesEngine(preview, started.battle);
    assert.equal(preview.capacityState, "finite");
    assert.equal(preview.barPercent, 100);
    assert.equal(preview.overloadBarPercent, 60);
    assert.equal(started.battle.enemy.capacity, capacity, "only this pressure launch sets symmetric CPU");
    assert.match(render(preview), new RegExp(`64 / ${capacity}`));
    assert.match(render(preview), /CPU過負荷/);
  }
});

test("legacy campaign and actual story launches use purchased capacity and ignore stale lab pressure", () => {
  for (const capacity of [12, 17, 38]) {
    const legacy = run("campaign", 20);
    legacy.capacity = capacity;
    const preview = view(C.analyze(legacy.owned), context(legacy, { pressureCapacity: 15 }));
    const started = R.startBattle(legacy, { serverPressureExperiment: true, pressureCapacity: 15 });
    assert.equal(started.ok, true);
    matchesEngine(preview, started.battle);
    assert.equal(started.battle.enemy.capacity, Infinity, "campaign enemy defaults must not be fabricated as symmetric");
    assert.equal(preview.overloaded, 20 > capacity);
    assert.equal(preview.barPercent, Math.min(100, 20 / capacity * 100));

    const story = commandStorySession(createStorySession(), { type: "name-page", name: "CPU witness" }).session;
    story.run.owned = links(20);
    story.run.nextId = 21;
    story.run.capacity = capacity;
    assert.equal(validateStorySession(story), true);
    const storyPreview = view(C.analyze(story.run.owned), context(story.run, { storyActive: true, pressureCapacity: 15 }));
    const storyStarted = prepareStoryBattle(story, `cpu-story-${capacity}`);
    assert.equal(storyStarted.ok, true);
    matchesEngine(storyPreview, storyStarted.battle);
    assert.equal(storyStarted.battle.enemy.capacity, Infinity);
  }
  const staleLab = view({ load: 64 }, { mode: "lab", storyActive: true, runCapacity: 17, pressureCapacity: 15 });
  assert.equal(staleLab.capacity, 17, "story context cannot inherit either laboratory override");
});

test("live battle capacity, base load and CPU lag beat preview context without borrowing enemy CPU", () => {
  const battle = new E.Battle(links(20), [], { playerCapacity: 17, enemyCapacity: 38 });
  const actual = view({ load: 999 }, { mode: "lab", storyActive: false,
    runCapacity: 56, pressureCapacity: 15, battle });
  matchesEngine(actual, battle);
  assert.equal(actual.source, "battle");
  assert.equal(actual.capacity, 17);
  // The observed engine lag remains authoritative even between queue mutation and engine refresh.
  const live = { player: { load: 17, capacity: 17, lag: 1.25 }, pressure: { player: { work: 6 } } };
  const observed = view({ load: 999 }, { mode: "lab", storyActive: false,
    runCapacity: 56, pressureCapacity: null, battle: live });
  assert.equal(observed.load, 23);
  assert.equal(observed.lag, 1.25);
  assert.equal(observed.cpuSpeed, .8);
  assert.equal(observed.overloaded, true);
  assert.match(render(observed), /基本17.*一時6/);
});

test("live transient pressure appears and expires in the display with real engine lag", () => {
  const battle = new E.Battle(links(14), [C.makeItem("go_jobs", "jobs", 24, 24)], {
    experimentalRules: "server-pressure-v1", playerCapacity: 15, enemyCapacity: 38,
    playerHp: 10000, enemyHp: 10000,
  });
  const options = { mode: "lab", storyActive: false, runCapacity: 56, pressureCapacity: 26, battle };
  const project = () => view({ load: 999 }, options);
  matchesEngine(project(), battle);
  const jobs = battle.enemy.parts[0];
  jobs.charge = 3;
  jobs.remaining = .05;
  const events = battle.step(.05);
  assert.ok(events.some(event => event.kind === "server-pressure" && event.action === "accepted" && event.target === "player"));
  assert.equal(battle.pressure.player.work, 6);
  matchesEngine(project(), battle);
  assert.equal(project().load, 20);
  assert.equal(project().overloaded, true);
  assert.ok(project().cpuSpeed < 1);
  for (let tick = 0; tick < 100; tick++) battle.step(.05);
  assert.equal(battle.pressure.player.work, 0);
  matchesEngine(project(), battle);
  assert.equal(project().load, 14);
  assert.equal(project().overloaded, false);
  assert.equal(project().cpuSpeed, 1);
});

test("zero, exact-boundary and enormous finite loads keep bars bounded and CPU-only percentages honest", () => {
  for (const [load, capacity, speed, overload] of [
    [0, 12, 1, false], [12, 12, 1, false], [24, 12, 1 / 1.6, true],
    [Number.MAX_VALUE, Number.MIN_VALUE, 0, true],
  ]) {
    const actual = view({ load }, { mode: "campaign", storyActive: false, runCapacity: capacity, pressureCapacity: null });
    assert.equal(actual.cpuSpeed, speed);
    assert.equal(actual.overloaded, overload);
    assert.ok(actual.barPercent >= 0 && actual.barPercent <= 100);
    assert.ok(actual.overloadBarPercent >= 0 && actual.overloadBarPercent <= 60);
    assert.doesNotMatch(render(actual), /NaN|Infinity|width:-/);
  }
});

test("invalid capacities are unknown, never invented as unbounded, finite, or healthy", () => {
  for (const capacity of [NaN, -Infinity, 0, -1, undefined, null, "12"]) {
    const actual = view({ load: 20 }, { mode: "campaign", storyActive: false, runCapacity: capacity, pressureCapacity: null });
    assert.equal(actual.capacityState, "invalid");
    assert.equal(actual.capacity, null);
    assert.equal(actual.cpuSpeed, null);
    assert.equal(actual.overloaded, null);
    assert.equal(actual.barPercent, null);
    assert.match(render(actual), /容量を確認できません/);
    assert.doesNotMatch(render(actual), /無制限|100%|NaN|Infinity|width:/);
  }
});

test("invalid live values remain unknown rather than silently falling back to healthy preview values", () => {
  for (const player of [
    { load: -1, capacity: 15, lag: 1 }, { load: NaN, capacity: 15, lag: 1 },
    { load: Infinity, capacity: 15, lag: 1 }, { load: 20, capacity: NaN, lag: 1 },
    { load: 20, capacity: 15, lag: NaN }, { load: 20, capacity: 15, lag: 0 },
  ]) {
    const actual = view({ load: 1 }, { mode: "lab", storyActive: false, runCapacity: 56,
      pressureCapacity: null, battle: { player } });
    assert.equal(actual.source, "battle");
    assert.equal(actual.cpuSpeed, null);
    assert.match(render(actual), /確認できません/);
    assert.doesNotMatch(render(actual), /CPU速度 100%|NaN|Infinity|width:(?:NaN|Infinity)/);
  }
  for (const work of [NaN, -1, Infinity]) {
    const actual = view({ load: 1 }, { mode: "lab", storyActive: false, runCapacity: 56,
      pressureCapacity: null, battle: { player: { load: 12, capacity: 15, lag: 1 }, pressure: { player: { work } } } });
    assert.equal(actual.load, null);
    assert.equal(actual.cpuSpeed, null);
    assert.equal(actual.barPercent, null);
    assert.doesNotMatch(render(actual), /CPU速度 100%|NaN|Infinity|width:/);
  }
});

test("impossible infinite live CPU lag is unknown rather than a fabricated zero-percent speed", () => {
  for (const [load, capacity] of [[14, 15], [20, 15], [14, Infinity]]) {
    const actual = view({ load: 1 }, { mode: "lab", storyActive: false,
      runCapacity: 56, pressureCapacity: null,
      battle: { player: { load, capacity, lag: Infinity } } });
    assert.equal(actual.lag, null);
    assert.equal(actual.cpuSpeed, null);
    assert.match(render(actual), /CPU速度を確認できません/);
    assert.doesNotMatch(render(actual), /CPU速度 (?:約)?0%|NaN|Infinity/);
  }
});

test("genuine finite-capacity engine lag overflow retains zero CPU speed in preview and live views", () => {
  const board = links(1);
  const battle = new E.Battle(board, [], { playerCapacity: Number.MIN_VALUE });
  assert.equal(battle.player.load, 1);
  assert.equal(battle.player.capacity, Number.MIN_VALUE);
  assert.equal(battle.player.lag, Infinity);
  const options = { mode: "campaign", storyActive: false,
    runCapacity: Number.MIN_VALUE, pressureCapacity: null };
  for (const extra of [{}, { battle }]) {
    const actual = view(C.analyze(board), { ...options, ...extra });
    matchesEngine(actual, battle);
    assert.equal(actual.cpuSpeed, 0);
    assert.equal(actual.overloaded, true);
    assert.equal(actual.barPercent, 100);
    assert.equal(actual.overloadBarPercent, 60);
    assert.match(render(actual), /CPU速度 約0%/);
    assert.doesNotMatch(render(actual), /確認できません|NaN|Infinity/);
  }
});
