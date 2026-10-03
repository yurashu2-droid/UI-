import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import R from "../src/run.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import UIRaidEditor, { Editor } from "../src/editor.js";
import { resources } from "../src/buildlab.js";

const guide = await import("../src/sidechannel-placement-guide.js").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
const fresh = () => R.newRun("lab", "site_slack");
const clone = value => structuredClone(value);
function view(run = fresh(), selectedIds = ["p4"], options = { editable: true }) {
  assert.equal(typeof guide.sidechannelPlacementGuide, "function");
  return guide.sidechannelPlacementGuide(run, selectedIds, options);
}
function render(projection) {
  assert.equal(typeof guide.renderSidechannelPlacementGuide, "function");
  return guide.renderSidechannelPlacementGuide(projection);
}
const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)];
const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
const textOf = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textOf).join("");
const buttons = projection => walk(parseFragment(render(projection))).filter(node => node.nodeName === "button");
const resource = owned => resources(owned.filter(C.placed).map(p => [p.type, p.x, p.y, p.w, p.h]));
function harness(run) {
  const events = { changes: 0, toasts: [] };
  const editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    o: {
      getRun: () => run,
      enabled: () => true,
      onChange: () => events.changes++,
      onToast: message => events.toasts.push(message),
    },
    history: [], future: [], selection: new Set(["p4"]), pending: null, drag: null,
  });
  return { editor, events };
}

// Changing recognition, the two projected destinations, actual patchItem, or
// real transaction rollback/history must break these behavior assertions.
test("SIDECHANNEL recognizes only its four original owned parts and the selected breadcrumb", () => {
  const run = fresh(), before = clone(run), actual = view(run);
  assert.deepEqual(run.owned.map(p => [p.id, p.type]), [
    ["p1", "tw_post"], ["p2", "go_history"], ["p3", "gov_pdf"], ["p4", "gov_breadcrumb"],
  ]);
  assert.equal(actual.breadcrumbId, "p4");
  assert.equal(actual.current, "history");
  assert.equal(actual.editable, true);
  assert.equal(actual.disabledReason, null);
  assert.deepEqual(actual.targets, [
    { key: "history", x: 208, y: 316, label: "履歴の上へ（15%加速）" },
    { key: "pdf", x: 648, y: 228, label: "PDFの上へ（15%加速）" },
  ]);
  assert.deepEqual(run, before, "projection is read-only");
  const reversed = clone(run); reversed.owned.reverse();
  assert.deepEqual(view(reversed), actual, "inventory order does not choose a different part");
  actual.targets[0].x = -100;
  assert.equal(view(run).targets[0].x, 208, "a view cannot rewrite the next view's destination");
});

test("wrong template, mode, phase, missing, multiple and stale selections expose no guide", () => {
  for (const mutate of [
    run => { delete run.page.templateId; },
    run => { run.page.templateId = "site_figma"; },
    run => { run.mode = "campaign"; },
    ...["battle", "reward", "complete", "gameover"].map(phase => run => { run.phase = phase; }),
  ]) {
    const run = fresh(); mutate(run);
    assert.equal(view(run), null);
  }
  for (const selectedIds of [[], ["p1"], ["p2"], ["p3"], ["p4", "p2"], ["p4", "p4"], ["foreign"], ["__proto__"]])
    assert.equal(view(fresh(), selectedIds), null);
  const gone = fresh(); gone.owned.pop(); assert.equal(view(gone), null);
  const replaced = fresh(); replaced.owned[3].id = "p5";
  assert.equal(view(replaced), null);
  assert.equal(view(replaced, ["p5"]), null, "a replacement is not silently adopted");
  const wrongType = fresh(); wrongType.owned[3].type = "ab_nav"; assert.equal(view(wrongType), null);
  assert.equal(render(null), "");
});

test("extra, missing, ambiguous and wrong-type inventory stays disabled without repair", () => {
  for (const mutate of [
    run => run.owned.push(C.makeItem("ab_link", "p5", null, null)),
    run => run.owned.splice(0, 1),
    run => { run.owned[0].id = "p2"; },
    run => { run.owned[0].id = "p4"; },
    run => { run.owned[0].id = "replacement"; },
    run => { run.owned[0].type = "gov_breadcrumb"; },
    run => { run.owned[1].type = "__proto__"; },
    run => { run.owned[2].type = "tw_post"; },
  ]) {
    const run = fresh(); mutate(run); const before = clone(run), actual = view(run);
    assert.ok(actual, "recognizable selected breadcrumb retains a concise disabled explanation");
    assert.equal(actual.editable, false);
    assert.equal(actual.current, null, "altered boards get no claimed acceleration state");
    assert.ok(actual.disabledReason.length > 0);
    assert.ok(buttons(actual).every(button => attr(button, "disabled") !== undefined));
    assert.deepEqual(run, before);
  }
});

test("every resized, unplaced or mechanically moved part disables comparison", () => {
  for (let index = 0; index < 4; index++) {
    for (const patch of [{ w: fresh().owned[index].w + 4 }, { h: fresh().owned[index].h + 4 },
      { x: null, y: null }, { x: null }, { y: null }, { x: NaN }, { y: Infinity },
      { x: fresh().owned[index].x + 1 }, { y: fresh().owned[index].y + 1 }]) {
      const run = fresh(); Object.assign(run.owned[index], patch); const before = clone(run), actual = view(run);
      assert.equal(actual.editable, false, `part ${index}, patch ${JSON.stringify(patch)}`);
      assert.equal(actual.current, null);
      assert.ok(actual.disabledReason);
      assert.deepEqual(run, before);
    }
  }
  const disconnected = fresh(); Object.assign(disconnected.owned[3], { x: 208, y: 552 });
  assert.equal(view(disconnected).editable, false, "only the two approved placements are recognized");
});

test("labels and appearance can change before rendering while recognition remains purely mechanical", () => {
  const run = fresh();
  for (const p of run.owned) Object.assign(p, {
    label: `<edited ${p.id} & \"label\">`, shape: "square", appearanceId: `appearance-${p.id}`,
    provenanceId: `source-${p.id}`, fusionLocked: true,
    lineage: [{ appearanceId: "original", provenanceId: "original-source" }],
  });
  run.page.name = "私の会話";
  const before = clone(run), actual = view(run);
  assert.equal(actual.editable, true);
  assert.equal(actual.current, "history");
  assert.deepEqual(run, before);
  assert.doesNotMatch(render(actual), /<edited/, "custom labels are not interpolated as markup");
});

test("rendered controls show both destinations and current state without an outcome promise", () => {
  for (const [current, position, status] of [
    ["history", { x: 208, y: 316 }, "履歴を15%加速"],
    ["pdf", { x: 648, y: 228 }, "PDFを15%加速"],
  ]) {
    const run = fresh(); Object.assign(run.owned[3], position);
    const actual = view(run), html = render(actual), controls = buttons(actual);
    assert.equal(actual.current, current);
    assert.equal(controls.length, 2);
    for (const [index, key] of ["history", "pdf"].entries()) {
      assert.equal(attr(controls[index], "type"), "button");
      assert.equal(attr(controls[index], "data-sidechannel-placement"), key);
      assert.equal(attr(controls[index], "data-source-id"), "p4");
      assert.equal(attr(controls[index], "aria-pressed"), String(key === current));
      assert.equal(attr(controls[index], "disabled"), undefined, "current position is a focusable no-op");
      assert.equal(textOf(controls[index]), actual.targets[index].label);
    }
    assert.ok(html.includes(`現在：${status}`));
    assert.ok(html.includes("パンくず1個だけを移動します。元に戻すで取り消せます。復元量は相手の被害と発動時刻で変わります"));
    assert.doesNotMatch(html, /55|145|127|必勝|自動対戦|リセット/);
  }
});

test("editability is opt-in and its disabled explanation is present and safely escaped", () => {
  for (const options of [{}, { editable: false }]) {
    const actual = view(fresh(), ["p4"], options);
    assert.equal(actual.editable, false);
    assert.equal(actual.current, "history");
    assert.ok(actual.disabledReason);
    assert.equal(buttons(actual).filter(button => attr(button, "disabled") !== undefined).length, 2);
  }
  const actual = view();
  actual.breadcrumbId = 'p4\" autofocus onfocus=\"bad';
  actual.disabledReason = '<img src=x onerror="bad">';
  actual.targets[0].label = '<b>bad & "quoted"</b>';
  const nodes = walk(parseFragment(render(actual)));
  assert.ok(!nodes.some(node => node.nodeName === "img"));
  assert.ok(!nodes.some(node => attr(node, "autofocus") !== undefined || attr(node, "onfocus") !== undefined));
  assert.equal(textOf(nodes.find(node => node.nodeName === "button")), actual.targets[0].label);
});

test("real editor changes only breadcrumb x/y, keeps resources and restores exact Undo/Redo snapshots", () => {
  const run = fresh();
  Object.assign(run.owned[3], { label: "手元のパンくず", appearanceId: "custom", provenanceId: "source", fusionLocked: true });
  const before = clone(run), inventory = run.owned.map(({ x, y, ...p }) => p), beforeResources = resource(run.owned);
  const { editor, events } = harness(run), target = view(run).targets.find(target => target.key === "pdf");
  assert.equal(editor.commit(() => UIRaidEditor.patchItem(run.owned, "p4", { x: target.x, y: target.y })), true);
  const after = clone(run), expected = clone(before); Object.assign(expected.owned[3], { x: 648, y: 228 });
  assert.deepEqual(after, expected, "only the two intended coordinates change across the complete Run");
  assert.deepEqual(run.owned.map(({ x, y, ...p }) => p), inventory);
  assert.deepEqual(resource(run.owned), beforeResources);
  assert.equal(editor.history.length, 1); assert.equal(events.changes, 1);
  assert.deepEqual(editor.history[0], before);
  for (let i = 0; i < 3; i++) {
    editor.undo(); assert.deepEqual(run, before); assert.equal(view(run).current, "history");
    editor.redo(); assert.deepEqual(run, after); assert.equal(view(run).current, "pdf");
  }
  const back = view(run).targets.find(target => target.key === "history");
  assert.equal(editor.commit(() => UIRaidEditor.patchItem(run.owned, "p4", { x: back.x, y: back.y })), true);
  assert.deepEqual(run, before);
  assert.equal(editor.history.length, 2);
});

test("real engine transfers exactly 1.15 speed between history and PDF and keeps all other mechanics", () => {
  const run = fresh(), { editor } = harness(run);
  for (const key of ["history", "pdf", "history"]) {
    const target = view(run).targets.find(target => target.key === key);
    assert.equal(editor.commit(() => UIRaidEditor.patchItem(run.owned, "p4", { x: target.x, y: target.y })), true);
    const analysis = E.analyze(run.owned);
    assert.deepEqual(analysis.parents, {}); assert.deepEqual(analysis.groups, []); assert.equal(analysis.load, 8);
    for (const p of run.owned) {
      assert.equal(analysis.mods[p.id].speed, p.id === (key === "history" ? "p2" : "p3") ? 1.15 : 1);
      assert.equal(analysis.mods[p.id].power, 1);
    }
    const battle = new E.Battle(run.owned, [], { playerHp: 440, enemyHp: 440, playerCapacity: 12, enemyCapacity: 12 });
    assert.equal(battle.combatVersion, "combat-v4");
    for (const part of battle.player.parts.filter(p => ["p2", "p3"].includes(p.id)))
      assert.equal(part.period, E.naturalPeriod(run.owned.find(p => p.id === part.id), analysis, 12));
    assert.deepEqual([resource(run.owned).acquisitionValue, resource(run.owned).footprint], [20, 98208]);
  }
});

test("real editor current-position no-op creates no history and preserves an existing redo", () => {
  const run = fresh(), { editor, events } = harness(run), before = clone(run);
  editor.commit(() => UIRaidEditor.patchItem(run.owned, "p4", { x: 648, y: 228 }));
  editor.undo(); const future = clone(editor.future), changes = events.changes;
  const target = view(run).targets.find(target => target.key === view(run).current);
  assert.equal(editor.commit(() => UIRaidEditor.patchItem(run.owned, "p4", { x: target.x, y: target.y })), true);
  assert.deepEqual(run, before); assert.deepEqual(editor.history, []); assert.deepEqual(editor.future, future);
  assert.equal(events.changes, changes);
});

test("real placement validation rejects overlap with no partial mutation or lost redo", () => {
  const run = fresh(), { editor, events } = harness(run);
  editor.commit(() => UIRaidEditor.patchItem(run.owned, "p4", { x: 648, y: 228 }));
  editor.undo(); const before = clone(run), future = clone(editor.future), changes = events.changes;
  assert.equal(editor.commit(() => UIRaidEditor.patchItem(run.owned, "p4", { x: 648, y: 264 })), false);
  assert.deepEqual(run, before); assert.deepEqual(editor.history, []); assert.deepEqual(editor.future, future);
  assert.equal(events.changes, changes); assert.equal(events.toasts.length, 1);
});

test("recomputing the guide rejects a once-valid board changed before a transaction callback", () => {
  for (const mutate of [
    run => { run.owned[2].w += 4; },
    run => run.owned.push(C.makeItem("gov_breadcrumb", "p5", null, null)),
    run => { run.owned[1].id = "p1"; },
    run => { run.owned[0].x += 4; },
  ]) {
    const run = fresh(), { editor, events } = harness(run), bound = view(run);
    assert.equal(bound.editable, true);
    mutate(run); const stale = clone(run);
    assert.equal(editor.commit(() => {
      const current = view(run);
      if (!current?.editable) return false;
      const target = current.targets.find(target => target.key === "pdf");
      return UIRaidEditor.patchItem(run.owned, current.breadcrumbId, { x: target.x, y: target.y });
    }), false);
    assert.deepEqual(run, stale); assert.deepEqual(editor.history, []); assert.equal(events.changes, 0);
  }
});
