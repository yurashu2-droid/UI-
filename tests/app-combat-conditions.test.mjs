import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import V from "../src/components.js";
import * as cpu from "../src/cpu-conditions-guidance.js";
import * as hp from "../src/opponent-hp-guidance.js";
import { createLabBattleController } from "../src/lab-audience-control.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Real app display/render/tick functions and engine state. DOM plumbing and
// unrelated visual renderers are adapted; no browser paint/focus claim is made.
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const extract = name => { const text = app.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0]; assert.ok(text, name); return text; };
const optional = ["currentCpuConditions", "refreshCpuFrameConditions"].filter(name => app.includes(`function ${name}(`));
const compiled = transformSync([...optional, "loadMeter", "renderFrames", "opponentCard", "siteCardFoe", "render", "tick"].map(extract).join("\n"), { loader: "ts", target: "es2022" }).code;
class Node extends ElementAdapter {
  get id() { return this.getAttribute("id") ?? ""; }
  set id(value) { this.setAttribute("id", value); }
  matches(selector) {
    return selector.split(",").some(part => {
      if ([...part.matchAll(/#([\w-]+)/g)].some(([, id]) => id !== this.id)) return false;
      return super.matches(part.replace(/#[\w-]+/g, ""));
    });
  }
  insertAdjacentHTML(where, html) {
    assert.equal(where, "beforeend"); const holder = this.ownerDocument.createElement("div"); holder.innerHTML = html; this.append(...[...holder.children]);
  }
}
const links = count => Array.from({ length: count }, (_, i) => C.makeItem("ab_link", `p${i + 1}`, 16 + i % 8 * 104, 16 + Math.floor(i / 8) * 32, 96, 24));
function harness({ mode = "lab", count = 64, pressure = null, storyActive = false } = {}) {
  const run = R.newRun(mode); run.admin = []; run.owned = links(count); run.nextId = count + 1;
  assert.ok(run.owned.every(p => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h)));
  const document = { createElement: tag => new Node(document, tag) }; document.body = document.createElement("body");
  for (const id of ["player-frame", "enemy-frame", "page-window", "scene", "traffic-hub", "tb-stats", "inspector", "battle-controls", "battle-log", "canvas-float", "back-to-page", "battle-clock"])
    { const node = document.createElement("section"); node.id = id; document.body.append(node); }
  const query = selector => { const [first, ...rest] = selector.split(" "); const root = document.body.querySelector(first); return rest.length ? root?.querySelector(rest.join(" ")) ?? null : root; };
  document.querySelector = query;
  let c, sideRenders = 0, framePaints = 0;
  c = vm.createContext({
    ...cpu, ...hp, C, D, E, R, run, storyActive, battle: null, preview: false, view: "self", paused: false, speed: 1, settling: false, lastTime: 0,
    document, $: query, esc: V.esc, ENEMY_ERA: {},
    labPressureCapacity: () => pressure, appOpponent: () => R.opponent(c.run), appEnemyBoard: () => R.enemyBoard(c.run),
    frameMarkup(side) { framePaints++; return `<div class="browser-paper"><div class="page-wrap"><div class="page-body" id="${side}-body"></div></div></div>`; },
    V: { render(host) { const sentinel = document.createElement("button"); sentinel.setAttribute("data-native-sentinel", ""); sentinel.textContent = "preserved local state"; host.append(sentinel); } },
    editor: { selection: new Set(), drawSelection() {} }, scheduleFit() {}, icon: () => "", enemyOptions: () => "",
    syncEra() {}, renderTopbar() { query("#tb-stats").innerHTML = c.loadMeter(C.analyze(c.run.owned)); },
    renderShop() {}, renderSide() { sideRenders++; query("#inspector").textContent = "No selected part"; }, markFusions() {}, renderCoach() {},
    crawler: { setEnabled() {} }, basket: { setEnabled() {} },
    fx: { emit() {}, update() {} }, traffic: { event() {} }, battleSfx() {}, battleIntensity() {},
    requestAnimationFrame() { return 1; }, endBattle() { throw new Error("Unexpected completed diagnostic"); },
  });
  vm.runInContext(compiled, c);
  return { c, run, document, query, meter: () => c.loadMeter(C.analyze(c.run.owned)),
    paper: () => query("#player-frame .browser-paper"), counts: () => ({ sideRenders, framePaints }) };
}

for (const variant of ["standard", "audience-v1"]) test(`actual ${variant} meter and frame agree with unbounded64-load launch`, () => {
  const h = harness(), controller = createLabBattleController(); controller.choose(variant, { mode: "lab", storyActive: false, battleActive: false });
  const original = JSON.stringify(h.run); h.c.renderFrames();
  assert.match(h.meter(), /64 \/ 無制限/); assert.match(h.meter(), /CPU速度 100%/); assert.doesNotMatch(h.meter(), /class="tb-load[^\"]* over|表示速度 92%|width:/);
  assert.equal(h.paper().classList.contains("is-slow"), false); assert.equal(h.paper().querySelector(".slow-banner"), null);
  assert.equal(JSON.stringify(h.run), original);
  const result = controller.start(h.run, false); assert.equal(result.ok, true); h.c.battle = result.battle;
  assert.equal(result.battle.player.capacity, Infinity); assert.equal(result.battle.player.lag, 1);
  h.c.renderFrames(); assert.match(h.meter(), /64 \/ 無制限/); assert.equal(h.paper().classList.contains("is-slow"), false);
});

for (const capacity of [15, 26, 38]) test(`actual pressure preview and frame use selected CPU${capacity}`, () => {
  const h = harness({ pressure: capacity }); h.c.renderFrames();
  const result = R.startBattle(h.run, { serverPressureExperiment: true, pressureCapacity: capacity }); assert.equal(result.ok, true);
  assert.match(h.meter(), new RegExp(`64 / ${capacity}`)); assert.equal(h.paper().classList.contains("is-slow"), true);
  assert.match(h.paper().querySelector(".slow-banner").textContent, /CPU/);
  assert.match(h.meter(), new RegExp(`${Math.round(100 / result.battle.player.lag)}%`));
  h.c.battle = result.battle; h.c.renderFrames(); assert.match(h.meter(), new RegExp(`64 / ${capacity}`));
});

test("story and legacy displays use their finite real capacity without a laboratory override", () => {
  for (const storyActive of [false, true]) {
    const h = harness({ mode: "campaign", count: 20, storyActive }); h.run.capacity = 17; h.c.renderFrames();
    assert.match(h.meter(), /20 \/ 17/); assert.equal(h.paper().classList.contains("is-slow"), true);
    assert.match(h.paper().querySelector(".slow-banner").textContent, /CPU/);
  }
});

test("live CPU state overrides preview board and settings, while unknown data never invents health", () => {
  const h = harness({ pressure: 26 });
  h.c.battle = new E.Battle(links(14), [], { playerCapacity: 15, enemyCapacity: 38 }); h.c.renderFrames();
  assert.match(h.meter(), /14 \/ 15/); assert.equal(h.paper().classList.contains("is-slow"), false);
  h.c.battle.player.capacity = NaN; h.c.battle.player.lag = NaN; h.c.renderFrames();
  assert.match(h.meter(), /確認不可|確認できません/); assert.doesNotMatch(h.meter(), /NaN|Infinity|100%| over/);
  assert.equal(h.paper().classList.contains("is-slow"), false); assert.equal(h.paper().querySelector(".slow-banner"), null);
});

test("actual render retires prebattle selection and actual pressure events refresh the frame without replacing battle nodes", () => {
  const h = harness({ count: 14, pressure: 15 });
  const b = new E.Battle(h.run.owned, [C.makeItem("go_jobs", "jobs", 24, 24)], {
    playerHp: 10000, enemyHp: 10000, playerCapacity: 15, enemyCapacity: 38, experimentalRules: "server-pressure-v1",
  });
  h.run.phase = "battle"; h.c.battle = b; h.query("#inspector").innerHTML = '<b>1.91秒</b><button data-stale-edit>stale</button>';
  h.c.render(); assert.equal(h.counts().sideRenders, 1); assert.doesNotMatch(h.query("#inspector").textContent, /1\.91|stale/);
  const paper = h.paper(), native = h.query("#player-body").querySelector("button"), paints = h.counts().framePaints;
  b.enemy.parts[0].charge = 3; b.enemy.parts[0].remaining = .05;
  h.c.tick(50);
  assert.equal(b.pressure.player.work, 6); assert.equal(b.player.lag, 1.2);
  assert.match(h.query("#tb-stats").textContent, /20 \/ 15/); assert.equal(paper.classList.contains("is-slow"), true);
  assert.equal(paper.querySelectorAll(".slow-banner").length, 1); assert.match(paper.querySelector(".slow-banner").textContent, /一時|CPU/);
  for (let tick = 2; tick <= 105; tick++) h.c.tick(tick * 50);
  assert.equal(b.pressure.player.work, 0); assert.equal(b.player.lag, 1);
  assert.equal(paper.classList.contains("is-slow"), false); assert.equal(paper.querySelector(".slow-banner"), null);
  assert.match(h.query("#tb-stats").textContent, /14 \/ 15/);
  assert.ok(h.paper() === paper); assert.ok(h.query("#player-body").querySelector("button") === native);
  assert.equal(native.textContent, "preserved local state"); assert.equal(h.counts().framePaints, paints); assert.equal(h.counts().sideRenders, 1);
});

test("both actual opponent surfaces distinguish equipment-adjusted start HP from its base and damaged HP", () => {
  const h = harness({ count: 1 });
  for (let stage = 0; stage < R.labEnemies().length; stage++) {
    h.run.stage = stage; const o = R.opponent(h.run), fresh = R.newRun("lab"); fresh.stage = stage;
    const result = R.startBattle(fresh); assert.equal(result.ok, true);
    const actual = result.battle.enemy.maxHp, expected = hp.opponentHpGuidance(o);
    assert.equal(expected.startingHp, actual);
    const html = h.c.opponentCard(), stats = h.c.siteCardFoe().stats;
    assert.match(html, new RegExp(`開始HP[^<]*${actual}`)); assert.match(html, new RegExp(`基礎HP[^<]*${o.hp}`));
    assert.equal(stats.find(row => row.label === "開始HP")?.value, String(actual));
    assert.equal(stats.find(row => row.label === "基礎HP")?.value, String(o.hp));
    result.battle.enemy.hp = .01; h.c.battle = result.battle;
    assert.equal(h.c.opponentCard(), html); assert.deepEqual(h.c.siteCardFoe().stats, stats);
  }
});
