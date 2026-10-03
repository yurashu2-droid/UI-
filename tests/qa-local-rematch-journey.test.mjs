import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import { IDBFactory } from "fake-indexeddb";
import D from "../src/data.js";
import R from "../src/run.js";
import Editor from "../src/editor.js";
import { createDeferredMount } from "../src/feature-loader.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { createProfileStore } from "../src/profile-store.js";
import { createRaidEnemy } from "../src/raid/blueprint.js";
import { registerRaidBlueprint } from "../src/raid/registry.js";
import { raidComponentCaption, renderRaidAppearance } from "../src/raid/render.js";
import * as raidPanelModule from "../src/raid/panel.js";
import { processLocalImportMessage } from "../src/raid/local-import-worker.js";
import { ElementAdapter, WorkerAdapter, localFile, settle, until } from "./helpers/local-import-dom.mjs";

// Exercise the actual app bridge, panel, worker parser, engine, editor transaction,
// durable victory/reward store and collection. Only DOM, native file/worker IO,
// drawing and animation scheduling are adapters. This is not browser acceptance.
// Removing app transient-selection wiring must fail after the first real loss.
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const declaration = name => {
  const value = source.match(new RegExp(`^(?:async )?function ${name}[^]*?^}`, "m"))?.[0];
  assert.ok(value, `actual app declaration: ${name}`);
  return value;
};
const modalStart = source.indexOf("let modalFeatureDispose:"), modalEnd = source.indexOf("/* ---------- Isolated story profile", modalStart);
assert.ok(modalStart >= 0 && modalEnd > modalStart);
const code = transformSync([
  source.slice(modalStart, modalEnd), declaration("deferredModalFeature"),
  declaration("localRaidEditingAllowed"), declaration("playRaidChallenge"),
  declaration("raidPanel"), declaration("collectionPanel"),
].join("\n"), { loader: "ts", target: "es2022" }).code
  .replace('import("./raid/panel.js")', "loadRaidModule()")
  .replace('import("./collection-backup-controls.js")', "loadBackupModule()");

class AppElement extends ElementAdapter {
  constructor(tag, doc) {
    super(tag, doc);
    this.style.setProperty = (key, value) => { this.style[key] = value; };
  }
  matches(selector) {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    return super.matches(selector);
  }
  setAttribute(name, value) {
    super.setAttribute(name, value);
    if (name === "id") this.id = value;
    if (name === "class") this.className = value;
    if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  set innerHTML(markup) {
    // Inert parsing of app-authored modal markup only, never imported HTML.
    const convert = node => {
      const el = this.ownerDocument.createElement(node.tagName ?? "span");
      if (node.nodeName === "#text") el.textContent = node.value;
      for (const attr of node.attrs ?? []) el.setAttribute(attr.name, attr.value);
      el.append(...(node.childNodes ?? []).map(convert));
      return el;
    };
    this.replaceChildren(...parseFragment(markup).childNodes.map(convert));
  }
}

function environment(store) {
  const doc = new EventTarget();
  doc.createElement = tag => new AppElement(tag, doc);
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  doc.querySelector = selector => doc.body.querySelector(selector);
  const dialog = doc.createElement("dialog"), content = doc.createElement("div"), queuedClose = [];
  dialog.id = "modal"; content.id = "modal-content"; doc.body.append(dialog); dialog.append(content); dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { if (dialog.open) { dialog.open = false; queuedClose.push(() => dialog.dispatchEvent(new Event("close"))); } };
  const preparations = [], frames = new Map();
  let frameId = 0;
  const run = R.newRun("lab"); run.owned = [run.owned[0]];
  const context = {
    Error, JSON, Promise, AbortController, structuredClone, clone: structuredClone,
    document: doc, D, R, P: D.PARTS, createDeferredMount, createRaidEnemy,
    run, storyActive: false, storySession: null, battle: null, preview: false,
    settling: false, pendingStorySettlement: null, view: "self", manualZoom: null,
    profileStore: store, profileWrites: Promise.resolve(),
    $: selector => { const el = doc.querySelector(selector); assert.ok(el, selector); return el; },
    renderSide() {}, render() {}, save() {}, toast() {},
    modalHead: () => '<button data-close-modal>閉じる</button>',
    registerRaidBlueprint, raidComponentCaption,
    // VM literals use a separate Object prototype; real app and renderer share one.
    renderRaidAppearance: (host, appearance) => renderRaidAppearance(host, structuredClone(appearance)),
    prepareRaidChallenge(...args) { const prepared = prepareRaidChallenge(...args); preparations.push(prepared); return prepared; },
    V: { render() {} }, performance: { now: () => 0 },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { observe() {} disconnect() {} },
    applyCombatFeedback() {}, combatFeedback() {}, targetCaption() {}, setTimeout,
    loadRaidModule: async () => raidPanelModule,
    loadBackupModule: async () => ({ mountCollectionBackupControls: () => ({ dispose() {} }) }),
  };
  vm.runInNewContext(code + "\nglobalThis.api={raidPanel,collectionPanel,closeModal};", context);
  return {
    c: context, doc, dialog, content, preparations,
    open: () => context.api.raidPanel(), close: () => context.api.closeModal(),
    collection: () => context.api.collectionPanel(),
    flushClose: () => { while (queuedClose.length) queuedClose.shift()(); },
    get host() { return doc.querySelector("#raid-feature-host"); },
    button(label) { return content.querySelectorAll("button").find(el => typeof label === "string" ? el.textContent === label : label.test(el.textContent)); },
    async finishBattle() {
      try { await until(() => frames.size > 0); }
      catch (error) { assert.fail(`${error.message}: ${content.querySelector(".raid-status")?.textContent}`); }
      let now = 0;
      for (let tick = 0; tick < 1500 && frames.size; tick++) {
        const next = [...frames.values()]; frames.clear(); now += 100;
        for (const callback of next) callback(now);
      }
      assert.equal(frames.size, 0, "real battle reached a terminal state");
      assert.ok(preparations.at(-1).battle.result);
      await settle();
    },
  };
}

test("actual local loss returns through editor and explicit rematch to one durable collected appearance", async t => {
  const previous = { Worker: globalThis.Worker, Element: globalThis.Element, document: globalThis.document };
  globalThis.Worker = WorkerAdapter; globalThis.Element = ElementAdapter;
  WorkerAdapter.instances = [];
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; throw Error("unexpected network request"); });
  const factory = new IDBFactory(), database = "qa-local-rematch-journey";
  const store = createProfileStore(factory, database), ui = environment(store);
  globalThis.document = ui.doc;
  t.after(() => ui.close());
  const editor = new Editor.Editor({
    getRun: () => ui.c.run, getHost: () => ui.content, getOverlay: () => null,
    enabled: () => !ui.dialog.open && ui.c.run.phase === "build",
    onChange() {}, onSelect() {}, onToast() {}, paint() {},
  });
  ui.c.editor = editor;
  await ui.open();
  await until(() => ui.host.querySelector(".raid-meta").textContent);
  const raw = '<title>Rematch audit</title><!-- source-only-private-sentinel --><h1>Title</h1><a href="/">North</a><a href="/">South</a><a href="/">East</a><a href="/">West</a>';
  const file = localFile(raw, { name: "private-rematch-filename.html" });
  const input = ui.host.querySelectorAll("input").find(el => el.type === "file");
  input.files = [file]; input.dispatchEvent(new Event("change"));
  ui.button("ローカルHTMLを近似再構成").click(); await settle();
  assert.equal(WorkerAdapter.instances.length, 1);
  const worker = WorkerAdapter.instances[0];
  const parsed = await processLocalImportMessage(worker.sent[0].value);
  assert.equal(parsed.result.ok, true, parsed.result.error);
  const blueprint = parsed.result.value;
  worker.reply(parsed.result);
  await until(() => /ローカルHTML/.test(ui.host.querySelector(".raid-meta").textContent));
  assert.equal(file.reads, 1);
  assert.equal((await store.listTrophies()).length, 0);
  assert.equal(await store.getBlueprint(blueprint.captureId), undefined, "unwon import is transient");

  const beforeLoss = JSON.stringify(ui.c.run);
  await until(() => !ui.button("このページに挑戦").disabled);
  ui.button("このページに挑戦").click(); await ui.finishBattle();
  await until(() => /今回は回収できませんでした/.test(ui.content.textContent));
  assert.equal(ui.preparations[0].battle.result.winner, "enemy");
  assert.equal(JSON.stringify(ui.c.run), beforeLoss, "real loss leaves run economy and board untouched");
  assert.equal((await store.listPendingRaids()).length, 0);
  assert.equal(await store.getBlueprint(blueprint.captureId), undefined);
  const edit = ui.host.querySelector('[data-local-selection="edit"]');
  assert.ok(edit && !edit.hidden && !edit.disabled, "loss offers an explicit route back to editing");
  edit.click();
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.c.view, "self");
  ui.flushClose();
  const owner = ui.c.run;
  assert.equal(editor.commit(() => { ui.c.run.owned = R.newRun("lab").owned; return true; }), true);
  assert.equal(ui.c.run, owner, "ordinary editor transaction retains the live run owner");

  await ui.open(); await until(() => ui.host.querySelector(".raid-meta").textContent);
  assert.equal(ui.preparations.length, 1, "reopening never starts a battle");
  assert.match(ui.host.querySelector(".raid-meta").textContent, /付属/, "return target is offered explicitly, not auto-selected");
  const restore = ui.host.querySelector('[data-local-selection="resume"]');
  assert.ok(restore && !restore.disabled && !restore.hidden, "same run offers its parsed local opponent");
  restore.click(); await until(() => /ローカルHTML/.test(ui.host.querySelector(".raid-meta").textContent));
  assert.match(ui.host.querySelector(".raid-meta").textContent, /Rematch audit/);
  assert.equal(WorkerAdapter.instances.length, 1, "return does not reparse or reopen native files");
  assert.equal(file.reads, 1);
  const beforeWin = JSON.stringify(ui.c.run);
  await until(() => !ui.button("このページに挑戦").disabled);
  ui.button("このページに挑戦").click(); await ui.finishBattle();
  await until(() => /勝利。/.test(ui.content.textContent));
  assert.equal(ui.preparations[1].battle.result.winner, "player");
  assert.equal(ui.preparations[1].blueprint.captureId, blueprint.captureId);
  assert.equal(ui.preparations[1].snapshot.owned.length, ui.c.run.owned.length);
  assert.equal(JSON.stringify(ui.c.run), beforeWin);
  assert.equal((await store.listTrophies()).length, 0);
  const pending = await store.listPendingRaids();
  assert.equal(pending.length, 1); assert.equal(pending[0].blueprint.captureId, blueprint.captureId);

  ui.close(); ui.flushClose(); await ui.open();
  await until(() => /保存済みの勝利/.test(ui.content.textContent));
  assert.equal(ui.button("このページに挑戦").disabled, true, "pending victory outranks rematch");
  assert.equal(ui.preparations.length, 2);
  const canvas = ui.host.querySelector(".raid-canvas"), component = canvas.querySelector("[data-component-id]");
  const click = () => { const event = new Event("click"); Object.defineProperty(event, "target", { value: component }); canvas.dispatchEvent(event); };
  click(); click();
  await until(() => /個人コレクションへ保存しました/.test(ui.content.textContent));
  const reopenedStore = createProfileStore(factory, database);
  const trophies = await reopenedStore.listTrophies();
  assert.equal(trophies.length, 1); assert.equal(trophies[0].captureId, blueprint.captureId);
  assert.equal((await reopenedStore.listPendingRaids()).length, 0);
  const saved = await reopenedStore.getBlueprint(blueprint.captureId);
  assert.equal(saved.source.kind, "local-file");
  assert.doesNotMatch(JSON.stringify({ saved, trophies, run: ui.c.run }), /private-rematch-filename|source-only-private-sentinel|<title>/);
  assert.equal(JSON.stringify(ui.c.run), beforeWin);
  ui.close(); ui.flushClose(); await ui.collection();
  const title = ui.doc.querySelector(".collection-acquisition").querySelector("h3").textContent;
  assert.match(title, /Rematch audit/); assert.match(title, /ローカル/); assert.match(title, /近似/);
  assert.equal(requests, 0);
});
