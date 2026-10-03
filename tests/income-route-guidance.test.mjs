import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import { targetCaption } from "../src/catalog/target-caption.js";

// The missing seam and view fail assertions before production implementation.
const guidance = await import("../src/income-route-guidance.js").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
function candidates(board, source, pressure = false, info = E.analyze(board, pressure ? "server-pressure-v1" : null)) {
  assert.equal(typeof E.incomeRouteCandidates, "function");
  return E.incomeRouteCandidates(info.board, info.near, source, pressure);
}
function view(board, source = board[1], options = {}) {
  assert.equal(typeof guidance.incomeRouteGuidance, "function");
  const { info = E.analyze(board, options.pressure ? "server-pressure-v1" : null), ...context } = options;
  return guidance.incomeRouteGuidance(source, info, { owned: board, editable: true, ...context });
}
function render(board, source = board[1], options = {}) {
  assert.equal(typeof guidance.renderIncomeRouteGuidance, "function");
  return guidance.renderIncomeRouteGuidance(view(board, source, options));
}
function legal(board) {
  assert.ok(board.filter(C.placed).every((part) => C.canPlace(board, part, part.x, part.y)));
  return board;
}
function compete() {
  return legal([
    C.makeItem("am_cart", "cart", 32, 32, 200, 76),
    C.makeItem("ab_mail", "mail", 244, 32, 144, 32),
    C.makeItem("am_oneclick", "one", 400, 32, 208, 44),
  ]);
}
function advance(battle, seconds = 30) {
  const events = [];
  for (let i = 0; i < seconds / 0.05; i++) events.push(...battle.step(0.05));
  return events;
}
function battle(board, extra = {}) {
  return new E.Battle(board, [], { playerHp: 10000, enemyHp: 10000, playerCapacity: 35, enemyCapacity: 35, ...extra });
}

test("income producer seam exactly shares the engine's existing predicate and rejects unknown types", () => {
  assert.equal(typeof E.isIncomeProducer, "function");
  const receivers = new Set(["am_cart", "am_oneclick", "ad_popup", "yt_tip"]);
  for (const [type, definition] of Object.entries(D.PARTS)) {
    assert.equal(E.isIncomeProducer({ type }),
      (definition.tags.includes("economy") && !receivers.has(type)) || ["gov_submit", "gov_onestop"].includes(type), type);
  }
  for (const type of ["missing", "__proto__", "constructor", "toString", ""]) {
    assert.equal(E.isIncomeProducer({ type }), false);
  }
});

test("candidate seam preserves nearest ordering, preferred selection and either structural-neighborhood direction", () => {
  const board = compete(), source = board[1], info = E.analyze(board);
  assert.deepEqual(candidates(board, source).map((p) => p.id), ["cart", "one"]);
  const reverseOnly = { ...info, near: { ...info.near, mail: [] } };
  assert.deepEqual(candidates(board, source, false, reverseOnly).map((p) => p.id), ["cart", "one"]);
  for (const routeTo of [undefined, "one", "missing"]) {
    source.routeTo = routeTo;
    const actual = view(board), expected = routeTo === "one" ? "one" : "cart";
    assert.equal(actual.effective.id, expected);
    assert.deepEqual(actual.candidates.map((p) => p.id), ["cart", "one"]);
    const b = battle(board), events = advance(b).filter((e) => e.kind === "conversion" && e.action === "route");
    assert.ok(events.length > 0);
    assert.ok(events.every((e) => e.id === "mail" && e.to === expected));
    assert.equal(b.metrics.player.routed, b.player.income);
    assert.equal(events.reduce((sum, e) => sum + e.value, 0), b.player.income);
  }
});

test("candidate ties keep the existing geometry/type ordering rather than labels or creation order", () => {
  const source = C.makeItem("ab_mail", "source", 240, 200, 144, 32);
  const left = C.makeItem("am_oneclick", "z", 84, 200, 144, 32);
  const right = C.makeItem("am_cart", "a", 396, 200, 144, 32);
  const near = { source: ["a", "z"] };
  assert.equal(typeof E.incomeRouteCandidates, "function");
  assert.deepEqual(E.incomeRouteCandidates([right, source, left], near, source).map((p) => p.id), ["z", "a"]);
  right.label = "AAA";
  left.label = "ZZZ";
  assert.deepEqual(E.incomeRouteCandidates([left, source, right], near, source).map((p) => p.id), ["z", "a"]);
});

test("saved unavailable preference stays selected, names its owned target and automatically resumes when restored", () => {
  const board = compete();
  board[1].routeTo = "one";
  board[2].label = "Checkout B";
  const original = { x: board[2].x, y: board[2].y };
  for (const patch of [{ x: 720, y: 480 }, { x: null, y: null }]) {
    Object.assign(board[2], patch);
    const actual = view(board), html = render(board);
    assert.deepEqual(actual.saved, { id: "one", name: targetCaption(board[2]), available: false });
    assert.equal(actual.effective.id, "cart");
    assert.equal(board[1].routeTo, "one");
    assert.match(html, /<option[^>]*value="one"[^>]*selected[^>]*disabled[^>]*>[^<]*利用不可/);
    assert.match(html, /保存した指定/);
    assert.match(html, /実際の接続先/);
    assert.match(html, /自動へフォールバック/);
    Object.assign(board[2], original);
    assert.equal(view(board).saved.available, true);
    assert.equal(view(board).effective.id, "one");
  }
});

test("source stashing is read-only and preserves the preference until placed", () => {
  const board = compete();
  board[1].routeTo = "one";
  board[1].x = board[1].y = null;
  const actual = view(board);
  assert.equal(actual.placed, false);
  assert.equal(actual.editable, false);
  assert.equal(actual.effective, null);
  assert.deepEqual(actual.candidates, []);
  assert.equal(actual.saved.id, "one");
  assert.match(render(board), /<select[^>]*disabled/);
  assert.match(render(board), /配置してから/);
  assert.equal(board[1].routeTo, "one");
});

test("jobs is a selectable receiver only in explicit pressure context, never ordinary analysis", () => {
  const board = legal([C.makeItem("go_jobs", "jobs", 32, 32), C.makeItem("ab_mail", "mail", 32, 160)]);
  board[1].routeTo = "jobs";
  assert.deepEqual(candidates(board, board[1]), []);
  assert.equal(view(board).saved.available, false);
  assert.equal(view(board).effective, null);
  assert.deepEqual(candidates(board, board[1], true).map((p) => p.id), ["jobs"]);
  const actual = view(board, board[1], { pressure: true });
  assert.equal(actual.saved.available, true);
  assert.equal(actual.effective.id, "jobs");
  for (const pressure of [false, true]) {
    const b = battle(board, { experimentalRules: pressure ? "server-pressure-v1" : null });
    const routed = advance(b).filter((e) => e.kind === "conversion" && e.action === "route");
    assert.equal(routed.length > 0, pressure);
    assert.ok(routed.every((e) => e.to === "jobs"));
  }
});

test("conditional producers have wiring without earning guarantees and full receivers do not spill to another route", () => {
  const conditional = legal([C.makeItem("am_cart", "cart", 32, 32, 200, 76), C.makeItem("yt_ad", "ad", 32, 120, 256, 64)]);
  const b = battle(conditional);
  assert.equal(view(conditional).effective.id, "cart");
  const events = advance(b);
  assert.equal(b.player.income, 0);
  assert.equal(events.filter((e) => e.kind === "conversion").length, 0);
  const html = render(conditional);
  for (const copy of [/収益.*発生条件/, /収益.*増や/, /二重配分/, /満杯.*別.*流れません/]) assert.match(html, copy);
  const board = compete();
  board[0] = C.makeItem("yt_tip", "tip", 32, 32, 200, 76);
  board[1].routeTo = "tip";
  const full = battle(board), source = full.player.parts.find((p) => p.id === "mail");
  full.player.shield = 60;
  full.player.parts.find((p) => p.id === "tip").charge = 6;
  full._earn(full.player, full.enemy, source, 2);
  assert.equal(full.player.income, 2);
  assert.equal(full.metrics.player.routed, 0);
  assert.equal(full.metrics.player.unconverted, 2);
  assert.equal(full.player.parts.find((p) => p.id === "one").charge, 0);
  assert.equal(view(board).effective.id, "tip");
});

test("the view hides controls for non-earners and stale selections without modifying imported references", () => {
  const board = compete();
  board[0].routeTo = "one";
  for (const selected of [board[0], { ...board[1], id: "foreign" }, { ...board[1], type: "gov_submit" }, { ...board[1], type: "__proto__" }]) {
    assert.equal(view(board, selected), null);
    assert.equal(render(board, selected), "");
  }
  assert.equal(board[0].routeTo, "one");
  const unavailable = ["missing", "mail", "__proto__", "constructor", '<bad" onfocus="run>'];
  const nonconsumer = C.makeItem("ab_link", "link", 600, 300);
  board.push(nonconsumer);
  unavailable.push("link");
  for (const routeTo of unavailable) {
    board[1].routeTo = routeTo;
    const actual = view(board);
    assert.equal(actual.saved.id, routeTo);
    assert.equal(actual.saved.available, false);
    assert.equal(actual.effective.id, "cart");
    assert.equal(board[1].routeTo, routeTo);
  }
});

test("view editability is opt-in and the supplied analysis owns effective wiring", () => {
  const board = compete(), info = E.analyze(board);
  assert.equal(typeof guidance.incomeRouteGuidance, "function");
  assert.equal(guidance.incomeRouteGuidance(board[1], info, { owned: board }).editable, false);
  assert.equal(view(board, board[1], { editable: false }).editable, false);
  assert.match(render(board, board[1], { editable: false }), /<select[^>]*disabled/);
  assert.equal(view(board, board[1], { info: { ...info, relations: [] } }).effective, null);
});

test("a stale placed analysis never enables editing a source that is now stashed in owned inventory", () => {
  const board = compete(), info = E.analyze(structuredClone(board));
  board[1].x = board[1].y = null;
  const actual = view(board, board[1], { info });
  assert.equal(actual.editable, false);
  assert.match(render(board, board[1], { info }), /<select[^>]*disabled/);
  assert.equal(actual.effective.id, "cart");
});

test("captions and identifiers are escaped in every selector/status position and projection is pure", () => {
  const board = compete();
  board[2].label = '<img src=x onerror="alert(1)"> & \'checkout\'\n\u202e';
  board[2].id = 'target" onfocus="bad';
  board[1].id = 'source" autofocus="bad';
  board[1].routeTo = board[2].id;
  const info = E.analyze(board), before = structuredClone({ board, info });
  const actual = view(board, board[1], { info }), html = render(board, board[1], { info });
  assert.equal(actual.saved.name, targetCaption(board[2]));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;checkout&#39;/);
  assert.match(html, /data-source-id="source&quot; autofocus=&quot;bad"/);
  assert.match(html, /value="target&quot; onfocus=&quot;bad"/);
  assert.doesNotMatch(html, /<img|onerror="|onfocus="|autofocus="/);
  actual.candidates[0].name = "presentation only";
  assert.deepEqual({ board, info }, before);
  candidates(board, board[1], false, info).reverse();
  assert.deepEqual({ board, info }, before);
});

// Captured from the untouched engine before extraction. All analyzed state,
// 30-second event traces, metrics, income and runtime parts must remain exact.
test("route seam extraction preserves exact legacy/current traces including unavailable and pressure routes", () => {
  const cases = [];
  for (const routeTo of [undefined, "one", "missing", "mail"]) {
    const board = compete();
    if (routeTo !== undefined) board[1].routeTo = routeTo;
    cases.push({ board });
  }
  for (const patch of [{ x: 720, y: 480 }, { x: null, y: null }]) {
    const board = compete();
    board[1].routeTo = "one";
    Object.assign(board[2], patch);
    cases.push({ board });
  }
  cases.push({ board: [C.makeItem("am_cart", "cart", 32, 32, 200, 76), C.makeItem("yt_ad", "ad", 32, 120, 256, 64)] });
  const pressure = [C.makeItem("go_jobs", "jobs", 32, 32), C.makeItem("ab_mail", "mail", 32, 160)];
  pressure[1].routeTo = "jobs";
  cases.push({ board: pressure }, { board: pressure, experimentalRules: "server-pressure-v1" });
  const expected = {
    "combat-v2": "60674088fe6f8778b2452704bd37529df9df216c77e5e7ce6a691d5a95cbe7f7",
    "combat-v3": "13bb180165d6c70697a02671a2f95de528dc6f4b45c66a835314d139cae76977",
    "combat-v4": "a1942b4711c1966307cddf7b7d622d25bd30a9dbc7b2fa5ee7acfb055ef23862",
  };
  for (const [combatVersion, hash] of Object.entries(expected)) {
    const output = cases.map(({ board, experimentalRules }) => {
      const b = battle(board, { combatVersion, experimentalRules }), events = advance(b);
      return { info: b.player.info, events, result: b.result, metrics: b.metrics, income: b.player.income, parts: b.player.parts };
    });
    assert.equal(createHash("sha256").update(JSON.stringify(output)).digest("hex"), hash, combatVersion);
  }
});
