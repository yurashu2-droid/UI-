import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {RECIPES} from '../src/fusion.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
const render=await import('../src/catalog/marketplace-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_rakuten');
const boardOf=t=>t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${t.id}-${i}`,x,y,w,h),label:label||''}));
const acquired=type=>{const r=RECIPES.find(r=>r.into===type);return r?acquired(r.a)+acquired(r.b):D.PARTS[type].price;};
const simulate=board=>{const b=new E.Battle(board,[C.makeItem('ab_link','enemy',24,24)],{playerHp:10000,enemyHp:10000,playerCapacity:56,enemyCapacity:56});const events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};};

test('marketplace template accounts for support ingredients instead of treating fusion as free',()=>{
 const t=template();assert.ok(t);assert.match(t.name,/楽天市場風/);assert.equal(t.faction,'marketplace');assert.equal(t.status,'experimental');assert.ok(D.PRESETS[t.id]);
 const board=boardOf(t);assert.equal(board.length,15);for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);
 assert.equal(board.reduce((n,p)=>n+D.PARTS[p.type].price,0),69);assert.equal(board.reduce((n,p)=>n+acquired(p.type),0),80);assert.equal(board.reduce((n,p)=>n+D.PARTS[p.type].load,0),30);
 assert.equal(Object.values(D.PARTS).some(p=>p.faction==='marketplace'),false);assert.match(t.counterplay,/80/);assert.match(t.counterplay,/合成/);
});
test('marketplace routes each income packet once to separate attack and defense destinations',()=>{
 const t=template();assert.ok(t);const board=boardOf(t),{b,events}=simulate(board),byType=t=>board.find(p=>p.type===t);
 const coupon=byType('am_coupon'),sale=byType('am_deal'),cart=byType('am_cart'),tip=byType('yt_tip');
 const income=events.filter(e=>e.kind==='income'&&e.side==='player'),routes=events.filter(e=>e.kind==='conversion'&&e.side==='player'&&e.action==='route');
 for(const e of income)assert.equal(routes.filter(r=>r.id===e.id&&r.time===e.time&&r.value===e.value).length,1);
 assert.deepEqual([...new Set(routes.map(e=>`${e.id}->${e.to}`))].sort(),[`${coupon.id}->${cart.id}`,`${sale.id}->${tip.id}`].sort());
 assert.equal(b.player.income,26);assert.equal(b.metrics.player.routed,26);assert.equal(b.metrics.player.spent,24);assert.equal(b.player.parts.reduce((n,p)=>n+p.charge,0),2);
 assert.equal(b.player.parts.find(p=>p.id===cart.id).damage,45);assert.equal(b.player.parts.find(p=>p.id===tip.id).protected,40);
 for(const p of board.filter(p=>p.type==='am_buy'))assert.equal(b.player.info.mods[p.id].power,1.44);
});
test('real post-battle fusion keeps both revenue routes and releases the cart rectangle',()=>{
 const t=template();assert.ok(t);const r=R.newRun('lab',t.id),fusions=R.fuse(r);assert.equal(fusions.length,1);assert.equal(fusions[0].recipe.into,'am_oneclick');
 const one=r.owned.find(p=>p.type==='am_oneclick');assert.deepEqual([one.x,one.y,one.w,one.h],[224,372,328,40]);assert.equal(r.owned.length,14);for(const p of r.owned)assert.ok(C.canPlace(r.owned,p,p.x,p.y),p.type);
 assert.equal(r.owned.reduce((n,p)=>n+acquired(p.type),0),80);assert.equal(r.owned.reduce((n,p)=>n+D.PARTS[p.type].load,0),28);assert.equal(r.owned.some(p=>p.x===224&&p.y===484),false);
 const {b,events}=simulate(r.owned),coupon=r.owned.find(p=>p.type==='am_coupon'),sale=r.owned.find(p=>p.type==='am_deal'),tip=r.owned.find(p=>p.type==='yt_tip');
 const routes=events.filter(e=>e.kind==='conversion'&&e.side==='player'&&e.action==='route');assert.deepEqual([...new Set(routes.map(e=>`${e.id}->${e.to}`))].sort(),[`${coupon.id}->${one.id}`,`${sale.id}->${tip.id}`].sort());
 assert.equal(b.player.income,26);assert.equal(b.metrics.player.spent,24);assert.equal(b.player.parts.find(p=>p.id===tip.id).protected,40);
 const converted=events.filter(e=>e.kind==='damage'&&e.side==='player'&&e.id===one.id&&e.value===20);assert.equal(converted.length,3);
});
test('marketplace chrome is fictional and leaves money meaning and donor controls intact',()=>{
 const t=template();assert.ok(t);assert.equal(typeof render.marketplaceDecor,'function');assert.match(V.header('marketplace',t.pageName),/楽天市場風.*非公式/);
 for(const [kind] of t.decor){const html=render.marketplaceDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<button|<input|<form|<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}
 for(const p of boardOf(t))assert.equal(V.markup(p,{theme:'marketplace'}),V.markup(p,{theme:D.PARTS[p.type].faction}));
 assert.match(render.marketplaceDecor('mall-support-note'),/応援/);assert.match(t.tip,/累計収益/);
});
