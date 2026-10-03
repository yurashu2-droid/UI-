import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {resources} from '../src/buildlab.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {marketplaceDecor} from '../src/catalog/marketplace-render.js';
const run=()=>JSON.parse(JSON.stringify(R.newRun('lab','site_rakuten')));
const battle=items=>new E.Battle(items,[],{playerHp:10000,enemyHp:10000,playerCapacity:56,enemyCapacity:56});
const conserved=b=>{const m=b.metrics.player,bank=b.player.parts.reduce((s,p)=>s+p.charge,0);assert.ok(Math.abs(b.player.income-m.routed-m.unconverted)<1e-8);assert.ok(Math.abs(m.routed-m.spent-bank)<1e-8);};

test('QA: marketplace full-shield banking caps once, keeps lifetime income and releases only stored charges',()=>{
 const r=run(),b=battle(r.owned);b.player.shield=60;
 for(let i=0;i<480;i++){b.step(.05);conserved(b);}
 const tip=b.player.parts.find(p=>p.type==='yt_tip'),cart=b.player.parts.find(p=>p.type==='am_cart');
 assert.equal(b.player.income,26);assert.equal(b.metrics.player.routed,17);assert.equal(b.metrics.player.unconverted,9);assert.equal(b.metrics.player.spent,9);
 assert.equal(tip.charge,6);assert.equal(cart.charge,2);assert.equal(tip.fires,0);assert.equal(tip.protected,0);
 const buys=b.player.parts.filter(p=>p.type==='am_buy');for(const buy of buys){const before=buy.damage;b._activate(b.player,b.enemy,buy);assert.ok(Math.abs(buy.damage-before-20.2)<1e-8,'both buys use the shared26 lifetime income');}
 b.player.shield=40;b.step(.05);conserved(b);
 assert.equal(b.player.shield,56);assert.equal(tip.charge,0);assert.equal(tip.protected,16);assert.equal(tip.fires,2);assert.equal(b.metrics.player.spent,15);
 b._convert(b.player,b.enemy,tip);assert.equal(tip.fires,2);conserved(b);
});

test('QA: actual marketplace fusion and save retain legal source geometry, donor value and separate routes',()=>{
 const r=run();assert.equal(R.validateRun(r),true);const t=SITE_TEMPLATES.find(t=>t.id==='site_rakuten');
 assert.equal(resources(t.layout).acquisitionValue,80);assert.equal(resources(t.layout).load,30);
 r.stage=R.labEnemies().findIndex(t=>t.id==='site_rakuten');assert.equal(R.validateRun(r),true);assert.equal(R.opponent(r).id,'site_rakuten');assert.equal(R.enemyBoard(r).length,15);
 const first=R.fuse(r);assert.equal(first.length,1);assert.equal(first[0].item.type,'am_oneclick');assert.equal(R.fuse(r).length,0);
 const loaded=JSON.parse(JSON.stringify(r));assert.equal(R.validateRun(loaded),true);const one=loaded.owned.find(p=>p.type==='am_oneclick');
 assert.deepEqual([one.x,one.y,one.w,one.h],[224,372,328,40]);assert.ok(loaded.owned.every(p=>C.canPlace(loaded.owned,p,p.x,p.y,p.w,p.h)));
 assert.equal(C.analyze(loaded.owned).load,28);const free=C.makeItem('am_cart','old-cart-space',224,484,328,100);assert.ok(C.canPlace(loaded.owned,free,free.x,free.y,free.w,free.h));
 const b=battle(loaded.owned),events=[];for(let i=0;i<480;i++){events.push(...b.step(.05));conserved(b);}
 const coupon=loaded.owned.find(p=>p.type==='am_coupon'),sale=loaded.owned.find(p=>p.type==='am_deal'),tip=loaded.owned.find(p=>p.type==='yt_tip');
 const routes=events.filter(e=>e.kind==='conversion'&&e.action==='route');assert.deepEqual([...new Set(routes.map(e=>`${e.id}->${e.to}`))].sort(),[`${coupon.id}->${one.id}`,`${sale.id}->${tip.id}`].sort());
});

test('QA: fictional marketplace adds no payment or remote-resource endpoint and preserves native controls',()=>{
 const r=run(),t=SITE_TEMPLATES.find(t=>t.id==='site_rakuten');
 const decor=t.decor.map(([kind])=>marketplaceDecor(kind)).join('');
 const walk=(n,chrome=false)=>{assert.ok(!['script','iframe','img','link','object','embed'].includes(n.tagName));if(chrome)assert.ok(!['input','button','select','textarea','form'].includes(n.tagName));for(const a of n.attrs||[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['src','srcset','href','action','formaction','poster'].includes(a.name));assert.ok(!a.name.startsWith('on'));}for(const c of n.childNodes||[])walk(c,chrome);};
 walk(parseFragment(decor),true);assert.match(decor,/実際の購入や決済/);assert.match(decor,/ポイント発行は行いません/);
 for(const p of r.owned){assert.equal(V.markup(p,{theme:'marketplace'}),V.markup(p,{theme:'mixed'}));walk(parseFragment(V.markup(p)));}
 assert.equal(Object.values(D.PARTS).some(p=>p.faction==='marketplace'),false);
});
