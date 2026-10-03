import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import R from "../src/run.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import UIRaidEditor, { Editor } from "../src/editor.js";

const guide = await import("../src/reddit-sidebar-placement-guide.js").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
const fresh = () => R.newRun("lab", "lesson_reddit_sidebar");
const clone = value => structuredClone(value);
function view(run = fresh(), selected = ["p6"], options = { editable: true }) {
  assert.equal(typeof guide.redditSidebarPlacementGuide, "function", "pure sidebar placement guide exists");
  return guide.redditSidebarPlacementGuide(run, selected, options);
}
function intent(run, selected, key, options = { editable: true }) {
  assert.equal(typeof guide.redditSidebarPlacementIntent, "function", "pure validated intent exists");
  return guide.redditSidebarPlacementIntent(run, selected, key, options);
}
function render(projection) {
  assert.equal(typeof guide.renderRedditSidebarPlacementGuide, "function", "sidebar placement fragment exists");
  return guide.renderRedditSidebarPlacementGuide(projection);
}
const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)];
const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
const textOf = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textOf).join("");
const buttons = projection => walk(parseFragment(render(projection))).filter(node => node.nodeName === "button");

// These tests assert production guide projections, canonical geometry/engine
// effects and real Editor transactions. They do not exercise browser pixels,
// Tab, pointer dispatch or the app's owner/selection/snapshot runtime gates.
test("sidebar guide recognizes the exact eight-piece lesson and projects source-specific destinations without mutation", () => {
  const run = fresh(), before = clone(run), link = view(run), font = view(run, ["p8"]);
  assert.deepEqual(run.owned.map(p => [p.id, p.type]), [
    ["p1", "rd_vote"], ["p2", "rd_post"], ["p3", "rd_thread"], ["p4", "rd_vote"],
    ["p5", "rd_post"], ["p6", "ab_link"], ["p7", "wk_reference"], ["p8", "gov_font"],
  ]);
  assert.deepEqual([link.sourceId, link.sourceKind, link.current, link.editable, link.disabledReason],
    ["p6", "link", "thread", true, null]);
  assert.deepEqual([font.sourceId, font.sourceKind, font.current, font.editable, font.disabledReason],
    ["p8", "font", "sidebar", true, null]);
  assert.deepEqual(link.targets.map(({ key, x, y, editable, disabledReason }) => ({ key, x, y, editable, disabledReason })), [
    { key: "thread", x: 100, y: 492, editable: true, disabledReason: null },
    { key: "reading", x: 692, y: 492, editable: true, disabledReason: null },
    { key: "detached", x: 692, y: 552, editable: true, disabledReason: null },
  ]);
  assert.deepEqual(font.targets.map(({ key, x, y }) => ({ key, x, y })), [
    { key: "sidebar", x: 692, y: 444 }, { key: "inside", x: 316, y: 492 },
  ]);
  assert.ok(font.targets.every(target => target.editable && target.disabledReason === null));
  assert.deepEqual(intent(run, ["p6"], "reading"), { sourceId: "p6", key: "reading", x: 692, y: 492 });
  assert.deepEqual(intent(run, ["p8"], "inside"), { sourceId: "p8", key: "inside", x: 316, y: 492 });
  assert.deepEqual(run, before);
  const reversed = clone(run); reversed.owned.reverse();
  assert.deepEqual(view(reversed), link);
  link.targets[1].x = -100;
  assert.equal(view(run).targets[1].x, 692, "mutating a view never changes an intent or future target");
  assert.deepEqual(intent(run, ["p6"], "reading"), { sourceId: "p6", key: "reading", x: 692, y: 492 });
});

test("wrong lesson mode phase or exact selected identity never exposes an actionable guide", () => {
  for (const mutate of [
    run => { delete run.page.templateId; }, run => { run.page.templateId = "site_reddit"; },
    run => { run.mode = "campaign"; }, run => { run.mode = "online"; },
    ...["battle", "reward", "complete", "gameover"].map(phase => run => { run.phase = phase; }),
  ]) {
    const run = fresh(); mutate(run);
    for (const [selected, key] of [[["p6"], "reading"], [["p8"], "inside"]]) {
      assert.equal(view(run, selected), null);
      assert.equal(intent(run, selected, key), null);
    }
  }
  for (const selected of [[], ["p1"], ["p7"], ["p6", "p8"], ["p6", "missing"], ["p6", "p6"], ["missing"], ["__proto__"]]) {
    assert.equal(view(fresh(), selected), null);
    assert.equal(intent(fresh(), selected, "reading"), null);
  }
  for (const id of ["p6", "p8"]) for (const replacement of [null, "different-id", "different-type"]) {
    const run = fresh(), index = run.owned.findIndex(part => part.id === id);
    if (replacement === null) run.owned.splice(index, 1);
    else if (replacement === "different-id") run.owned[index].id = replacement;
    else run.owned[index].type = "ab_nav";
    assert.equal(view(run, [id]), null);
    if (replacement === "different-id") assert.equal(view(run, [replacement]), null, "never adopt a replacement by type");
  }
});

test("changed inventory stays visible but disabled rather than repaired or mechanically described", () => {
  for (const mutate of [
    run => run.owned.push(C.makeItem("ab_link", "p9", null, null)),
    run => run.owned.splice(0, 1),
    run => { run.owned[0].id = "p2"; }, run => { run.owned[0].id = "p6"; },
    run => { run.owned[0].id = "replacement"; }, run => { run.owned[0].type = "ab_link"; },
    run => { run.owned[0].type = "__proto__"; },
  ]) {
    const run = fresh(); mutate(run); const before = clone(run);
    for (const selected of [["p6"], ["p8"]]) {
      const actual = view(run, selected);
      assert.ok(actual, "recognizable original selection gets a reason");
      assert.equal(actual.editable, false); assert.equal(actual.current, null);
      assert.ok(actual.disabledReason);
      assert.ok(actual.targets.every(target => !target.editable && target.disabledReason));
      assert.equal(intent(run, selected, selected[0] === "p6" ? "reading" : "inside"), null);
    }
    assert.deepEqual(run, before);
  }
});

test("every changed size shape placement or fixed-piece coordinate remains disabled without mutation", () => {
  for (let index = 0; index < 8; index++) {
    const original = fresh().owned[index];
    for (const patch of [{ w: original.w + 4 }, { h: original.h + 4 }, { w: NaN }, { h: Infinity },
      { shape: "square" }, { shape: "unknown" }, { shape: undefined },
      { x: null, y: null }, { x: null }, { y: null }, { x: NaN }, { y: Infinity },
      { x: original.x + 1 }, { y: original.y + 1 }, { x: -100 },
    ]) {
      const run = fresh(); Object.assign(run.owned[index], patch); const before = clone(run);
      for (const selected of [["p6"], ["p8"]]) {
        const actual = view(run, selected);
        assert.equal(actual.editable, false, `${original.id}: ${JSON.stringify(patch)}`);
        assert.equal(actual.current, null); assert.ok(actual.disabledReason);
        assert.ok(actual.targets.every(target => !target.editable && target.disabledReason));
        assert.equal(intent(run, selected, selected[0] === "p6" ? "thread" : "sidebar"), null);
      }
      assert.deepEqual(run, before);
    }
  }
});

test("runtime edit permission is opt-in and never changes the recognized location", () => {
  for (const options of [{}, { editable: false }]) for (const [selected, current, target] of [
    [["p6"], "thread", "reading"], [["p8"], "sidebar", "inside"],
  ]) {
    const run = fresh(), actual = view(run, selected, options);
    assert.equal(actual.current, current); assert.equal(actual.editable, false);
    assert.ok(actual.disabledReason); assert.ok(actual.targets.every(target => !target.editable && target.disabledReason));
    assert.equal(intent(run, selected, target, options), null);
  }
});

test("font-inside waits visibly for original link return and never offers to move both pieces", () => {
  for (const position of [{ x: 692, y: 492 }, { x: 692, y: 552 }]) {
    const run = fresh(); Object.assign(run.owned[5], position); const before = clone(run);
    const font = view(run, ["p8"]), inside = font.targets.find(target => target.key === "inside");
    assert.equal(font.editable, true, "the source-position recovery remains available");
    assert.equal(inside.editable, false); assert.match(inside.disabledReason, /青リンク.*返信内.*先/);
    assert.equal(font.targets.find(target => target.key === "sidebar").editable, true);
    assert.equal(intent(run, ["p8"], "inside"), null);
    assert.deepEqual(intent(run, ["p6"], "thread"), { sourceId: "p6", key: "thread", x: 100, y: 492 });
    assert.deepEqual(run, before, "requesting an unavailable alternative never silently returns the link");
  }
});

test("font moved inside disables the two outside link destinations but preserves selected-piece-only returns", () => {
  for (const position of [{ x: 100, y: 492 }, { x: 692, y: 492 }, { x: 692, y: 552 }]) {
    const run = fresh(); Object.assign(run.owned[5], position); Object.assign(run.owned[7], { x: 316, y: 492 });
    const before = clone(run), link = view(run);
    assert.equal(link.editable, true); assert.equal(link.targets.find(target => target.key === "thread").editable, true);
    for (const key of ["reading", "detached"]) {
      const target = link.targets.find(target => target.key === key);
      assert.equal(target.editable, false); assert.match(target.disabledReason, /文字サイズ.*右.*先/);
      assert.equal(intent(run, ["p6"], key), null);
    }
    assert.deepEqual(intent(run, ["p8"], "sidebar"), { sourceId: "p8", key: "sidebar", x: 692, y: 444 });
    if (position.x === 692)
      assert.deepEqual(intent(run, ["p6"], "thread"), { sourceId: "p6", key: "thread", x: 100, y: 492 });
    assert.deepEqual(run, before, "even a mismatched supported pair does not repair its partner");
  }
});

test("intent rejects wrong-source destinations forged keys current positions and stale selections", () => {
  const run = fresh(), before = clone(run);
  for (const [selected, keys] of [[["p6"], ["thread", "sidebar", "inside", "missing", "__proto__", "constructor"]],
    [["p8"], ["sidebar", "thread", "reading", "detached"]], [["p6", "missing"], ["reading"]]])
    for (const key of keys) assert.equal(intent(run, selected, key), null, `${selected}: ${key}`);
  assert.equal(view(run).targets[0].editable, true, "current location remains a focusable no-op");
  assert.equal(view(run, ["p8"]).targets[0].editable, true);
  assert.deepEqual(run, before);
});

test("native placement buttons expose pressed states reasons and a qualified one-piece explanation", () => {
  assert.equal(render(null), "");
  for (const [selected, count] of [[["p6"], 3], [["p8"], 2]]) {
    const projection = view(fresh(), selected), controls = buttons(projection), html = render(projection);
    assert.equal(controls.length, count);
    for (const [index, control] of controls.entries()) {
      const target = projection.targets[index];
      assert.equal(attr(control, "type"), "button");
      assert.equal(attr(control, "data-reddit-sidebar-placement"), target.key);
      assert.equal(attr(control, "data-source-id"), selected[0]);
      assert.equal(attr(control, "aria-pressed"), String(target.key === projection.current));
      assert.equal(attr(control, "disabled"), undefined);
      assert.equal(textOf(control), target.label);
    }
    assert.match(html, /選択した1部品だけ/); assert.match(html, /元に戻す/);
    assert.match(html, /固定.*条件/); assert.match(html, /勝利.*保証/);
    assert.match(html, /文字サイズ.*返信内/); assert.doesNotMatch(html, /必勝|自動対戦|リセット/);
  }
  const run = fresh(); Object.assign(run.owned[5], { x: 692, y: 492 });
  const font = view(run, ["p8"]), controls = buttons(font), html = render(font);
  assert.equal(controls.length, 2, "promised alternative stays visible");
  assert.equal(attr(controls[0], "disabled"), undefined); assert.notEqual(attr(controls[1], "disabled"), undefined);
  assert.ok(textOf(parseFragment(html)).includes(font.targets[1].disabledReason));
  for (const invalidate of [run => { run.owned[0].w += 4; }, run => { run.owned[5].x = null; }]) {
    const broken = fresh(); invalidate(broken); const projection = view(broken);
    assert.equal(buttons(projection).length, 3);
    assert.ok(buttons(projection).every(button => attr(button, "disabled") !== undefined));
    assert.ok(textOf(parseFragment(render(projection))).includes(projection.disabledReason));
  }
});

test("renderer escapes every variable label reason key and source instead of emitting markup", () => {
  const projection = view();
  projection.sourceId = 'p6" autofocus onfocus="bad';
  projection.disabledReason = '<img src=x onerror="bad">';
  projection.targets[0].key = 'thread" onclick="bad';
  projection.targets[0].label = '<b>bad & "quoted"</b>';
  projection.targets[0].disabledReason = '<script>bad</script>';
  const nodes = walk(parseFragment(render(projection)));
  assert.ok(!nodes.some(node => ["img", "script"].includes(node.nodeName)));
  assert.ok(!nodes.some(node => ["autofocus", "onfocus", "onclick"].some(name => attr(node, name) !== undefined)));
  assert.equal(textOf(nodes.find(node => node.nodeName === "button")), projection.targets[0].label);
  assert.ok(textOf(nodes[0]).includes(projection.disabledReason));
  assert.ok(textOf(nodes[0]).includes(projection.targets[0].disabledReason));
});

test("each placement action has its own row rather than sharing the inherited nonwrapping flex row", () => {
  for (const selected of [["p6"], ["p8"]]) {
    const projection = view(fresh(), selected), rows = walk(parseFragment(render(projection)))
      .filter(node => (attr(node, "class") ?? "").split(" ").includes("sel-actions"));
    assert.equal(rows.length, projection.targets.length);
    assert.ok(rows.every(row => walk(row).filter(node => node.nodeName === "button").length === 1));
    assert.ok(projection.targets.every(target => [...target.label].length <= 12), "short labels reduce source-level wrap risk");
  }
});

function harness(run, selected = ["p6"]) {
  const events = { changes: 0, toasts: [] }, editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    o: { getRun: () => run, enabled: () => true, onChange: () => events.changes++, onToast: message => events.toasts.push(message) },
    history: [], future: [], selection: new Set(selected), pending: null, drag: null,
  });
  return { editor, events };
}
function move(editor, selected, key) {
  const action = intent(editor.run, selected, key);
  if (!action) return false;
  return editor.commit(() => {
    const fresh = intent(editor.run, selected, key);
    return !!fresh && UIRaidEditor.patchItem(editor.board, fresh.sourceId, { x: fresh.x, y: fresh.y });
  });
}

test("one real Editor transaction preserves native identity labels metadata resources and unrelated Run data", () => {
  for (const [sourceId, key, coordinates] of [["p6", "reading", { x: 692, y: 492 }], ["p6", "detached", { x: 692, y: 552 }], ["p8", "inside", { x: 316, y: 492 }]]) {
    const run = fresh();
    for (const part of run.owned) Object.assign(part, {
      label: `<edited ${part.id} & "label">`, appearanceId: `appearance_${part.id.slice(1).repeat(64)}`,
      provenanceId: `capture_${part.id.slice(1).repeat(64)}`, fusionLocked: true, routeTo: "p2",
      lineage: [{ appearanceId: `appearance_${"a".repeat(64)}`, provenanceId: `capture_${"b".repeat(64)}` }],
    });
    run.cash = 123; run.capacity = 14; run.admin = ["moderator"]; run.shop[0].sold = true; run.page.name = "編集した教材";
    const before = clone(run), expected = clone(run), { editor, events } = harness(run, [sourceId]);
    Object.assign(expected.owned.find(part => part.id === sourceId), coordinates);
    assert.equal(view(run, [sourceId]).editable, true, "edited appearance and labels do not disable geometry");
    assert.equal(move(editor, [sourceId], key), true);
    assert.deepEqual(run, expected, "only selected source x/y changes across the entire Run");
    assert.equal(editor.history.length, 1); assert.deepEqual(editor.history[0], before); assert.equal(events.changes, 1);
    assert.ok(run.owned.every(part => C.canPlace(run.owned, part, part.x, part.y)));
    for (let i = 0; i < 2; i++) {
      editor.undo(); assert.deepEqual(run, before);
      editor.redo(); assert.deepEqual(run, expected);
    }
    assert.equal(move(editor, [sourceId], sourceId === "p6" ? "thread" : "sidebar"), true);
    assert.deepEqual(run, before); assert.equal(editor.history.length, 2);
  }
});

test("safe intents preserve canonical relationships for all supported actions and reversible returns", () => {
  const run = fresh(), before = clone(run), { editor } = harness(run);
  for (const key of ["reading", "detached", "thread"]) {
    assert.equal(move(editor, ["p6"], key), true);
    const analysis = E.analyze(run.owned);
    assert.equal(analysis.load, 14); assert.equal(analysis.mods.p6.power, key === "reading" ? 1.5 : 1);
    assert.equal(analysis.parents.p6, key === "thread" ? "p3" : undefined);
    assert.equal(analysis.near.p7.includes("p6"), key === "thread");
  }
  assert.deepEqual(run, before);
  assert.equal(move(editor, ["p8"], "inside"), true);
  const analysis = E.analyze(run.owned);
  assert.equal(analysis.parents.p8, "p3"); assert.equal(analysis.parents.p6, "p3");
  assert.equal(analysis.mods.p5.power, 1.5); assert.equal(analysis.mods.p6.power, 1.5);
  assert.ok(analysis.near.p7.includes("p6"));
  assert.equal(move(editor, ["p8"], "sidebar"), true); assert.deepEqual(run, before);
});

test("a current-position intent causes no transaction change callback or lost redo", () => {
  for (const [selected, away, back] of [[["p6"], "reading", "thread"], [["p8"], "inside", "sidebar"]]) {
    const run = fresh(), { editor, events } = harness(run, selected);
    assert.equal(move(editor, selected, away), true); editor.undo();
    const before = clone(run), future = clone(editor.future), changes = events.changes;
    assert.equal(move(editor, selected, back), false);
    assert.deepEqual(run, before); assert.deepEqual(editor.history, []); assert.deepEqual(editor.future, future);
    assert.equal(events.changes, changes); assert.deepEqual(events.toasts, []);
  }
});

test("fresh validation and canonical patchItem reject collisions without partial mutation or lost redo", () => {
  const run = fresh(), { editor, events } = harness(run);
  assert.equal(move(editor, ["p6"], "reading"), true); editor.undo();
  // Deliberately colliding with the source font cannot become a valid shortcut.
  const before = clone(run), future = clone(editor.future), changes = events.changes;
  assert.equal(editor.commit(() => UIRaidEditor.patchItem(run.owned, "p6", { x: 692, y: 444 })), false);
  assert.deepEqual(run, before); assert.deepEqual(editor.history, []); assert.deepEqual(editor.future, future);
  assert.equal(events.changes, changes);
  for (const mutate of [
    run => { run.owned[1].x += 1; }, run => { run.owned[5].w += 4; },
    run => { run.owned[7].x = null; }, run => run.owned.push(C.makeItem("ab_link", "p9", 692, 492, 208, 32)),
  ]) {
    const run = fresh(), { editor, events } = harness(run);
    assert.ok(intent(run, ["p6"], "reading")); mutate(run); const stale = clone(run);
    assert.equal(editor.commit(() => {
      const action = intent(run, ["p6"], "reading");
      return !!action && UIRaidEditor.patchItem(run.owned, action.sourceId, { x: action.x, y: action.y });
    }), false);
    assert.deepEqual(run, stale); assert.deepEqual(editor.history, []); assert.equal(events.changes, 0);
  }
});
