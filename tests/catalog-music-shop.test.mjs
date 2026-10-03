import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {RECIPES} from '../src/fusion.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
const render=await import('../src/catalog/music-shop-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_bandcamp');
const acquired=t=>{const r=RECIPES.find(r=>r.into===t);return r?acquired(r.a)+acquired(r.b):D.PARTS[t].price;};
function simulate(board,enemy=true,full=false){const b=new E.Battle(board,enemy?[C.makeItem('ab_link','enemy',24,24)]:[],{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12});if(full)b.player.shield=60;const events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};}
const runFor=()=>R.newRun('lab',template().id);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('direct music shop appends a native five-part single-budget lesson including fusion donor cost',()=>{
 const t=template();assert.ok(t);assert.match(t.name,/Bandcamp風/);assert.equal(t.faction,'musicshop');assert.equal(t.status,'experimental');assert.deepEqual(t.admin,[]);assert.equal(SITE_TEMPLATES[18].id,'site_geocities');assert.equal(SITE_TEMPLATES[19].id,t.id);assert.ok(D.FACTIONS.musicshop);assert.ok(D.PRESETS[t.id]);assert.equal(Object.values(D.PARTS).some(p=>p.faction==='musicshop'),false);assert.equal(t.loot.includes('yt_tip'),false);
 const r=runFor();assert.equal(r.owned.length,5);for(const p of r.owned){assert.ok(C.canPlace(r.owned,p,p.x,p.y),p.type);assert.deepEqual([p.w,p.h],[D.PARTS[p.type].w,D.PARTS[p.type].h]);}assert.equal(r.owned.reduce((s,p)=>s+D.PARTS[p.type].price,0),20);assert.equal(r.owned.reduce((s,p)=>s+acquired(p.type),0),31);assert.equal(r.owned.reduce((s,p)=>s+D.PARTS[p.type].load,0),10);
});
test('moving the same coupon trades real support shielding for cart damage without making audio income',()=>{
 const t=template();assert.ok(t);const r=runFor(),coupon=r.owned.find(p=>p.type==='am_coupon'),tip=r.owned.find(p=>p.type==='yt_tip'),cart=r.owned.find(p=>p.type==='am_cart'),audio=r.owned.find(p=>p.type==='sc_track'),base=simulate(r.owned);
 assert.deepEqual(base.b.player.info.groups,[]);assert.equal(base.b.player.income,12);assert.equal(base.b.metrics.player.routed,12);assert.equal(base.b.metrics.player.spent,12);assert.equal(base.b.metrics.player.shielding,32);close(base.b.metrics.player.hpDamage,158);assert.equal(base.b.player.parts.find(p=>p.id===cart.id).damage,0);assert.ok(base.events.filter(e=>e.kind==='conversion'&&e.side==='player'&&e.action==='route').every(e=>e.id===coupon.id&&e.to===tip.id));
 const noAudio=simulate(r.owned.filter(p=>p.id!==audio.id));assert.equal(noAudio.b.player.income,12);assert.equal(noAudio.b.metrics.player.shielding,32);close(noAudio.b.metrics.player.hpDamage,78);
 coupon.x=216;coupon.y=312;for(const p of r.owned)assert.ok(C.canPlace(r.owned,p,p.x,p.y));const checkout=simulate(r.owned);close(checkout.b.metrics.player.hpDamage,218);assert.equal(checkout.b.metrics.player.shielding,0);assert.equal(checkout.b.player.income,12);assert.equal(checkout.b.player.parts.find(p=>p.id===cart.id).damage,60);assert.ok(checkout.events.filter(e=>e.kind==='conversion'&&e.side==='player'&&e.action==='route').every(e=>e.id===coupon.id&&e.to===cart.id));
 const trimmed=simulate(r.owned.filter(p=>p.id!==tip.id));close(trimmed.b.metrics.player.hpDamage,218);assert.equal(trimmed.b.player.income,12);
});
test('idle-cart set contribution, full-shield banking and no accidental fusion remain explicit',()=>{
 const t=template();assert.ok(t);for(const moved of [false,true]){const r=runFor();if(moved)Object.assign(r.owned.find(p=>p.type==='am_coupon'),{x:216,y:312});const original=JSON.stringify(r.owned);assert.deepEqual(R.fuse(r),[]);assert.deepEqual(R.fuse(r),[]);assert.equal(JSON.stringify(r.owned),original);assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);}
 const r=runFor(),tip=r.owned.find(p=>p.type==='yt_tip'),cart=r.owned.find(p=>p.type==='am_cart'),without=simulate(r.owned.filter(p=>p.id!==cart.id));assert.equal(without.b.player.income,8);assert.equal(without.b.metrics.player.shielding,16);close(without.b.metrics.player.hpDamage,155);
 const full=simulate(r.owned,false,true);assert.equal(full.b.player.income,12);assert.equal(full.b.metrics.player.routed,6);assert.equal(full.b.metrics.player.spent,0);assert.equal(full.b.metrics.player.unconverted,6);assert.equal(full.b.player.parts.find(p=>p.id===tip.id).charge,6);assert.equal(full.b.player.parts.find(p=>p.id===cart.id).damage,0);full.b.player.shield=44;full.b.step(.05);assert.equal(full.b.player.shield,60);assert.equal(full.b.player.parts.find(p=>p.id===tip.id).charge,0);
});
test('album artwork and track metadata are original inert decoration around unchanged donor controls',()=>{
 const t=template();assert.ok(t);assert.equal(typeof render.musicShopDecor,'function');assert.match(V.header('musicshop',t.pageName),/Bandcamp風.*非公式/);for(const[kind]of t.decor){const html=render.musicShopDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<button|<input|<form|<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}assert.match(render.musicShopDecor('musicshop-cart-note'),/待機/);assert.match(render.musicShopDecor('musicshop-local-note'),/決済/);for(const p of runFor().owned)assert.equal(V.markup(p,{theme:'musicshop'}),V.markup(p,{theme:'mixed'}));
});

test('fixed music-shop notes reserve enough declared height for their text-line budgets',async()=>{
 const{readFileSync}=await import('node:fs'),css=readFileSync(new URL('../src/catalog/music-shop.css',import.meta.url),'utf8');
 const rule=s=>css.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]+)\\}'))[1];
 const amount=(s,p)=>Number(rule(s).match(new RegExp('(?:^|;)'+p+':([\\d.]+)'))[1]);
 // Source-only conservative line budget, not browser/font or pixel evidence.
 const route=amount('.musicshop-route-note','padding')*2+1+15+amount('.musicshop-route-note>p','margin')+amount('.musicshop-route-note>p','line-height')*3+2;
 assert.ok(route<=76,`route note needs ${route}px for header plus three lines`);
 const localLine=Number(rule('.musicshop-local-note').match(/font:9px\/([\d.]+)px/)[1]);
 const local=amount('.musicshop-local-note','padding')*2+2+localLine*4+2;
 assert.ok(local<=76,`local disclosure needs ${local}px for four lines`);
 const credits=amount('.musicshop-credits','padding-top')+1+16+amount('.musicshop-credits>p','margin')*2+28.8+12.8+2;
 assert.ok(credits<=76,`credit note needs ${credits}px for two paragraph lines`);
});
