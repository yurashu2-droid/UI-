import {withOriginalReleaseTeaching} from './helpers/original-release-teaching.mjs';
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

test('LEAFNOTE appends after every prior opponent/template without changing combat definitions', () => {
  const enemies = R.labEnemies();
  assert.equal(hash(withOriginalReleaseTeaching(enemies.slice(0, 40),29)), '3e2c6cbcb449ccb3b23e27ff78e70d91177bd7ec9329baf0f8c2435046256feb');
  assert.equal(hash(withOriginalReleaseTeaching(SITE_TEMPLATES.slice(0, 26),15)), 'f47f912668c28f1ac4684e46a5e5ca16ccb4c8c0422d05e0c3416d08c2a54223');
  assert.equal(hash(D.PARTS), 'a949b4d8aa8f8b8b55f60fb827bb8e5c21f62219fccbc6da05fdd570189f5fb6');
  assert.equal(enemies[40]?.id, 'site_notion');
  assert.equal(SITE_TEMPLATES[26]?.id, 'site_notion');
  assert.equal(SITE_TEMPLATES.filter(t => t.id === 'site_notion').length, 1);
});

test('registered notebook keeps moved ownership and selected opponent through ordinary saves', () => {
  const run = R.newRun('lab', 'site_notion');
  assert.equal(run.page.templateId, 'site_notion');
  assert.equal(run.page.theme, 'notebook');
  assert.equal(run.owned.length, 4);
  const link = run.owned[1], before = structuredClone(run.owned);
  assert.equal(R.move(run, link.id, 24, 520), true);
  assert.equal(R.move(run, link.id, 24, 240), true);
  assert.deepEqual(run.owned, before);
  run.stage = 40;
  const restored = JSON.parse(JSON.stringify(run));
  assert.equal(R.validateRun(restored), true);
  assert.equal(R.opponent(restored).id, 'site_notion');
  assert.deepEqual(R.pageDecor(restored), SITE_TEMPLATES[26].decor);
  const shape = parts => parts.map(p => [p.type,p.x,p.y,p.w,p.h,p.label]);
  assert.deepEqual(shape(R.enemyBoard(restored)), shape(restored.owned));
  assert.ok(restored.owned.every(p => C.canPlace(restored.owned,p,p.x,p.y,p.w,p.h)));
  assert.deepEqual(R.newRun('campaign','site_notion').owned, []);
});

test('notebook rendering is registered as original theme chrome without adding shop parts or a family bonus', () => {
  assert.match(V.header('notebook'), /LEAFNOTE/);
  assert.match(D.FACTIONS.notebook?.set ?? '', /追加補正なし/);
  assert.equal(factionSetView('notebook',3).active, false);
  assert.equal(Object.values(D.PARTS).filter(p => p.faction === 'notebook').length, 0);
  assert.equal(Object.values(D.PARTS).filter(p => p.status === 'experimental').length, 28);
  assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'), /@import ["']\.\.\/catalog\/notebook\.css["'];/);
  assert.match(readFileSync(new URL('../src/components.ts',import.meta.url),'utf8'), /notebookDecor\(kind\)/);
});
