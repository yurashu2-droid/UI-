import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import C from "../src/document.js";
import E from "../src/engine.js";
import * as S from "../src/story/session.js";
import { SUPPORTED_COMBAT_VERSIONS } from "../src/combat-rules.js";
import { simulateCommerceRecovery } from "../scripts/commerce-recovery.js";

// Red first: a missing presentation module is a behavior assertion, not a loader error.
const result = await import("../src/battle-income-result.js").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
const project = (battle) => {
  assert.equal(typeof result.battleIncomeResult, "function");
  return result.battleIncomeResult(battle);
};
const render = (view) => {
  assert.equal(typeof result.renderBattleIncomeResult, "function");
  return result.renderBattleIncomeResult(view);
};
const finish = (battle) => {
  const events = [];
  for (let i = 0; i < 5000 && !battle.result; i++) events.push(...battle.step(.05));
  assert.ok(battle.result);
  return events;
};
const legal = (parts) => {
  assert.ok(parts.every((p) => C.canPlace(parts, p, p.x, p.y, p.w, p.h)));
  return parts;
};
const options = { playerHp: 10000, enemyHp: 10000 };
const ledger = (battle) => ({
  grossIncome: battle.player.income,
  routed: battle.metrics.player.routed,
  spent: battle.metrics.player.spent,
  retained: battle.player.parts.reduce((sum, p) => sum + p.charge, 0),
  unconverted: battle.metrics.player.unconverted,
});
function parsed(html) {
  const root = parseFragment(html);
  const all = [];
  const visit = (node) => { all.push(node); for (const child of node.childNodes ?? []) visit(child); };
  visit(root);
  return {
    all,
    text: all.filter((n) => n.nodeName === "#text").map((n) => n.value).join(" "),
    details: all.find((n) => n.tagName === "details"),
    summary: all.find((n) => n.tagName === "summary"),
  };
}

// Substituting settlement payout for gross income or guessing routed from earned
// income breaks the two real paid outcomes. The projection never settles a match.
test("the paid story loss exposes 41 gross but zero routed charge separately from its 10 income payout", () => {
  const route = simulateCommerceRecovery();
  for (const [key, expected, winner, time, payout] of [
    ["beforeLoss", {grossIncome:41,routed:0,spent:0,retained:0,unconverted:41}, "enemy",20.65,16],
    ["beforeRetry", {grossIncome:42,routed:23,spent:21,retained:2,unconverted:19}, "player",18.4,20],
  ]) {
    const source = route[key], saved = structuredClone(source);
    const id = "income-result-" + key;
    const prepared = S.prepareStoryBattle(source, id);
    assert.equal(prepared.ok, true, prepared.error);
    const b = prepared.battle;
    finish(b);
    assert.equal(b.result.winner, winner);
    assert.ok(Math.abs(b.elapsed - time) < 1e-9);
    assert.equal(b.player.load, 33);
    assert.equal(b.player.capacity, 35);
    assert.equal(b.player.lagLoss ?? 0, 0);
    const before = structuredClone(b);
    const view = project(b);
    assert.deepEqual(view, expected);
    const html = render(view);
    assert.deepEqual(structuredClone(b), before, "projection/rendering cannot change the finished battle");
    assert.deepEqual(source, saved, "reading a battle cannot settle or rewrite the paid session");
    const settled = S.settleStoryBattle(prepared.session, id, b);
    assert.equal(settled.ok, true);
    assert.equal(settled.summary.rawIncome, expected.grossIncome);
    assert.equal(settled.summary.income, 10);
    assert.equal(settled.summary.total, payout);
    assert.match(html, /チャージの消費は.*精算.*収益.*差し引きません/);
    assert.doesNotMatch(html, /敗因|原因|必ず|おすすめ|ボーナス|<span>所持金<\/span>|停止中|攻撃できません/);
    assert.deepEqual(Object.keys(view).sort(), ["grossIncome","retained","routed","spent","unconverted"]);
  }
});

// Inferring "unconnected" from unconverted, or dropping full-receiver surplus,
// would misdescribe two live, legally connected income sources.
test("a full capped support receiver reports its actual unaccepted surplus without calling it disconnected", () => {
  const parts = legal([
    C.makeItem("yt_tip", "tip", 32, 32),
    C.makeItem("ab_mail", "m1", 32, 88),
    C.makeItem("ab_mail", "m2", 268, 32),
  ]);
  const b = new E.Battle(parts, [], {...options, playerAdmin:["adnet"]});
  const events = finish(b);
  assert.equal(b.player.info.relations.filter((r) => r.kind === "conversion").length, 2);
  assert.deepEqual(project(b), {grossIncome:60,routed:30,spent:24,retained:6,unconverted:30});
  const conversion = events.filter((e) => e.kind === "conversion" && e.side === "player");
  assert.equal(conversion.filter((e) => e.action === "route").reduce((n,e) => n+e.value,0), 30);
  assert.equal(conversion.filter((e) => e.action === "spend").reduce((n,e) => n+e.value,0), 24);
  const html = render(project(b));
  assert.match(html, /チャージに入らなかった収益/);
  assert.match(html, /接続先がない.*満杯/);
  assert.doesNotMatch(html, /未接続の収益|受け入れ失敗|収益を失|\$30.*未接続/);
});

// Filtering to ordinary shopping/support parts would miss the laboratory's
// genuine spend. No charge, counters, clocks or income are injected here.
test("laboratory server-pressure spend is a charge ledger, not an attack count", () => {
  const jobs = C.makeItem("go_jobs", "jobs", 32, 32);
  const parts = legal([jobs, C.makeItem("ab_mail", "mail", 32, 44+jobs.h)]);
  const b = new E.Battle(parts, [], {...options, experimentalRules:"server-pressure-v1",playerCapacity:26,enemyCapacity:26});
  const events = finish(b);
  assert.ok(b.metrics.player.spent > 0);
  assert.ok(events.some((e) => e.kind === "server-pressure"));
  assert.equal(b.player.damage, 0);
  assert.deepEqual(project(b), ledger(b));
  assert.doesNotMatch(render(project(b)), /追加攻撃|攻撃回数|勝因|敗因/);
});

// Flooring displayed amounts would erase real ad-network half units.
test("fractional gross income remains precise in the view and rendered result", () => {
  const parts = legal([C.makeItem("ab_blog", "blog", 32, 32)]);
  const b = new E.Battle(parts, [], {...options,playerAdmin:["adnet"]});
  finish(b);
  assert.equal(b.player.income, 19.5);
  assert.deepEqual(project(b), {grossIncome:19.5,routed:0,spent:0,retained:0,unconverted:19.5});
  assert.match(render(project(b)), /\$19\.5/);
});

// No-income 1-Click still attacks naturally. Zero must stay real data while its
// details remain collapsed, and missing data must not produce the same zero view.
test("an income-free battle keeps valid zero data behind one collapsed details summary", () => {
  const b = new E.Battle([C.makeItem("am_oneclick", "one", 32, 32)], [], options);
  finish(b);
  assert.ok(b.player.damage > 0);
  assert.deepEqual(project(b), {grossIncome:0,routed:0,spent:0,retained:0,unconverted:0});
  const html = render(project(b)), dom = parsed(html);
  assert.ok(dom.details);
  assert.ok(dom.summary);
  assert.ok(!dom.details.attrs.some((a) => a.name === "open"));
  assert.match(dom.text, /\$0/);
  assert.doesNotMatch(dom.text, /停止|無効|攻撃できません|稼いでいないため/);
  assert.ok(!dom.all.some((n) => ["button","input","select","script"].includes(n.tagName)));
});

// Missing/nonfinite measurements must be omitted; defaults would fabricate a
// real-looking zero result for an old summary, unfinished battle or partial data.
test("unfinished and unavailable result data are omitted rather than filled with zeros", () => {
  const b = new E.Battle([], [], options);
  for (const missing of [null, undefined, {}, b]) assert.equal(project(missing), null);
  finish(b);
  const source = structuredClone(b);
  const cases = [
    { ...source, result:null },
    { ...source, metrics:undefined },
    { ...source, metrics:{} },
    { ...source, player:undefined },
    { ...source, player:{...source.player,parts:undefined} },
    { ...source, player:{...source.player,income:undefined} },
    { ...source, player:{...source.player,parts:[{}]} },
    { ...source, player:{...source.player,parts:[{charge:NaN}]} },
  ];
  for (const field of ["routed","spent","unconverted"])
    for (const invalid of [undefined,NaN,Infinity,-1,"0"])
      cases.push({...source,metrics:{player:{...source.metrics.player,[field]:invalid}}});
  for (const invalid of [NaN,Infinity,-1,"0"])
    cases.push({...source,player:{...source.player,income:invalid}});
  for (const candidate of cases) assert.equal(project(candidate), null);
  assert.equal(render(null), "");
});

// A returned view must be a snapshot, not an alias or a future recomputation
// from an edited board. Rendering it cannot consult mutable current app state.
test("the view is detached from battle objects and later source changes", () => {
  const b = new E.Battle([C.makeItem("ab_mail", "mail", 32, 32)], [], options);
  finish(b);
  const before = structuredClone(b), view = project(b), expected = structuredClone(view);
  assert.deepEqual(view, ledger(b));
  assert.deepEqual(structuredClone(b), before);
  const html = render(view);
  b.player.income = 999;
  b.metrics.player.unconverted = 999;
  b.player.parts[0].charge = 999;
  assert.deepEqual(view, expected);
  assert.equal(render(view), html);
});

// These are real completed battles across supported replays, not synthetic
// counters. A side swap or recalculation using a different ruleset must fail.
test("supported rulesets project the player's finished measured ledger unchanged", () => {
  for (const combatVersion of SUPPORTED_COMBAT_VERSIONS) {
    const cart = C.makeItem("am_cart", "cart", 32, 32);
    const parts = legal([cart, C.makeItem("ab_mail", "mail", 32, 44+cart.h)]);
    const b = new E.Battle(parts, [], {...options,combatVersion});
    finish(b);
    const measured = ledger(b);
    assert.ok(measured.grossIncome > 0);
    assert.ok(measured.spent > 0);
    assert.equal(measured.grossIncome, measured.routed+measured.unconverted);
    assert.equal(measured.routed, measured.spent+measured.retained);
    assert.deepEqual(project(b), measured);
    assert.equal(b.enemy.income, 0);
  }
});
