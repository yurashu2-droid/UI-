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

test('calendar appends after all 37 complete opponents and 23 complete templates without changing combat definitions',()=>{
  const enemies=R.labEnemies();
  assert.equal(hash(withOriginalReleaseTeaching(enemies.slice(0,37),29)),'4bcb2df295893cbe4c4b392c1f440f9de93af5eaf608a6cbe017d4a39fd62060');
  assert.equal(hash(withOriginalReleaseTeaching(SITE_TEMPLATES.slice(0,23),15)),'e829855fe2bd6ce7735d9950ab085588c1fa2bebc8fdaa02aab52da6662a4333');
  assert.equal(hash(D.PARTS),'a949b4d8aa8f8b8b55f60fb827bb8e5c21f62219fccbc6da05fdd570189f5fb6');
  assert.equal(enemies[37]?.id,'site_calendar');assert.equal(SITE_TEMPLATES[23]?.id,'site_calendar');
  assert.equal(SITE_TEMPLATES.filter(t=>t.id==='site_calendar').length,1);
});

test('registered calendar preserves the exact selected opponent, movable owned parts and decor through save validation',()=>{
  const run=R.newRun('lab','site_calendar');assert.equal(run.page.templateId,'site_calendar');assert.equal(run.page.theme,'calendar');
  const wish=run.owned.find(p=>p.type==='am_wish');assert.ok(wish);
  assert.equal(R.move(run,wish.id,456,236),true);assert.equal(R.move(run,wish.id,560,236),true);
  run.stage=37;const restored=JSON.parse(JSON.stringify(run));assert.equal(R.validateRun(restored),true);
  const template=SITE_TEMPLATES.find(t=>t.id==='site_calendar');assert.ok(template);
  assert.equal(R.opponent(restored).id,'site_calendar');assert.deepEqual(R.pageDecor(restored),template.decor);
  const shape=parts=>parts.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]);
  assert.deepEqual(shape(R.enemyBoard(restored)),shape(restored.owned));
  assert.ok(restored.owned.every(p=>C.canPlace(restored.owned,p,p.x,p.y,p.w,p.h)));
});

test('calendar theme supplies original chrome and stylesheet without a new combat family, set or campaign acquisition',()=>{
  assert.match(V.header('calendar'),/WEEKGRID/);assert.match(D.FACTIONS.calendar?.set??'',/追加補正なし/);
  assert.equal(factionSetView('calendar',3).active,false);assert.equal(Object.values(D.PARTS).filter(p=>p.faction==='calendar').length,0);
  assert.equal(Object.values(D.PARTS).filter(p=>p.status==='experimental').length,28);
  assert.deepEqual(R.newRun('campaign','site_calendar').owned,[]);
  assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'),/@import ["']\.\.\/catalog\/calendar\.css["'];/);
  assert.match(readFileSync(new URL('../src/components.ts',import.meta.url),'utf8'),/calendarDecor\(kind\)/);
});
