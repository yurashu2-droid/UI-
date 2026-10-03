import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import { targetCaption } from "../src/catalog/target-caption.js";

// Red first: absence of the presentation helper is a behavior assertion failure.
const guidance = await import("../src/conversion-guidance.js").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
function view(selected, info) {
  assert.equal(typeof guidance.conversionGuidance, "function");
  return guidance.conversionGuidance(selected, info);
}
function render(selected, info) {
  assert.equal(typeof guidance.renderConversionGuidance, "function");
  return guidance.renderConversionGuidance(view(selected, info));
}
function legal(board) {
  assert.ok(board.filter(C.placed).every((part) =>
    C.canPlace(board, part, part.x, part.y)));
  return board;
}
function pair(type = "am_oneclick") {
  const consumer = C.makeItem(type, "consumer", 32, 32);
  return legal([consumer, C.makeItem("ab_mail", "mail", 32, 32 + consumer.h + 12)]);
}
function compete() {
  return legal([
    C.makeItem("am_cart", "cart", 32, 32, 200, 76),
    C.makeItem("ab_mail", "mail", 244, 32, 144, 32),
    C.makeItem("am_oneclick", "one", 400, 32, 208, 44),
  ]);
}
function advance(battle, seconds = 12) {
  const events = [];
  for (let i = 0; i < seconds / 0.05; i++) events.push(...battle.step(0.05));
  return events;
}

test("converter guidance lists only authoritative incoming conversion sources for the four consumers", () => {
  for (const type of ["am_cart", "am_oneclick", "ad_popup", "yt_tip"]) {
    const board = pair(type), info = E.analyze(board);
    assert.equal(info.relations.filter((r) => r.kind === "conversion").length, 1);
    assert.deepEqual(view(board[0], info), {
      state: "wired", sources: [{ id: "mail", name: D.PARTS.ab_mail.name }],
    });
    assert.match(render(board[0], info), /チャージの接続元/);
  }
  const board = pair();
  for (const type of ["ab_mail", "am_buy", "go_jobs", "go_instant"]) {
    const selected = C.makeItem(type, "other", 600, 400);
    const info = E.analyze([...board, selected], "server-pressure-v1");
    assert.equal(view(selected, info), null);
    assert.equal(render(selected, info), "");
  }
});

test("nearest and explicit routeTo competition agree with actual battle routing and never double-list income", () => {
  const board = compete();
  for (const [routeTo, winner, loser] of [
    [undefined, "cart", "one"], ["one", "one", "cart"], ["missing", "cart", "one"],
  ]) {
    board[1].routeTo = routeTo;
    const battle = new E.Battle(board, [], { playerHp: 10000, enemyHp: 10000 });
    const actual = view(board.find((p) => p.id === winner), battle.player.info);
    assert.deepEqual(actual.sources.map((p) => p.id), ["mail"]);
    assert.equal(actual.state, "wired");
    assert.deepEqual(view(board.find((p) => p.id === loser), battle.player.info), {
      state: "unwired", sources: [],
    });
    const events = advance(battle).filter((e) => e.kind === "conversion" && e.action === "route");
    assert.ok(events.length > 0);
    assert.ok(events.every((e) => e.id === "mail" && e.to === winner));
  }
});

test("movement, source stashing, and converter stashing distinguish disconnected from absent placement", () => {
  const board = pair();
  assert.equal(view(board[0], E.analyze(board)).state, "wired");
  board[1].y = 500;
  assert.deepEqual(view(board[0], E.analyze(board)), { state: "unwired", sources: [] });
  assert.match(render(board[0], E.analyze(board)), /未接続/);
  board[1].x = board[1].y = null;
  assert.deepEqual(view(board[0], E.analyze(board)), { state: "unwired", sources: [] });
  board[0].x = board[0].y = null;
  assert.deepEqual(view(board[0], E.analyze(board)), { state: "unplaced", sources: [] });
  assert.match(render(board[0], E.analyze(board)), /このページ.*未配置/);
  assert.doesNotMatch(render(board[0], E.analyze(board)), /手持ち|未接続|働いていません/);
});

test("a conditional video ad remains wired while the real engine produces no income or charge", () => {
  const board = legal([
    C.makeItem("am_cart", "cart", 32, 32, 200, 76),
    C.makeItem("yt_ad", "ad", 32, 120, 256, 64),
  ]);
  const battle = new E.Battle(board, [], { playerHp: 10000, enemyHp: 10000 });
  assert.deepEqual(view(board[0], battle.player.info), {
    state: "wired", sources: [{ id: "ad", name: D.PARTS.yt_ad.name }],
  });
  const events = advance(battle, 30);
  assert.equal(battle.player.income, 0);
  assert.equal(battle.metrics.player.routed, 0);
  assert.equal(events.filter((e) => e.kind === "income" || e.kind === "conversion").length, 0);
  const html = render(board[0], battle.player.info);
  assert.match(html, /接続関係/);
  assert.match(html, /収益の発生/);
  assert.match(html, /チャージの受け入れ/);
  assert.match(html, /発動.*条件/);
  assert.doesNotMatch(html, /発動中|稼働中|\$[0-9]|毎秒|働いていません/);
});

test("unwired 1-Click still naturally attacks and the source fragment never calls it inactive", () => {
  const selected = C.makeItem("am_oneclick", "one", 32, 32);
  const battle = new E.Battle([selected], [], { playerHp: 10000, enemyHp: 10000 });
  assert.deepEqual(view(selected, battle.player.info), { state: "unwired", sources: [] });
  const events = advance(battle);
  assert.ok(events.some((e) => e.kind === "damage" && e.side === "player" && e.id === "one"));
  assert.equal(battle.player.income, 0);
  assert.equal(battle.metrics.player.routed, 0);
  const html = render(selected, battle.player.info);
  assert.match(html, /未接続/);
  assert.doesNotMatch(html, /働いていません|攻撃できません|停止中|無効/);
});

test("the provided battle analysis stays authoritative if a later editor copy moved the source", () => {
  const board = pair(), battle = new E.Battle(board, []);
  board[1].y = 500;
  assert.equal(view(board[0], E.analyze(board)).state, "unwired");
  assert.deepEqual(view(board[0], battle.player.info).sources.map((p) => p.id), ["mail"]);
});

test("missing or type-mismatched selected IDs cannot inherit another page part's wiring", () => {
  const board = pair(), info = E.analyze(board);
  for (const selected of [
    { ...board[0], id: "foreign" }, { ...board[0], type: "am_cart" },
  ]) {
    assert.deepEqual(view(selected, info), { state: "unplaced", sources: [] });
    assert.match(render(selected, info), /このページ.*未配置/);
  }
  const missing = { ...info, board: info.board.filter((p) => p.id !== "consumer") };
  assert.deepEqual(view(board[0], missing), { state: "unplaced", sources: [] });
});

test("projection ignores dangling sources, self-links, unrelated kinds and repeated relation IDs", () => {
  const board = pair(), info = E.analyze(board);
  const relation = info.relations.find((r) => r.kind === "conversion");
  info.relations.push(
    { ...relation }, { ...relation, from: "missing" },
    { ...relation, from: "consumer" },
    { ...relation, from: "other", kind: "power" },
  );
  assert.deepEqual(view(board[0], info).sources.map((p) => p.id), ["mail"]);
  const noRelations = { ...info, relations: [] };
  assert.deepEqual(view(board[0], noRelations), { state: "unwired", sources: [] });
  const missingSource = { ...info, board: info.board.filter((p) => p.id !== "mail") };
  assert.deepEqual(view(board[0], missingSource), { state: "unwired", sources: [] });
  for (const patch of [{ x: null, y: null }, { type: "unknown-source" }]) {
    const staleSource = { ...info, board: info.board.map((p) => p.id === "mail" ? { ...p, ...patch } : p) };
    assert.deepEqual(view(board[0], staleSource), { state: "unwired", sources: [] });
  }
});

test("engine board order and source IDs preserve duplicate labels without duplicating one source", () => {
  const board = legal([
    C.makeItem("am_cart", "cart", 32, 32, 280, 100),
    C.makeItem("ab_mail", "top", 324, 32, 144, 32),
    C.makeItem("ab_mail", "bottom", 324, 80, 144, 32),
  ]);
  board[1].label = board[2].label = "Daily";
  const info = E.analyze(board);
  const actual = view(board[0], info);
  assert.deepEqual(actual.sources, [
    { id: "top", name: "Daily（メールリンク）" },
    { id: "bottom", name: "Daily（メールリンク）" },
  ]);
  assert.deepEqual(view(board[0], E.analyze([...board].reverse())), actual);
  assert.equal((render(board[0], info).match(/<li\b/g) ?? []).length, 2);
});

test("canonical source captions stay plain and hostile labels are escaped in the rendered fragment", () => {
  const board = pair();
  board[1].label = '<img src=x onerror="alert(1)"> & \'mail\'\n\u202e';
  const info = E.analyze(board), actual = view(board[0], info);
  assert.equal(actual.sources[0].name, targetCaption(board[1]));
  assert.match(actual.sources[0].name, /（メールリンク）$/);
  assert.doesNotMatch(actual.sources[0].name, /[\n\u202e]/);
  const html = render(board[0], info);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;mail&#39;/);
  assert.doesNotMatch(html, /<img|onerror="alert/);
});

test("long valid labels remain complete and malformed long labels follow targetCaption limits", () => {
  const board = pair();
  for (const label of ["L".repeat(80), "📨".repeat(100)]) {
    board[1].label = label;
    const info = E.analyze(board), name = targetCaption(board[1]);
    assert.equal(view(board[0], info).sources[0].name, name);
    assert.ok(render(board[0], info).includes(name));
  }
  board[1].label = " ";
  assert.equal(view(board[0], E.analyze(board)).sources[0].name, D.PARTS.ab_mail.name);
  board[1].label = D.PARTS.ab_mail.name;
  assert.equal(view(board[0], E.analyze(board)).sources[0].name, D.PARTS.ab_mail.name);
});

test("guidance and rendering leave selected item, labels, routes, and full engine analysis unchanged", () => {
  const board = compete();
  board[1].routeTo = "one";
  board[1].label = "Mail";
  const info = E.analyze(board), before = structuredClone({ board, info });
  const actual = view(board[2], info);
  render(board[2], info);
  actual.sources[0].name = "presentation-only change";
  assert.deepEqual({ board, info }, before);
});
