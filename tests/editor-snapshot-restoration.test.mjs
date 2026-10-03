import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import R from "../src/run.js";

function campaign() {
  const run = R.newRun("campaign");
  run.seed = 1;
  run.shop = R.market(run);
  assert.equal(run.cash, 10);
  assert.equal(R.capacity(run), 12);
  assert.deepEqual(run.shop.find((offer) => offer.type === "plan:srv_s"), {
    type: "plan:srv_s", sold: false,
  });
  return run;
}

// Use the production transaction methods without installing DOM listeners.
function harness(run) {
  const events = { changes: 0, toasts: [] };
  const editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    o: {
      getRun: () => run,
      enabled: () => true,
      onChange: () => events.changes++,
      onToast: (message) => events.toasts.push(message),
    },
    history: [], future: [], selection: new Set(),
  });
  return { editor, events };
}

test("undo refunds the first real server purchase without retaining its optional capacity", () => {
  const run = campaign(), before = structuredClone(run);
  const { editor, events } = harness(run);
  assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
  assert.equal(run.cash, 7);
  assert.equal(R.capacity(run), 17);
  assert.equal(run.shop.find((offer) => offer.type === "plan:srv_s").sold, true);
  editor.selection.add("previous-selection");

  editor.undo();

  assert.equal(editor.run, run, "the app's live run object is retained");
  assert.equal(run.cash, 10);
  assert.equal(run.shop.find((offer) => offer.type === "plan:srv_s").sold, false);
  assert.equal(R.capacity(run), 12);
  assert.equal(Object.hasOwn(run, "capacity"), false);
  assert.deepEqual(run, before);
  assert.equal(editor.selection.size, 0);
  assert.equal(editor.history.length, 0);
  assert.equal(editor.future.length, 1);
  assert.equal(events.changes, 2);
});

test("redo restores the paid capacity and stock across repeated undo and redo", () => {
  const run = campaign(), before = structuredClone(run);
  const { editor } = harness(run);
  assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
  const purchased = structuredClone(run);

  for (let i = 0; i < 3; i++) {
    editor.undo();
    assert.deepEqual(run, before);
    editor.selection.add("previous-selection");
    editor.redo();
    assert.equal(editor.run, run);
    assert.deepEqual(run, purchased);
    assert.equal(run.cash, 7);
    assert.equal(R.capacity(run), 17);
    assert.equal(editor.selection.size, 0);
    assert.equal(editor.history.length, 1);
    assert.equal(editor.future.length, 0);
  }
});

test("undoing a later UI purchase preserves already paid server capacity and ownership", () => {
  const run = campaign();
  assert.equal(R.purchase(run, "plan:srv_s").ok, true);
  const before = structuredClone(run), { editor } = harness(run);
  const offer = run.shop.find((entry) => !entry.sold && !entry.type.startsWith("plan:"));
  assert.ok(offer);
  assert.equal(editor.commit(() => R.purchase(run, offer.type)), true);
  const purchased = structuredClone(run);
  assert.equal(run.owned.length, 1);

  editor.undo();
  assert.equal(editor.run, run);
  assert.deepEqual(run, before);
  assert.equal(run.capacity, 17);
  assert.equal(run.owned.length, 0);
  editor.redo();
  assert.deepEqual(run, purchased);
  assert.equal(run.capacity, 17);
  assert.equal(run.owned.length, 1);
});

test("a failed compound purchase restores capacity absence and the original economy", () => {
  const run = campaign(), before = structuredClone(run);
  const { editor, events } = harness(run);
  let rejection;
  assert.equal(editor.commit(() => {
    assert.equal(R.purchase(run, "plan:srv_s").ok, true);
    rejection = R.purchase(run, "plan:srv_s");
    return rejection;
  }), false);

  assert.equal(editor.run, run);
  assert.equal(R.capacity(run), 12);
  assert.equal(Object.hasOwn(run, "capacity"), false);
  assert.deepEqual(run, before);
  assert.deepEqual(events.toasts, [rejection.error]);
  assert.equal(events.changes, 0);
  assert.deepEqual(editor.history, []);
  assert.deepEqual(editor.future, []);
});

test("a boolean rejection removes optional fields created by its attempted edit", () => {
  const run = campaign(), before = structuredClone(run);
  const { editor, events } = harness(run);
  assert.equal(editor.commit(() => {
    assert.equal(R.purchase(run, "plan:srv_s").ok, true);
    run.pendingInventory = [];
    return false;
  }), false);

  assert.equal(editor.run, run);
  assert.deepEqual(run, before);
  assert.equal(Object.hasOwn(run, "capacity"), false);
  assert.equal(Object.hasOwn(run, "pendingInventory"), false);
  assert.equal(events.changes, 0);
  assert.equal(events.toasts.length, 1);
  assert.ok(events.toasts[0].length > 0);
});

test("redo restores the absence of an optional field removed by the committed edit", () => {
  const run = campaign();
  run.pendingInventory = [];
  const before = structuredClone(run), { editor } = harness(run);
  assert.equal(editor.commit(() => {
    delete run.pendingInventory;
    return true;
  }), true);
  const after = structuredClone(run);
  editor.undo();
  assert.deepEqual(run, before);

  editor.redo();

  assert.equal(editor.run, run);
  assert.equal(Object.hasOwn(run, "pendingInventory"), false);
  assert.deepEqual(run, after);
});

test("rollback distinguishes an existing undefined optional field from an absent one", () => {
  const run = campaign();
  run.capacity = undefined;
  const before = structuredClone(run), { editor } = harness(run);
  assert.equal(editor.commit(() => {
    assert.equal(R.purchase(run, "plan:srv_s").ok, true);
    run.pendingInventory = [];
    return false;
  }), false);

  assert.equal(Object.hasOwn(run, "capacity"), true);
  assert.equal(run.capacity, undefined);
  assert.equal(Object.hasOwn(run, "pendingInventory"), false);
  assert.deepEqual(run, before);
});

test("a rejected action keeps existing redo history and does not notify a change", () => {
  const run = campaign(), { editor, events } = harness(run);
  assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
  const purchased = structuredClone(run);
  editor.undo();
  const before = structuredClone(run), future = structuredClone(editor.future);
  editor.selection.add("keep-selection");
  const changes = events.changes;
  assert.equal(editor.commit(() => R.purchase(run, "not-a-real-ui")), false);

  assert.deepEqual(run, before);
  assert.deepEqual(editor.future, future);
  assert.equal(editor.history.length, 0);
  assert.equal(editor.selection.has("keep-selection"), true);
  assert.equal(events.changes, changes);
  editor.redo();
  assert.deepEqual(run, purchased);
});

test("nested live edits cannot mutate the remaining undo and redo snapshots", () => {
  const run = campaign(), { editor } = harness(run);
  assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
  assert.equal(editor.commit(() => { run.page.name = "Edited page"; return true; }), true);
  editor.undo();
  const history = structuredClone(editor.history), future = structuredClone(editor.future);

  run.page.name = "Unsaved live edit";
  run.shop[0].sold = true;
  assert.deepEqual(editor.history, history);
  assert.deepEqual(editor.future, future);
  editor.redo();
  assert.equal(run.page.name, "Edited page");
  assert.equal(run.shop[0].sold, false);
  assert.equal(run.capacity, 17);
});

test("disabled and no-op transactions retain the live run and its history", () => {
  const run = campaign(), { editor, events } = harness(run);
  assert.equal(editor.commit(() => R.purchase(run, "plan:srv_s")), true);
  editor.undo();
  const before = structuredClone(run), future = structuredClone(editor.future);
  const changes = events.changes;
  assert.equal(editor.commit(() => true), true);
  assert.deepEqual(editor.future, future);
  editor.o.enabled = () => false;
  assert.equal(editor.commit(() => assert.fail("disabled callback must not run")), false);
  editor.undo();
  editor.redo();
  assert.equal(editor.run, run);
  assert.deepEqual(run, before);
  assert.deepEqual(editor.future, future);
  assert.equal(editor.history.length, 0);
  assert.equal(events.changes, changes);
});
