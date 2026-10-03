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
import * as lab from "../src/lab-audience-control.js";
import * as appGuidance from "../src/app-guidance.js";
import * as navigation from "../src/navigation-guidance.js";
import * as conversion from "../src/conversion-guidance.js";
import * as income from "../src/income-route-guidance.js";
import * as containment from "../src/containment-guidance.js";
import { targetCaption } from "../src/catalog/target-caption.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Execute the real async start, render/inspector, controller and event loop.
// Only browser DOM/drawing and unrelated panels are adapted. The inspector is
// hidden by battle CSS; this is lifecycle/state evidence, not browser paint,
// focus, keyboard-default-action or assistive-technology acceptance.
// Removing the battle renderSide call or the event-batch frame refresh fails.
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const declaration = name => {
  const text = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(text, `production ${name}`); return text;
};
const rules = source.slice(source.indexOf("const KIND:"), source.indexOf("function shortDesc("));
const functions = ["currentCpuConditions", "refreshCpuFrameConditions", "labPressureCapacity", "loadMeter", "renderTopbar", "renderFrames", "selectionCard", "opponentCard", "renderSide", "render", "start", "tick"];
const compiled = transformSync(rules + "\n" + functions.map(declaration).join("\n"), { loader: "ts", target: "es2022" }).code;
class Node extends ElementAdapter {
  get id() { return this.getAttribute("id") ?? ""; }
  set id(value) { this.setAttribute("id", value); }
  matches(selector) {
    return selector.split(",").some(value => {
      if ([...value.matchAll(/#([\w-]+)/g)].some(([, id]) => id !== this.id)) return false;
      return super.matches(value.replace(/#[\w-]+/g, ""));
    });
  }
}
const links = count => Array.from({ length: count }, (_, i) => C.makeItem("ab_link", `p${i}`, 16 + i % 8 * 104, 16 + Math.floor(i / 8) * 32, 96, 24));
function harness(count = 14) {
  const run = R.newRun("lab"); run.owned = links(count); run.admin = []; run.nextId = count + 1;
  assert.equal(R.validateRun(run), true);
  assert.ok(run.owned.every(p => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h)));
  const controller = lab.createLabBattleController();
  controller.choose("server-pressure-tight", { mode: "lab", storyActive: false, battleActive: false });
  const document = { createElement: tag => new Node(document, tag) }; document.body = document.createElement("body");
  for (const id of ["player-frame", "enemy-frame", "page-window", "scene", "traffic-hub", "inspector", "battle-button", "menu-button", "tb-run", "tb-stats", "battle-clock", "pause-button", "undo-button", "redo-button", "battle-controls", "battle-log", "canvas-float", "back-to-page"]) {
    const node = document.createElement("section"); node.id = id; document.body.append(node);
  }
  const query = selector => {
    const [first, ...rest] = selector.split(" "), root = document.body.querySelector(first);
    return rest.length ? root?.querySelector(rest.join(" ")) ?? null : root;
  };
  document.querySelector = query;
  const counts = { sideRenders: 0, framePaints: 0, saves: 0 }, events = [];
  let c;
  c = vm.createContext({
    ...cpu, ...hp, ...lab, ...appGuidance, ...navigation, ...conversion, ...income, ...containment,
    C, D, E, R, P: D.PARTS, targetCaption, document, HTMLElement: Node, HTMLSelectElement: Node,
    $: selector => { const node = query(selector); assert.ok(node, selector); return node; }, $$: () => [],
    run, labBattleController: controller, battle: null, storyActive: false, storySession: null,
    preview: false, view: "self", paused: false, speed: 1, lastTime: 0, settling: false, clone: structuredClone,
    preBattle: null, manualZoom: null, coachHidden: false, battleStage: 0,
    incomeRouteBinding: null, sidechannelPlacementBindings: new Map(), redditSidebarPlacementBindings: new WeakMap(),
    bindSidechannelPlacementControls() {}, bindRedditSidebarPlacementControls() {}, incomeRouteEditingAllowed: () => false,
    editor: { selection: new Set(["p0"]), history: [], future: [], pending: null,
      selected() { return c.run.owned.filter(p => this.selection.has(p.id)); }, drawSelection() {} },
    appOpponent: () => R.opponent(c.run), appEnemyBoard: () => R.enemyBoard(c.run),
    esc: V.esc, skinPicker: () => "", synergyPanel: () => "", enemyOptions: () => "", ENEMY_ERA: {}, icon: () => "",
    frameMarkup(side) { counts.framePaints++; return `<div class="browser-paper"><div class="page-wrap"><div class="page-body" id="${side}-body"></div></div></div>`; },
    V: { ...V, render(host) { const node = document.createElement("input"); node.setAttribute("data-native-sentinel", ""); node.value = "preserved local state"; host.append(node); } },
    scheduleFit() {}, wm: { setTitle() {} }, syncEra() {}, renderCoach() {}, renderShop() {}, markFusions() {},
    crawler: { setEnabled() {} }, basket: { setEnabled() {} },
    fx: { reset() {}, emit(event) { events.push(event); }, update() {} },
    traffic: { event() {}, start() {} }, battleSfx() {}, battleIntensity() {}, requestAnimationFrame() { return 1; },
    setTimeout() { throw new Error("Diagnostic must not end a battle"); }, performance: { now: () => 0 },
    save() { counts.saves++; }, toast(message) { throw new Error(message); },
    audio: { setMusic() {}, setIntensity() {}, sfx() {} }, particles: { flash() {} },
    Cer: { showPublish: async () => {}, showVersus: async () => {} }, publishLog: () => [], siteCardYou: () => ({}), siteCardFoe: () => ({}),
  });
  vm.runInContext(compiled, c);
  const renderSide = c.renderSide; c.renderSide = (...args) => { counts.sideRenders++; return renderSide(...args); };
  return { c, run, document, query, counts, events, controller };
}

test("QA actual start retires the real selected-period/edit actions and remounts a battle-locked lab selector", async () => {
  const h = harness(); h.c.renderSide();
  const inspector = h.query("#inspector"), oldControl = h.query("#lab-audience-experiment");
  assert.match(inspector.textContent, /自然発動1\.91秒ごと/);
  assert.ok(inspector.querySelector("[data-editor-action]"));
  assert.equal(oldControl.disabled, false);
  await h.c.start();
  assert.equal(h.run.phase, "battle"); assert.ok(h.c.battle instanceof E.Battle);
  assert.equal(h.c.battle.player.capacity, 15); assert.equal(h.c.battle.player.load, 14);
  assert.equal(h.c.editor.selection.size, 0); assert.equal(inspector.querySelector(".sel-card") === null, true, "the real selected card is retired at start");
  assert.equal(inspector.querySelector("[data-editor-action]") === null, true, "the old editing actions are removed");
  assert.doesNotMatch(inspector.textContent, /1\.91秒ごと/);
  const currentControl = h.query("#lab-audience-experiment");
  assert.notEqual(currentControl, oldControl); assert.equal(currentControl.disabled, true);
  assert.equal(currentControl.value, "server-pressure-tight");
  assert.equal(h.counts.sideRenders, 2, "one prebattle render, one start-boundary repaint");
  const battle = h.c.battle, saves = h.counts.saves;
  oldControl.value = "standard"; await oldControl.dispatch("change");
  currentControl.value = "server-pressure-spare"; await currentControl.dispatch("change");
  assert.equal(h.controller.value, "server-pressure-tight"); assert.equal(h.c.battle, battle);
  assert.equal(h.c.battle.player.capacity, 15); assert.equal(h.counts.saves, saves);
  assert.equal(h.counts.sideRenders, 2, "queued or current locked changes do not rebuild panels");
});

test("QA overlapping real pressure lots cross overload at12 then recover at6 while preserving native battle nodes", () => {
  const h = harness(8), battle = new E.Battle(h.run.owned, [C.makeItem("go_jobs", "jobs", 24, 24)], {
    experimentalRules: "server-pressure-v1", playerCapacity: 15, enemyCapacity: 38, playerHp: 10000, enemyHp: 10000,
  });
  h.run.phase = "battle"; h.c.battle = battle; h.c.editor.selection.clear(); h.c.render();
  const paper = h.query("#player-frame .browser-paper"), body = h.query("#player-body"), native = body.querySelector("[data-native-sentinel]"), selector = h.query("#lab-audience-experiment");
  const paints = h.counts.framePaints, sideRenders = h.counts.sideRenders, period = battle.player.parts[0].period;
  let tick = 0;
  const advance = until => { while (tick < until) h.c.tick(++tick * 50); };
  const check = (work, overloaded) => {
    assert.equal(battle.pressure.player.work, work);
    assert.match(h.query("#tb-stats").textContent, new RegExp(`${8 + work} / 15`));
    assert.equal(paper.classList.contains("is-slow"), overloaded);
    assert.equal(paper.querySelectorAll(".slow-banner").length, overloaded ? 1 : 0);
    assert.equal(h.query("#player-frame .browser-paper"), paper); assert.equal(h.query("#player-body"), body);
    assert.equal(body.querySelector("[data-native-sentinel]"), native); assert.equal(native.value, "preserved local state");
    assert.equal(h.query("#lab-audience-experiment"), selector);
    assert.equal(h.counts.framePaints, paints); assert.equal(h.counts.sideRenders, sideRenders);
  };
  const jobs = battle.enemy.parts[0]; jobs.charge = 3; jobs.remaining = .05; advance(1); check(6, false);
  assert.equal(battle.player.lag, 1); assert.equal(battle.player.parts[0].period, period);
  advance(40); jobs.charge = 3; jobs.remaining = .05; advance(41); check(12, true);
  assert.equal(battle.player.lag, 1.2); assert.ok(Math.abs(battle.player.parts[0].period - period * 1.2) < 1e-12);
  assert.match(paper.querySelector(".slow-banner").textContent, /基本8＋一時12/);
  advance(101); check(6, false); assert.equal(battle.player.lag, 1);
  advance(141); check(0, false); assert.equal(battle.player.lag, 1);
  assert.ok(Math.abs(battle.player.parts[0].period - period) < 1e-12);
  assert.deepEqual(h.events.filter(e => e.kind === "server-pressure").map(e => [e.action, Math.round(e.time * 20), e.queued]), [
    ["accepted", 1, 6], ["accepted", 41, 12], ["expired", 101, 6], ["expired", 141, 0],
  ]);
});
