import {withOriginalReleaseTeaching} from './helpers/original-release-teaching.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import D from '../src/data.js';
import R from '../src/run.js';
import C from '../src/document.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {factionSetView} from '../src/app-guidance.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('designcanvas appends after all 38 complete opponents and 24 complete templates without changing combat definitions',()=>{
  const enemies=R.labEnemies();
  assert.equal(hash(withOriginalReleaseTeaching(enemies.slice(0,38),29)),'f413bbb3d3978deba741a5106fdf3c1b31c40159ec8a09aca514394fd3611a9f');
  assert.equal(hash(withOriginalReleaseTeaching(SITE_TEMPLATES.slice(0,24),15)),'d6cde001ec98abc3123a5a6de4f4c0a5f65ecbbfc3a9fffff83f6fabfd28ece3');
  assert.equal(hash(D.PARTS),'a949b4d8aa8f8b8b55f60fb827bb8e5c21f62219fccbc6da05fdd570189f5fb6');
  assert.equal(enemies[38]?.id,'site_figma');assert.equal(SITE_TEMPLATES[24]?.id,'site_figma');
  assert.equal(SITE_TEMPLATES.filter(t=>t.id==='site_figma').length,1);
});

test('registered designcanvas preserves the exact selected opponent, movable owned parts and decor through save validation',()=>{
  const run=R.newRun('lab','site_figma');assert.equal(run.page.templateId,'site_figma');assert.equal(run.page.theme,'designcanvas');
  const pdf=run.owned.find(p=>p.type==='gov_pdf');assert.ok(pdf);
  assert.equal(R.move(run,pdf.id,260,412),true);assert.equal(R.move(run,pdf.id,260,254),true);
  run.stage=38;const restored=JSON.parse(JSON.stringify(run));assert.equal(R.validateRun(restored),true);
  const template=SITE_TEMPLATES.find(t=>t.id==='site_figma');assert.ok(template);
  assert.equal(R.opponent(restored).id,'site_figma');assert.deepEqual(R.pageDecor(restored),template.decor);
  const shape=parts=>parts.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]);
  assert.deepEqual(shape(R.enemyBoard(restored)),shape(restored.owned));
  assert.ok(restored.owned.every(p=>C.canPlace(restored.owned,p,p.x,p.y,p.w,p.h)));
});

test('designcanvas theme supplies original chrome and stylesheet without a new combat family, set or campaign acquisition',()=>{
  assert.match(V.header('designcanvas'),/FRAMESET/);assert.match(D.FACTIONS.designcanvas?.set??'',/追加補正なし/);
  assert.equal(factionSetView('designcanvas',3).active,false);assert.equal(Object.values(D.PARTS).filter(p=>p.faction==='designcanvas').length,0);
  assert.equal(Object.values(D.PARTS).filter(p=>p.status==='experimental').length,28);
  assert.deepEqual(R.newRun('campaign','site_figma').owned,[]);
  assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'),/@import ["']\.\.\/catalog\/design-canvas\.css["'];/);
  assert.match(readFileSync(new URL('../src/components.ts',import.meta.url),'utf8'),/designCanvasDecor\(kind\)/);
});
