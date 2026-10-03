import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {resources} from '../src/buildlab.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {musicShopDecor} from '../src/catalog/music-shop-render.js';
const saved=()=>JSON.parse(JSON.stringify(R.newRun('lab','site_bandcamp')));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);
function simulate(items,{full=false}={}){
 const b=new E.Battle(items,full?[]:[C.makeItem('ab_link','e',24,24)],{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12}),events=[];if(full)b.player.shield=60;
 for(let i=0;i<480;i++){events.push(...b.step(.05));const m=b.metrics.player,bank=b.player.parts.reduce((s,p)=>s+p.charge,0);close(b.player.income,m.routed+m.unconverted);close(m.routed,m.spent+bank);}return{b,events};
}
const resource=items=>resources(items.map(p=>[p.type,p.x,p.y,p.w,p.h]));

test('QA: saved music coupon movement selects only one conversion destination and overflow never spills into the idle cart',()=>{
 const r=saved(),coupon=r.owned.find(p=>p.type==='am_coupon'),tip=r.owned.find(p=>p.type==='yt_tip'),cart=r.owned.find(p=>p.type==='am_cart');assert.equal(R.validateRun(r),true);assert.deepEqual([resource(r.owned).acquisitionValue,resource(r.owned).load],[31,10]);
 for(const moved of[false,true]){
  const run=saved();if(moved)assert.equal(R.move(run,coupon.id,216,312),true);const restored=JSON.parse(JSON.stringify(run));assert.equal(R.validateRun(restored),true);const before=JSON.stringify(restored.owned);assert.deepEqual(R.fuse(restored),[]);assert.deepEqual(R.fuse(restored),[]);assert.equal(JSON.stringify(restored.owned),before);
  const{b,events}=simulate(restored.owned),to=moved?cart.id:tip.id;assert.equal(b.player.income,12);assert.equal(b.metrics.player.spent,12);assert.equal(b.metrics.player.shielding,moved?0:32);assert.equal(b.metrics.player.hpDamage,moved?218:158);assert.equal(b.player.parts.find(p=>p.id===cart.id).damage,moved?60:0);
  const route=events.filter(e=>e.kind==='conversion'&&e.side==='player'&&e.action==='route');assert.ok(route.length);assert.ok(route.every(e=>e.id===coupon.id&&e.to===to));assert.equal(b.player.parts.find(p=>p.type==='sc_track').earned,0);
  run.phase='battle';assert.equal(R.move(run,coupon.id,24,380),false,'routing geometry is locked during a battle');
 }
 const{b,events}=simulate(r.owned,{full:true});assert.equal(b.player.income,12);assert.equal(b.metrics.player.routed,6);assert.equal(b.metrics.player.unconverted,6);assert.equal(b.metrics.player.spent,0);assert.equal(b.player.parts.find(p=>p.id===tip.id).charge,6);assert.equal(b.player.parts.find(p=>p.id===cart.id).charge,0);assert.equal(events.some(e=>e.kind==='conversion'&&e.to===cart.id),false);
 b.player.shield=44;b.step(.05);assert.equal(b.player.shield,60);assert.equal(b.metrics.player.spent,6);assert.equal(b.player.parts.find(p=>p.id===tip.id).charge,0);b.step(.05);assert.equal(b.metrics.player.spent,6);
});

test('QA: music-shop teaching layout admits its cheaper role-specific alternatives instead of claiming an optimal build',()=>{
 const r=saved(),cart=r.owned.find(p=>p.type==='am_cart'),tip=r.owned.find(p=>p.type==='yt_tip'),coupon=r.owned.find(p=>p.type==='am_coupon');
 const rated=r.owned.map(p=>p.id===cart.id?C.makeItem('am_rating',p.id,p.x,p.y):p);assert.ok(rated.every(p=>C.canPlace(rated,p,p.x,p.y,p.w,p.h)));assert.deepEqual([resource(rated).acquisitionValue,resource(rated).load],[28,8]);const ratingResult=simulate(rated).b;assert.deepEqual([ratingResult.player.income,ratingResult.metrics.player.shielding,ratingResult.metrics.player.hpDamage],[12,32,158]);
 assert.equal(R.move(r,coupon.id,216,312),true);const trimmed=r.owned.filter(p=>p.id!==tip.id);assert.deepEqual([resource(trimmed).acquisitionValue,resource(trimmed).load],[20,8]);const checkout=simulate(trimmed).b;assert.deepEqual([checkout.player.income,checkout.metrics.player.shielding,checkout.metrics.player.hpDamage],[12,0,218]);
});

test('QA: music shop opponent/save retains native controls and original inert artwork with no audio/payment/download endpoint',()=>{
 const r=saved(),t=SITE_TEMPLATES.find(t=>t.id==='site_bandcamp');r.stage=R.labEnemies().findIndex(e=>e.id===t.id);assert.equal(R.validateRun(r),true);assert.deepEqual(R.enemyBoard(r).map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]),r.owned.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]));assert.equal(Object.values(D.PARTS).some(p=>p.faction==='musicshop'),false);
 const overlap=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];for(const[k,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,k);for(const p of r.owned)assert.equal(overlap([x,y,w,h],[p.x,p.y,p.w,p.h]),false,k);}
 const walk=(n,chrome)=>{assert.ok(!['form','script','iframe','object','embed','img','link','audio','video'].includes(n.tagName));if(chrome)assert.ok(!['button','input','select','textarea','a'].includes(n.tagName));for(const a of n.attrs||[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['href','src','srcset','action','formaction','download','poster'].includes(a.name));assert.ok(!a.name.startsWith('on'));}for(const c of n.childNodes||[])walk(c,chrome);};
 const decor=V.header('musicshop',r.page.name)+t.decor.map(([kind])=>musicShopDecor(kind)).join('');walk(parseFragment(decor),true);assert.match(decor,/音声の再生・購入・決済/);assert.match(decor,/ダウンロードは行いません/);assert.match(decor,/合成材料込み\$31/);
 for(const p of r.owned){assert.equal(V.markup(p,{theme:'musicshop'}),V.markup(p,{theme:'mixed'}));walk(parseFragment(V.markup(p)),false);}
 assert.doesNotMatch(readFileSync(new URL('../src/catalog/music-shop.css',import.meta.url),'utf8'),/@import|url\s*\(|\.web-node|\.node-|\.native-/i);
});
