import * as containmentViews from '../src/containment-guidance.js';
import * as incomeRoutes from '../src/income-route-guidance.js';
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
function inspect(board, selected, { pressure = null, battle = null, mode = "lab", storyActive = false } = {}) {
  const info = E.analyze(board, pressure ? "server-pressure-v1" : null), run = R.newRun(mode);
  run.owned = board;
  const context = {
    ...guidance, ...navigationViews, ...conversionViews, ...incomeRoutes, ...containmentViews,
    incomeRouteEditingAllowed: () => false, D, P: D.PARTS, E, R, info, selected, run, battle, storyActive,
    labPressureCapacity: () => pressure, labBattleController: { value: pressure ? "server-pressure-v1" : "standard" },
    esc: escape, skinPicker: () => "",
  };
  vm.runInNewContext(`${code}\noutput=selectionCard([selected],info);`, context);
  return context.output;
}
function board() { return [C.makeItem("go_jobs", "jobs", 24, 24), C.makeItem("ab_link", "link", 600, 24, 208, 32)]; }

test("job inspector does not advertise a running clock outside the pressure experiment", () => {
  for (const experimentalRules of [null, "audience-v1"]) {
    const parts = board(), battle = new E.Battle(parts, [], { experimentalRules, playerCapacity: Infinity });
    assert.equal(battle.player.parts.find(p => p.id === "jobs").period, 0);
    for (const active of [null, battle]) {
      const html = inspect(parts, parts[0], { battle: active });
      assert.match(html, /<small>自然発動<\/small><b>実験ルールで有効<\/b>/);
      assert.doesNotMatch(html, /<small>自然発動<\/small><b>(?:4\.00秒ごと|未配置)<\/b>/);
    }
  }
});

test("job inspector keeps actual pressure cadence and distinguishes unplaced parts", () => {
  for (const capacity of [15, 26, 38]) {
    const parts = board(), battle = new E.Battle(parts, [], { experimentalRules: "server-pressure-v1", playerCapacity: capacity, enemyCapacity: capacity });
    const expected = battle.player.parts.find(p => p.id === "jobs").period.toFixed(2);
    assert.match(inspect(parts, parts[0], { pressure: capacity }), new RegExp(`<small>自然発動</small><b>${expected}秒ごと</b>`));
    // Active battle rules are authoritative even if stale preview selection differs.
    assert.match(inspect(parts, parts[0], { pressure: null, battle }), new RegExp(`<small>自然発動</small><b>${expected}秒ごと</b>`));
    parts[0].x = null; parts[0].y = null;
    assert.match(inspect(parts, parts[0], { pressure: capacity }), /<small>自然発動<\/small><b>未配置<\/b>/);
  }
});

test("ordinary periodic and passive inspector fields retain their existing meaning", () => {
  const parts = [C.makeItem("ab_link", "link", 24, 24, 208, 32), C.makeItem("gov_font", "font", 24, 72, 232, 36)];
  const battle = new E.Battle(parts, [], { playerCapacity: Infinity });
  assert.match(inspect(parts, parts[0]), new RegExp(`<small>自然発動</small><b>${battle.player.parts[0].period.toFixed(2)}秒ごと</b>`));
  assert.match(inspect(parts, parts[1]), /<small>自然発動<\/small><b>連動<\/b>/);
});
