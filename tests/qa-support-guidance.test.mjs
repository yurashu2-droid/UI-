import * as conversionViews from '../src/conversion-guidance.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import * as guidance from '../src/app-guidance.js';
import * as navigationViews from '../src/navigation-guidance.js';

// Execute the production predicates, connection copy, and inspector together.
// Stub only unrelated page state; these are source-execution tests, not pixel QA.
const app = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const rules = app.slice(app.indexOf('const KIND:'), app.indexOf('function shortDesc('));
const selection = app.match(/^function selectionCard\([^]*?^}/m)?.[0];
assert.ok(rules && selection);
const code = transformSync(`${rules}\n${selection}`, { loader: 'ts', target: 'es2022' }).code;
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function inspect(board, selected) {
  const info = E.analyze(board);
  const context = {
    ...guidance, ...navigationViews, ...conversionViews, D, P: D.PARTS, E, R, info, selected,
    run: R.newRun('campaign'), battle: null, storyActive: false,
    labPressureCapacity: () => null, labBattleController: { value: 'normal' },
    esc: escape, skinPicker: () => '',
  };
  vm.runInNewContext(`${code}\noutput={working:working(selected,info),help:connectText(selected.type),html:selectionCard([selected],info)};`, context);
  return context.output;
}
function fight(board, combatVersion = 'combat-v4') {
  const battle = new E.Battle(board, [], { playerCapacity: Infinity, enemyHp: 1000, combatVersion });
  const events = [];
  for (let tick = 0; tick < 140 && !battle.result; tick++) events.push(...battle.step(.05));
  return { battle, events };
}
function supportBoard(type, targetType = 'am_oneclick') {
  const definition = D.PARTS[targetType];
  const target = C.makeItem(targetType, 'target', 16, 16,
    Math.max(128, definition.minW), Math.max(40, definition.minH));
  const support = C.makeItem(type, 'support', target.x + target.w + 8, 16);
  const board = [target, support];
  assert.ok(board.every(p => C.canPlace(board, p, p.x, p.y, p.w, p.h)), 'fixture is a legal non-overlapping placement');
  return { board, target, support };
}

for (const type of ['am_quantity', 'am_deal', 'am_coupon']) {
  test(`QA ${type} guidance agrees with its real effect next to One-click Purchase`, () => {
    const { board, support } = supportBoard(type);
    for (const version of ['combat-v2', 'combat-v3', 'combat-v4']) {
      const { battle, events } = fight(board, version);
      if (type === 'am_quantity') {
        assert.equal(battle.player.info.mods.target.power, 1.2, version);
        assert.equal(events.find(e => e.kind === 'damage' && e.id === 'target')?.value, 14.4, version);
      } else {
        assert.equal(events.find(e => e.kind === 'income' && e.id === 'support')?.value, 2, version);
        assert.equal(battle.player.income, 2, version);
      }
    }
    const view = inspect(board, support);
    assert.equal(view.working, true, 'engine-active support must not be reported inactive');
    assert.doesNotMatch(view.html, /今は働いていません/);
    assert.match(view.help, /ワンクリック/, 'connection guidance must name the supported fused purchase UI');
  });
}

test('QA existing Buy Button and Product Info partners retain their support effects', () => {
  for (const targetType of ['am_buy', 'am_product']) {
    for (const type of ['am_quantity', 'am_deal', 'am_coupon']) {
      const { board, support } = supportBoard(type, targetType);
      const { battle, events } = fight(board);
      if (type === 'am_quantity') {
        assert.equal(battle.player.info.mods.target.power, 1.2);
        assert.equal(events.find(e => e.kind === 'damage' && e.id === 'target')?.value,
          Math.round(D.PARTS[targetType].value * 1.2 * 10) / 10);
      } else {
        assert.equal(events.find(e => e.kind === 'income' && e.id === 'support')?.value, 2);
      }
      const view = inspect(board, support);
      assert.equal(view.working, true, `${type} with ${targetType}`);
      assert.doesNotMatch(view.html, /今は働いていません/);
    }
  }
});

test('QA separated commerce support becomes inactive and does not invent a target or income', () => {
  for (const type of ['am_quantity', 'am_deal', 'am_coupon']) {
    const { board, support } = supportBoard(type);
    support.x = 560; support.y = 480;
    const { battle, events } = fight(board);
    assert.equal(battle.player.info.mods.target.power, 1);
    assert.equal(battle.player.income, 0);
    assert.ok(!events.some(e => e.kind === 'income' && e.id === 'support'));
    const view = inspect(board, support);
    assert.equal(view.working, false, type);
    assert.match(view.html, /今は働いていません/, type);
    support.x = null; support.y = null;
    assert.equal(inspect(board, support).working, false, `${type} in inventory`);
  }
});

test('QA unrelated neighboring text cannot activate commerce support', () => {
  for (const type of ['am_quantity', 'am_deal', 'am_coupon']) {
    const { board, support } = supportBoard(type, 'ab_link');
    const { battle } = fight(board);
    assert.equal(battle.player.info.mods.target.power, 1);
    assert.equal(battle.player.income, 0);
    assert.equal(inspect(board, support).working, false, type);
  }
});

test('QA disconnected Instant Search retains intrinsic attack without inventing supported targets', () => {
  const source = C.makeItem('go_instant', 'instant', 32, 32, 420, 44);
  const far = C.makeItem('ab_link', 'far', 720, 600, 192, 32);
  const board = [source, far], info = E.analyze(board), { events } = fight(board);
  assert.equal(info.mods.instant.power, 1.45);
  assert.equal(events.find(e => e.kind === 'damage' && e.id === source.id)?.value, 17.4);
  assert.deepEqual(guidance.instantSearchSupport(source, info).targets, []);
  const view = inspect(board, source);
  assert.equal(view.working, true);
  assert.doesNotMatch(view.html, /今は働いていません/);
  assert.match(view.html, /ほかの文字攻撃には未接続/);
  assert.match(view.html, /自分の内蔵サジェストは有効/);
});
