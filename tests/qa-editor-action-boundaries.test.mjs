import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { randomUUID } from "node:crypto";
import { Editor } from "../src/editor.js";
import D from "../src/data.js";
import C from "../src/document.js";
import R from "../src/run.js";
import * as Story from "../src/story/index.js";
import * as StorySession from "../src/story/session.js";
import { createRunPersistence } from "../src/persistence.js";
import { createLabBattleController } from "../src/lab-audience-control.js";

const clone = structuredClone;
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const names = ["load", "save", "appOpponent", "commitStorySession", "enterStory", "storyCommand", "storyRewardPanel", "storyInboxPanel", "importFile", "switchMode", "start", "abort", "finishStoryBattle", "finishBattle", "leaveBattle"];
function appSource() {
  const functions = names.map(name => {
    const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"));
    assert.ok(match, `actual app ${name}`);
    return match[0];
  }).join("\n");
  const options = source.match(/^const editor = new UIRaidEditor.Editor\(\{[^]*?^\}\);/m)?.[0];
  const click = source.slice(source.indexOf("/* ---------- Events ---------- */")).match(/^document.addEventListener\("click",[^]*?^\}\);/m)?.[0];
  assert.ok(options); assert.ok(click);
  return transformSync(`let importRequestId = 0;\n${functions}\n${options}\n${click}\nglobalThis.editor = editor;`, {loader: "ts", target: "es2022"}).code;
}
const compiled = appSource();
const noop = () => {};
class ElementAdapter {
  constructor(tag = "button") { this.tag = tag; this.id = ""; this.dataset = {}; this.children = []; this.style = {}; this.open = false; this.textContent = ""; this.classList = {add: noop, remove: noop, toggle: noop}; }
  closest(selector) { return selector === "button" && this.tag === "button" ? this : null; }
  hasAttribute() { return false; }
  setAttribute() {}
  append(...nodes) { this.children.push(...nodes); }
  getBoundingClientRect() { return {left: 0, top: 0, width: 10, height: 10}; }
}
// Same VM boundary as qa-interrupted-save-imports: actual application functions,
// click dispatch, editor enabled/onChange callbacks and transaction methods.
// Only DOM drawing, ceremony, sound and frame scheduling are adapted. No browser
// pixels or invented outcome/reward/build are involved in these assertions.
function application(values = new Map()) {
  const nodes = new Map(), events = new Map(), toasts = [];
  let failWrites = false;
  const storage = {getItem: k => values.get(k) ?? null, setItem(k, v) { if (failWrites) throw new Error("QA storage quota failure"); values.set(k, v); }};
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, new ElementAdapter(selector === "#modal" ? "dialog" : "div")); return nodes.get(selector); };
  const initial = R.newRun("campaign");
  initial.seed = 401; initial.shop = R.market(initial);
  const context = {
    JSON, Error, structuredClone, clone, crypto: {randomUUID}, R, C, P: D.PARTS, D, Story, StorySession,
    Element: ElementAdapter,
    UIRaidEditor: {Editor: class { constructor(options) { return Object.assign(Object.create(Editor.prototype), {o: {...options, getOverlay: () => null}, history: [], future: [], selection: new Set(), pending: null, drag: null}); }}},
    run: initial, memory: {}, runPersistence: createRunPersistence(storage, "qa-boundary-"),
    storyPersistence: StorySession.createStorySessionPersistence(storage), storyActive: false, storySession: null,
    storyMatchId: null, storyBattleEncounter: null, pendingStorySettlement: null, battle: null, preBattle: null,
    profileStore: null, profileWrites: Promise.resolve(), saveOK: true, saveProblem: "", profileProblem: "",
    preview: false, view: "self", eraInstant: false, manualZoom: null, settling: false, paused: false,
    speed: 1, lastTime: 0, coachHidden: false, battleStage: 0, pendingFusions: [], labBattleController: createLabBattleController(),
    document: {createElement: tag => new ElementAdapter(tag), body: {classList: {add: noop, remove: noop}}, addEventListener: (type, fn) => events.set(type, fn)},
    window: {confirm: () => true}, $: node, $$: () => [],
    render: noop, renderStorageNotice: noop, resetBuildSnap: noop, afterBuildChange: noop, renderSide: noop,
    renderShop: noop, renderCoach: noop, previewAction: noop, resultModal: noop, rewardModal: noop,
    finishModal: noop, roundIntro: async () => {}, celebrateFusions: noop, tutorialDone: () => true,
    toast: message => toasts.push(message), modalHead: () => "", esc: String,
    openModal: () => { node("#modal").open = true; }, closeModal: () => { node("#modal").open = false; },
    openStoryHub: () => { node("#modal").open = true; },
    V: {palettePreview: type => ({type})},
    audio: {setMusic: noop, setIntensity: noop, sfx: noop}, fx: {reset: noop, update: noop, clear: noop},
    Cer: {showPublish: async () => {}, showVersus: async () => {}, showOutcome: async () => {}},
    particles: {flash: noop, clear: noop, burst: noop, confetti: noop}, traffic: {active: false, start: noop, stop: noop},
    performance: {now: () => 0}, requestAnimationFrame: noop, tick: noop,
    publishLog: () => [], siteCardYou: () => ({}), siteCardFoe: () => ({}),
  };
  vm.runInNewContext(compiled, context);
  return {context, values, storage, toasts, node,
    failWrites(value) { failWrites = value; },
    savedStory: () => JSON.parse(values.get(StorySession.STORY_SAVE_KEY)),
    click(id, dataset = {}) { const target = new ElementAdapter(); target.id = id; target.dataset = dataset; events.get("click")({target}); },
  };
}
function beginStory(host) {
  const c = host.context;
  c.enterStory();
  assert.equal(c.storyCommand({type: "name-page", name: "Boundary QA"}).ok, true);
  c.closeModal();
  // The guaranteed shop costs exactly the actual starting $11, with no grants.
  for (const type of ["ab_heading", "ab_link", "ab_nav"])
    assert.equal(c.editor.commit(() => R.purchase(c.run, type)), true);
  for (const type of ["ab_link", "ab_nav", "ab_heading"]) {
    const item = c.run.owned.find(p => p.type === type), d = D.PARTS[type];
    const w = Math.max(d.minW, Math.min(d.w, 280));
    assert.equal(c.editor.commit(() => { const proposed = {...item, w, h: d.h}; const spot = C.findSpace(c.run.owned, proposed); return !!spot && R.move(c.run, item.id, spot.x, spot.y, w, d.h); }), true);
  }
  assert.equal(c.run.cash, 0);
  return c;
}
async function play(host) {
  const c = host.context;
  await c.start();
  assert.ok(c.battle, host.toasts.join(" "));
  for (let i = 0; i < 5000 && !c.battle.result; i++) c.battle.step(0.05);
  assert.ok(c.battle.result);
  await c.finishBattle();
}
function relabel(c, label) {
  const item = c.run.owned[0];
  assert.ok(item);
  c.editor.select([item.id]);
  // Production part-label change dispatch calls this exact method.
  c.editor.update({label});
  assert.equal(c.run.owned.find(p => p.id === item.id).label, label);
}
function claimFirst(host) {
  const c = host.context;
  c.storyRewardPanel();
  const card = host.node("#story-reward-choices").children[0];
  assert.ok(card, "actual production reward panel rendered choices");
  const button = card.children.find(el => el.tag === "button");
  button.onclick();
  c.closeModal();
}

test("QA: a real story settlement clears both editor stacks before editing resumes", async () => {
  const host = application(), c = beginStory(host);
  relabel(c, "Before combat"); c.editor.undo();
  assert.ok(c.editor.history.length); assert.ok(c.editor.future.length);
  await play(host);
  assert.equal(c.battle.result.winner, "player");
  assert.equal(c.editor.history.length, 0); assert.equal(c.editor.future.length, 0);
  c.leaveBattle(); const settled = clone(c.storySession);
  c.editor.undo(); c.editor.redo();
  assert.deepEqual(c.storySession, settled);
  assert.deepEqual(host.savedStory(), settled);
});

test("QA: paid first-story reward survives edits made before collection and later undo", async t => {
  const host = application(), c = beginStory(host);
  await play(host); assert.equal(c.battle.result.winner, "player");
  c.leaveBattle();
  assert.ok(c.storySession.reward);
  relabel(c, "Edit before collecting earned loot");
  const previousIds = c.run.owned.map(p => p.id);
  claimFirst(host);
  assert.equal(c.storySession.reward, null);
  const earned = c.run.owned.find(p => !previousIds.includes(p.id));
  assert.ok(earned);
  const committed = clone(c.storySession);
  c.editor.undo();
  t.diagnostic(JSON.stringify({earned: {id: earned.id, type: earned.type}, beforeUndo: committed.run.owned.length, afterUndo: c.run.owned.length, reward: c.storySession.reward, completed: c.storySession.story.completedEncounters, valid: StorySession.validateStorySession(host.savedStory())}));
  assert.ok(c.run.owned.some(p => p.id === earned.id), "undo must not delete externally claimed loot while its reward receipt stays consumed");
  assert.deepEqual(host.savedStory().run.owned, committed.run.owned);
});

test("QA: rejected story settlement keeps history disabled and successful retry clears it", async () => {
  const host = application(), c = beginStory(host);
  await c.start();
  for (let i = 0; i < 5000 && !c.battle.result; i++) c.battle.step(0.05);
  host.failWrites(true);
  await c.finishBattle();
  assert.ok(c.pendingStorySettlement); assert.ok(c.editor.history.length);
  const run = clone(c.run), history = clone(c.editor.history);
  c.editor.undo(); c.editor.redo();
  assert.deepEqual(c.run, run); assert.deepEqual(c.editor.history, history);
  host.failWrites(false);
  await c.finishStoryBattle();
  assert.equal(c.pendingStorySettlement, null);
  assert.equal(c.editor.history.length, 0); assert.equal(c.editor.future.length, 0);
});

test("QA: story-to-laboratory and reopening story clear old editor snapshots", () => {
  const host = application(), c = beginStory(host);
  const story = clone(c.storySession);
  assert.ok(c.editor.history.length);
  c.switchMode("lab");
  assert.equal(c.editor.history.length, 0); assert.equal(c.editor.future.length, 0);
  relabel(c, "Lab editor only");
  c.enterStory(); c.closeModal();
  assert.equal(c.editor.history.length, 0); assert.equal(c.editor.future.length, 0);
  c.editor.undo(); c.editor.redo();
  assert.deepEqual(c.storySession, story);
});

test("QA: reopening newer story progress after rejected settlement invalidates pre-battle undo history", async t => {
  const oldTab = application(), old = beginStory(oldTab);
  await old.start();
  assert.ok(old.battle);
  const resumedTab = application(oldTab.values), resumed = resumedTab.context;
  resumed.enterStory();
  const interruptedId = resumed.storySession.story.pendingEncounter.matchId;
  assert.equal(resumed.storyCommand({type: "cancel-encounter", matchId: interruptedId}).ok, true);
  resumed.closeModal();
  await play(resumedTab);
  assert.equal(resumed.battle.result.winner, "player");
  resumed.leaveBattle(); claimFirst(resumedTab);
  const newer = clone(resumed.storySession);
  assert.equal(newer.run.owned.length, 4);
  for (let i = 0; i < 5000 && !old.battle.result; i++) old.battle.step(0.05);
  await old.finishBattle();
  assert.ok(old.pendingStorySettlement);
  oldTab.click("story-use-saved");
  old.closeModal();
  assert.equal(old.pendingStorySettlement, null);
  assert.deepEqual(old.storySession, newer);
  old.editor.undo();
  t.diagnostic(JSON.stringify({committedCash: newer.run.cash, restoredCash: old.run.cash, committedOwned: newer.run.owned.length, restoredOwned: old.run.owned.length, reward: old.storySession.reward, completed: old.storySession.story.completedEncounters, valid: StorySession.validateStorySession(oldTab.savedStory())}));
  assert.deepEqual(old.storySession, newer, "old history must not overwrite a newly reopened settled/claimed run");
  assert.deepEqual(oldTab.savedStory(), newer);
});

test("QA: legacy real battle and next-round shop retain settlement through undo and redo", async () => {
  const host = application(), c = host.context;
  const offer = c.run.shop.find(s => D.PARTS[s.type]?.kind === "attack" && R.purchase(clone(c.run), s.type).ok);
  assert.ok(offer);
  assert.equal(c.editor.commit(() => R.purchase(c.run, offer.type)), true);
  const item = c.run.owned[0];
  assert.equal(c.editor.commit(() => R.move(c.run, item.id, 16, 16)), true);
  relabel(c, "Legacy paid board"); c.editor.undo();
  assert.ok(c.editor.history.length); assert.ok(c.editor.future.length);
  await play(host);
  assert.equal(c.editor.history.length, 0); assert.equal(c.editor.future.length, 0);
  if (c.run.phase === "reward") host.click("", {loot: "skip"});
  else c.leaveBattle();
  assert.ok(c.run.stage > 0);
  const settled = clone(c.run);
  c.editor.undo(); c.editor.redo();
  assert.deepEqual(c.run, settled);
  assert.deepEqual(JSON.parse(host.values.get("qa-boundary-campaign")), settled);
});

test("QA: explicit story import clears undo and redo before restored editing", async () => {
  const host = application(), c = beginStory(host);
  const imported = clone(c.storySession);
  relabel(c, "Not in imported save"); c.editor.undo();
  assert.ok(c.editor.history.length); assert.ok(c.editor.future.length);
  const raw = JSON.stringify(imported);
  await c.importFile({size: raw.length, text: async () => raw});
  c.closeModal();
  assert.equal(c.editor.history.length, 0); assert.equal(c.editor.future.length, 0);
  c.editor.undo(); c.editor.redo();
  assert.deepEqual(c.storySession, imported);
});

test("QA: story start and abort preserve pre-battle editing history when canonical build is unchanged", async () => {
  const host = application(), c = beginStory(host);
  relabel(c, "Retained redo title"); c.editor.undo();
  const run = clone(c.run), history = clone(c.editor.history), future = clone(c.editor.future);
  await c.start();
  assert.ok(c.battle); assert.equal(c.run.phase, "battle");
  assert.deepEqual(clone(c.editor.history), history); assert.deepEqual(clone(c.editor.future), future);
  const matchId = c.storyMatchId;
  c.abort();
  assert.equal(c.battle, null);
  assert.deepEqual(c.run, run);
  assert.ok(c.storySession.cancelledMatches.includes(matchId));
  assert.deepEqual(clone(c.editor.history), history); assert.deepEqual(clone(c.editor.future), future);
  c.editor.redo();
  assert.equal(c.run.owned[0].label, "Retained redo title");
  assert.ok(c.storySession.cancelledMatches.includes(matchId));
});

test("QA: story-only dialogue and rejected story commands preserve editor history", () => {
  const host = application(), c = beginStory(host);
  relabel(c, "Redo after talking"); c.editor.undo();
  const run = clone(c.run), history = clone(c.editor.history), future = clone(c.editor.future);
  assert.equal(c.storyCommand({type: "talk-junk"}).ok, true);
  assert.equal(c.storySession.story.junkMet, true);
  assert.deepEqual(c.run, run);
  assert.deepEqual(clone(c.editor.history), history); assert.deepEqual(clone(c.editor.future), future);
  assert.equal(c.storyCommand({type: "advance-stage"}).ok, false);
  assert.deepEqual(clone(c.editor.history), history); assert.deepEqual(clone(c.editor.future), future);
  c.editor.redo();
  assert.equal(c.run.owned[0].label, "Redo after talking");
  assert.equal(c.storySession.story.junkMet, true);
});

test("QA: rejected story loot persistence preserves the pending reward and editor history", async () => {
  const host = application(), c = beginStory(host);
  await play(host); c.leaveBattle();
  relabel(c, "Pending loot edit"); c.editor.undo();
  const session = clone(c.storySession), history = clone(c.editor.history), future = clone(c.editor.future);
  host.failWrites(true);
  claimFirst(host);
  assert.deepEqual(c.storySession, session);
  assert.deepEqual(host.savedStory(), session);
  assert.deepEqual(clone(c.editor.history), history); assert.deepEqual(clone(c.editor.future), future);
  assert.ok(c.storySession.reward);
  host.failWrites(false);
  c.editor.redo();
  assert.equal(c.run.owned[0].label, "Pending loot edit");
  assert.ok(c.storySession.reward);
});

test("QA: successful story shop reroll is a boundary while a failed saved reroll retains both stacks", async () => {
  const host = application(), c = beginStory(host);
  await play(host); c.leaveBattle(); claimFirst(host);
  relabel(c, "Before shop reroll"); c.editor.undo();
  const session = clone(c.storySession), history = clone(c.editor.history), future = clone(c.editor.future);
  host.failWrites(true);
  host.click("reroll-button");
  assert.deepEqual(c.storySession, session);
  assert.deepEqual(clone(c.editor.history), history); assert.deepEqual(clone(c.editor.future), future);
  host.failWrites(false);
  host.click("reroll-button");
  assert.equal(c.run.cash, session.run.cash - R.REROLL);
  assert.equal(c.run.rerolls, session.run.rerolls + 1);
  const rerolled = clone(c.storySession);
  assert.equal(c.editor.history.length, 0); assert.equal(c.editor.future.length, 0);
  c.editor.undo();
  assert.deepEqual(c.storySession, rerolled);
  c.editor.redo();
  assert.deepEqual(c.storySession, rerolled, "an unrelated old edit must not restore the previous shop or refund the newly committed reroll");
  assert.deepEqual(host.savedStory(), rerolled);
});

test("QA: collecting real story loot invalidates a pre-claim redo branch as well as undo", async () => {
  const host = application(), c = beginStory(host);
  await play(host); c.leaveBattle();
  relabel(c, "Deferred redo label"); c.editor.undo();
  assert.equal(c.editor.future.length, 1);
  claimFirst(host);
  const claimed = clone(c.storySession);
  assert.equal(claimed.run.owned.length, 4); assert.equal(claimed.reward, null);
  c.editor.redo();
  assert.deepEqual(c.storySession, claimed, "redo must not reinstate the pre-claim snapshot and consume the earned item");
  assert.deepEqual(host.savedStory(), claimed);
});
