import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { parseFragment } from 'parse5';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import * as appGuidance from '../src/app-guidance.js';
import * as navigation from '../src/navigation-guidance.js';
import * as conversion from '../src/conversion-guidance.js';
import * as incomeRoutes from '../src/income-route-guidance.js';
import * as containment from '../src/containment-guidance.js';
import { targetCaption } from '../src/catalog/target-caption.js';
import { DESIGN_CANVAS_TEMPLATES } from '../src/catalog/design-canvas-templates.js';

const app = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const rules = app.slice(app.indexOf('const KIND:'), app.indexOf('function shortDesc('));
const functions = ['incomeRouteEditingAllowed', 'selectionCard', 'bindSidechannelPlacementControls', 'renderSide'].map(name => {
  const fn = app.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))?.[0];
  assert.ok(fn, `use actual ${name}`); return fn;
});
const modalCode = app.slice(app.indexOf('let modalFeatureDispose:'), app.indexOf('/* ---------- Isolated story profile'));
const compiled = transformSync(modalCode + '\n' + rules + '\n' + functions.join('\n'), {loader: 'ts', target: 'es2022'}).code;
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)];
const text = node => node?.nodeName === '#text' ? node.value : (node?.childNodes ?? []).map(text).join('');
const hasClass = (node, name) => node.attrs?.find(attr => attr.name === 'class')?.value.split(/\s+/).includes(name);
const frameset = () => DESIGN_CANVAS_TEMPLATES[0].layout.map(([type, x, y, w, h, , label], i) =>
  ({...C.makeItem(type, `p${i + 1}`, x, y, w, h), label}));

// Executes the real inspector selection, battle-analysis choice and editability
// gate. DOM storage, surrounding unrelated panels and thumbnail paint are adapted.
function inspector(board = frameset(), selected = ['p3']) {
  let html = '', paintCount = 0, routeControl = null;
  class Select { constructor(node) { this.disabled = node.attrs.some(attr => attr.name === 'disabled'); this.dataset = {sourceId: node.attrs.find(attr => attr.name === 'data-source-id')?.value}; } }
  const host = {querySelector: selector => selector === '#sel-income-route' ? routeControl : null,
    get innerHTML() { return html; }, set innerHTML(value) {
      html = value; paintCount++;
      const node = walk(parseFragment(value)).find(node => node.tagName === 'select' && node.attrs.some(attr => attr.name === 'id' && attr.value === 'sel-income-route'));
      routeControl = node ? new Select(node) : null;
    }};
  const queued = [], events = {};
  const modal = {get open() { return c.dialogOpen; }, classList: {remove() {}},
    addEventListener: (type, fn) => { events[type] = fn; }, showModal() { c.dialogOpen = true; },
    close() { if (c.dialogOpen) { c.dialogOpen = false; queued.push(() => events.close?.()); } }};
  const controls = new Map([['#inspector', host], ['#undo-button', {}], ['#redo-button', {}],
    ['#enemy-thumbnail', {innerHTML: '', querySelector: () => ({})}], ['#modal', modal], ['#modal-content', {innerHTML: ''}]]);
  const run = R.newRun('campaign', 'blank'); run.owned = board; run.nextId = board.length + 1;
  const c = {
    ...appGuidance, ...navigation, ...conversion, ...incomeRoutes, ...containment,
    D, P: D.PARTS, C, E, R, targetCaption, run, battle: null, preview: false,
    settling: false, pendingStorySettlement: null, storyActive: false, view: 'self', dialogOpen: false,
    incomeRouteBinding: null, sidechannelPlacementBindings: new Map(), HTMLSelectElement: Select,
    labPressureCapacity: () => null, labBattleController: {value: 'normal'},
    esc: escape, skinPicker: () => '', synergyPanel: () => '', opponentCard: () => '',
    V: {header: () => '', render() {}}, scheduleFit() {}, appOpponent: () => ({faction: 'retro', pageName: 'Enemy'}), appEnemyBoard: () => [],
    document: {querySelector: selector => selector === 'dialog[open]' && c.dialogOpen ? {} : null},
    $: selector => { assert.ok(controls.has(selector), `adapted ${selector}`); return controls.get(selector); },
    editor: {history: [], future: [], selected: () => c.run.owned.filter(part => c.selectedIds.includes(part.id))},
    selectedIds: selected,
  };
  vm.runInNewContext(compiled, c);
  const read = () => {
    const tree = parseFragment(host.innerHTML), all = walk(tree);
    const fragment = all.find(node => hasClass(node, 'containment-guidance'));
    assert.ok(fragment, 'actual inspector includes the containment fragment');
    return {fragment, text: text(fragment), all, html: host.innerHTML};
  };
  const render = () => { c.renderSide(); return read(); };
  return {c, render, read, modal, get routeControl() { return routeControl; }, get paintCount() { return paintCount; }, flushClose() { while (queued.length) queued.shift()(); }};
}

const assertEffects = value => {
  assert.match(value, /ドラッグ.*矢印キー.*座標欄/);
  assert.match(value, /手持ち.*子孫.*配置位置.*失われ/);
  assert.match(value, /売却・削除は選択中のUIだけ/);
};
const assertReadOnly = value => {
  assert.match(value, /直接の親/);
  assert.doesNotMatch(value, /ドラッグ|矢印キー|座標欄|手持ち|売却・削除/);
};

test('QA: real FRAMESET PDF inspector names its edited immediate table parent safely', () => {
  const board = frameset(); board[1].label = '<img src=x onerror="bad()"> & renamed table';
  const before = structuredClone(board), h = inspector(board), output = h.render();
  assert.ok(output.text.includes(`直接の親：${targetCaption(board[1])}`));
  assert.ok(!output.text.includes(`直接の親：${targetCaption(board[0])}`), 'outer form is not the PDF immediate parent');
  assert.ok(!output.all.some(node => node.tagName === 'img'));
  assertEffects(output.text); assert.deepEqual(board, before);
});

test('QA: real single and overlapping multi-selection inspector counts distinct unselected descendants', () => {
  const board = frameset(); board.push(C.makeItem('ab_link', 'loose', 24, 24));
  const h = inspector(board);
  for (const [selected, count, extra] of [
    [['p1'], 1, 2], [['p2'], 1, 1], [['p1', 'p2'], 2, 1],
    [['p1', 'p3'], 2, 1], [['p1', 'p2', 'p3'], 3, 0], [['p1', 'loose'], 2, 2],
  ]) {
    h.c.selectedIds = selected;
    const output = h.render();
    assert.match(output.text, new RegExp(`選択中 ${count}個 / 未選択の子孫 ${extra}個`));
    assertEffects(output.text);
    if (selected.includes('p1')) assert.match(output.text, /直下の子 1個 \/ 入れ子全体の子孫 2個/);
    if (extra > 0) assert.match(output.text, new RegExp(`未選択の子孫 ${extra}個は同じ位置に残り`));
  }
});

test('QA: actual inspector chooses the battle snapshot over later live parent geometry and labels', () => {
  const board = frameset(), h = inspector(board);
  const battle = new E.Battle(structuredClone(board), [], {playerCapacity: Infinity, enemyHp: 10_000});
  h.c.battle = battle;
  const snapshotTable = targetCaption(battle.player.info.board.find(part => part.id === 'p2'));
  assert.equal(C.moveMany(board, ['p3'], 0, 412 - board[2].y), true);
  board[1].label = 'New live table'; board[0].label = 'New live outer form';
  assert.equal(E.analyze(board).parents.p3, 'p1'); assert.equal(battle.player.info.parents.p3, 'p2');
  const before = structuredClone(board), output = h.render();
  assert.ok(output.text.includes(`直接の親：${snapshotTable}`));
  assert.ok(!output.text.includes('New live table')); assert.ok(!output.text.includes('New live outer form'));
  assertReadOnly(output.text); assert.deepEqual(board, before);
  h.c.battle = null;
  assert.ok(h.render().text.includes(`直接の親：${targetCaption(board[0])}`), 'once the battle ends, current geometry owns the inspector again');
});

for (const [label, block] of [
  ['battle', h => { h.c.battle = new E.Battle(h.c.run.owned, [], {playerCapacity: Infinity}); }],
  ['preview', h => { h.c.preview = true; }],
  ['settling', h => { h.c.settling = true; }],
  ['pending settlement', h => { h.c.pendingStorySettlement = {}; }],
  ['non-build run', h => { h.c.run.phase = 'reward'; }],
  ['enemy view', h => { h.c.view = 'enemy'; }],
  ['open dialog', h => { h.c.dialogOpen = true; }],
]) {
  test(`QA: actual ${label} gate suppresses containment action-impact copy for single and multi-selection`, () => {
    const h = inspector();
    assertEffects(h.render().text); block(h);
    assert.equal(h.c.incomeRouteEditingAllowed(), false);
    for (const ids of [['p1'], ['p1', 'p2']]) {
      h.c.selectedIds = ids; assertReadOnly(h.render().text);
    }
  });
}

test('QA: reopened editability and changed selection update the real containment fragment without stale actions', () => {
  const h = inspector(); h.c.dialogOpen = true; assertReadOnly(h.render().text);
  h.c.dialogOpen = false; h.c.selectedIds = ['p1', 'p2']; assertEffects(h.render().text);
  assert.equal(R.move(h.c.run, 'p2', null, null), true);
  h.c.selectedIds = ['p1', 'p2']; const output = h.render();
  assertReadOnly(output.text); assert.match(output.text, /直下の子 0個 \/ 入れ子全体の子孫 0個/);
  assert.ok(!output.text.includes('未選択の子孫 1個'), 'stashed descendants cannot retain earlier action counts');
});


for (const native of [false, true]) {
  test(`QA: ${native ? 'native Escape' : 'Close'} dismissal refreshes the actual disabled income route selector`, () => {
    const source = C.makeItem('ab_mail', 'source', 24, 24), consumer = C.makeItem('am_cart', 'consumer', 180, 24);
    const h = inspector([source, consumer], ['source']);
    h.c.renderSide(); assert.ok(h.routeControl); assert.equal(h.routeControl.disabled, false);
    h.c.openModal('<p>Story workshop</p>'); h.c.renderSide();
    assert.equal(h.routeControl.disabled, true, 'a story repaint while its modal is open must withhold editing');
    native ? h.modal.close() : h.c.closeModal(); h.flushClose();
    assert.equal(h.c.incomeRouteEditingAllowed(), true);
    assert.equal(h.routeControl.disabled, false, 'the current inspector must become editable on real dismissal');
  });
}

test('QA: queued old dialog close cannot refresh controls behind a newly opened dialog', () => {
  const source = C.makeItem('ab_mail', 'source', 24, 24), consumer = C.makeItem('am_cart', 'consumer', 180, 24);
  const h = inspector([source, consumer], ['source']);
  h.c.openModal('<p>Old dialog</p>'); h.c.renderSide(); h.c.closeModal();
  h.c.openModal('<p>New dialog</p>'); const paints = h.paintCount; h.flushClose();
  assert.equal(h.modal.open, true); assert.equal(h.paintCount, paints, 'the queued old close must keep the reopened-dialog guard');
  assert.equal(h.routeControl.disabled, true);
  h.modal.close(); h.flushClose();
  assert.equal(h.routeControl.disabled, false, 'only the current dialog dismissal re-enables the control');
});


test('QA: current dialog dismissal restores containment guidance only while the editor is otherwise editable', () => {
  const h = inspector(frameset(), ['p1', 'p2']);
  h.c.openModal('<p>Story workshop</p>'); assertReadOnly(h.render().text);
  h.c.closeModal(); h.flushClose(); assertEffects(h.read().text);
  h.c.openModal('<p>Another dialog</p>'); h.c.preview = true; assertReadOnly(h.render().text);
  h.modal.close(); h.flushClose(); assertReadOnly(h.read().text);
});
