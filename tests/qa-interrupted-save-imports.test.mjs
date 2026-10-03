import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import D from "../src/data.js";
import C from "../src/document.js";
import R from "../src/run.js";
import * as Story from "../src/story/index.js";
import * as StorySession from "../src/story/session.js";
import { createRunPersistence } from "../src/persistence.js";
import { createLabBattleController } from "../src/lab-audience-control.js";

const clone = value => JSON.parse(JSON.stringify(value));
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const functionNames = ["load", "save", "appOpponent", "commitStorySession", "enterStory", "storyCommand", "importFile", "switchMode", "start"];
function appFunctions() {
  const requestSequence = source.match(/^let importRequestId = 0;/m)?.[0] ?? "";
  return transformSync(requestSequence + "\n" + functionNames.map(name => {
    const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"));
    assert.ok(match, `execute actual app.ts ${name} function`);
    return match[0];
  }).join("\n"), {loader: "ts", target: "es2022"}).code;
}
function deferredFile(value) {
  const raw = JSON.stringify(value);
  let resume;
  const text = new Promise(resolve => { resume = () => resolve(raw); });
  return {file: {size: Buffer.byteLength(raw), text: () => text}, resume};
}
function campaign(name, paid = false) {
  const run = R.newRun("campaign");
  run.seed = 401; run.shop = R.market(run); run.page.name = name;
  if (paid) {
    const offer = run.shop.find(stock => !stock.sold && D.PARTS[stock.type]?.kind === "attack" && R.purchase(clone(run), stock.type).ok);
    assert.ok(offer, "fixture uses a real affordable attack offer");
    const bought = R.purchase(run, offer.type);
    assert.equal(bought.ok, true);
    assert.equal(R.move(run, bought.item.id, 16, 16), true);
  }
  assert.equal(R.validateRun(run), true);
  return run;
}
// Only rendering, ceremonies, and File.text scheduling are adapted. The extracted
// app entry points use real run/story validation, transactions, local journals,
// navigation, battle preparation, and battle engine. This is not browser QA.
function application(initial = campaign("Original page", true)) {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const runPersistence = createRunPersistence(storage, "qa-import-");
  assert.equal(runPersistence.save(initial).ok, true);
  const input = {value: "selected.json"};
  const toasts = [];
  const noop = () => {};
  const context = {
    JSON, Error, structuredClone, clone, R, C, P: D.PARTS, Story, StorySession,
    run: runPersistence.load(initial.mode).run,
    memory: {}, runPersistence, storyPersistence: StorySession.createStorySessionPersistence(storage),
    storyActive: false, storySession: null, storyMatchId: null, storyBattleEncounter: null,
    pendingStorySettlement: null, battle: null, preBattle: null, profileStore: null,
    profileWrites: Promise.resolve(), saveOK: true, saveProblem: "", profileProblem: "",
    preview: false, view: "self", eraInstant: false, manualZoom: null,
    settling: false, paused: false, speed: 1, lastTime: 0, coachHidden: false, battleStage: 0,
    labBattleController: createLabBattleController(),
    editor: {reset: noop, selection: new Set(), pending: null},
    render: noop, renderStorageNotice: noop, resetBuildSnap: noop, closeModal: noop,
    openStoryHub: noop, rewardModal: noop, finishModal: noop, roundIntro: noop,
    tutorialDone: () => true, toast: message => toasts.push(message),
    $: selector => selector === "#import-file" ? input : {textContent: ""}, $$: () => [],
    audio: {setMusic: noop, setIntensity: noop, sfx: noop}, fx: {reset: noop},
    Cer: {showPublish: async () => {}, showVersus: async () => {}},
    publishLog: () => [], siteCardYou: () => ({}), siteCardFoe: () => ({}),
    particles: {flash: noop}, traffic: {start: noop}, performance: {now: () => 0},
    requestAnimationFrame: noop, tick: noop,
  };
  vm.runInNewContext(appFunctions(), context);
  return {...context, context, values, input, toasts,
    saved: mode => JSON.parse(values.get("qa-import-" + mode)),
    savedStory: () => JSON.parse(values.get(StorySession.STORY_SAVE_KEY)),
  };
}

test("QA: an older delayed import cannot overwrite a later selected paid save", async t => {
  const host = application();
  const older = campaign("Earlier selected empty backup");
  const newer = campaign("Latest selected paid backup", true);
  const first = deferredFile(older), second = deferredFile(newer);
  const firstImport = host.context.importFile(first.file);
  const secondImport = host.context.importFile(second.file);
  second.resume(); await secondImport;
  assert.deepEqual(host.context.run, newer, "later selection must really commit first");
  assert.deepEqual(host.saved("campaign"), newer);
  first.resume(); await firstImport;
  t.diagnostic(JSON.stringify({selected: newer.page.name, actual: host.context.run.page.name,
    expectedOwned: newer.owned.length, actualOwned: host.context.run.owned.length,
    journalOwned: host.saved("campaign").owned.length}));
  assert.deepEqual(host.context.run, newer, "late completion of the older selection must not replace the latest paid inventory");
  assert.deepEqual(host.saved("campaign"), newer);
});

test("QA: navigation away and back invalidates a pending import even in the same mode", async t => {
  const host = application();
  const selected = deferredFile(campaign("Stale backup from before navigation"));
  const pending = host.context.importFile(selected.file);
  host.context.switchMode("lab");
  assert.equal(host.context.run.mode, "lab");
  host.context.switchMode("campaign");
  const returned = host.context.run, expected = clone(returned);
  const journal = host.values.get("qa-import-campaign");
  selected.resume(); await pending;
  t.diagnostic(JSON.stringify({returned: expected.page.name, actual: host.context.run.page.name,
    expectedOwned: expected.owned.length, actualOwned: host.context.run.owned.length}));
  assert.equal(host.context.run, returned, "a pending file belongs to the abandoned navigation, not the newly opened campaign");
  assert.equal(host.values.get("qa-import-campaign"), journal);
});

test("QA: starting a new story invalidates an import selected in the previous story", async t => {
  const host = application();
  host.context.enterStory();
  assert.equal(host.context.storyCommand({type: "name-page", name: "Previous journey"}).ok, true);
  const old = clone(host.context.storySession), selected = deferredFile(old);
  const pending = host.context.importFile(selected.file);
  host.context.enterStory(true);
  assert.equal(host.context.storyCommand({type: "name-page", name: "New journey"}).ok, true);
  const current = clone(host.context.storySession);
  const journal = host.values.get(StorySession.STORY_SAVE_KEY);
  selected.resume(); await pending;
  t.diagnostic(JSON.stringify({expected: current.run.page.name, actual: host.context.run.page.name,
    journal: host.savedStory().run.page.name}));
  assert.deepEqual(host.context.storySession, current, "an old read must not silently replace the new named story and its saved session");
  assert.equal(host.values.get(StorySession.STORY_SAVE_KEY), journal);
});

test("QA: an import finishing during a real battle cannot replace its run or journal", async t => {
  const host = application();
  const selected = deferredFile(campaign("Unrelated pre-battle backup"));
  const pending = host.context.importFile(selected.file);
  await host.context.start();
  assert.ok(host.context.battle, "actual app start must create the real engine battle");
  assert.equal(host.context.run.phase, "battle");
  const activeRun = host.context.run, activeBattle = host.context.battle;
  const journal = host.values.get("qa-import-campaign");
  selected.resume(); await pending;
  assert.equal(host.context.battle, activeBattle, "the file completion does not cancel the engine battle");
  for (let tick = 0; tick < 3000 && !activeBattle.result; tick++) activeBattle.step(0.05);
  assert.ok(activeBattle.result);
  const settlement = R.settleBattle(clone(host.context.run), activeBattle);
  t.diagnostic(JSON.stringify({phaseAfterImport: host.context.run.phase,
    runAfterImport: host.context.run.page.name, journalAfterImport: host.saved("campaign").page.name,
    settlementAccepted: settlement.ok, error: settlement.error}));
  assert.equal(host.context.run, activeRun, "late file completion must not detach the running battle from its build");
  assert.equal(host.context.run.phase, "battle");
  assert.equal(host.values.get("qa-import-campaign"), journal);
  assert.equal(settlement.ok, true, "the preserved real battle must remain settleable");
});

test("QA: a current story import commits its valid session and releases the file input", async () => {
  const host = application();
  host.context.enterStory();
  const named = StorySession.commandStorySession(StorySession.createStorySession(), {type: "name-page", name: "Selected story backup"});
  assert.equal(named.ok, true);
  const selected = deferredFile(named.session);
  const pending = host.context.importFile(selected.file);
  selected.resume(); await pending;
  assert.deepEqual(host.context.storySession, named.session);
  assert.deepEqual(host.savedStory(), named.session);
  assert.equal(host.input.value, "", "successful story imports must release the input so the same file can be selected again");
});

test("QA: a paid edit made while the same run is awaiting file text remains current", async t => {
  const host = application();
  const selected = deferredFile(campaign("Backup selected before the new purchase"));
  const pending = host.context.importFile(selected.file);
  const activeRun = host.context.run;
  const offer = activeRun.shop.find(stock => !stock.sold && D.PARTS[stock.type] && R.purchase(clone(activeRun), stock.type).ok);
  assert.ok(offer, "second item is actually offered and affordable");
  assert.equal(R.purchase(activeRun, offer.type).ok, true);
  host.context.save();
  const expected = clone(activeRun), journal = host.values.get("qa-import-campaign");
  selected.resume(); await pending;
  t.diagnostic(JSON.stringify({purchased: offer.type, expectedOwned: expected.owned.length,
    actualOwned: host.context.run.owned.length, sameRun: host.context.run === activeRun}));
  assert.equal(host.context.run, activeRun, "the same run object is still owned by the user's later paid edit");
  assert.deepEqual(host.context.run, expected);
  assert.equal(host.values.get("qa-import-campaign"), journal);
});

test("QA: an old failed read cannot clear the latest pending file or publish a stale error", async () => {
  const host = application();
  let rejectOld;
  const oldText = new Promise((resolve, reject) => { rejectOld = reject; });
  const oldImport = host.context.importFile({size: 20, text: () => oldText});
  const latest = campaign("Latest backup", true), selected = deferredFile(latest);
  host.input.value = "latest.json";
  const latestImport = host.context.importFile(selected.file);
  rejectOld(new Error("Old file read failed"));
  await oldImport;
  assert.equal(host.input.value, "latest.json", "only the current operation owns file-input cleanup");
  assert.deepEqual(host.toasts, [], "stale failures cannot overwrite feedback for the pending selection");
  selected.resume(); await latestImport;
  assert.deepEqual(host.context.run, latest);
  assert.deepEqual(host.saved("campaign"), latest);
  assert.equal(host.input.value, "");
});

async function expectBlockedImport(host) {
  const current = host.context.run, snapshot = clone(current);
  const journal = host.values.get("qa-import-campaign");
  const pendingSettlement = host.context.pendingStorySettlement;
  let reads = 0;
  const raw = JSON.stringify(campaign("Backup selected while blocked"));
  await host.context.importFile({size: raw.length, text: async () => { reads++; return raw; }});
  assert.equal(reads, 0, "a blocked import must not even start File.text");
  assert.equal(host.context.run, current);
  assert.deepEqual(host.context.run, snapshot);
  assert.equal(host.context.pendingStorySettlement, pendingSettlement);
  assert.equal(host.values.get("qa-import-campaign"), journal);
  assert.equal(host.input.value, "", "blocked current request still releases its own input");
  assert.equal(host.toasts.length, 1, "the current blocked request explains why it was not read");
}

test("QA: import initiation during an already active real battle never reads the file", async () => {
  const host = application();
  await host.context.start();
  const battle = host.context.battle;
  assert.ok(battle);
  await expectBlockedImport(host);
  assert.equal(host.context.battle, battle);
});

test("QA: import initiation during a pending result-save never reads the file", async () => {
  const host = application();
  // Valid session marker at the host's persistence-retry boundary. This tests
  // import refusal, not story result production or browser presentation.
  host.context.pendingStorySettlement = StorySession.createStorySession();
  assert.equal(StorySession.validateStorySession(host.context.pendingStorySettlement), true);
  assert.equal(host.context.battle, null, "exercise the pending-save guard independently");
  await expectBlockedImport(host);
});
