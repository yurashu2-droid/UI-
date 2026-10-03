import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../src/run.js';
import C from '../src/document.js';
import { createLabBattleController, mountAudienceLabControl } from '../src/lab-audience-control.js';

const lab = { mode: 'lab', storyActive: false, battleActive: false };
const standard = '通常ルールです。自分のCPU（処理能力）は無制限。CPUは閲覧者HPとは別です。離脱・定着や一時サーバー負荷の追加ルールは無効です。';
const audience = '広告が集中すると閲覧者が離脱し、登録は収益の一部を定着に変えます。双方のページに適用。自分のCPU（処理能力）は無制限で、閲覧者HPとは別です。実験室を離れると通常に戻ります。';
const pressure = capacity => `双方CPU ${capacity}（処理能力）。CPUは閲覧者HPとは別です。自動閲覧ジョブは収益$3を消費して相手に一時負荷。CAPTCHAと余剰CPUが対策になります。実通信なし。実験室を離れると通常に戻ります。`;
const choices = [
  ['standard', '通常ルール'],
  ['audience-v1', '実験：広告の離脱・登録の定着'],
  ['server-pressure-v1', '実験：一時サーバー負荷（双方CPU 26）'],
  ['server-pressure-tight', '比較：容量ぎりぎり（双方CPU 15）'],
  ['server-pressure-spare', '比較：余剰CPU（双方CPU 38）'],
];

// Minimal native-element port: checks production event wiring and text, not
// browser layout, keyboard behavior, or screen-reader acceptance.
function control(controller = createLabBattleController(), initialContext = lab) {
  let context = initialContext;
  const callbacks = [];
  const doc = { createElement(tagName) {
    return { tagName, ownerDocument: doc, children: [], attributes: {}, events: {},
      append(...children) { this.children.push(...children); },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) { this.events[name] = callback; },
    };
  } };
  const host = doc.createElement('section');
  mountAudienceLabControl(host, controller, () => context, () => {
    callbacks.push({ value: controller.value, description: description.textContent });
  });
  const [label, select, description] = host.children;
  return { controller, host, label, select, description, callbacks,
    setContext(value) { context = value; },
    change(value) { select.value = value; select.events.change(); },
  };
}

function start(controller) {
  const run = R.newRun('lab');
  run.owned = [C.makeItem('ab_link', 'attack', 24, 24)];
  const result = controller.start(run, false);
  assert.equal(result.ok, true);
  assert.equal(run.phase, 'battle');
  return result.battle;
}

test('fresh rule description explains the actual standard battle and keeps the native association and options', () => {
  const ui = control(), battle = start(ui.controller);
  assert.equal(battle.player.capacity, Infinity);
  assert.equal(battle.experimentalRules, null);
  assert.equal(battle.audience, null);
  assert.equal(battle.pressure, null);
  assert.equal(ui.description.textContent, standard);
  assert.equal(ui.label.attributes.for, ui.select.id);
  assert.equal(ui.label.textContent, '対戦ルール［実験室限定］');
  assert.equal(ui.select.attributes['aria-describedby'], ui.description.id);
  assert.equal(ui.description.id, 'lab-audience-description');
  assert.equal(ui.description.className, 'opp-tip');
  assert.equal(ui.select.tagName, 'select');
  assert.deepEqual(ui.select.children.map(option => [option.value, option.textContent]), choices);
});

test('each accepted rule change describes its real next battle, without stale rules or alternate capacities', () => {
  const ui = control();
  const cases = [
    ['audience-v1', audience, Infinity, 'audience-v1'],
    ['server-pressure-v1', pressure(26), 26, 'server-pressure-v1'],
    ['server-pressure-tight', pressure(15), 15, 'server-pressure-v1'],
    ['server-pressure-spare', pressure(38), 38, 'server-pressure-v1'],
    ['standard', standard, Infinity, null],
  ];
  for (const [value, expected, capacity, rules] of cases) {
    ui.change(value);
    const battle = start(ui.controller);
    assert.equal(battle.experimentalRules, rules);
    assert.equal(battle.player.capacity, capacity);
    assert.equal(!!battle.audience, rules === 'audience-v1');
    assert.equal(!!battle.pressure, rules === 'server-pressure-v1');
    if (battle.pressure) assert.equal(battle.enemy.capacity, capacity);
    assert.ok(Number.isFinite(battle.player.maxHp));
    assert.notEqual(battle.player.maxHp, capacity);
    assert.equal(ui.select.value, value);
    assert.equal(ui.description.textContent, expected);
    assert.deepEqual(ui.callbacks.at(-1), { value, description: expected }, 'description is current before the host rerenders');
    assert.equal(ui.host.children[2], ui.description, 'the described native node is retained');
  }
  assert.equal(ui.callbacks.length, cases.length);
});

test('unknown and stale changes restore the selected description and preserve battle and mode disabling', () => {
  const ui = control();
  ui.change('server-pressure-tight');
  const attempts = [
    [lab, 'unknown'],
    [{ ...lab, battleActive: true }, 'server-pressure-spare'],
    [{ ...lab, mode: 'campaign' }, 'standard'],
    [{ ...lab, storyActive: true }, 'audience-v1'],
  ];
  for (const [context, value] of attempts) {
    ui.setContext(context);
    ui.change(value);
    assert.equal(ui.controller.value, 'server-pressure-tight');
    assert.equal(ui.select.value, 'server-pressure-tight');
    assert.equal(ui.description.textContent, pressure(15));
    assert.equal(ui.select.disabled, context !== lab);
    assert.equal(ui.callbacks.length, 1);
  }
  ui.setContext(lab);
  ui.change('audience-v1');
  assert.equal(ui.select.disabled, false);
  assert.equal(ui.description.textContent, audience);
  assert.equal(ui.callbacks.length, 2);
});

test('remount reflects the selected rule and a controller reset restores standard explanatory text', () => {
  const controller = createLabBattleController();
  controller.choose('server-pressure-spare', lab);
  const locked = control(controller, { ...lab, battleActive: true });
  assert.equal(locked.select.disabled, true);
  assert.equal(locked.description.textContent, pressure(38));
  controller.reset();
  const reset = control(controller);
  assert.equal(reset.select.value, 'standard');
  assert.equal(reset.description.textContent, standard);
  assert.equal(start(controller).experimentalRules, null);
});
