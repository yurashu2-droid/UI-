import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import C from "../src/document.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { Editor } from "../src/editor.js";
import * as StorySession from "../src/story/session.js";
import { targetCaption } from "../src/catalog/target-caption.js";
import { DESIGN_CANVAS_TEMPLATES } from "../src/catalog/design-canvas-templates.js";

// A missing implementation fails an assertion, rather than masking a bad import.
const guidance = await import("../src/containment-guidance.js").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
function frameset() {
  return DESIGN_CANVAS_TEMPLATES[0].layout.map(([type, x, y, w, h, , label], i) =>
    ({ ...C.makeItem(type, `p${i + 1}`, x, y, w, h), label }));
}
function project(board, ids = ["p1"], options = {}, info = E.analyze(board)) {
  assert.equal(typeof guidance.containmentGuidance, "function");
  return guidance.containmentGuidance(board.filter(p => ids.includes(p.id)), info, options);
}
function render(view) {
  assert.equal(typeof guidance.renderContainmentGuidance, "function");
  return guidance.renderContainmentGuidance(view);
}
const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)];
const textOf = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textOf).join("");
function runWith(board = frameset(), mode = "lab") {
  const run = R.newRun(mode, "blank");
  run.owned = board;
  run.nextId = board.length + 1;
  run.admin = [];
  return run;
}
// Real transactions/history; only DOM event registration is bypassed.
function editorFor(run) {
  const editor = Object.create(Editor.prototype), toasts = [];
  Object.assign(editor, {
    o: { getRun: () => run, enabled: () => true, onChange() {}, onSelect() {}, onToast: message => toasts.push(message) },
    history: [], future: [], selection: new Set(), pending: null, drag: null,
  });
  return { editor, toasts };
}

test("FRAMESET reports the actual immediate parent and separate direct/all-descendant counts", () => {
  const board = frameset(), info = E.analyze(board);
  assert.deepEqual(info.parents, { p2: "p1", p3: "p2" });
  const view = project(board, ["p1", "p2", "p3"], { editable: true }, info);
  assert.deepEqual(view.items.map(p => [p.id, p.parent?.id ?? null, p.directChildCount, p.descendantCount]),
    [["p1", null, 1, 2], ["p2", "p1", 1, 1], ["p3", "p2", 0, 0]]);
  assert.deepEqual(view.items[2].parent, { id: "p2", name: targetCaption(board[1]) });
  assert.deepEqual(view.items.map(p => p.name), board.map(targetCaption));
  assert.equal(view.items[0].isContainer, true);
  assert.equal(view.items[2].isContainer, false);
  assert.equal(view.selectedCount, 3);
  assert.equal(view.unselectedDescendantCount, 0);
  const html = render(view);
  assert.match(html, /直接の親/);
  assert.match(html, /直下.*1.*入れ子全体.*2/);
  assert.match(html, /ページ直下/);
});

test("overlapping selections deduplicate both selection and the unselected descendant union", () => {
  const board = frameset(), info = E.analyze(board);
  assert.equal(project(board, ["p1"], { editable: true }).unselectedDescendantCount, 2);
  assert.equal(project(board, ["p1", "p2"], { editable: true }).unselectedDescendantCount, 1);
  assert.equal(project(board, ["p1", "p3"], { editable: true }).unselectedDescendantCount, 1);
  assert.equal(project(board, ["p2", "p3"], { editable: true }).unselectedDescendantCount, 0);
  assert.equal(typeof guidance.containmentGuidance, "function");
  const repeated = guidance.containmentGuidance([board[0], board[1], board[0]], info, { editable: true });
  assert.equal(repeated.selectedCount, 2);
  assert.equal(repeated.items.length, 2);
  assert.equal(repeated.unselectedDescendantCount, 1);
  const html = render(repeated);
  assert.match(html, /未選択の子孫.*1個/);
  assert.match(html, /重複.*数え|重複.*除/);
});

test("the supplied snapshot owns relationships and captions rather than reanalyzed live geometry", () => {
  const board = frameset(), snapshot = E.analyze(structuredClone(board));
  assert.equal(C.moveMany(board, ["p3"], 0, 412 - board[2].y), true);
  board[1].label = "live table label";
  assert.equal(E.analyze(board).parents.p3, "p1");
  const fromSnapshot = project(board, ["p3"], {}, snapshot);
  assert.deepEqual(fromSnapshot.items[0].parent, { id: "p2", name: targetCaption(snapshot.board[1]) });
  assert.equal(project(board, ["p3"]).items[0].parent.id, "p1");
  assert.equal(project(board, ["p1"], {}, { ...snapshot, parents: {} }).items[0].descendantCount, 0,
    "do not reconstruct a parent tree from coordinates when supplied analysis says otherwise");
});

test("ordinary loose items, empty selections, unplaced and mismatched IDs do not create guidance", () => {
  const board = frameset(), info = E.analyze(board);
  assert.equal(project(board, []), null);
  const loose = C.makeItem("ab_link", "loose", 20, 20);
  assert.equal(project([...board, loose], ["loose"]), null);
  assert.equal(typeof guidance.containmentGuidance, "function");
  for (const selected of [
    { ...board[0], id: "missing" },
    { ...board[0], type: "ab_table" },
    { ...board[0], type: "__proto__" },
  ]) assert.equal(guidance.containmentGuidance([selected], info, { editable: true }), null);
  const run = runWith(board);
  assert.equal(R.move(run, "p1", null, null), true);
  assert.equal(project(run.owned, ["p1", "p2", "p3"], { editable: true }), null);
  assert.equal(render(null), "");
  const emptyContainer = C.makeItem("gov_form", "empty", 20, 20);
  assert.equal(project([emptyContainer], ["empty"]).items[0].descendantCount, 0);
});

test("action effects require explicit current editability and a complete placed selection", () => {
  const board = frameset(), snapshot = E.analyze(structuredClone(board));
  for (const options of [{}, { editable: false }]) {
    const view = project(board, ["p1"], options, snapshot), html = render(view);
    assert.equal(view.editable, false);
    assert.match(html, /直接の親/);
    assert.doesNotMatch(html, /ドラッグ|手持ち|売却|削除/);
  }
  const editable = project(board, ["p1"], { editable: true }, snapshot);
  assert.equal(editable.editable, true);
  assert.match(render(editable), /ドラッグ.*矢印キー.*座標欄/);
  assert.match(render(editable), /手持ち/);
  const invalid = { ...board[2], id: "foreign" };
  assert.equal(guidance.containmentGuidance([board[0], invalid], snapshot, { editable: true }).editable, false);
  board[0].x = board[0].y = null;
  const stale = project(board, ["p1"], { editable: true }, snapshot);
  assert.equal(stale.editable, false);
  assert.equal(stale.items[0].descendantCount, 2, "historical relationship remains supplied analysis");
});

test("captions are bounded, safely escaped and wrapped without adding actions or mutating inputs", () => {
  const board = frameset();
  board[0].label = '<img src=x onerror="bad()"> & \'outer\'\n\u202e' + "名".repeat(140);
  board[1].label = '<script>bad()</script> & \'inner\'';
  board[2].label = 'a" onclick="bad';
  const info = E.analyze(board), before = structuredClone({ board, info });
  const view = project(board, ["p1", "p2", "p3"], { editable: true }, info), html = render(view);
  const nodes = walk(parseFragment(html)), renderedText = textOf(parseFragment(html));
  for (const part of board) assert.ok(renderedText.includes(targetCaption(part)));
  assert.match(html, /&lt;img.*&quot;bad\(\)&quot;.*&amp;.*&#39;outer&#39;/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.doesNotMatch(html, /<img|<script|onclick="|onerror="|\u202e/);
  for (const node of nodes) {
    assert.ok(!["button", "input", "select", "textarea", "a", "script", "img"].includes(node.tagName));
    assert.ok((node.attrs ?? []).every(a => !a.name.startsWith("on")));
  }
  assert.ok(view.items[0].name.includes("…"));
  view.items[1].parent.name = "presentation-only";
  view.items[0].descendantCount = 400;
  assert.deepEqual({ board, info }, before);
});

test("real Editor coordinate movement carries descendants once and undo restores exact relationships", () => {
  const run = runWith(), before = structuredClone(run), { editor } = editorFor(run);
  assert.equal(project(run.owned, ["p1"], { editable: true }).unselectedDescendantCount, 2);
  editor.select(["p1"]);
  editor.update({ x: run.owned[0].x + 8 });
  assert.deepEqual(run.owned.map(p => p.x), before.owned.map(p => p.x + 8));
  assert.deepEqual(E.analyze(run.owned).parents, { p2: "p1", p3: "p2" });
  editor.undo();
  assert.deepEqual(run, before);
  assert.equal(editor.commit(() => C.moveMany(run.owned, ["p1", "p2"], 0, 8)), true);
  assert.deepEqual(run.owned.map(p => p.y), before.owned.map(p => p.y + 8));
  editor.undo();
  assert.deepEqual(run, before);
  assert.equal(R.move(run, "p1", run.owned[0].x + 1, run.owned[0].y), true);
  assert.equal(run.owned[1].x, before.owned[1].x, "direct R.move coordinates do not carry descendants");
  assert.equal(run.owned[2].x, before.owned[2].x);
});

test("real Editor stash keeps ownership and money but loses nesting; placing only the parent leaves children stashed", () => {
  const run = runWith(), before = structuredClone(run), { editor } = editorFor(run);
  const html = render(project(run.owned, ["p1"], { editable: true }));
  assert.match(html, /所持|所有/);
  assert.match(html, /位置.*失|配置.*失|位置.*解除/);
  assert.match(html, /個別|一つずつ|1つずつ/);
  editor.select(["p1", "p2"]);
  editor.stash();
  assert.equal(run.cash, before.cash);
  assert.deepEqual(run.owned, before.owned.map(p => ({ ...p, x: null, y: null })));
  assert.deepEqual(E.analyze(run.owned).parents, {});
  assert.equal(project(run.owned, ["p1"], { editable: true }), null);
  editor.undo();
  assert.deepEqual(run, before);
  editor.redo();
  assert.ok(run.owned.every(p => !C.placed(p)));
  assert.equal(R.move(run, "p1", before.owned[0].x, before.owned[0].y), true);
  assert.equal(C.placed(run.owned[0]), true);
  assert.ok(run.owned.slice(1).every(p => !C.placed(p)));
  assert.deepEqual(E.analyze(run.owned).parents, {});
  assert.equal(project(run.owned, ["p1"]).items[0].descendantCount, 0);
});

for (const mode of ["lab", "campaign"]) {
  test(`real ${mode} selected-only removal leaves unselected descendants in place and Undo restores the inventory`, () => {
    const run = runWith(frameset(), mode), before = structuredClone(run), { editor } = editorFor(run);
    const html = render(project(run.owned, ["p2"], { editable: true }));
    assert.match(html, /売却.*削除|削除.*売却/);
    assert.match(html, /選択.*だけ|選択.*のみ/);
    assert.match(html, /未選択.*残/);
    assert.match(html, /親.*再判定|親.*決まり直/);
    editor.select(["p2"]);
    editor.remove();
    assert.deepEqual(run.owned, [before.owned[0], before.owned[2]]);
    assert.equal(run.cash, before.cash + R.sellValue(before, "ab_table"));
    assert.equal(E.analyze(run.owned).parents.p3, "p1");
    assert.equal(project(run.owned, ["p3"]).items[0].parent.id, "p1");
    const removed = structuredClone(run);
    editor.undo();
    assert.deepEqual(run, before);
    editor.redo();
    assert.deepEqual(run, removed);
  });
}

test("all-item removal can fail atomically, so guidance describes effects without promising success", () => {
  const run = runWith(), before = structuredClone(run), { editor, toasts } = editorFor(run);
  const view = project(run.owned, ["p1", "p2", "p3"], { editable: true });
  assert.equal(view.unselectedDescendantCount, 0);
  assert.match(render(view), /実行できない|実行.*制限|失敗/);
  editor.select(["p1", "p2", "p3"]);
  editor.remove();
  assert.deepEqual(run, before);
  assert.deepEqual(editor.history, []);
  assert.match(toasts.at(-1), /最後のUI/);
});

test("G retains real composition-group precedence and the container descendant fallback", () => {
  const run = runWith(), { editor } = editorFor(run);
  editor.groupSelect("p1");
  assert.deepEqual([...editor.selection], ["p1", "p2", "p3"]);
  assert.equal(project(run.owned, [...editor.selection]).unselectedDescendantCount, 0);
  run.owned = [
    C.makeItem("gov_form", "form", 32, 32, 480, 368),
    C.makeItem("go_search", "search", 52, 100, 280, 40),
    C.makeItem("go_lucky", "lucky", 332, 100, 120, 40),
  ];
  const info = C.analyze(run.owned);
  assert.ok(info.member.search.length);
  editor.groupSelect("search");
  assert.deepEqual([...editor.selection], info.member.search[0].items);
  assert.deepEqual(new Set(editor.selection), new Set(["search", "lucky"]));
  assert.equal(project(run.owned, [...editor.selection]).selectedCount, 2);
});

test("separate selected containers include both descendant sets while loose selections only affect the selection count", () => {
  const board = [
    C.makeItem("gov_form", "left", 16, 16, 440, 344),
    C.makeItem("ab_table", "table", 32, 72, 400, 176),
    C.makeItem("gov_pdf", "pdf", 48, 120, 280, 48),
    C.makeItem("gov_form", "right", 480, 16, 440, 344),
    C.makeItem("ab_link", "child", 496, 100),
    C.makeItem("ab_link", "loose", 32, 480),
  ];
  assert.ok(board.every(part => C.canPlace(board, part, part.x, part.y)));
  const view = project(board, ["left", "table", "right", "loose"], { editable: true });
  assert.deepEqual(view.items.map(p => [p.id, p.directChildCount, p.descendantCount]),
    [["left", 1, 2], ["right", 1, 1], ["table", 1, 1]]);
  assert.equal(view.selectedCount, 4);
  assert.equal(view.unselectedDescendantCount, 2);
  assert.equal(view.editable, true);
});

test("selling overlapping ancestor selections leaves the remaining child exactly in place", () => {
  const run = runWith(), before = structuredClone(run), { editor } = editorFor(run);
  assert.equal(project(run.owned, ["p1", "p2"], { editable: true }).unselectedDescendantCount, 1);
  editor.select(["p1", "p2"]);
  editor.remove();
  assert.deepEqual(run.owned, [before.owned[2]]);
  assert.deepEqual(E.analyze(run.owned).parents, {});
  assert.equal(project(run.owned, ["p3"]), null, "a formerly nested leaf now has no containment to explain");
  editor.undo();
  assert.deepEqual(run, before);
});

test("invalid or stashed entries in a supplied board cannot become a parent or count as a descendant", () => {
  const board = frameset(), info = E.analyze(board);
  const malformed = { ...info, board: [...info.board,
    { ...board[2], id: "stash", x: null, y: null },
    { ...board[2], id: "unknown", type: "constructor" },
  ], parents: { ...info.parents, stash: "p1", unknown: "p1", missing: "p1" } };
  assert.equal(project(board, ["p1"], {}, malformed).items[0].descendantCount, 2);
  assert.equal(project(board, ["p1"], {}, { ...info, parents: { p1: "p1" } }).items[0].parent, null);
  assert.equal(project(board, ["p3"], {}, { ...info, parents: { p3: "missing" } }), null);
  const inherited = Object.create({ p3: "p1" });
  assert.equal(project(board, ["p3"], {}, { ...info, parents: inherited }), null);
});

test("a real story build rejects sale of a protected nested child despite the ordinary sale succeeding", () => {
  const named = StorySession.commandStorySession(StorySession.createStorySession(), { type: "name-page", name: "Containment QA" });
  assert.equal(named.ok, true);
  const session = named.session;
  // Test-only legal nested inventory exercises protection; it is not an acquisition claim.
  session.run.owned = frameset();
  session.run.owned[2] = C.makeItem("ab_mail", "p3", 260, 254, 224, 32);
  session.run.nextId = 4;
  session.protectedKitIds = ["p3"];
  assert.equal(StorySession.validateStorySession(session), true);
  const before = structuredClone(session), html = render(project(session.run.owned, ["p3"], { editable: true }));
  assert.match(html, /物語の保護対象.*実行できない/);
  const attempted = structuredClone(session.run);
  assert.equal(R.sell(attempted, "p3").ok, true);
  const result = StorySession.updateStoryBuild(session, attempted);
  assert.equal(result.ok, false);
  assert.match(result.error, /支給品.*残/);
  assert.deepEqual(result.session, before);
  assert.deepEqual(session, before);
  assert.equal(project(session.run.owned, ["p3"]).items[0].parent.id, "p2");
});
