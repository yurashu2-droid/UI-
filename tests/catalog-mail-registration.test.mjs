import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import D from '../src/data.js';import R from '../src/run.js';import C from '../src/document.js';import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {MAIL_TEMPLATES} from '../src/catalog/mail-templates.js';
import {mailHeader} from '../src/catalog/mail-render.js';
import {factionSetView} from '../src/app-guidance.js';
const priorIds=['retro','gov','google','amazon','youtube','b_video','b_cart','b_text','b_links','b_fort','b_echo','b_fort_native','b_documents_heavy','b_video_checkout','site_twitter_classic','site_x','site_wikipedia','site_github','site_niconico','site_reddit','site_yahoo_portal','site_steam_store','site_wayback','site_twitch','site_google_docs','site_soundcloud','site_stackoverflow','site_google_reader','site_rakuten','site_github_releases','site_hacker_news','site_google_maps','site_geocities','site_bandcamp','site_govuk','site_trello'];

test('mail registration appends after all36 existing opponent IDs without renumbering',()=>{
  const enemies=R.labEnemies();assert.deepEqual(enemies.slice(0,36).map(e=>e.id),priorIds);
  assert.equal(enemies[36]?.id,'site_gmail');assert.equal(SITE_TEMPLATES[22]?.id,'site_gmail');
  assert.equal(SITE_TEMPLATES.filter(t=>t.id==='site_gmail').length,1);
});

test('registered mail run preserves original template and chosen opponent through save and moves',()=>{
  const run=R.newRun('lab','site_gmail');assert.equal(run.page.templateId,'site_gmail');assert.equal(run.page.theme,'mailroom');
  const translator=run.owned.find(p=>p.type==='go_translate');assert.ok(translator);
  assert.equal(R.move(run,translator.id,216,136),true);assert.equal(R.move(run,translator.id,592,152),true);
  run.stage=36;const saved=JSON.parse(JSON.stringify(run));assert.equal(R.validateRun(saved),true);
  assert.equal(R.opponent(saved).id,'site_gmail');assert.deepEqual(R.pageDecor(saved),MAIL_TEMPLATES[0].decor);
  const shape=parts=>parts.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]);
  assert.deepEqual(shape(R.enemyBoard(saved)),shape(saved.owned));
  assert.ok(saved.owned.every(p=>C.canPlace(saved.owned,p,p.x,p.y,p.w,p.h)));
});

test('mail theme registration supplies original chrome without creating a new combat family or shop entry',()=>{
  assert.equal(V.header('mailroom'),mailHeader());assert.match(D.FACTIONS.mailroom?.set??'',/追加補正なし/);
  assert.equal(factionSetView('mailroom',3).active,false);assert.equal(Object.values(D.PARTS).filter(p=>p.faction==='mailroom').length,0);
  assert.equal(Object.values(D.PARTS).filter(p=>p.status==='experimental').length,28);
  assert.deepEqual(R.newRun('campaign','site_gmail').owned,[]);
  assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'),/@import ["']\.\/catalog-mail\.css["'];/);
  assert.match(readFileSync(new URL('../src/components.ts',import.meta.url),'utf8'),/mailDecor\(kind\)/);
});
