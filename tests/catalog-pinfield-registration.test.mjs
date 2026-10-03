import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import D from '../src/data.js';
import R from '../src/run.js';
import C from '../src/document.js';
import V from '../src/components.js';
import { SITE_TEMPLATES } from '../src/catalog/index.js';
import { factionSetView } from '../src/app-guidance.js';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('PINFIELD appends after every prior opponent/template without changing combat definitions', () => {
  const enemies = R.labEnemies();
  assert.equal(hash(enemies.slice(0, 41)), '3d2af64ccb0bafb289066f5583d3a54f7d9f02b720b4c28aa17cc065eff99a62');
  assert.equal(hash(SITE_TEMPLATES.slice(0, 27)), '4670a5632dbabeb675daf174025bf8f80454605c31fd45ff0bfd6d3133eab865');
  assert.equal(hash(D.PARTS), 'a949b4d8aa8f8b8b55f60fb827bb8e5c21f62219fccbc6da05fdd570189f5fb6');
  assert.equal(enemies[41]?.id, 'site_pinterest');
  assert.equal(SITE_TEMPLATES[27]?.id, 'site_pinterest');
  assert.equal(SITE_TEMPLATES.filter(t => t.id === 'site_pinterest').length, 1);
});

test('registered pinfield keeps moved ownership and selected opponent through ordinary saves', () => {
  const run = R.newRun('lab', 'site_pinterest');
  assert.equal(run.page.templateId, 'site_pinterest');
  assert.equal(run.page.theme, 'pinfield');
  assert.equal(run.owned.length, 4);
  const caption = run.owned[2], before = structuredClone(run.owned);
  assert.equal(R.move(run, caption.id, 736, 24), true);
  assert.equal(R.move(run, caption.id, 24, 400), true);
  assert.deepEqual(run.owned, before);
  run.stage = 41;
  const restored = JSON.parse(JSON.stringify(run));
  assert.equal(R.validateRun(restored), true);
  assert.equal(R.opponent(restored).id, 'site_pinterest');
  assert.deepEqual(R.pageDecor(restored), SITE_TEMPLATES[27].decor);
  const shape = parts => parts.map(p => [p.type,p.x,p.y,p.w,p.h,p.label]);
  assert.deepEqual(shape(R.enemyBoard(restored)), shape(restored.owned));
  assert.ok(restored.owned.every(p => C.canPlace(restored.owned,p,p.x,p.y,p.w,p.h)));
  assert.deepEqual(R.newRun('campaign','site_pinterest').owned, []);
});

test('pinfield rendering is registered as original theme chrome without adding shop parts or a family bonus', () => {
  assert.match(V.header('pinfield'), /PINFIELD/);
  assert.match(D.FACTIONS.pinfield?.set ?? '', /追加補正なし/);
  assert.equal(factionSetView('pinfield',3).active, false);
  assert.equal(Object.values(D.PARTS).filter(p => p.faction === 'pinfield').length, 0);
  assert.equal(Object.values(D.PARTS).filter(p => p.status === 'experimental').length, 28);
  assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'), /@import ["']\.\.\/catalog\/pinfield\.css["'];/);
  assert.match(readFileSync(new URL('../src/components.ts',import.meta.url),'utf8'), /pinfieldDecor\(kind\)/);
});
