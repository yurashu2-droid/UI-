import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {documentsHeader,documentsDecor} from '../src/catalog/documents-render.js';

test('QA: saved Docs template has exact working font, translation, cache and Google-history connections',()=>{
 const original=R.newRun('lab','site_google_docs'),run=JSON.parse(JSON.stringify(original));
 assert.equal(R.validateRun(run),true);assert.equal(run.page.theme,'documents');
 const board=run.owned,byType=t=>board.find(p=>p.type===t),article=byType('wk_article');
 for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y,p.w,p.h));
 const full=E.analyze(board),withoutFont=E.analyze(board.filter(p=>p.type!=='gov_font')),withoutTranslation=E.analyze(board.filter(p=>p.type!=='go_translate'));
 assert.equal(full.mods[article.id].power,1.875);assert.equal(withoutFont.mods[article.id].power,1.25);assert.equal(withoutTranslation.mods[article.id].power,1.5);
 assert.equal(full.mods[article.id].speed,1.2);assert.equal(full.counts.google,3);
 const battle=new E.Battle(board,[C.makeItem('ab_link','enemy',24,24)],{playerHp:440,enemyHp:440,playerCapacity:56,enemyCapacity:56});
 assert.equal(battle.player.load,24);assert.equal(battle.states.player.get(byType('go_cache').id).target,byType('gh_diff').id);
 const h=battle.player.parts.find(p=>p.id===byType('go_history').id);assert.equal(h.period,5);assert.equal(h.remaining,1.875);
 const index=R.labEnemies().findIndex(t=>t.id==='site_google_docs');assert.ok(index>=0);run.stage=index;
 assert.equal(R.validateRun(run),true);assert.equal(R.opponent(run).id,'site_google_docs');
 assert.deepEqual(R.enemyBoard(run).map(p=>p.type),board.map(p=>p.type));
});

test('QA: Docs template keeps each component native and emits no external resource or submission target',()=>{
 const t=SITE_TEMPLATES.find(t=>t.id==='site_google_docs'),r=R.newRun('lab',t.id);
 const html=[documentsHeader(),...t.decor.map(([kind])=>documentsDecor(kind))];
 for(const p of r.owned){
  assert.equal(V.markup(p,{theme:'documents'}),V.markup(p,{theme:'mixed'}),`${p.type}: page theme cannot replace native markup`);
  assert.notEqual(D.PARTS[p.type].faction,'documents');
  html.push(V.markup(p,{theme:'documents'}));
 }
 const root=parseFragment(html.join(''));
 const walk=n=>{
  if(n.tagName)assert.ok(!['script','iframe','object','embed','link'].includes(n.tagName),n.tagName);
  for(const a of n.attrs||[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['href','src','srcset','action','formaction','poster'].includes(a.name),`${n.tagName}.${a.name}`);assert.ok(!a.name.startsWith('on'),a.name);}
  for(const child of n.childNodes||[])walk(child);
 };walk(root);
 const css=readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8').split('/* Collaborative-document template;')[1];
 assert.ok(css);assert.doesNotMatch(css,/@import|url\s*\(|\.web-node|\.node-|\.native-/i);
 assert.match(html.join(''),/実際のクラウド文書やアカウントは変更しません/);
});
