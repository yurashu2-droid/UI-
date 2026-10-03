import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.ts";
import R from "../src/run.ts";
import { createRunPersistence } from "../src/persistence.ts";
import * as S from "../src/story/session.ts";

function campaign() {
  const run = R.newRun("campaign");
  run.seed = 1;
  run.shop = R.market(run);
  assert.equal(run.cash, 10);
  assert.ok(run.shop.some(s => s.type === "plan:srv_s" && !s.sold));
  assert.equal(Object.hasOwn(run, "capacity"), false);
  return run;
}

function editorFor(run, onChange = () => {}) {
  // Only constructor event wiring is bypassed. Commit, snapshot, undo and redo
  // are the production methods, with no replacement restoration behavior.
  const editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    o: { getRun: () => run, enabled: () => true, onChange, onToast() {} },
    history: [], future: [], selection: new Set(),
  });
  return editor;
}

function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}

test("QA: actual editor undo restores first server purchase, optional capacity absence, and persisted economy", () => {
  const run = campaign(), identity = run, before = structuredClone(run);
  const persistence = createRunPersistence(storage(), "qa-editor-");
  const editor = editorFor(run, () => assert.equal(persistence.save(run).ok, true));
  assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
  assert.equal(run.cash, 7);
  assert.equal(R.capacity(run), 17);
  const purchased = structuredClone(run);
  editor.undo();
  assert.strictEqual(editor.run, identity);
  assert.equal(run.cash, 10);
  assert.equal(run.shop.find(s => s.type === "plan:srv_s").sold, false);
  assert.equal(R.capacity(run), 12, "refunded purchase must remove its capacity gain");
  assert.equal(Object.hasOwn(run, "capacity"), false);
  assert.deepEqual(run, before);
  assert.deepEqual(persistence.load("campaign").run, before);
  editor.redo();
  assert.strictEqual(editor.run, identity);
  assert.deepEqual(run, purchased);
  assert.deepEqual(persistence.load("campaign").run, purchased);
});

test("QA: failed multi-step editor purchase rolls back newly introduced capacity and owned items", () => {
  const run = campaign(), before = structuredClone(run), editor = editorFor(run);
  assert.equal(editor.commit(() => {
    assert.equal(R.purchase(run, "plan:srv_s").ok, true);
    const available = run.shop.find(s => !s.type.startsWith("plan:") && !s.sold);
    assert.equal(R.purchase(run, available.type).ok, true);
    return R.purchase(run, "plan:srv_s"); // The real already-sold rejection aborts the transaction.
  }), false);
  assert.equal(R.capacity(run), 12, "failed transaction must not keep a paid upgrade");
  assert.deepEqual(run, before);
  assert.deepEqual(editor.history, []);
  assert.deepEqual(editor.future, []);
});

test("QA: undo and redo preserve an already-paid capacity level and existing purchased UI", () => {
  const run = campaign(), identity = run;
  assert.equal(R.purchase(run, "plan:srv_s").ok, true);
  assert.equal(R.purchase(run, "ab_link").ok, true);
  assert.equal(R.reroll(run).ok, true);
  assert.equal(R.capacity(run), 17);
  const before = structuredClone(run), editor = editorFor(run);
  assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
  assert.equal(R.capacity(run), 22);
  const purchased = structuredClone(run);
  for (let i = 0; i < 3; i++) {
    editor.undo();
    assert.strictEqual(editor.run, identity);
    assert.equal(R.capacity(run), 17);
    assert.equal(Object.hasOwn(run, "capacity"), true);
    assert.deepEqual(run, before);
    editor.redo();
    assert.strictEqual(editor.run, identity);
    assert.deepEqual(run, purchased);
    assert.deepEqual(run.owned, before.owned);
  }
});

test("QA: undoing and rebuying the first plan cannot accumulate unpaid capacity", () => {
  const run = campaign(), editor = editorFor(run);
  for (let i = 0; i < 3; i++) {
    assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
    assert.equal(run.cash, 7);
    assert.equal(R.capacity(run), 17);
    editor.undo();
    assert.equal(run.cash, 10);
    assert.equal(R.capacity(run), 12);
  }
  assert.equal(editor.commit(() => R.purchase(run, "ab_link")), true);
  const replacement = structuredClone(run);
  assert.deepEqual(editor.future, []);
  editor.redo();
  assert.deepEqual(run, replacement, "a new committed purchase must discard the old redo branch");
});

test("QA: rejected boolean transaction preserves the redo branch without leaving a first capacity upgrade", () => {
  const run = campaign();
  let changed = 0;
  const editor = editorFor(run, () => changed++);
  assert.equal(editor.commit(() => R.purchase(run, "ab_link")), true);
  const itemPurchase = structuredClone(run);
  editor.undo();
  const before = structuredClone(run);
  const future = structuredClone(editor.future);
  assert.equal(editor.commit(() => {
    assert.equal(R.purchase(run, "plan:srv_s").ok, true);
    return R.purchase(run, "plan:srv_s").ok;
  }), false);
  assert.equal(changed, 2, "rejected work must not send an onChange save notification");
  assert.deepEqual(run, before);
  assert.deepEqual(editor.future, future);
  editor.redo();
  assert.deepEqual(run, itemPurchase);
  assert.equal(changed, 3);
});

test("QA: story build persistence records exact plan undo and redo without changing story progress or owned UI", () => {
  const named = S.commandStorySession(S.createStorySession(), { type: "name-page", name: "snapshot audit" });
  assert.equal(named.ok, true);
  let session = named.session;
  const run = structuredClone(session.run), identity = run;
  const persistence = S.createStorySessionPersistence(storage());
  const editor = editorFor(run, () => {
    const updated = S.updateStoryBuild(session, run);
    assert.equal(updated.ok, true, updated.error);
    session = updated.session;
    assert.equal(persistence.save(session).ok, true);
  });
  assert.equal(editor.commit(() => R.purchase(run, "ab_link")), true);
  const before = structuredClone(session);
  assert.equal(Object.hasOwn(run, "capacity"), false);
  assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
  const purchased = structuredClone(session);
  assert.equal(purchased.run.cash, before.run.cash - 3);
  assert.equal(R.capacity(purchased.run), 17);
  assert.deepEqual(purchased.story, before.story);
  assert.deepEqual(purchased.run.owned, before.run.owned);
  editor.undo();
  assert.strictEqual(editor.run, identity);
  assert.deepEqual(session, before);
  assert.deepEqual(persistence.load().session, before);
  assert.equal(S.validateStorySession(persistence.load().session), true);
  editor.redo();
  assert.strictEqual(editor.run, identity);
  assert.deepEqual(session, purchased);
  assert.deepEqual(persistence.load().session, purchased);
});
