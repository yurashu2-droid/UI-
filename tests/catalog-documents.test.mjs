import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import { SITE_TEMPLATES } from '../src/catalog/index.js';
const render=await import('../src/catalog/documents-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_google_docs');
const boardOf=t=>t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${t.id}-${i}`,x,y,w,h),label:label||''}));
test('collaborative document template demonstrates the verified history item without new combat types',()=>{
  const t=template();assert.ok(t);assert.match(t.name,/Google Docs風/);assert.equal(t.status,'experimental');assert.equal(t.faction,'documents');assert.ok(D.PRESETS[t.id]);
  const board=boardOf(t);for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);
  assert.ok(board.some(p=>p.type==='go_history'));assert.ok(t.loot.every(type=>board.some(p=>p.type===type)));
  assert.equal(Object.values(D.PARTS).some(p=>p.faction==='documents'),false);
});
test('editor toolbar, cache and revision history have real distinct connections',()=>{
  const t=template();assert.ok(t);const board=boardOf(t),b=new E.Battle(board,[C.makeItem('ab_link','enemy',24,24)],{playerHp:10000,enemyHp:10000,playerCapacity:56,enemyCapacity:56});
  const article=board.find(p=>p.type==='wk_article'),cache=board.find(p=>p.type==='go_cache'),diff=board.find(p=>p.type==='gh_diff'),history=board.find(p=>p.type==='go_history');
  assert.ok(b.player.info.parents[article.id]);assert.ok(b.player.info.mods[article.id].power>=1.8,'font and translation should actually reach article');
  assert.equal(b.states.player.get(cache.id).target,diff.id);
  const h=b.player.parts.find(p=>p.id===history.id);assert.equal(h.remaining,h.period*.5*.75,'the three real Google parts provide the documented opening modifier');
});
test('document editor decoration and header use original inert local-only markup',()=>{
  assert.equal(typeof render.documentsDecor,'function');const t=template();assert.ok(t);
  assert.match(V.header('documents',t.pageName),/Google Docs風.*非公式/);
  for(const [kind] of t.decor){const html=render.documentsDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}
});
