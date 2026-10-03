import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {RECIPES} from '../src/fusion.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
const render=await import('../src/catalog/personal-web-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_geocities');
const acquired=t=>{const r=RECIPES.find(r=>r.into===t);return r?acquired(r.a)+acquired(r.b):D.PARTS[t].price;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function simulate(board,capacity=12){const b=new E.Battle(board,[C.makeItem('ab_link','enemy',24,24)],{playerHp:10000,enemyHp:10000,playerCapacity:capacity,enemyCapacity:capacity});b.player.hp=9000;const events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};}
function runFor(){return R.newRun('lab',template().id);}

test('personal homepage adds only existing retro parts at native counter and BBS sizes',()=>{
 const t=template();assert.ok(t);assert.match(t.name,/GeoCities風/);assert.equal(t.faction,'personalweb');assert.equal(t.status,'experimental');assert.deepEqual(t.admin,[]);assert.equal(SITE_TEMPLATES[17].id,'site_google_maps');assert.equal(SITE_TEMPLATES[18].id,t.id);assert.ok(D.FACTIONS.personalweb);assert.ok(D.PRESETS[t.id]);assert.equal(Object.values(D.PARTS).some(p=>p.faction==='personalweb'),false);
 const r=runFor();assert.equal(r.owned.length,8);for(const p of r.owned)assert.ok(C.canPlace(r.owned,p,p.x,p.y),p.type);assert.equal(r.owned.reduce((s,p)=>s+acquired(p.type),0),30);assert.equal(r.owned.reduce((s,p)=>s+D.PARTS[p.type].load,0),12);for(const type of ['ab_counter','ab_guestbook']){const p=r.owned.find(p=>p.type===type);assert.deepEqual([p.w,p.h],[D.PARTS[type].w,D.PARTS[type].h]);}
});
test('actual blog fusion improves standalone sustain but gives up only adjacency-dependent raw income',()=>{
 const t=template();assert.ok(t);const r=runFor(),before=simulate(r.owned),area=r.owned.reduce((s,p)=>s+p.w*p.h,0);assert.equal(R.validateRun(r),true);
 assert.equal(R.fuse(r)[0].recipe.into,'ab_blog');assert.deepEqual(R.fuse(r),[]);assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);const blog=r.owned.find(p=>p.type==='ab_blog');assert.deepEqual([blog.x,blog.y,blog.w,blog.h],[320,336,320,132]);assert.equal(area-r.owned.reduce((s,p)=>s+p.w*p.h,0),7488);assert.equal(r.owned.reduce((s,p)=>s+acquired(p.type),0),30);assert.equal(r.owned.reduce((s,p)=>s+D.PARTS[p.type].load,0),11);
 const after=simulate(r.owned);assert.equal(before.b.player.income,24);assert.equal(after.b.player.income,16);assert.equal(before.b.metrics.player.healing,30);assert.equal(after.b.metrics.player.healing,42);close(before.b.metrics.player.hpDamage,384);close(after.b.metrics.player.hpDamage,384);assert.equal(before.b.player.lag,1);assert.equal(after.b.player.lag,1);
 const lower=runFor(),counter=lower.owned.find(p=>p.type==='ab_counter');counter.x=336;counter.y=478;assert.ok(C.canPlace(lower.owned,counter,counter.x,counter.y));assert.equal(simulate(lower.owned).b.player.income,12);R.fuse(lower);assert.equal(simulate(lower.owned).b.player.income,16);
});
test('optional native cart makes the lost counter income an offensive cost without duplicating revenue',()=>{
 const t=template();assert.ok(t);const r=runFor();r.owned.push(C.makeItem('am_cart',`p${r.nextId++}`,648,286,280,100));for(const p of r.owned)assert.ok(C.canPlace(r.owned,p,p.x,p.y));const before=simulate(r.owned,17),counter=r.owned.find(p=>p.type==='ab_counter'),cart=r.owned.find(p=>p.type==='am_cart');R.fuse(r);const after=simulate(r.owned,17),blog=r.owned.find(p=>p.type==='ab_blog');
 for(const [meter,source,routed,spent,damage] of [[before,counter,14,12,60],[after,blog,6,6,30]]){assert.equal(meter.b.metrics.player.routed,routed);assert.equal(meter.b.metrics.player.spent,spent);assert.equal(meter.b.player.parts.find(p=>p.id===cart.id).damage,damage);const routes=meter.events.filter(e=>e.kind==='conversion'&&e.side==='player'&&e.action==='route');assert.ok(routes.every(e=>e.id===source.id&&e.to===cart.id));}
 close(before.b.metrics.player.hpDamage,444);close(after.b.metrics.player.hpDamage,414);assert.equal(before.b.metrics.player.healing,30);assert.equal(after.b.metrics.player.healing,42);
});
test('personal-homepage construction and webring decoration stay inert with original native parts',()=>{
 const t=template();assert.ok(t);assert.equal(typeof render.personalWebDecor,'function');assert.match(V.header('personalweb',t.pageName),/GeoCities風.*非公式/);for(const[kind]of t.decor){const html=render.personalWebDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<button|<input|<form|<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}assert.match(render.personalWebDecor('personal-webring'),/表示のみ/);for(const p of runFor().owned)assert.equal(V.markup(p,{theme:'personalweb'}),V.markup(p,{theme:'mixed'}));
});
