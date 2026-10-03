import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
const render=await import('../src/catalog/map-search-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_google_maps');
const boardOf=t=>t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${t.id}-${i}`,x,y,w,h),label:label||''}));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function simulate(board,capacity=19){const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:capacity,enemyCapacity:capacity}),events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};}
const move=(board,type,x,y)=>board.map(p=>p.type===type?{...p,x,y}:p);

test('Maps adds a legal schematic-map composition without a new attack, geolocation or set bonus',()=>{
 const t=template();assert.ok(t);assert.match(t.name,/Google Maps風/);assert.equal(t.faction,'mapsearch');assert.equal(t.status,'experimental');assert.deepEqual(t.admin,[]);assert.ok(D.PRESETS[t.id]);assert.ok(D.FACTIONS.mapsearch);assert.equal(SITE_TEMPLATES[16].id,'site_hacker_news');assert.equal(SITE_TEMPLATES[17].id,t.id);
 const board=boardOf(t);assert.equal(board.length,11);for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);assert.equal(board.reduce((s,p)=>s+D.PARTS[p.type].price,0),48);assert.equal(board.reduce((s,p)=>s+D.PARTS[p.type].load,0),19);assert.equal(Object.values(D.PARTS).some(p=>p.faction==='mapsearch'),false);
});
test('map islands forfeit local support while the first-two-link quota and retro speed stay page-wide',()=>{
 const t=template();assert.ok(t);const board=boardOf(t),{b,events}=simulate(board),search=board[0],area=board[3],destinations=board.slice(8),results=[board[4],board[6],board[7]];
 assert.deepEqual(b.player.info.near[search.id],[board[1].id,board[2].id,area.id]);for(const p of destinations)assert.deepEqual(b.player.info.near[p.id],[]);
 const hit=(id,ev=events)=>ev.find(e=>e.kind==='damage'&&e.id===id).value;
 close(hit(search.id),15.6);for(let i=0;i<results.length;i++)close(hit(results[i].id),i<2?12:8);for(let i=0;i<destinations.length;i++)close(hit(destinations[i].id),i===0?7:4);close(hit(area.id),7);close(b.metrics.player.hpDamage,740.7);assert.equal(b.player.shield,24);assert.equal(b.player.income,0);assert.equal(b.metrics.player.healing,0);assert.equal(events.some(e=>e.kind==='echo'),false);
 close(hit(search.id,simulate(move(board,'tw_favorite',392,76)).events),13);
 const moveArea=rows=>rows.map(p=>p.id===area.id?{...p,x:600,y:76}:p);close(hit(search.id,simulate(moveArea(board)).events),13);close(hit(search.id,simulate(moveArea(move(board,'tw_favorite',392,76))).events),10.4);
 const fontElsewhere=simulate(move(board,'gov_font',392,228));close(hit(destinations[0].id,fontElsewhere.events),10.5);close(hit(results[0].id,fontElsewhere.events),8);close(hit(results[1].id,fontElsewhere.events),8);close(fontElsewhere.b.metrics.player.hpDamage,729.2);
 const clustered=board.map((p,i)=>i>=8?{...p,x:392,y:184+(i-8)*40,w:184}:p),packed=simulate(clustered);for(const p of clustered)assert.ok(C.canPlace(clustered,p,p.x,p.y));close(packed.b.metrics.player.hpDamage,785.7);assert.equal(packed.events.filter(e=>e.kind==='damage'&&e.id===destinations[0].id).length,18);
 const lagged=simulate(board,12);close(lagged.b.player.lag,1.35);close(lagged.b.metrics.player.hpDamage,544.5);close(10000-lagged.b.player.hp,76.8);assert.deepEqual(simulate([...board].reverse()).events,events);
});
test('map chrome is a fictional fixed schematic and never replaces native search or destination controls',()=>{
 const t=template();assert.ok(t);assert.equal(typeof render.mapSearchDecor,'function');assert.match(V.header('mapsearch',t.pageName),/Google Maps風.*非公式/);
 for(const[kind]of t.decor){const html=render.mapSearchDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<button|<input|<form|<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}
 assert.match(render.mapSearchDecor('map-legend'),/架空.*固定/);assert.match(render.mapSearchDecor('map-rail-note'),/位置情報/);for(const p of boardOf(t))assert.equal(V.markup(p,{theme:'mapsearch'}),V.markup(p,{theme:'mixed'}));
});
