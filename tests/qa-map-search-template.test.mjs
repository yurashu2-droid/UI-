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
import {mapSearchDecor} from '../src/catalog/map-search-render.js';
const saved=()=>JSON.parse(JSON.stringify(R.newRun('lab','site_google_maps')));
const simulate=(items,cap=19)=>{const b=new E.Battle(items,[],{playerHp:10000,enemyHp:10000,playerCapacity:cap,enemyCapacity:cap}),events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);

test('QA: map modifiers and CPU clock are real neighbours and shared limits, with shielding only from the favorite',()=>{
 const r=saved(),search=r.owned[0],favorite=r.owned[2],area=r.owned[3],destinations=r.owned.slice(8),{b,events}=simulate(r.owned);
 assert.deepEqual(b.player.info.near[search.id],[r.owned[1].id,favorite.id,area.id]);for(const p of destinations){assert.deepEqual(b.player.info.near[p.id],[]);assert.equal(b.player.parts.find(q=>q.id===p.id).speed,1.15);}
 const first=(ev,id)=>ev.find(e=>e.kind==='damage'&&e.id===id);assert.deepEqual([first(events,search.id).time,first(events,search.id).value],[1.35,15.6]);
 assert.deepEqual([area,...destinations].map(p=>first(events,p.id).value),[7,7,4,4]);assert.equal(b.player.shield,24);assert.equal(b.metrics.player.healing,0);assert.equal(b.player.income,0);
 const far=r.owned.map(p=>p.id===favorite.id?{...p,x:392,y:76}:p.id===area.id?{...p,x:600,y:76}:p);assert.ok(far.every(p=>C.canPlace(far,p,p.x,p.y,p.w,p.h)));const moved=simulate(far);close(first(moved.events,search.id).value,10.4);assert.equal(moved.b.player.shield,24,'moving the favorite does not invent or remove its independent shield timer');
 const withoutFavorite=simulate(r.owned.filter(p=>p.id!==favorite.id));assert.equal(withoutFavorite.b.player.shield,0);
 const lagged=simulate(r.owned,12);close(lagged.b.player.lag,1.35);assert.equal(first(lagged.events,search.id).time,1.85);close(lagged.b.metrics.player.hpDamage,544.5);close(10000-lagged.b.player.hp,76.8);
 close(b.player.info.freeRatio,1-resources(SITE_TEMPLATES.find(t=>t.id==='site_google_maps').layout).footprint/(960*680));
});

test('QA: map save/opponent and native controls stay legal while fixed schematic chrome has no remote action',()=>{
 const r=saved(),t=SITE_TEMPLATES.find(t=>t.id==='site_google_maps');assert.equal(R.validateRun(r),true);assert.equal(r.page.theme,'mapsearch');assert.deepEqual(r.admin,[]);const res=resources(t.layout);assert.deepEqual([res.acquisitionValue,res.load,res.parts,res.legal],[48,19,11,true]);assert.equal(Object.values(D.PARTS).some(p=>p.faction==='mapsearch'),false);
 r.stage=R.labEnemies().findIndex(e=>e.id===t.id);assert.equal(R.validateRun(r),true);assert.deepEqual(R.enemyBoard(r).map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]),r.owned.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]));
 const overlaps=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];for(const[k,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,k);for(const p of r.owned)assert.equal(overlaps([x,y,w,h],[p.x,p.y,p.w,p.h]),false,k);}
 const walk=(n,decor)=>{assert.ok(!['script','iframe','object','embed','img','link','audio','video'].includes(n.tagName));if(decor)assert.ok(!['button','input','form','select','textarea','a'].includes(n.tagName));for(const a of n.attrs||[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['href','src','srcset','action','formaction','download','poster'].includes(a.name));assert.ok(!a.name.startsWith('on'));}for(const c of n.childNodes||[])walk(c,decor);};
 const decor=V.header('mapsearch',r.page.name)+t.decor.map(([kind])=>mapSearchDecor(kind)).join('');walk(parseFragment(decor),true);assert.match(decor,/位置情報の取得や経路検索は行いません/);assert.match(decor,/縮尺なし/);
 for(const p of r.owned){assert.equal(V.markup(p,{theme:'mapsearch'}),V.markup(p,{theme:'mixed'}));walk(parseFragment(V.markup(p)),false);}
 const css=readFileSync(new URL('../src/catalog/map-search.css',import.meta.url),'utf8');assert.doesNotMatch(css,/@import|url\s*\(|\.web-node|\.node-|\.native-/i);assert.match(css,/\.page-body::before/);assert.match(css,/pointer-events:none/);
});

test('QA: actual shared search submit seam is local and cancels the form action for fictional map input',()=>{
 //Only the existing submit callback is executed; this is not browser evidence.
 const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8'),start=source.indexOf('document.addEventListener("submit",'),end=source.indexOf('document.addEventListener("keydown",',start);assert.ok(start>=0&&end>start);
 let callback,prevented=0;const messages=[];class HTMLFormElement{closest(){return{};}matches(){return false;}querySelector(){return{value:'小庭の街'};}}
 new Function('document','HTMLFormElement','preview','toast','previewVideoComment',source.slice(start,end))({addEventListener(name,fn){assert.equal(name,'submit');callback=fn;}},HTMLFormElement,true,text=>messages.push(text),()=>assert.fail('map search is not video chat'));
 callback({target:new HTMLFormElement(),preventDefault(){prevented++;}});assert.equal(prevented,1);assert.deepEqual(messages,['「小庭の街」を検索（ページ内の操作デモ）']);
});
