import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import D from "../src/data.js";
import R from "../src/run.js";
import * as StorySession from "../src/story/session.js";
import { STORY_WORLD } from "../src/story/content.js";
import { createRunPersistence } from "../src/persistence.js";
import { battleIncomeResult, renderBattleIncomeResult } from "../src/battle-income-result.js";
import { simulateCommerceRecovery } from "../scripts/commerce-recovery.js";

const clone = value => JSON.parse(JSON.stringify(value));
const noop = () => {};
const app = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const functions = ["save", "commitStorySession", "resultModal", "finishBattle", "finishStoryBattle", "leaveBattle"];
const declarations = functions.map(name => {
  const match = app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"));
  assert.ok(match, `execute the actual ${name} application function`);
  return match[0];
}).join("\n");
const modalSource = app.slice(app.indexOf("let modalFeatureDispose:"), app.indexOf("/* ---------- Isolated story profile"));
const compiled = transformSync(modalSource + "\n" + declarations, {loader: "ts", target: "es2022"}).code;
const recovery = simulateCommerceRecovery();
const finish = battle => {
  for (let i = 0; i < 5000 && !battle.result; i++) battle.step(.05);
  assert.ok(battle.result, "the actual engine must reach a result without injected counters");
  return battle;
};
const measure = battle => ({
  grossIncome: battle.player.income,
  routed: battle.metrics.player.routed,
  spent: battle.metrics.player.spent,
  retained: battle.player.parts.reduce((sum, part) => sum + part.charge, 0),
  unconverted: battle.metrics.player.unconverted,
});
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return {promise, resolve};
};
function storyCase(which = "beforeLoss") {
  const matchId = "host-income-" + which;
  const prepared = StorySession.prepareStoryBattle(recovery[which], matchId);
  assert.equal(prepared.ok, true, prepared.error);
  finish(prepared.battle);
  return {...prepared, matchId};
}

// Execute actual settlement, fusion, journal commit, result and leave functions.
// Only DOM, ceremonial delay and page painting are adapted; this is not a
// browser/CSS/focus acceptance claim. The production module supplies the view.
function host({battle, run, session = null, matchId = null}) {
  const values = new Map(), writes = [], dialogs = [], outcomes = [], nodes = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); writes.push({key, value}); },
  };
  const storyPersistence = StorySession.createStorySessionPersistence(storage);
  if (session) assert.equal(storyPersistence.save(session).ok, true);
  const runPersistence = createRunPersistence(storage, "host-income-");
  const queued = [], handlers = new Map();
  const dialog = {
    open: false, classList: {remove: noop, add: noop},
    addEventListener(type, fn) { handlers.set(type, fn); },
    showModal() { this.open = true; },
    close() { if (!this.open) return; this.open = false; queued.push(() => handlers.get("close")?.()); },
  };
  let html = "";
  const content = {
    set innerHTML(value) {
      html = value; dialogs.push(value); nodes.clear();
      for (const [, id] of value.matchAll(/id="([^"]+)"/g)) nodes.set("#" + id, {});
    },
  };
  const context = {
    R, StorySession, STORY_WORLD, P: D.PARTS, clone, battleIncomeResult, renderBattleIncomeResult,
    run: clone(run ?? session.run), battle, storySession: session ? clone(session) : null,
    storyActive: !!session, storyMatchId: matchId, storyBattleEncounter: null,
    storyPersistence, runPersistence, pendingStorySettlement: null, pendingFusions: [],
    battleStage: run?.stage ?? session?.run.stage ?? 0, preBattle: null, settling: true,
    saveOK: true, saveProblem: "", profileProblem: "", profileStore: null,
    profileWrites: Promise.resolve(), memory: {}, preview: false, view: "self", manualZoom: null,
    editor: {history: ["old"], future: ["old"], reset() { this.history = []; this.future = []; }},
    document: {body: {classList: {remove: noop}}},
    $: selector => selector === "#modal" ? dialog : selector === "#modal-content" ? content : nodes.get(selector),
    esc: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    modalHead: (title, subtitle) => `<h2>${title}: ${subtitle}</h2><button data-close-modal>閉じる</button>`,
    render: noop, renderSide: noop, renderStorageNotice: noop, resetBuildSnap: noop,
    toast(message) { throw new Error("Unexpected app failure: " + message); },
    fx: {update: noop, clear: noop}, traffic: {active: false, stop: noop},
    audio: {setMusic: noop}, particles: {confetti: noop, clear: noop},
    roundIntro: async () => {}, celebrateFusions: noop, openStoryHub: noop,
    Cer: {showOutcome(data) { const pending = deferred(); outcomes.push({...pending, data}); return pending.promise; }},
  };
  if (session) context.run.phase = "battle";
  vm.runInNewContext(compiled, context);
  return {c: context, values, writes, dialogs, outcomes, dialog,
    get html() { return html; },
    flushClose() { while (queued.length) queued.shift()(); },
  };
}
function readLedger(html) {
  const root = parseFragment(html);
  const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)];
  const all = walk(root), text = node => walk(node).filter(n => n.nodeName === "#text").map(n => n.value).join("");
  const details = all.filter(node => node.tagName === "details" && node.attrs.some(a => a.name === "class" && a.value.split(/\s+/).includes("battle-income-result")));
  assert.equal(details.length, 1, "the actual result modal must contain one real battle-income fragment");
  assert.ok(!details[0].attrs.some(a => a.name === "open"), "income details must start collapsed");
  const labels = ["戦闘中の総収益", "受け入れたチャージ", "消費したチャージ", "終了時のチャージ残量", "チャージに入らなかった収益"];
  const amounts = labels.map(label => {
    const row = walk(details[0]).find(node => node.tagName === "div" && node.childNodes?.some(child => child.tagName === "span" && text(child) === label));
    assert.ok(row, `actual result row: ${label}`);
    const amount = row.childNodes.find(child => child.tagName === "b");
    return Number(text(amount).replace("$", "").replaceAll(",", ""));
  });
  return Object.fromEntries(["grossIncome", "routed", "spent", "retained", "unconverted"].map((key, index) => [key, amounts[index]]));
}

test("actual story loss result shows its 41 gross/zero charge ledger alongside the unchanged $10 capped income payout", async () => {
  const prepared = storyCase();
  const original = structuredClone(prepared.battle);
  const expected = StorySession.settleStoryBattle(prepared.session, prepared.matchId, prepared.battle);
  assert.equal(expected.ok, true);
  const h = host(prepared), pending = h.c.finishBattle();
  assert.equal(h.outcomes.length, 1);
  assert.equal(h.dialogs.length, 0, "result waits for its ceremony");
  h.outcomes[0].resolve(); await pending;
  assert.deepEqual(readLedger(h.html), {grossIncome:41,routed:0,spent:0,retained:0,unconverted:41});
  assert.match(h.html, /基本収入 \$6 ＋ 勝利 \$0 ＋ 収益 \$10 = \$16/);
  assert.deepEqual(h.c.storySession, expected.session, "presentation cannot change settlement/schema");
  assert.deepEqual(h.c.run, expected.session.run);
  assert.deepEqual(h.c.storyPersistence.load().session, expected.session, "actual journal retains original paid settlement");
  assert.deepEqual(structuredClone(prepared.battle), original);
});

test("actual legal story retry reports 42 gross, 23 routed, 21 spent, 2 retained and 19 unconverted without changing payout or saves", async () => {
  const prepared = storyCase("beforeRetry"), before = structuredClone(prepared.battle);
  const expected = StorySession.settleStoryBattle(prepared.session, prepared.matchId, prepared.battle);
  assert.equal(expected.ok, true);
  const h = host(prepared), pending = h.c.finishBattle();
  h.outcomes[0].resolve(); await pending;
  assert.deepEqual(readLedger(h.html), {grossIncome:42,routed:23,spent:21,retained:2,unconverted:19});
  assert.match(h.html, /基本収入 \$6 ＋ 勝利 \$4 ＋ 収益 \$10 = \$20/);
  assert.deepEqual(h.c.storySession, expected.session);
  assert.deepEqual(h.c.storyPersistence.load().session, expected.session);
  assert.deepEqual(clone(h.c.pendingFusions), clone(expected.fusions ?? []));
  assert.deepEqual(structuredClone(prepared.battle), before);
  assert.equal(h.c.storySession.run.history.length, prepared.session.run.history.length + 1);
});

function regularCase(mode = "campaign", preset = "commerce") {
  const run = mode === "campaign" ? clone(recovery.beforeLoss.run) : R.newRun("lab", preset);
  const started = R.startBattle(run);
  assert.equal(started.ok, true, started.error);
  return {run, battle: finish(started.battle)};
}
function expectedRegular(prepared) {
  const run = clone(prepared.run);
  const result = R.settleBattle(run, prepared.battle);
  assert.equal(result.ok, true, result.error);
  const fusions = run.phase !== "gameover" ? R.fuse(run) : [];
  result.summary.visitors = null;
  return {run, summary: result.summary, fusions};
}
for (const [mode, preset] of [["campaign", "commerce"], ["lab", "commerce"], ["lab", "mixed"]]) {
  test(`actual ${mode}/${preset} result uses finished battle data while retaining settlement, fusion and save contents`, async () => {
    const prepared = regularCase(mode, preset), expected = expectedRegular(prepared);
    const measured = measure(prepared.battle), before = structuredClone(prepared.battle);
    assert.ok(measured.grossIncome > 0);
    if (mode === "lab" && preset === "commerce") assert.ok(measured.routed > 0 && measured.spent > 0);
    if (mode === "lab" && preset === "mixed") assert.ok(expected.fusions.length > 0, "exercise an actual post-battle fusion");
    const h = host(prepared), pending = h.c.finishBattle();
    assert.equal(h.outcomes.length, 1); assert.equal(h.dialogs.length, 0);
    h.outcomes[0].resolve(); await pending;
    assert.deepEqual(readLedger(h.html), measured);
    assert.deepEqual(h.c.run, expected.run, "unchanged actual settlement and fused inventory");
    assert.deepEqual(clone(h.c.pendingFusions), clone(expected.fusions));
    assert.deepEqual(JSON.parse(h.values.get("host-income-" + mode)), expected.run, "actual saved schema is unchanged");
    assert.deepEqual(structuredClone(prepared.battle), before, "presentation cannot alter battle counters");
    assert.equal(h.c.run.cash - prepared.run.cash, expected.summary.total);
    if (mode === "campaign") assert.match(h.html, /サイト収益：戦闘中に稼いだ \$[^]*の半分（上限 \$10）/);
    else assert.equal(expected.summary.total, 0, "laboratory ledger does not introduce a cash reward");
  });
}

test("an old BattleSummary alone cannot invent a charge ledger or borrow the current battle", async () => {
  const prepared = regularCase(), h = host(prepared), pending = h.c.finishBattle();
  h.outcomes[0].resolve(); await pending;
  assert.deepEqual(readLedger(h.html), measure(prepared.battle));
  const historical = clone(h.c.run.history.at(-1));
  const before = clone(historical);
  h.c.leaveBattle();
  h.c.resultModal(historical);
  assert.doesNotMatch(h.html, /battle-income-result|受け入れたチャージ|消費したチャージ|チャージに入らなかった収益/);
  h.c.battle = regularCase("lab").battle;
  h.c.resultModal(historical);
  assert.doesNotMatch(h.html, /battle-income-result|受け入れたチャージ|消費したチャージ/);
  assert.deepEqual(historical, before, "rendering does not add historical accounting fields");
});

for (const kind of ["story", "campaign", "lab"]) {
  test(`the ${kind} host captures numeric results before the outcome promise can expose later mutable battle state`, async () => {
    const prepared = kind === "story" ? storyCase("beforeRetry") : regularCase(kind);
    const expected = measure(prepared.battle), h = host(prepared), pending = h.c.finishBattle();
    assert.equal(h.outcomes.length, 1);
    const savedBefore = [...h.values], runBefore = clone(h.c.run);
    // Deliberate adversarial mutation occurs only after the real finished result
    // was settled. The view must already be detached before this async boundary.
    prepared.battle.player.income = 901;
    prepared.battle.metrics.player.routed = 902;
    prepared.battle.metrics.player.spent = 903;
    prepared.battle.metrics.player.unconverted = 904;
    for (const part of prepared.battle.player.parts) part.charge = 905;
    h.outcomes[0].resolve(); await pending;
    assert.deepEqual(readLedger(h.html), expected);
    assert.deepEqual(h.c.run, runBefore);
    assert.deepEqual([...h.values], savedBefore, "resuming presentation performs no new journal write");
  });
  test(`leaving a ${kind} battle during its ceremony cannot reopen a stale income result`, async () => {
    const prepared = kind === "story" ? storyCase() : regularCase(kind);
    const h = host(prepared), pending = h.c.finishBattle();
    assert.equal(h.outcomes.length, 1);
    h.c.leaveBattle(); h.flushClose();
    const before = clone(h.c.run), savedBefore = [...h.values];
    h.outcomes[0].resolve(); await pending;
    assert.equal(h.c.battle, null);
    assert.equal(h.dialog.open, false);
    assert.equal(h.dialogs.length, 0, "closed battle cannot open any stale result");
    assert.deepEqual(h.c.run, before);
    assert.deepEqual([...h.values], savedBefore);
  });
  test(`a late ${kind} outcome cannot replace a new run's finished result or attach its old ledger`, async () => {
    const prepared = kind === "story" ? storyCase() : regularCase(kind);
    const h = host(prepared), oldPending = h.c.finishBattle();
    assert.equal(h.outcomes.length, 1);
    h.c.leaveBattle();
    const replacement = regularCase("lab", "mixed");
    h.c.storyActive = false; h.c.storySession = null; h.c.storyMatchId = null;
    h.c.run = replacement.run; h.c.battle = replacement.battle;
    const newPending = h.c.finishBattle();
    assert.equal(h.outcomes.length, 2);
    h.outcomes[1].resolve(); await newPending;
    assert.deepEqual(readLedger(h.html), measure(replacement.battle));
    const html = h.html, before = clone(h.c.run), savedBefore = [...h.values];
    h.outcomes[0].resolve(); await oldPending; h.flushClose();
    assert.equal(h.html, html, "old outcome cannot overwrite the new result");
    assert.equal(h.dialogs.length, 1, "only the current battle owns a result modal");
    assert.equal(h.c.battle, replacement.battle);
    assert.deepEqual(h.c.run, before);
    assert.deepEqual([...h.values], savedBefore);
  });
}
