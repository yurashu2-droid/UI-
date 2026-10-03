import * as incomeRoutes from '../src/income-route-guidance.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { parseFragment } from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import * as appGuidance from '../src/app-guidance.js';
import * as navigation from '../src/navigation-guidance.js';
import { targetCaption } from '../src/catalog/target-caption.js';
import * as conversion from '../src/conversion-guidance.js';
import { simulateCommerceRecovery } from '../scripts/commerce-recovery.ts';
const { conversionGuidance, renderConversionGuidance } = conversion;

// Execute production inspector code, stubbing only unrelated surrounding UI.
// These checks cover generated HTML and real engine analysis, not browser pixels.
const app = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const rules = app.slice(app.indexOf('const KIND:'), app.indexOf('function shortDesc('));
function compiled(name) {
  const fn = app.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))?.[0];
  assert.ok(fn, `production ${name} exists`);
  return transformSync(fn, { loader: 'ts', target: 'es2022' }).code;
}
const selectionCode = transformSync(rules, { loader: 'ts', target: 'es2022' }).code + '\n' + compiled('selectionCard');
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function inspect(selected, info) {
  const context = {
    ...appGuidance, ...navigation, ...conversion, ...incomeRoutes, incomeRouteEditingAllowed:()=>false, targetCaption, D, P: D.PARTS, E, R, selected, info,
    run: R.newRun('campaign'), battle: null, storyActive: false,
    labPressureCapacity: () => null, labBattleController: { value: 'normal' },
    esc: escape, skinPicker: () => '',
  };
  vm.runInNewContext(`${selectionCode}\noutput=selectionCard([selected],info);`, context);
  return context.output;
}
function pair(consumerType = 'am_cart', sourceType = 'am_newsletter') {
  const consumer = C.makeItem(consumerType, 'consumer', 32, 32);
  const source = C.makeItem(sourceType, 'source', consumer.x + consumer.w + 8, 32);
  const board = [consumer, source];
  assert.ok(board.every(p => C.canPlace(board, p, p.x, p.y, p.w, p.h)));
  return { board, consumer, source };
}

test('QA: actual selected converter names its engine-chosen source with canonical identity', () => {
  const { board, consumer, source } = pair();
  source.label = 'Inspector source proof';
  const info = E.analyze(board);
  assert.ok(info.relations.some(r => r.kind === 'conversion' && r.from === source.id && r.to === consumer.id));
  const html = inspect(consumer, info);
  assert.ok(html.includes(targetCaption(source)), 'inspector must render the actual source identity');
});


function simulate(board, options = {}) {
  const battle = new E.Battle(board, [], {
    playerCapacity: Infinity, enemyHp: 10_000, ...options,
  });
  const events = [];
  for (let tick = 0; tick < 260 && !battle.result; tick++) events.push(...battle.step(.05));
  return { battle, events };
}
function competitors(secondType = 'am_oneclick') {
  const left = C.makeItem('am_cart', 'left', 32, 32);
  const source = C.makeItem('ab_mail', 'source', 320, 32, 144, 32);
  const right = C.makeItem(secondType, 'right', 472, 32);
  source.label = 'Shared revenue';
  const board = [left, source, right];
  assert.ok(board.every(p => C.canPlace(board, p, p.x, p.y, p.w, p.h)));
  return { board, left, source, right };
}
const sourceIds = (selected, info) => conversionGuidance(selected, info)?.sources.map(s => s.id);
const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)];
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');

for (const type of ['am_cart', 'am_oneclick', 'ad_popup', 'yt_tip']) {
  test(`QA: ${type} source guidance distinguishes wired, moved and stash states`, () => {
    const { board, consumer, source } = pair(type);
    source.label = 'Revenue source';
    const original = structuredClone(board);
    let info = E.analyze(board);
    assert.deepEqual(conversionGuidance(consumer, info), {
      state: 'wired', sources: [{ id: source.id, name: targetCaption(source) }],
    });
    assert.deepEqual(board, original);
    assert.ok(inspect(consumer, info).includes(targetCaption(source)));
    source.x = 640; source.y = 560;
    info = E.analyze(board);
    assert.deepEqual(conversionGuidance(consumer, info), { state: 'unwired', sources: [] });
    assert.match(inspect(consumer, info), /未接続/);
    assert.ok(!inspect(consumer, info).includes(targetCaption(source)));
    consumer.x = null; consumer.y = null;
    info = E.analyze(board);
    assert.deepEqual(conversionGuidance(consumer, info), { state: 'unplaced', sources: [] });
    const fragment = renderConversionGuidance(conversionGuidance(consumer, info));
    assert.match(fragment, /未配置/);
    assert.doesNotMatch(fragment, /接続中|稼働中|受取中|発動中/);
  });
}

test('QA: closest actual recipient owns income once; routeTo can choose another nearby recipient', () => {
  const { board, left, source, right } = competitors();
  for (const routedTo of [right.id, left.id, 'missing-consumer']) {
    source.routeTo = routedTo;
    const expected = routedTo === left.id ? left.id : right.id;
    const info = E.analyze(board), { events } = simulate(board);
    assert.deepEqual(info.relations.filter(r => r.kind === 'conversion').map(r => [r.from, r.to]), [[source.id, expected]]);
    for (const consumer of [left, right]) {
      assert.deepEqual(sourceIds(consumer, info), consumer.id === expected ? [source.id] : []);
      const html = inspect(consumer, info);
      assert.equal(html.includes(targetCaption(source)), consumer.id === expected);
      if (consumer.type === 'am_cart') {
        if (consumer.id === expected) assert.doesNotMatch(html, /今は働いていません/);
        else assert.match(html, /今は働いていません/);
      }
    }
    const actual = events.filter(e => e.kind === 'conversion' && e.action === 'route' && e.id === source.id);
    assert.ok(actual.length > 0);
    assert.ok(actual.every(e => e.to === expected));
    const routed = actual.reduce((sum, e) => sum + e.value, 0);
    const earned = events.filter(e => e.kind === 'income' && e.id === source.id).reduce((sum, e) => sum + e.value, 0);
    assert.equal(routed, earned, 'a source is not duplicated between recipients');
  }
});

for (const type of ['am_coupon', 'yt_ad']) {
  test(`QA: inactive conditional source ${type} remains wiring, never an income promise`, () => {
    const { board, consumer, source } = pair('am_cart', type);
    source.label = 'Conditional source';
    const info = E.analyze(board), { battle, events } = simulate(board);
    assert.deepEqual(sourceIds(consumer, info), [source.id]);
    assert.equal(battle.player.income, 0);
    assert.equal(events.some(e => e.kind === 'income' || (e.kind === 'conversion' && e.action === 'route')), false);
    const fragment = renderConversionGuidance(conversionGuidance(consumer, info));
    assert.ok(fragment.includes(targetCaption(source)));
    assert.match(fragment, /収益/);
    assert.match(fragment, /条件/);
    assert.match(fragment, /収益の発生.*受け入れ.*発動.*条件/);
    assert.doesNotMatch(fragment, /稼働中|収益発生中|発動中|秒ごと/);
  });
}

test('QA: unwired One-click keeps its real natural attack and distinct cumulative-income help', () => {
  const consumer = C.makeItem('am_oneclick', 'one', 32, 32);
  const info = E.analyze([consumer]), { battle, events } = simulate([consumer]);
  assert.deepEqual(conversionGuidance(consumer, info), { state: 'unwired', sources: [] });
  assert.equal(battle.player.income, 0);
  assert.ok(events.some(e => e.kind === 'damage' && e.id === consumer.id));
  assert.equal(events.some(e => e.kind === 'conversion'), false);
  const html = inspect(consumer, info);
  assert.match(html, /未接続/);
  assert.match(html, /収益が未接続でも通常攻撃は使える/);
  assert.match(html, /累計収益/);
  assert.doesNotMatch(html, /今は働いていません/);
});

test('QA: only provided conversion relations count, independent of proximity and stale relation IDs', () => {
  const { board, consumer, source } = pair();
  const remote = C.makeItem('ab_mail', 'remote', 640, 560);
  const held = C.makeItem('ab_mail', 'held', null, null);
  const info = {
    board: [...board, remote, held],
    relations: [
      { from: remote.id, to: consumer.id, kind: 'conversion', label: 'provided route' },
      { from: source.id, to: consumer.id, kind: 'income', label: 'wrong kind' },
      { from: consumer.id, to: source.id, kind: 'conversion', label: 'wrong direction' },
      { from: 'missing', to: consumer.id, kind: 'conversion', label: 'stale source' },
      { from: held.id, to: consumer.id, kind: 'conversion', label: 'stashed source' },
    ],
  };
  for (const type of ['constructor', '__proto__', 'toString', 'unknown']) {
    const invalid = { ...remote, id: `invalid-${type}`, type };
    info.board.push(invalid);
    info.relations.push({ from: invalid.id, to: consumer.id, kind: 'conversion', label: 'invalid source' });
  }
  const before = structuredClone(info);
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
    return value;
  };
  freeze(info);
  assert.deepEqual(sourceIds(consumer, info), [remote.id], 'trust supplied routing, do not guess from geometry');
  assert.deepEqual(info, before);
  assert.deepEqual(conversionGuidance(consumer, { board: [source], relations: info.relations }), { state: 'unplaced', sources: [] });
  const wrongType = { ...consumer, type: 'yt_tip' };
  assert.deepEqual(conversionGuidance(wrongType, info), { state: 'unplaced', sources: [] });
});

test('QA: identical display labels do not merge distinct source identities or duplicate relation rows', () => {
  const { board, consumer, source } = pair();
  const other = C.makeItem('am_newsletter', 'other', 32, 140);
  source.label = other.label = 'Same label';
  board.push(other);
  assert.ok(board.every(p => C.canPlace(board, p, p.x, p.y, p.w, p.h)));
  const info = E.analyze(board);
  assert.equal(info.relations.filter(r => r.kind === 'conversion').length, 2);
  info.relations.push(...info.relations.filter(r => r.kind === 'conversion'));
  const view = conversionGuidance(consumer, info);
  assert.deepEqual(view.sources.map(s => s.id), [source.id, other.id]);
  assert.equal(view.sources[0].name, view.sources[1].name);
  const rows = walk(parseFragment(renderConversionGuidance(view))).filter(n => n.tagName === 'li');
  assert.equal(rows.length, 2);
});

test('QA: hostile, long and control-character labels are escaped as text with their canonical type', () => {
  const { board, consumer, source } = pair();
  for (const label of ['<img src=x onerror="alert(1)">&\'quoted\'', '同じ名前'.repeat(50), '\u202eRevenue\nsource\u0000']) {
    source.label = label;
    const before = structuredClone(board), info = E.analyze(board);
    const html = inspect(consumer, info), nodes = walk(parseFragment(html));
    const caption = targetCaption(source);
    assert.ok(nodes.some(n => n.tagName === 'li' && text(n) === caption));
    assert.ok(caption.includes(`（${D.PARTS[source.type].name}）`));
    assert.ok(!nodes.some(n => n.tagName === 'img'));
    assert.ok(!nodes.some(n => n.attrs?.some(a => a.name.startsWith('on'))));
    assert.doesNotMatch(caption, /[\u0000\u202e\n]/);
    assert.deepEqual(board, before);
  }
});

test('QA: unrelated and prototype-looking converter types cannot produce guidance', () => {
  const { board, consumer } = pair();
  const info = E.analyze(board);
  for (const type of ['am_buy', 'go_jobs', 'ab_mail', 'constructor', '__proto__', 'toString', 'not-a-part']) {
    assert.equal(conversionGuidance({ ...consumer, type }, info), null, type);
  }
  assert.equal(renderConversionGuidance(null), '');
});

function inspectSide(run, battle, selected) {
  const nodes = new Map();
  const node = () => ({ innerHTML: '', disabled: false, querySelector: () => ({}) });
  const context = {
    ...appGuidance, ...navigation, ...conversion, ...incomeRoutes, incomeRouteEditingAllowed:()=>false, targetCaption,
    D, P: D.PARTS, E, R, C, run, battle, storyActive: false, preview: false,
    labPressureCapacity: () => null, labBattleController: { value: 'normal' },
    HTMLSelectElement: class {}, editor: { selected: () => [selected], history: [], future: [] },
    $: key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); },
    esc: escape, skinPicker: () => '', synergyPanel: () => '', opponentCard: () => '',
    appOpponent: () => ({ faction: 'retro', pageName: 'Opponent', decor: [] }),
    appEnemyBoard: () => [], V: { header: () => '', render() {} }, scheduleFit() {},
  };
  vm.runInNewContext(`${selectionCode}\n${compiled('renderSide')}\nrenderSide();`, context);
  return nodes.get('#inspector').innerHTML;
}

test('QA: actual renderSide uses battle-authoritative source routes and resumes editor analysis afterward', () => {
  const { board, left, source, right } = competitors('go_jobs');
  source.routeTo = right.id;
  const run = R.newRun('campaign');
  run.owned = board;
  const editorInfo = E.analyze(board);
  assert.deepEqual(sourceIds(left, editorInfo), [source.id]);
  const battle = new E.Battle(board, [], {
    experimentalRules: 'server-pressure-v1', playerCapacity: 26, enemyCapacity: 26,
  });
  assert.deepEqual(sourceIds(left, battle.player.info), []);
  assert.ok(battle.player.info.relations.some(r => r.kind === 'conversion' && r.to === right.id));
  const editorHtml = inspectSide(run, null, left);
  assert.ok(editorHtml.includes(targetCaption(source)));
  const battleHtml = inspectSide(run, battle, left);
  assert.ok(!battleHtml.includes(targetCaption(source)), 'editor-only cart source must not leak into the active battle view');
  assert.match(battleHtml, /未接続/);
  assert.ok(inspectSide(run, null, left).includes(targetCaption(source)), 'returning to editor follows current editor rules');
});

test('QA: a cart with actual non-economy-tagged government income is never reported inactive', () => {
  const { board, consumer, source } = pair('am_cart', 'gov_onestop');
  const info = E.analyze(board), { battle, events } = simulate(board);
  assert.equal(D.PARTS[source.type].tags.includes('economy'), false, 'fixture exercises the exceptional engine earner');
  assert.deepEqual(sourceIds(consumer, info), [source.id]);
  assert.equal(battle.player.income, 4);
  assert.ok(events.some(e => e.kind === 'conversion' && e.action === 'spend' && e.id === consumer.id));
  assert.ok(events.some(e => e.kind === 'damage' && e.id === consumer.id && e.value === 15));
  assert.doesNotMatch(inspect(consumer, info), /今は働いていません/);
});


test('QA: adjacent economy-tagged recipient UIs cannot falsely activate a cart', () => {
  for (const type of ['ad_popup', 'yt_tip']) {
    const { board, consumer, source } = pair('am_cart', type);
    assert.equal(D.PARTS[source.type].tags.includes('economy'), true);
    const info = E.analyze(board), { battle, events } = simulate(board);
    assert.deepEqual(sourceIds(consumer, info), []);
    assert.equal(battle.player.income, 0);
    assert.equal(events.some(e => e.kind === 'conversion'), false);
    const html = inspect(consumer, info);
    assert.match(html, /未接続/);
    assert.match(html, /今は働いていません/);
  }
});


test('QA: the actual paid commerce recovery changes selected 1-Click from unwired to Newsletter and Mail', () => {
  const recovery = simulateCommerceRecovery();
  const before = recovery.beforeLoss.run.owned;
  const after = recovery.beforeRetry.run.owned;
  const selectedBefore = before.find(p => p.id === 'p18');
  const selectedAfter = after.find(p => p.id === 'p18');
  assert.equal(selectedBefore?.type, 'am_oneclick');
  assert.equal(selectedAfter?.type, 'am_oneclick');
  const beforeInfo = E.analyze(before), afterInfo = E.analyze(after);
  assert.deepEqual(conversionGuidance(selectedBefore, beforeInfo), { state: 'unwired', sources: [] });
  const expected = ['p9', 'p14'].map(id => after.find(p => p.id === id));
  assert.deepEqual(expected.map(p => p.type), ['am_newsletter', 'ab_mail']);
  assert.deepEqual(conversionGuidance(selectedAfter, afterInfo), {
    state: 'wired', sources: expected.map(p => ({ id: p.id, name: targetCaption(p) })),
  });
  const beforeHtml = inspect(selectedBefore, beforeInfo);
  const afterHtml = inspect(selectedAfter, afterInfo);
  assert.match(beforeHtml, /未接続/);
  for (const source of expected) {
    assert.ok(!beforeHtml.includes(targetCaption(source)));
    assert.ok(afterHtml.includes(targetCaption(source)));
  }
});
