import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
const render=await import('../src/catalog/ranked-news-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_hacker_news');
const boardOf=t=>t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${t.id}-${i}`,x,y,w,h),label:label||''}));
function simulate(board,capacity=13){const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:capacity,enemyCapacity:capacity}),events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};}

test('ranked news appends a legal existing-parts template without a new upvote or combat family',()=>{
 const t=template();assert.ok(t);assert.match(t.name,/Hacker News風/);assert.equal(t.faction,'rankednews');assert.equal(t.status,'experimental');assert.deepEqual(t.admin,[]);assert.ok(D.PRESETS[t.id]);assert.ok(D.FACTIONS.rankednews);assert.equal(SITE_TEMPLATES[15].id,'site_github_releases');assert.equal(SITE_TEMPLATES[16].id,t.id);
 const board=boardOf(t);assert.equal(board.length,11);for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);assert.equal(board.reduce((s,p)=>s+D.PARTS[p.type].price,0),36);assert.equal(board.reduce((s,p)=>s+D.PARTS[p.type].load,0),13);assert.equal(Object.values(D.PARTS).some(p=>p.faction==='rankednews'),false);
});
test('disconnected More still shares page navigation attention while discussion replay stays isolated',()=>{
 const t=template();assert.ok(t);const board=boardOf(t),{b,events}=simulate(board),stories=board.filter(p=>p.type==='ab_link'),more=board.find(p=>p.type==='ab_nav'),post=board.find(p=>p.type==='rd_post'),ref=board.find(p=>p.type==='wk_reference');
 assert.deepEqual(b.player.info.groups,[]);assert.deepEqual(b.player.info.near[more.id],[]);assert.deepEqual(b.player.info.near[post.id],[ref.id]);
 for(let i=0;i<stories.length;i++){const hits=events.filter(e=>e.kind==='damage'&&e.id===stories[i].id);assert.equal(hits.length,13);assert.equal(hits[0].time,.9);assert.ok(hits.every(e=>e.value===(i<2?6:4)));}
 const copies=events.filter(e=>e.kind==='echo'&&e.id===ref.id);assert.deepEqual(copies.map(e=>e.time),[3.25,9.75,16.25,22.75]);assert.ok(copies.every(e=>e.to===post.id));assert.ok(Math.abs(b.metrics.player.hpDamage-585.2)<1e-8);assert.equal(b.player.income,0);assert.equal(b.metrics.player.healing,0);assert.equal(b.player.shield,0);
 const without=simulate(board.filter(p=>p.id!==more.id));assert.ok(Math.abs(without.b.metrics.player.hpDamage-571.2)<1e-8);assert.equal(without.events.filter(e=>e.kind==='damage'&&e.id===stories[0].id).length,14);assert.equal(simulate(board.filter(p=>p.id!==post.id)).events.some(e=>e.kind==='echo'&&e.id===ref.id),false);assert.deepEqual(simulate([...board].reverse()).events,events);
 const lagged=simulate(board,12);assert.equal(lagged.b.player.lag,1.05);assert.equal(lagged.events.find(e=>e.kind==='echo'&&e.id===ref.id).time,3.45);
});
test('ranked story scores and navigation chrome are inert fictional data and preserve native controls',()=>{
 const t=template();assert.ok(t);assert.equal(typeof render.rankedNewsDecor,'function');assert.match(V.header('rankednews',t.pageName),/Hacker News風.*非公式/);
 for(const[kind]of t.decor){const html=render.rankedNewsDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<button|<input|<form|<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}
 assert.match(render.rankedNewsDecor('ranked-discussion-heading'),/コメント例/);assert.match(render.rankedNewsDecor('ranked-disclaimer'),/架空/);for(const p of boardOf(t))assert.equal(V.markup(p,{theme:'rankednews'}),V.markup(p,{theme:'mixed'}));
});
