import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
const render=await import('../src/catalog/feedreader-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_google_reader');
const boardOf=t=>t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${t.id}-${i}`,x,y,w,h),label:label||''}));
const simulate=board=>{const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:19,enemyCapacity:19});const events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};};

test('Reader template adds a legal fixed feed view using only existing parts',()=>{
  const t=template();assert.ok(t);assert.match(t.name,/Google Reader風/);assert.equal(t.status,'experimental');assert.equal(t.faction,'feedreader');assert.ok(D.FACTIONS.feedreader);assert.ok(D.PRESETS[t.id]);
  const board=boardOf(t);assert.equal(board.length,11);for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);
  assert.equal(board.reduce((v,p)=>v+D.PARTS[p.type].price,0),47);assert.equal(board.reduce((v,p)=>v+D.PARTS[p.type].load,0),19);
  assert.equal(Object.values(D.PARTS).some(p=>p.faction==='feedreader'),false);assert.equal(board.some(p=>p.type==='ab_counter'),false);
});
test('Reader search credits only the two local cultures while each feed keeps its own replay chain',()=>{
  const t=template();assert.ok(t);const board=boardOf(t),{b,events}=simulate(board);
  const byType=type=>board.find(p=>p.type===type),search=byType('go_search'),ref=byType('wk_reference'),article=byType('wk_article'),pager=byType('go_page'),diff=byType('gh_diff');
  const cultures=[...new Set(b.player.info.near[search.id].map(id=>D.PARTS[board.find(p=>p.id===id).type].faction).filter(f=>f!=='google'))].sort();
  assert.deepEqual(cultures,['retro','twitter']);assert.equal(b.player.parts.find(p=>p.id===search.id).period,3);
  const hits=events.filter(e=>e.kind==='damage'&&e.id===search.id);assert.equal(hits.length,8);assert.ok(hits.every(e=>e.value===12));
  const refs=events.filter(e=>e.kind==='echo'&&e.id===ref.id),pages=events.filter(e=>e.kind==='echo'&&e.id===pager.id);
  assert.equal(refs.length,4);assert.ok(refs.every(e=>e.to===article.id));assert.equal(pages.length,3);assert.ok(pages.every(e=>e.to===diff.id));assert.equal(pages[0].time,8.25);
  assert.equal(b.player.income,0);assert.equal(b.player.lag,1);
  for(const [source,controller] of [[article,ref],[diff,pager]])assert.equal(simulate(board.filter(p=>p.id!==source.id)).events.some(e=>e.kind==='echo'&&e.id===controller.id),false);
  assert.deepEqual(simulate([...board].reverse()).events,events);
});
test('Reader decoration has no active unread queue and does not replace native controls',()=>{
  const t=template();assert.ok(t);assert.equal(typeof render.feedreaderDecor,'function');assert.match(V.header('feedreader',t.pageName),/Google Reader風.*非公式/);
  for(const [kind] of t.decor){const html=render.feedreaderDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<button|<input|<form|<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}
  assert.match(render.feedreaderDecor('reader-subscriptions'),/未読数は表示用/);
  for(const p of boardOf(t))assert.equal(V.markup(p,{theme:'feedreader'}),V.markup(p,{theme:D.PARTS[p.type].faction}));
  assert.match(t.counterplay,/8\.25/);assert.match(t.tip,/2系統/);
});
