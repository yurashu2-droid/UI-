import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
const render=await import('../src/catalog/qanda-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_stackoverflow');
const boardOf=t=>t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${t.id}-${i}`,x,y,w,h),label:label||''}));

test('Q&A template uses flat independently voted documents without new combat definitions',()=>{
  const t=template();assert.ok(t);assert.match(t.name,/Stack Overflow風/);assert.equal(t.status,'experimental');assert.equal(t.faction,'qanda');assert.ok(D.FACTIONS.qanda);assert.ok(D.PRESETS[t.id]);
  const board=boardOf(t);for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);
  assert.equal(board.length,11);assert.equal(board.filter(p=>p.type==='rd_vote').length,2);
  assert.equal(board.some(p=>D.PARTS[p.type].container),false);assert.equal(Object.values(D.PARTS).some(p=>p.faction==='qanda'),false);
  assert.equal(board.reduce((v,p)=>v+D.PARTS[p.type].price,0),42);assert.equal(board.reduce((v,p)=>v+D.PARTS[p.type].load,0),17);
});
test('answer source, separator and follow-up notice supply their real bounded effects',()=>{
  const t=template();assert.ok(t);const board=boardOf(t),b=new E.Battle(board,[],{playerHp:1000,enemyHp:1000,playerCapacity:100,enemyCapacity:100});b.player.hp=500;
  const ref=board.find(p=>p.type==='wk_reference'),diff=board.find(p=>p.type==='gh_diff'),rule=board.find(p=>p.type==='ab_hr'),notice=board.find(p=>p.type==='gov_notice');
  const refAttacks=(b.player.info.near[ref.id]??[]).filter(id=>D.PARTS[board.find(p=>p.id===id).type].kind==='attack');
  assert.deepEqual(refAttacks,[diff.id]);assert.ok(b.player.info.near[notice.id].includes(ref.id));
  const events=[];for(let i=0;i<150;i++)events.push(...b.step(.05));
  assert.ok(events.some(e=>e.kind==='echo'&&e.id===ref.id&&e.to===diff.id));
  assert.ok(events.some(e=>e.kind==='shield'&&e.id===rule.id&&e.value===7));
  assert.ok(events.some(e=>e.kind==='heal'&&e.id===notice.id&&e.value===7));
  assert.equal(b.player.income,0);
});
test('Q&A chrome keeps acceptance inert and preserves source-native controls',()=>{
  const t=template();assert.ok(t);assert.equal(typeof render.qandaDecor,'function');assert.match(V.header('qanda',t.pageName),/Stack Overflow風.*非公式/);
  for(const [kind] of t.decor){const html=render.qandaDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<button|<input|<form|<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}
  assert.match(render.qandaDecor('qanda-accepted'),/表示のみ/);
  for(const p of boardOf(t))assert.equal(V.markup(p,{theme:'qanda'}),V.markup(p,{theme:D.PARTS[p.type].faction}));
  assert.match(t.counterplay,/貫通/);assert.match(t.tip,/採用/);
});

test('separator description states its actual nearby-text condition without a false two-sided requirement',()=>{
  assert.match(D.PARTS.ab_hr.desc,/近くに文字UIがあると\+2/);
  assert.doesNotMatch(D.PARTS.ab_hr.desc,/上下/);
});
