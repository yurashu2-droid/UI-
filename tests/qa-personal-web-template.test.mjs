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
import {personalWebDecor} from '../src/catalog/personal-web-render.js';
import {previewCatalogueAction} from '../src/catalog/preview.js';
const saved=()=>JSON.parse(JSON.stringify(R.newRun('lab','site_geocities')));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);

test('QA: personal homepage saves as an opponent and actual blog fusion retains donor value and frees the counter rectangle once',()=>{
 const r=saved(),t=SITE_TEMPLATES.find(t=>t.id==='site_geocities');assert.equal(R.validateRun(r),true);assert.equal(r.page.theme,'personalweb');assert.deepEqual(r.admin,[]);const resource=resources(t.layout);assert.deepEqual([resource.acquisitionValue,resource.load,resource.parts,resource.legal],[30,12,8,true]);
 r.stage=R.labEnemies().findIndex(e=>e.id===t.id);assert.equal(R.validateRun(r),true);assert.deepEqual(R.enemyBoard(r).map(p=>[p.type,p.x,p.y,p.w,p.h]),r.owned.map(p=>[p.type,p.x,p.y,p.w,p.h]));
 const counter=r.owned.find(p=>p.type==='ab_counter'),bbs=r.owned.find(p=>p.type==='ab_guestbook'),links=r.owned.filter(p=>p.type==='ab_link');assert.deepEqual(E.analyze(r.owned).near[counter.id],[...links.map(p=>p.id),bbs.id]);
 const original=JSON.stringify(r);assert.equal(R.fuse(r).length,1);const after=JSON.stringify(r);assert.equal(R.fuse(r).length,0);assert.equal(JSON.stringify(r),after);assert.notEqual(after,original);assert.equal(R.validateRun(JSON.parse(after)),true);
 const blog=r.owned.find(p=>p.type==='ab_blog');assert.deepEqual([blog.x,blog.y,blog.w,blog.h],[bbs.x,bbs.y,bbs.w,bbs.h]);assert.equal(E.analyze(r.owned).load,11);
 const layout=r.owned.map(p=>[p.type,p.x,p.y,p.w,p.h]);assert.equal(resources(layout).acquisitionValue,30);assert.ok(C.canPlace(r.owned,counter,counter.x,counter.y,counter.w,counter.h));
});

test('QA: personal counter/cart charges conserve per tick before and after fusion, while lab settlement never grants raw income',()=>{
 const r=saved();r.owned.push(C.makeItem('am_cart',`p${r.nextId++}`,648,286,280,100));const a=JSON.parse(JSON.stringify(r));R.fuse(r);const z=JSON.parse(JSON.stringify(r));
 for(const [run,expected]of[[a,{income:24,routed:14,spent:12,bank:2,damage:60}],[z,{income:16,routed:6,spent:6,bank:0,damage:30}]]){
  const b=new E.Battle(run.owned,[C.makeItem('ab_link','e',24,24)],{playerHp:10000,enemyHp:10000,playerCapacity:17,enemyCapacity:17});b.player.hp=9000;
  for(let i=0;i<480;i++){b.step(.05);const m=b.metrics.player,bank=b.player.parts.reduce((s,p)=>s+p.charge,0);close(b.player.income,m.routed+m.unconverted);close(m.routed,m.spent+bank);}
  const cart=b.player.parts.find(p=>p.type==='am_cart'),m=b.metrics.player;assert.deepEqual({income:b.player.income,routed:m.routed,spent:m.spent,bank:cart.charge,damage:cart.damage},expected);
 }
 for(const fused of[false,true]){const run=saved();if(fused)R.fuse(run);const start=R.startBattle(run);assert.equal(start.ok,true);while(!start.battle.result)start.battle.step(.05);assert.ok(start.battle.player.income>0);const cash=run.cash,settled=R.settleBattle(run,start.battle);assert.equal(settled.ok,true);assert.equal(settled.summary.rawIncome,start.battle.player.income);assert.deepEqual([settled.summary.base,settled.summary.bonus,settled.summary.income,settled.summary.total,run.cash],[0,0,0,0,cash]);assert.equal(R.settleBattle(run,start.battle).ok,false);assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))),true);}
});

test('QA: personal BBS and mail remain local preview links and all homepage decoration is inert',()=>{
 const r=saved(),t=SITE_TEMPLATES.find(t=>t.id==='site_geocities'),decor=V.header('personalweb',r.page.name)+t.decor.map(([kind])=>personalWebDecor(kind)).join('');
 const walk=(n,chrome)=>{assert.ok(!['script','iframe','object','embed','img','link','audio','video','form'].includes(n.tagName));if(chrome)assert.ok(!['button','input','select','textarea','a'].includes(n.tagName));for(const a of n.attrs||[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['href','src','srcset','action','formaction','download'].includes(a.name));assert.ok(!a.name.startsWith('on'));}for(const c of n.childNodes||[])walk(c,chrome);};walk(parseFragment(decor),true);assert.match(decor,/外部への移動・メール送信は行いません/);
 for(const p of r.owned){assert.equal(V.markup(p,{theme:'personalweb'}),V.markup(p,{theme:'mixed'}));walk(parseFragment(V.markup(p)),false);}
 assert.doesNotMatch(readFileSync(new URL('../src/catalog/personal-web.css',import.meta.url),'utf8'),/@import|url\s*\(|\.web-node|\.node-|\.native-/i);
 const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8'),start=source.indexOf('function previewAction(e: MouseEvent)'),end=source.indexOf('/* ---------- Events ---------- */',start);assert.ok(start>=0&&end>start);const js=source.slice(start,end).replace('(e: MouseEvent)','(e)').replaceAll('<HTMLElement>','').replace('querySelector("span")!.','querySelector("span").');
 let prevented=0,pulsed=0;const messages=[];const node={dataset:{id:'p1'}};let control;class Element{closest(s){return s==='[data-ui]'?control:s==='.browser-paper'?{}:null;}}
 const preview=new Function('Element','preview','battle','storyActive','storySession','fx','previewCatalogueAction','toast',js+';return previewAction;')(Element,true,null,false,null,{pulse(){pulsed++;}},previewCatalogueAction,message=>messages.push(message));
 for(const label of['[書き込む]','感想をメールで']){control={tagName:'A',dataset:{ui:'link'},textContent:label,closest(){return node;}};preview({target:new Element(),preventDefault(){prevented++;}});assert.equal(control.textContent,label);}
 assert.equal(prevented,2);assert.equal(pulsed,2);assert.deepEqual(messages,['ページ内のプレビューです。外部には移動しません。','ページ内のプレビューです。外部には移動しません。']);
});
