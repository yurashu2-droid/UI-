import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import { IDBFactory } from "fake-indexeddb";
import D from "../src/data.js";
import R from "../src/run.js";
import * as StorySession from "../src/story/session.js";
import { createDeferredMount } from "../src/feature-loader.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { createProfileStore } from "../src/profile-store.js";
import { reconstructLocalCode } from "../src/raid/local-code.js";
import { createFixtureRaid } from "../src/raid/fixtures.js";
import { createRaidEnemy, prepareRaidRewards, verifyRaidBlueprint } from "../src/raid/blueprint.js";
import { registerRaidBlueprint } from "../src/raid/registry.js";
import { mountRaidPanel } from "../src/raid/panel.js";
import { createLocalRaidSelection } from "../src/raid/local-selection.js";
import { ElementAdapter, deferred, settle, until } from "./helpers/local-import-dom.mjs";

// Execute the actual app modal, deferred-loader, raid callbacks and battle bridge.
// Only drawing/frame scheduling and optional module/store boundaries are adapted.
// This establishes host ownership and dispatch, not browser file-picker, paint or AT acceptance.
// A saved source path permits RED verification without reverting shared production files.
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
function declaration(name, optional = false) {
  const found = source.match(new RegExp(`^(?:async )?function ${name}[^]*?^}`, "m"))?.[0];
  assert.ok(optional || found, `actual app declaration: ${name}`);
  return found ?? "";
}
const modalStart = source.indexOf("let modalFeatureDispose:"), modalEnd = source.indexOf("/* ---------- Isolated story profile", modalStart);
assert.ok(modalStart >= 0 && modalEnd > modalStart);
const compiled = transformSync([
  source.slice(modalStart, modalEnd),
  declaration("deferredModalFeature"), declaration("localRaidEditingAllowed", true),
  declaration("playRaidChallenge"), declaration("raidPanel"),
].join("\n"), { loader: "ts", target: "es2022" }).code.replace('import("./raid/panel.js")', "loadRaidModule()");
assert.ok(!compiled.includes('import("./raid/panel.js")'));

class AppElement extends ElementAdapter {
  constructor(tag, doc) {
    super(tag, doc);
    this.style.setProperty = (key, value) => { this.style[key] = value; };
  }
  matches(selector) {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector === "dialog[open]") return this.tagName === "DIALOG" && this.open;
    return super.matches(selector);
  }
  setAttribute(name, value) {
    super.setAttribute(name, value);
    if (name === "id") this.id = value;
    if (name === "class") this.className = value;
    if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  set innerHTML(markup) {
    // Parse only trusted app-authored markup into inert test nodes. Never execute HTML.
    const convert = tree => {
      const node = this.ownerDocument.createElement(tree.tagName ?? "span");
      if (tree.nodeName === "#text") node.textContent = tree.value;
      for (const attr of tree.attrs ?? []) node.setAttribute(attr.name, attr.value);
      node.append(...(tree.childNodes ?? []).map(convert));
      return node;
    };
    this.replaceChildren(...parseFragment(markup).childNodes.map(convert));
  }
}

function namedStory() {
  const result = StorySession.commandStorySession(StorySession.createStorySession(), { type: "name-page", name: "App boundary" });
  assert.equal(result.ok, true);
  return result.session;
}
function armedCampaign() {
  const run = namedStory().run;
  const purchase = R.purchase(run, "ab_heading");
  assert.equal(purchase.ok, true);
  assert.equal(R.move(run, purchase.item.id, 32, 24), true);
  assert.equal(R.validateRun(run), true);
  return run;
}
const localResult = await reconstructLocalCode({ html: new TextEncoder().encode("<title>Host Boundary</title><h1>Local heading</h1><a href='/'>Menu</a>"), capturedAt: "2026-10-03T12:00:00.000Z" });
assert.equal(localResult.ok, true, localResult.error);
const localBlueprint = localResult.value;
const publicBlueprint = JSON.parse(readFileSync(new URL("../fixtures/raid/compatibility/books-before-child-selectors.json", import.meta.url), "utf8"));
const fixtureBlueprint = await createFixtureRaid("archive");
for (const blueprint of [localBlueprint, publicBlueprint, fixtureBlueprint]) assert.equal((await verifyRaidBlueprint(blueprint)).ok, true);
const resume = (blueprint, battleId) => ({ blueprint, battleId, winner: "player" });
const localPending = resume(localBlueprint, "a_local_host_reward");
const publicPending = resume(publicBlueprint, "b_public_host_reward");
const fixturePending = resume(fixtureBlueprint, "c_fixture_host_reward");
const localReward = prepareRaidRewards(localBlueprint, localPending.battleId)[0];

function environment(options = {}) {
  const doc = new EventTarget();
  doc.createElement = tag => new AppElement(tag, doc);
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  doc.querySelector = selector => doc.body.querySelector(selector);
  const dialog = doc.createElement("dialog"), content = doc.createElement("div"), queuedClose = [];
  dialog.id = "modal"; content.id = "modal-content"; doc.body.append(dialog); dialog.append(content); dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { if (!dialog.open) return; dialog.open = false; queuedClose.push(() => dialog.dispatchEvent(new Event("close"))); };
  const calls = { mounts: [], captures: [], preparations: [], registrations: [], claims: [], discards: [], victories: [], renders: 0, disposals: 0, frames: 0, drawings: 0, commits: 0 };
  const pending = options.pending ?? [];
  const store = options.store ?? {
    listPendingRaids: () => options.list?.() ?? Promise.resolve(pending),
    claimRaidReward: async (...args) => { calls.claims.push(args); return options.claim ? options.claim(...args) : { created: true }; },
    discardRaidVictory: async id => { calls.discards.push(id); },
    recordRaidVictory: async (...args) => { calls.victories.push(args); },
  };
  const frameQueue = new Map(); let frameId = 0;
  const context = {
    Error, JSON, Promise, AbortController, structuredClone, clone: structuredClone,
    document: doc, D, R, createDeferredMount, createRaidEnemy,
    run: options.run ?? R.newRun("lab"), storyActive: false, storySession: null,
    battle: null, preview: false, settling: false, pendingStorySettlement: null, view: "self",
    profileStore: store, profileWrites: Promise.resolve(),
    $: selector => { const found = doc.querySelector(selector); assert.ok(found, `app element ${selector}`); return found; },
    renderSide() {}, modalHead: () => '<button data-close-modal>閉じる</button>', toast() {},
    render() { calls.renders++; },
    commitStorySession(session) { calls.commits++; context.storySession = session; context.run = structuredClone(session.run); },
    StorySession: { ...StorySession, cacheStoryAnalysis(...args) { calls.captures.push(args); return StorySession.cacheStoryAnalysis(...args); } },
    prepareRaidChallenge(...args) { calls.preparations.push(args); return prepareRaidChallenge(...args); },
    async registerRaidBlueprint(blueprint) { calls.registrations.push(blueprint); await options.register?.(blueprint); return registerRaidBlueprint(blueprint); },
    V: { render() { calls.drawings++; } }, renderRaidAppearance() {},
    performance: { now: () => 0 },
    requestAnimationFrame(callback) { calls.frames++; frameQueue.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frameQueue.delete(id); },
    ResizeObserver: class { observe() {} disconnect() {} },
    applyCombatFeedback() {}, combatFeedback() {}, targetCaption() {}, setTimeout,
    loadRaidModule: async () => ({
      createLocalRaidSelection,
      mountRaidPanel(host, callbacks, saved, initialRequest) {
        calls.mounts.push({ host, callbacks, resume: saved, initialRequest });
        const panel = options.realPanel ? mountRaidPanel(host, callbacks, saved, initialRequest) : { dispose() {} };
        return { dispose() { calls.disposals++; panel.dispose(); } };
      },
    }),
  };
  Object.assign(context, options.state);
  vm.runInNewContext(compiled + "\nglobalThis.api={raidPanel,openModal,closeModal};", context);
  return {
    c: context, api: context.api, calls, store, dialog, content, doc,
    get mount() { return calls.mounts.at(-1); },
    async open(initial) { await context.api.raidPanel(initial); return calls.mounts.at(-1); },
    close() { context.api.closeModal(); },
    flushClose() { while (queuedClose.length) queuedClose.shift()(); },
    snapshot() { return JSON.stringify({ run: context.run, story: context.storySession }); },
    async finishBattle() {
      let now = 0;
      for (let ticks = 0; ticks < 1500 && frameQueue.size; ticks++) {
        const callbacks = [...frameQueue.values()]; frameQueue.clear(); now += 100;
        for (const callback of callbacks) callback(now);
      }
      assert.equal(frameQueue.size, 0, "the real challenge engine reached its terminal state");
      await settle();
    },
  };
}

const invalidations = {
  "run replacement": f => { f.c.run = R.newRun("lab"); },
  "story session replacement": f => { f.c.storySession = namedStory(); },
  "story activation": f => { f.c.storyActive = true; },
  "profile replacement": f => { f.c.profileStore = {}; },
  "native close before its event": f => { f.dialog.close(); assert.equal(f.mount.host.isConnected, true); },
  "host detachment": f => { f.mount.host.remove(); },
  "modal replacement": f => { f.api.openModal("Replacement panel"); },
  "explicit close": f => f.close(),
};
const blockers = {
  campaign: f => { f.c.run = R.newRun("campaign"); },
  story: f => { f.c.storyActive = true; f.c.storySession = namedStory(); },
  "global battle": f => { f.c.battle = {}; },
  preview: f => { f.c.preview = true; },
  settling: f => { f.c.settling = true; },
  "pending story settlement": f => { f.c.pendingStorySettlement = namedStory(); },
  "non-build phase": f => { f.c.run.phase = "battle"; },
};
const rejects = callback => assert.rejects(Promise.resolve().then(callback));
function recoveryNote(f, count) {
  const note = f.mount.host.querySelector(".raid-local-pending-note");
  assert.ok(note, "recovery notice survives the real panel's replacement of its host");
  assert.equal(note.dataset.localPendingCount, String(count));
  assert.equal(note.hidden, false); assert.equal(note.isConnected, true);
  assert.match(note.textContent, /ローカル/); assert.match(note.textContent, /実験室/);
  assert.match(note.textContent, /受け取|回収|復旧/);
  assert.match(note.textContent, /読み込み時点/, "the count is explicitly a loading-time snapshot");
  return note;
}

// Removing the app opt-in must fail even though the standalone panel has its own guard.
test("actual raid host exposes a live local-import gate only for an editable non-story lab", async t => {
  const good = environment(); await good.open();
  assert.equal(typeof good.mount.callbacks.isLocalImportAllowed, "function", "app explicitly supplies the local-import gate");
  assert.equal(good.mount.callbacks.isLocalImportAllowed(), true);
  good.close();
  for (const [name, block] of Object.entries(blockers)) await t.test(name, async () => {
    const f = environment(); block(f); const before = f.snapshot(); await f.open();
    assert.equal(f.mount.callbacks.isLocalImportAllowed?.(), false);
    assert.equal(f.snapshot(), before); assert.equal(f.calls.claims.length, 0);
  });
});

test("actual callback ownership is invalid immediately across close, run, story, store and host changes", async t => {
  for (const [name, invalidate] of Object.entries(invalidations)) await t.test(name, async () => {
    const f = environment(); await f.open(); const callback = f.mount.callbacks;
    invalidate(f); const before = f.snapshot();
    assert.equal(callback.isLocalImportAllowed?.(), false, name);
    await rejects(() => callback.onChallenge(localBlueprint));
    const result = await callback.onClaim(localReward, localBlueprint);
    assert.equal(result.ok, false, name);
    assert.equal(f.calls.preparations.length, 0, "reject before preparing real combat");
    assert.equal(f.calls.registrations.length, 0); assert.equal(f.calls.claims.length, 0);
    assert.equal(f.snapshot(), before); assert.equal(f.calls.renders, 0);
    f.flushClose();
  });
});

test("injected local challenge and claim callbacks reject every closed app gate before combat or storage", async t => {
  for (const [name, block] of Object.entries(blockers)) await t.test(name, async () => {
    const f = environment(); await f.open(); block(f); const before = f.snapshot();
    const outcome = Promise.resolve().then(() => f.mount.callbacks.onChallenge(localBlueprint)).then(value => ({ value }), error => ({ error }));
    await settle();
    assert.equal(f.calls.preparations.length, 0, "app gate rejects before real battle preparation");
    assert.ok((await outcome).error);
    assert.equal((await f.mount.callbacks.onClaim(localReward, localBlueprint)).ok, false);
    assert.equal(f.calls.preparations.length, 0); assert.equal(f.calls.registrations.length, 0);
    assert.equal(f.calls.claims.length, 0); assert.equal(f.calls.frames, 0);
    assert.equal(f.snapshot(), before);
  });
});

test("injected local onCaptured cannot enter story energy or cache handling", async () => {
  const session = namedStory(), f = environment({ state: { storyActive: true, storySession: session, run: structuredClone(session.run) } });
  await f.open(); const before = f.snapshot();
  for (const kind of ["new", "reanalyze"]) await rejects(() => f.mount.callbacks.onCaptured(localBlueprint, kind));
  assert.equal(f.calls.captures.length, 0, "app rejects local before even invoking story analysis");
  assert.equal(f.calls.commits, 0); assert.equal(f.calls.renders, 0); assert.equal(f.snapshot(), before);
});

test("public and fixture app captures preserve real story analysis receipts and energy", async t => {
  for (const blueprint of [publicBlueprint, fixtureBlueprint]) await t.test(blueprint.source.kind, async () => {
    const session = namedStory(), f = environment({ state: { storyActive: true, storySession: session, run: structuredClone(session.run) } });
    await f.open(); const energy = session.story.analysisEnergy, run = JSON.stringify(f.c.run);
    await f.mount.callbacks.onCaptured(blueprint, "new");
    assert.equal(f.calls.captures.length, 1); assert.equal(f.calls.commits, 1);
    assert.equal(f.c.storySession.story.analysisEnergy, energy - 1);
    assert.equal(JSON.stringify(f.c.run), run);
    assert.equal(StorySession.findStoryCapture(f.c.storySession, blueprint.source.displayUrl)?.captureId, blueprint.captureId);
  });
});

// A pending local record must never shadow an eligible public reward or be discarded.
test("outside lab pending local rewards stay durable while the first public or fixture reward resumes", async t => {
  for (const state of ["campaign", "story", "blocked lab"]) await t.test(state, async () => {
    const pending = [localPending, publicPending, fixturePending], before = JSON.stringify(pending);
    const f = environment({ pending, run: R.newRun(state === "campaign" ? "campaign" : "lab") });
    if (state === "story") { f.c.storyActive = true; f.c.storySession = namedStory(); }
    if (state === "blocked lab") f.c.preview = true;
    await f.open();
    assert.equal(f.mount.resume?.battleId, publicPending.battleId, "first eligible pending reward retains priority");
    recoveryNote(f, 1);
    assert.equal(f.calls.discards.length, 0); assert.equal(f.calls.claims.length, 0); assert.equal(JSON.stringify(pending), before);
  });
});

test("unavailable local-only reward leaves no resume and a visible recoverable-in-lab notice", async () => {
  const f = environment({ pending: [localPending], run: R.newRun("campaign"), realPanel: true });
  await f.open(); await settle();
  assert.equal(f.mount.resume, undefined);
  recoveryNote(f, 1);
  assert.equal(f.calls.discards.length, 0); f.close();
});

test("allowed lab resumes the original first local reward without a misleading recovery notice", async () => {
  const f = environment({ pending: [localPending, publicPending] }); await f.open();
  assert.equal(f.mount.resume?.battleId, localPending.battleId);
  assert.equal(f.mount.host.querySelector(".raid-local-pending-note"), null);
  assert.equal(f.calls.discards.length, 0);
});

test("pending-load completion cannot mount into a native-closed connected raid host", async () => {
  const listing = deferred(), f = environment({ list: () => listing.promise });
  const opening = f.api.raidPanel(); await settle();
  const host = f.doc.querySelector("#raid-feature-host");
  f.dialog.close(); assert.equal(host.isConnected, true);
  const before = host.textContent;
  listing.resolve([localPending]); await opening;
  assert.equal(f.calls.mounts.length, 0); assert.equal(host.textContent, before);
  assert.equal(f.calls.discards.length, 0); f.flushClose();
});

test("pending-load delivery rechecks owner run and store before mounting", async t => {
  for (const change of ["run", "store"]) await t.test(change, async () => {
    const listing = deferred(), f = environment({ list: () => listing.promise });
    const opening = f.api.raidPanel(); await settle();
    if (change === "run") f.c.run = R.newRun("lab"); else f.c.profileStore = {};
    listing.resolve([localPending, publicPending]); await opening;
    assert.equal(f.calls.mounts.length, 0, "stale load must not mount against replacement owner");
    assert.equal(f.calls.discards.length, 0);
  });
});

test("pending-load delivery filters by the live lab gate instead of its initial value", async () => {
  const listing = deferred(), f = environment({ list: () => listing.promise });
  const opening = f.api.raidPanel(); await settle(); f.c.preview = true;
  listing.resolve([localPending, publicPending]); await opening;
  assert.equal(f.mount.resume?.battleId, publicPending.battleId);
  assert.equal(f.mount.callbacks.isLocalImportAllowed?.(), false);
  assert.match(f.content.textContent, /実験室/);
});

test("local claim rechecks current ownership after queued profile writes before calling the store", async t => {
  for (const [name, invalidate] of Object.entries({ ...invalidations, ...blockers })) await t.test(name, async () => {
    const writes = deferred(), f = environment(); await f.open(); f.c.profileWrites = writes.promise;
    const claiming = f.mount.callbacks.onClaim(localReward, localBlueprint); await settle();
    assert.equal(f.calls.claims.length, 0); invalidate(f); const before = f.snapshot();
    writes.resolve(); const result = await claiming;
    assert.equal(result.ok, false, name); assert.equal(f.calls.claims.length, 0);
    assert.equal(f.calls.registrations.length, 0); assert.equal(f.snapshot(), before);
  });
});

test("local battle rechecks owner after async registration before any drawing or frames", async t => {
  for (const [name, invalidate] of Object.entries({ ...invalidations, ...blockers })) await t.test(name, async () => {
    const registration = deferred(), f = environment({ register: () => registration.promise }); await f.open();
    const playing = f.mount.callbacks.onChallenge(localBlueprint);
    let completed;
    const outcome = playing.then(value => (completed = { value }), error => (completed = { error }));
    await settle(); assert.equal(f.calls.preparations.length, 1); assert.equal(f.calls.registrations.length, 1);
    invalidate(f); const before = f.snapshot(); registration.resolve();
    await until(() => completed || f.calls.drawings > 0);
    assert.equal(f.calls.drawings, 0, name); assert.equal(f.calls.frames, 0, name);
    assert.ok((await outcome).error, "stale local challenge is rejected");
    assert.equal(f.calls.victories.length, 0); assert.equal(f.snapshot(), before);
  });
});

test("accepted local claim may finish durably after close without stale UI or replacement-profile writes", async () => {
  const committed = deferred(), f = environment({ claim: () => committed.promise }); await f.open();
  const originalRun = f.c.run, before = f.snapshot(), claiming = f.mount.callbacks.onClaim(localReward, localBlueprint);
  await settle(); assert.equal(f.calls.claims.length, 1);
  f.close(); f.c.run = R.newRun("campaign"); const replacement = f.snapshot(); f.c.profileStore = {};
  committed.resolve({ created: true }); const result = await claiming;
  assert.equal(result.ok, true, "already accepted durable claim is not falsely rolled back");
  assert.equal(f.calls.claims[0][0].mode, "lab"); assert.notEqual(f.calls.claims[0][0], originalRun);
  assert.equal(f.calls.claims[0][3].writeRunProfile, true);
  assert.equal(f.calls.registrations.length, 0, "closed host must not register stale completion UI");
  assert.equal(f.calls.renders, 0); assert.equal(f.snapshot(), replacement);
  assert.equal(JSON.stringify({ run: originalRun, story: null }), before);
});

test("public and fixture campaign claims keep the existing writeRunProfile routing", async t => {
  for (const story of [false, true]) for (const blueprint of [publicBlueprint, fixtureBlueprint]) await t.test(`${story ? "story" : "campaign"} ${blueprint.source.kind}`, async () => {
    const f = environment({ run: R.newRun("campaign"), state: { storyActive: story, storySession: story ? namedStory() : null } }); await f.open();
    const before = f.snapshot(), reward = prepareRaidRewards(blueprint, "public_host_claim")[0];
    const result = await f.mount.callbacks.onClaim(reward, blueprint);
    assert.equal(result.ok, true); assert.equal(f.calls.claims.length, 1);
    assert.equal(f.calls.claims[0][3].writeRunProfile, !story);
    assert.equal(f.calls.registrations.length, 1); assert.equal(f.snapshot(), before);
  });
});

test("app-resumed local reward claims once through the real store and cannot rechallenge after mode replacement", async t => {
  const previousElement = globalThis.Element; globalThis.Element = ElementAdapter;
  t.after(() => { if (previousElement === undefined) delete globalThis.Element; else globalThis.Element = previousElement; });
  const store = createProfileStore(new IDBFactory(), "app-local-resume");
  await store.recordRaidVictory(localBlueprint, localPending.battleId);
  const f = environment({ store, realPanel: true }); await f.open();
  assert.equal(f.mount.callbacks.isLocalImportAllowed?.(), true, "resumed local claim requires the actual app opt-in");
  await until(() => /保存済みの勝利/.test(f.content.textContent));
  const before = f.snapshot(), target = f.mount.host.querySelector("[data-component-id]");
  assert.ok(target); const event = new Event("click"); Object.defineProperty(event, "target", { value: target });
  f.mount.host.querySelector(".raid-canvas").dispatchEvent(event);
  await until(() => /個人コレクションへ保存しました/.test(f.content.textContent));
  assert.equal((await store.listPendingRaids()).length, 0); assert.equal((await store.listTrophies()).length, 1);
  assert.equal(f.snapshot(), before);
  f.c.run = R.newRun("campaign");
  const challenge = f.mount.host.querySelectorAll("button").find(button => button.textContent === "このページに挑戦");
  assert.ok(challenge); challenge.dispatchEvent(new Event("click")); await settle();
  assert.equal(f.calls.preparations.length, 0); assert.equal((await store.listTrophies()).length, 1);
  f.close();
});

test("permitted local app bridge renders its local label and records a real cloned-run victory", async () => {
  const f = environment(); await f.open(); const before = f.snapshot();
  const playing = f.mount.callbacks.onChallenge(localBlueprint);
  await until(() => f.calls.frames > 0);
  const live = f.mount.host.querySelector(".raid-live-battle");
  assert.ok(live); assert.match(live.textContent, /ローカルHTMLの近似UI/);
  assert.doesNotMatch(live.textContent, /\$\{|blueprint\.source/);
  assert.match(live.querySelector(".raid-approximation").textContent, /元ページやJavaScriptは実行しません/);
  await f.finishBattle(); const result = await playing;
  assert.equal(result.winner, "player"); assert.equal(f.calls.victories.length, 1);
  assert.equal(f.calls.victories[0][0].captureId, localBlueprint.captureId);
  assert.equal(f.calls.victories[0][1], result.battleId);
  assert.equal(f.calls.captures.length, 0); assert.equal(f.calls.claims.length, 0);
  assert.equal(f.snapshot(), before); assert.equal(f.mount.host.querySelector(".raid-live-battle"), null);
  f.close();
});

test("public and fixture app bridges still start campaign combat with the local gate closed", async t => {
  for (const blueprint of [publicBlueprint, fixtureBlueprint]) await t.test(blueprint.source.kind, async () => {
    const f = environment({ run: armedCampaign() }); await f.open();
    const before = f.snapshot(), playing = f.mount.callbacks.onChallenge(blueprint);
    let completed;
    const outcome = playing.then(value => (completed = { value }), error => (completed = { error }));
    await until(() => f.calls.frames > 0 || completed);
    assert.ok(f.calls.frames > 0, completed?.error?.message);
    assert.equal(f.mount.callbacks.isLocalImportAllowed?.(), false);
    assert.equal(f.calls.preparations.length, 1); assert.equal(f.calls.drawings, 2);
    assert.match(f.mount.host.querySelector(".raid-live-battle").textContent, /取得したページ/);
    f.close(); assert.ok((await outcome).error); assert.equal(f.snapshot(), before);
  });
});

test("filtered local record survives an actual public campaign claim and resumes after returning to lab", async () => {
  const store = createProfileStore(new IDBFactory(), "app-filtered-local-recovery");
  await store.recordRaidVictory(localBlueprint, localPending.battleId);
  await store.recordRaidVictory(publicBlueprint, publicPending.battleId);
  const f = environment({ store, run: R.newRun("campaign"), realPanel: true }); await f.open();
  await until(() => /保存済みの勝利/.test(f.content.textContent));
  assert.equal(f.mount.resume?.battleId, publicPending.battleId); recoveryNote(f, 1);
  const result = await f.mount.callbacks.onClaim(prepareRaidRewards(publicBlueprint, publicPending.battleId)[0], publicBlueprint);
  assert.equal(result.ok, true);
  const pending = await store.listPendingRaids();
  assert.equal(pending.length, 1); assert.equal(pending[0].battleId, localPending.battleId);
  recoveryNote(f, 1);
  f.close(); f.c.run = R.newRun("lab"); await f.open();
  assert.equal(f.mount.resume?.battleId, localPending.battleId);
  assert.equal(f.mount.host.querySelector(".raid-local-pending-note"), null);
  assert.equal((await store.listTrophies()).length, 1); f.close();
});

test("pending notice counts only filtered local entries and keeps fixture-only recovery eligible", async () => {
  const f = environment({ pending: [localPending, resume(localBlueprint, "second_local_pending"), fixturePending], run: R.newRun("campaign") });
  await f.open(); assert.equal(f.mount.resume?.battleId, fixturePending.battleId); recoveryNote(f, 2);
  assert.equal(f.calls.discards.length, 0); f.close();
});

test("local rematch survives close and edits in the same lab run without automatically restoring an opponent", async () => {
  const f = environment(); await f.open();
  const memory = f.mount.callbacks.localSelection;
  assert.ok(memory, "lab panel has bounded transient return memory");
  assert.equal((await memory.remember(localBlueprint, f.mount.callbacks.isLocalImportAllowed)).ok, true);
  f.close(); f.c.run.page.name = "Edited between attempts";
  await f.open();
  assert.equal(f.mount.callbacks.localSelection, memory);
  assert.equal(memory.read().captureId, localBlueprint.captureId);
  assert.equal(f.mount.resume, undefined);
  assert.equal(f.mount.initialRequest, undefined);
  assert.equal(f.calls.preparations.length, 0);
  assert.equal(f.calls.claims.length, 0);
  f.close();
});

test("local rematch memory is cleared when run, mode, story or profile ownership changes", async t => {
  const cases = {
    "new lab run": f => { f.c.run = R.newRun("lab"); },
    "same object leaves laboratory": f => { f.c.run.mode = "campaign"; },
    "story activation": f => { f.c.storyActive = true; },
    "profile replacement": f => { f.c.profileStore = { ...f.store }; },
  };
  for (const [name, change] of Object.entries(cases)) await t.test(name, async () => {
    const f = environment(); await f.open();
    const previous = f.mount.callbacks.localSelection;
    assert.ok(previous, "initial lab selection memory exists");
    assert.equal((await previous.remember(localBlueprint, f.mount.callbacks.isLocalImportAllowed)).ok, true);
    f.close(); change(f); await f.open();
    assert.equal(previous.read(), undefined, "old owner cannot retain a return entry");
    assert.equal(f.mount.callbacks.localSelection?.read(), undefined);
    assert.equal(f.calls.preparations.length, 0);
    f.close();
  });
});

test("edit-and-rematch closes only its current laboratory panel and returns to the player's board", async () => {
  const f = environment(); await f.open();
  const current = f.mount.callbacks;
  assert.equal(typeof current.onEditLocal, "function");
  assert.equal((await current.localSelection.remember(localBlueprint, current.isLocalImportAllowed)).ok, true);
  const before = f.snapshot(); f.c.view = "enemy";
  current.onEditLocal();
  assert.equal(f.dialog.open, false);
  assert.equal(f.c.view, "self");
  assert.equal(f.calls.renders, 1);
  assert.equal(f.snapshot(), before);
  await f.open();
  current.onEditLocal();
  assert.equal(f.dialog.open, true, "the old callback cannot close a replacement modal");
  assert.equal(f.calls.renders, 1);
  f.close();
});

test("edit-and-rematch does not act after laboratory eligibility or transient memory is lost", async t => {
  for (const [name, invalidate] of Object.entries({
    "memory cleared": f => f.mount.callbacks.localSelection.clear(),
    "preview enabled": f => { f.c.preview = true; },
    "run replaced": f => { f.c.run = R.newRun("lab"); },
    "native modal closed": f => { f.dialog.open = false; },
  })) await t.test(name, async () => {
    const f = environment(); await f.open();
    const callbacks = f.mount.callbacks;
    assert.equal(typeof callbacks.onEditLocal, "function");
    assert.equal((await callbacks.localSelection.remember(localBlueprint, callbacks.isLocalImportAllowed)).ok, true);
    invalidate(f); const wasOpen = f.dialog.open;
    callbacks.onEditLocal();
    assert.equal(f.dialog.open, wasOpen);
    assert.equal(f.calls.renders, 0);
    f.close();
  });
});
